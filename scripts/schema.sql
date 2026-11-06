-- ============================================================================
-- 红石的小站 · Supabase 数据库结构存档
-- 项目：lxdyrajbsjftduesvosh（东京 / PG 17）
-- 用法：在 Supabase SQL Editor 里整份跑一遍即可重建聊天相关对象（幂等）。
-- 游戏表（gomoku_* / rooms / room_players / brawl_*）不在这里，那是早期的表。
-- ============================================================================

-- ── 账号档案 ────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique,
  avatar     text not null default '🙂',
  created_at bigint not null default 0
);
alter table public.profiles enable row level security;

drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (true);

drop policy if exists "profiles ins" on public.profiles;
create policy "profiles ins" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "profiles upd" on public.profiles;
create policy "profiles upd" on public.profiles for update using (auth.uid() = id);

-- ── 好友关系（请求式：pending → accepted）──────────────────────────────
create table if not exists public.friendships (
  id         bigserial primary key,
  requester  uuid not null references auth.users(id) on delete cascade,
  addressee  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending',
  created_at bigint not null default 0,
  unique (requester, addressee),
  check (requester <> addressee)
);
alter table public.friendships enable row level security;

drop policy if exists "fr read" on public.friendships;
create policy "fr read" on public.friendships for select
  using (auth.uid() = requester or auth.uid() = addressee);

drop policy if exists "fr ins" on public.friendships;
create policy "fr ins" on public.friendships for insert
  with check (auth.uid() = requester and status = 'pending');

drop policy if exists "fr upd" on public.friendships;
create policy "fr upd" on public.friendships for update
  using (auth.uid() = requester or auth.uid() = addressee);

drop policy if exists "fr del" on public.friendships;
create policy "fr del" on public.friendships for delete
  using (auth.uid() = requester or auth.uid() = addressee);

-- ── 消息（公屏 + 私聊共用一张表，靠 kind/peer 区分）────────────────────
create table if not exists public.chat_msgs (
  id     bigserial primary key,
  author uuid not null references auth.users(id) on delete cascade,
  nick   text not null default '',
  body   text not null,
  kind   text not null default 'public',   -- public | dm
  peer   uuid references auth.users(id) on delete cascade,
  ts     bigint not null
);
create index if not exists chat_msgs_pub_idx  on public.chat_msgs (kind, ts desc);
create index if not exists chat_msgs_peer_idx on public.chat_msgs (peer, ts desc);
alter table public.chat_msgs enable row level security;

-- 公屏谁都能读；私聊只有收发双方能读
drop policy if exists "msg read" on public.chat_msgs;
create policy "msg read" on public.chat_msgs for select
  using (kind = 'public' or auth.uid() = author or auth.uid() = peer);

drop policy if exists "msg ins" on public.chat_msgs;
create policy "msg ins" on public.chat_msgs for insert
  with check (auth.uid() = author and (kind = 'public' or peer is not null));

drop policy if exists "msg del" on public.chat_msgs;
create policy "msg del" on public.chat_msgs for delete using (auth.uid() = author);

-- ── Realtime 发布（重复执行会报 duplicate_object，忽略即可）─────────────
do $$ begin alter publication supabase_realtime add table public.chat_msgs; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.friendships; exception when duplicate_object then null; end $$;

-- ── 安全加固 ────────────────────────────────────────────────────────────
-- 视图默认以创建者身份执行（绕过调用者的 RLS），改成按查询者身份执行。
-- brawl_active_rooms 当前没有任何页面引用（pvpga.html 直接查 brawl_rooms），
-- 保留只为了不破坏可能的旧链接；底层 brawl_rooms 的 RLS 是 true，读行为不变。
alter view if exists public.brawl_active_rooms set (security_invoker = true);
revoke insert, update, delete, truncate, references, trigger
  on public.brawl_active_rooms from anon, authenticated;

-- 触发器/维护函数固定 search_path，防止搜索路径劫持
alter function public.brawl_cleanup_expired_rooms()     set search_path = public, pg_temp;
alter function public.brawl_touch_updated_at()          set search_path = public, pg_temp;
alter function public.brawl_sync_room_player_count()    set search_path = public, pg_temp;

-- ── Auth 设置（在控制台里改，这里只做记录）──────────────────────────────
-- mailer_autoconfirm = true   注册后免邮箱验证，直接拿 session
-- disable_signup     = false  允许公开注册
