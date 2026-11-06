/* ============================================================================
   红石的小站 · 全站聊天框 v1
   chat.js — 右下角悬浮入口，注册用户可在公屏发言、加好友、私聊

   账号：Supabase Auth 邮箱+密码，但用户只填「昵称 + 密码」，
   内部把昵称哈希成 u<base36>@hs.local，省掉邮箱验证这一步。
   数据：profiles / friendships / chat_msgs 三张表，全部开 RLS。
   ========================================================================== */
(function (w, d) {
  'use strict';

  var HS = w.HS || {};
  // 允许外部覆盖（本地联调 / 以后换项目都不用改死）
  var SB_URL = (w.HS_CHAT_SB_URL || 'https://lxdyrajbsjftduesvosh.supabase.co').replace(/\/$/, '');
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4ZHlyYWpic2pmdGR1ZXN2b3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzkyMzksImV4cCI6MjEwNjA1NTIzOX0.ZEC7EohRqr0YCxqACBRTVI3-TGNFWUGxq-aH_yqIhig';

  /* ── 小工具 ───────────────────────────────────────────────────── */
  function url(p) {
    if (HS.site && HS.site.url) return HS.site.url(p);
    var s = d.currentScript && d.currentScript.src;
    if (s) return s.replace(/assets\/js\/chat\.js.*$/, '') + p;
    return p;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(sel, root) { return (root || d).querySelector(sel); }
  function hhmm(ts) {
    var t = new Date(Number(ts) || Date.now());
    var p = function (n) { return n < 10 ? '0' + n : n; };
    return p(t.getHours()) + ':' + p(t.getMinutes());
  }
  function slugOf(name) {
    var h = 2166136261;
    var s = String(name).trim().toLowerCase();
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return 'u' + h.toString(36);
  }
  function mailOf(name) { return slugOf(name) + '@hs.local'; }

  function zhErr(msg) {
    var m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return '昵称或密码不对';
    if (/already registered|already exists/i.test(m)) return '这个昵称已经被占用了';
    if (/Password should be at least/i.test(m)) return '密码至少 6 位';
    if (/fetch|network|Failed/i.test(m)) return '网络不通，稍后再试';
    if (/rate limit|too many/i.test(m)) return '操作太频繁，歇一会儿';
    return m.slice(0, 80);
  }

  /* ── 状态 ─────────────────────────────────────────────────────── */
  var st = {
    sb: null, session: null, me: null,
    open: false, view: 'public', peer: null,
    authMode: 'login', busy: false,
    friends: [], incoming: [], outgoing: [],
    unread: 0, chan: null, mounted: false
  };

  /* ── 样式 ─────────────────────────────────────────────────────── */
  function injectCSS() {
    if (d.getElementById('hsChatCSS')) return;
    var l = d.createElement('link');
    l.id = 'hsChatCSS';
    l.rel = 'stylesheet';
    l.href = url('assets/css/chat.css');
    d.head.appendChild(l);
  }

  /* ── 壳 ───────────────────────────────────────────────────────── */
  var root, fab, dot, panel, headEl, tabsEl, bodyEl;

  function mount() {
    if (st.mounted) return;
    st.mounted = true;

    root = d.createElement('div');
    root.id = 'hsChat';
    root.innerHTML =
      '<button class="hsc-fab" type="button" aria-label="打开聊天" aria-expanded="false">'
      + '<span class="hsc-ico">💬</span><i class="hsc-dot"></i></button>'
      + '<section class="hsc-panel" aria-label="聊天">'
      + '<div class="hsc-head"><span class="hsc-title">聊天</span>'
      + '<span class="hsc-me"></span>'
      + '<button class="hsc-ibtn" data-a="logout" type="button" title="退出登录" hidden>⏻</button>'
      + '<button class="hsc-ibtn" data-a="close" type="button" title="收起" aria-label="收起">✕</button>'
      + '</div>'
      + '<div class="hsc-tabs" hidden>'
      + '<button type="button" data-tab="public" aria-selected="true">公屏</button>'
      + '<button type="button" data-tab="friends" aria-selected="false">好友<i class="hsc-badge"></i></button>'
      + '</div>'
      + '<div class="hsc-view"></div>'
      + '</section>';
    d.body.appendChild(root);

    fab = $('.hsc-fab', root);
    dot = $('.hsc-dot', root);
    panel = $('.hsc-panel', root);
    headEl = $('.hsc-head', root);
    tabsEl = $('.hsc-tabs', root);
    bodyEl = $('.hsc-view', root);

    fab.addEventListener('click', function () { toggle(); });
    $('[data-a="close"]', root).addEventListener('click', function () { toggle(false); });
    $('[data-a="logout"]', root).addEventListener('click', function () { logout(); });
    tabsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      st.view = b.getAttribute('data-tab');
      st.peer = null;
      paint();
    });
    // 面板内点击不要冒泡到页面（避免触发站内的全局快捷键之类）
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && st.open) toggle(false);
    });
    w.addEventListener('resize', function () {
      if (st.open && w.innerWidth > 560) { /* 桌面/移动切换时保持打开 */ }
    });
  }

  function toggle(force) {
    mount();
    var next = typeof force === 'boolean' ? force : !st.open;
    st.open = next;
    root.classList.toggle('open', next);
    fab.setAttribute('aria-expanded', next ? 'true' : 'false');
    if (next) {
      st.unread = 0; paintDot();
      ensureSB().then(function () { paint(); }).catch(function () { paint(); });
      var inp = $('.hsc-form input', panel) || $('.hsc-auth input', panel);
      if (inp) setTimeout(function () { inp.focus(); }, 180);
    }
  }

  /* ── Supabase 懒加载 ──────────────────────────────────────────── */
  var sbPromise = null;
  function loadSDK() {
    if (w.supabase && w.supabase.createClient) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = d.createElement('script');
      s.src = url('assets/vendor/supabase.js');
      s.onload = function () { res(); };
      s.onerror = function () {
        var c = d.createElement('script');
        c.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        c.onload = function () { res(); };
        c.onerror = function () { rej(new Error('聊天服务加载失败')); };
        d.head.appendChild(c);
      };
      d.head.appendChild(s);
    });
  }

  function ensureSB() {
    if (!sbPromise) {
      sbPromise = loadSDK().then(function () {
        st.sb = w.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 10 } } });
        st.sb.auth.onAuthStateChange(function (_ev, session) {
          var was = st.session && st.session.user ? st.session.user.id : null;
          var now = session && session.user ? session.user.id : null;
          st.session = session;
          if (was !== now) {
            st.me = null;
            if (now) loadMe().then(paint);
            else paint();
          }
        });
        return st.sb.auth.getSession();
      }).then(function (r) {
        var s = r && r.data ? r.data.session : null;
        st.session = s;
        if (s && s.user) return loadMe();
      });
    }
    return sbPromise;
  }

  /* ── 账号 ─────────────────────────────────────────────────────── */
  async function loadMe() {
    if (!st.session || !st.session.user) { st.me = null; return; }
    var uid = st.session.user.id;
    var r = await st.sb.from('profiles').select('id,username,avatar').eq('id', uid).maybeSingle();
    if (r.data) {
      st.me = { id: uid, username: r.data.username, avatar: r.data.avatar || '🙂' };
    } else {
      // 老账号没有档案（注册时插档失败），用邮箱前缀兜底
      var mail = (st.session.user.email || '').split('@')[0] || '用户';
      st.me = { id: uid, username: mail, avatar: '🙂' };
    }
    subscribe();
    loadFriends();
    return st.me;
  }

  async function signUp(name, pass) {
    name = String(name || '').trim();
    if (name.length < 2 || name.length > 14) throw new Error('昵称要 2~14 个字');
    if (!/^[\w\u4e00-\u9fa5·]+$/.test(name)) throw new Error('昵称只能是中文、字母、数字、下划线');
    if (String(pass || '').length < 6) throw new Error('密码至少 6 位');

    var dup = await st.sb.from('profiles').select('id').eq('username', name).maybeSingle();
    if (dup.data) throw new Error('这个昵称已经被占用了');

    var res = await st.sb.auth.signUp({ email: mailOf(name), password: pass });
    if (res.error) throw new Error(zhErr(res.error.message));

    var session = res.data.session;
    if (!session) {
      var again = await st.sb.auth.signInWithPassword({ email: mailOf(name), password: pass });
      if (again.error) throw new Error(zhErr(again.error.message));
      session = again.data.session;
    }
    st.session = session;
    var ins = await st.sb.from('profiles')
      .insert({ id: session.user.id, username: name, avatar: '🙂', created_at: Date.now() });
    if (ins.error) throw new Error('昵称保存失败：' + zhErr(ins.error.message));
    await loadMe();
  }

  async function signIn(name, pass) {
    var res = await st.sb.auth.signInWithPassword({ email: mailOf(String(name || '').trim()), password: pass });
    if (res.error) throw new Error(zhErr(res.error.message));
    st.session = res.data.session;
    await loadMe();
  }

  async function logout() {
    if (st.chan && st.sb) { try { st.sb.removeChannel(st.chan); } catch (e) { } st.chan = null; }
    await st.sb.auth.signOut();
    st.session = null; st.me = null; st.friends = []; st.incoming = []; st.outgoing = [];
    st.view = 'public'; st.peer = null;
    paint();
  }

  /* ── 数据 ─────────────────────────────────────────────────────── */
  async function loadFriends() {
    if (!st.me) return;
    var uid = st.me.id;
    var r = await st.sb.from('friendships').select('*')
      .or('requester.eq.' + uid + ',addressee.eq.' + uid);
    if (r.error) { console.warn('[chat]', r.error.message); return; }
    var rows = r.data || [];
    var ids = [];
    rows.forEach(function (x) {
      var other = x.requester === uid ? x.addressee : x.requester;
      if (ids.indexOf(other) < 0) ids.push(other);
    });
    var map = {};
    if (ids.length) {
      var p = await st.sb.from('profiles').select('id,username,avatar').in('id', ids);
      (p.data || []).forEach(function (u) { map[u.id] = u; });
    }
    st.friends = []; st.incoming = []; st.outgoing = [];
    rows.forEach(function (x) {
      var mine = x.requester === uid;
      var other = mine ? x.addressee : x.requester;
      var u = map[other] || { id: other, username: '未知用户', avatar: '❓' };
      var item = { id: other, username: u.username, avatar: u.avatar || '🙂', fid: x.id, status: x.status };
      if (x.status === 'accepted') st.friends.push(item);
      else if (!mine) st.incoming.push(item);
      else st.outgoing.push(item);
    });
    if (st.view === 'friends') paint();
    paintBadge();
  }

  async function sendFriend(name) {
    name = String(name || '').trim();
    if (!name) throw new Error('先填对方的昵称');
    if (name === st.me.username) throw new Error('不能加自己');
    var p = await st.sb.from('profiles').select('id,username').eq('username', name).maybeSingle();
    if (!p.data) throw new Error('没有叫「' + name + '」的用户');
    if (st.friends.some(function (f) { return f.id === p.data.id; })) throw new Error('你们已经是好友了');
    var r = await st.sb.from('friendships')
      .insert({ requester: st.me.id, addressee: p.data.id, status: 'pending', created_at: Date.now() });
    if (r.error) {
      if (r.error.code === '23505') throw new Error('已经发过请求了，等对方同意');
      if (r.error.code === '23514') throw new Error('不能加自己');
      throw new Error(zhErr(r.error.message));
    }
    await loadFriends();
  }

  async function acceptFriend(item) {
    await st.sb.from('friendships').update({ status: 'accepted' }).eq('id', item.fid);
    await loadFriends();
  }
  async function dropFriend(item) {
    await st.sb.from('friendships').delete().eq('id', item.fid);
    await loadFriends();
  }

  function subscribe() {
    if (!st.sb || st.chan) return;
    var uid = st.me ? st.me.id : null;
    if (!uid) return;
    st.chan = st.sb.channel('hs-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_msgs' }, function (p) {
        onIncoming(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, function () {
        loadFriends();
      })
      .subscribe();
  }

  function onIncoming(m) {
    if (!m || !st.me) return;
    var mine = m.author === st.me.id;
    var here = (m.kind === 'public' && st.view === 'public' && st.open)
      || (m.kind === 'dm' && st.view === 'dm' && st.open && st.peer
        && (m.author === st.peer.id || m.peer === st.peer.id));
    if (here) {
      appendMsg(m);
      return;
    }
    if (mine) return;
    st.unread++;
    paintDot();
    if (!st.open && w.HS && HS.toast && st.unread === 1) {
      HS.toast('💬 ' + (m.nick || '有人') + ' 在聊天框里发了消息', 'info');
    }
  }

  /* ── 渲染 ─────────────────────────────────────────────────────── */
  function paintDot() {
    if (!dot) return;
    if (st.unread > 0) {
      dot.classList.add('on');
      dot.textContent = st.unread > 99 ? '99+' : String(st.unread);
    } else {
      dot.classList.remove('on');
      dot.textContent = '';
    }
  }
  function paintBadge() {
    var b = $('.hsc-badge', tabsEl);
    if (b) b.textContent = st.incoming.length ? String(st.incoming.length) : '';
  }
  function paintMe() {
    var me = $('.hsc-me', headEl);
    var lo = $('[data-a="logout"]', headEl);
    if (st.me) {
      me.innerHTML = '<span>' + esc(st.me.avatar) + '</span><b>' + esc(st.me.username) + '</b>';
      lo.hidden = false;
    } else {
      me.innerHTML = '';
      lo.hidden = true;
    }
  }

  function paint() {
    if (!root) return;
    paintMe();
    paintBadge();
    var signed = !!st.me;
    tabsEl.hidden = !signed;
    root.classList.toggle('guest', !signed);

    if (!st.sb) {
      bodyEl.innerHTML = '<div class="hsc-empty"><b>正在连接聊天服务…</b>第一次打开需要下载一小段脚本</div>';
      return;
    }
    // 没登录也能围观公屏，想说话再登录
    if (!signed) {
      if (st.view === 'auth') { renderAuth(); return; }
      st.view = 'public'; st.peer = null; renderChat(); return;
    }
    if (st.view === 'auth') st.view = 'public';   // 登录成功后回到公屏

    [].forEach.call(tabsEl.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-tab') === (st.view === 'dm' ? 'friends' : st.view);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    if (st.view === 'friends') renderFriends();
    else renderChat();
  }

  /* 登录 / 注册 */
  function renderAuth() {
    var isReg = st.authMode === 'reg';
    bodyEl.innerHTML =
      '<div class="hsc-auth">'
      + '<h3>' + (isReg ? '注册一个账号' : '登录后开始聊天') + '</h3>'
      + '<p>' + (isReg
        ? '只填昵称和密码，不用邮箱。昵称就是别人加你好友的名字。'
        : '用注册时填的昵称和密码登录，登录后才能发言和加好友。') + '</p>'
      + '<label>昵称</label>'
      + '<input class="hsc-u" maxlength="14" autocomplete="username" placeholder="2~14 个字">'
      + '<label>密码</label>'
      + '<input class="hsc-p" type="password" autocomplete="' + (isReg ? 'new-password' : 'current-password') + '" placeholder="至少 6 位">'
      + '<div class="hsc-err"></div>'
      + '<div class="hsc-row">'
      + '<button type="button" data-a="submit">' + (isReg ? '注册并进入' : '登录') + '</button>'
      + '<button type="button" class="ghost" data-a="switch">' + (isReg ? '已有账号' : '去注册') + '</button>'
      + '</div></div>';

    var u = $('.hsc-u', bodyEl), p = $('.hsc-p', bodyEl), err = $('.hsc-err', bodyEl);
    $('[data-a="switch"]', bodyEl).addEventListener('click', function () {
      st.authMode = isReg ? 'login' : 'reg';
      renderAuth();
    });
    function submit() {
      if (st.busy) return;
      var name = u.value.trim(), pass = p.value;
      if (!name || !pass) { err.textContent = '昵称和密码都要填'; return; }
      st.busy = true;
      err.textContent = '';
      var btn = $('[data-a="submit"]', bodyEl);
      btn.disabled = true; btn.textContent = isReg ? '注册中…' : '登录中…';
      (isReg ? signUp(name, pass) : signIn(name, pass)).then(function () {
        st.busy = false;
        paint();
        w.HS && HS.toast && HS.toast(isReg ? '注册成功，欢迎 ' + name : '欢迎回来，' + name, 'ok');
      }).catch(function (e) {
        st.busy = false;
        btn.disabled = false;
        btn.textContent = isReg ? '注册并进入' : '登录';
        err.textContent = e.message || '出错了';
      });
    }
    $('[data-a="submit"]', bodyEl).addEventListener('click', submit);
    bodyEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    setTimeout(function () { u.focus(); }, 60);
  }

  /* 消息视图 */
  function renderChat() {
    var signed = !!st.me;
    var dm = signed && st.view === 'dm' && st.peer;
    var target = dm ? st.peer : null;
    bodyEl.innerHTML =
      (dm
        ? '<div class="hsc-sub"><button class="hsc-ibtn" type="button" data-a="back">←</button>'
        + '<span>' + esc(target.avatar || '🙂') + ' ' + esc(target.username) + '</span></div>'
        : '')
      + '<div class="hsc-list"></div>'
      + (signed
        ? '<form class="hsc-form"><input maxlength="500" placeholder="'
          + (dm ? '只发给 ' + esc(target.username) : '在公屏说点什么…') + '"><button type="submit">发送</button></form>'
        : '<div class="hsc-loginbar"><span>登录后才能发言、加好友</span>'
          + '<button type="button" data-a="login">登录 / 注册</button></div>');

    var list = $('.hsc-list', bodyEl);

    if (!signed) {
      $('[data-a="login"]', bodyEl).addEventListener('click', function () {
        st.authMode = 'login';
        st.view = 'auth';
        paint();
      });
      loadMsgs(list, false, null);
      return;
    }

    var form = $('.hsc-form', bodyEl);
    var inp = $('input', form);

    list.innerHTML = '<div class="hsc-empty"><b>正在加载…</b></div>';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var text = inp.value.trim();
      if (!text) return;
      var btn = $('button', form);
      btn.disabled = true;
      var row = { author: st.me.id, nick: st.me.username, body: text, kind: dm ? 'dm' : 'public', ts: Date.now() };
      if (dm) row.peer = target.id;
      st.sb.from('chat_msgs').insert(row).then(function (r) {
        btn.disabled = false;
        if (r.error) { w.HS && HS.toast && HS.toast('发送失败：' + zhErr(r.error.message), 'err'); return; }
        inp.value = '';
        // 自己发的先本地回显，Realtime 可能晚一拍
        if (!list.querySelector('[data-local="1"][data-t="' + row.ts + '"]')) {
          appendMsg(Object.assign({ id: 'local-' + row.ts, _local: 1 }, row));
        }
      });
      inp.focus();
    });
    if (dm && $('[data-a="back"]', bodyEl)) {
      $('[data-a="back"]', bodyEl).addEventListener('click', function () {
        st.view = 'friends'; st.peer = null; paint();
      });
    }
    loadMsgs(list, dm, target);
  }

  async function loadMsgs(list, dm, target) {
    var q;
    if (dm) {
      q = st.sb.from('chat_msgs').select('*').eq('kind', 'dm')
        .or('and(author.eq.' + st.me.id + ',peer.eq.' + target.id + '),and(author.eq.' + target.id + ',peer.eq.' + st.me.id + ')')
        .order('ts', { ascending: false }).limit(60);
    } else {
      q = st.sb.from('chat_msgs').select('*').eq('kind', 'public')
        .order('ts', { ascending: false }).limit(60);
    }
    var r = await q;
    if (list !== $('.hsc-list', bodyEl)) return;   // 用户已经切走了
    if (r.error) {
      list.innerHTML = '<div class="hsc-empty"><b>加载失败</b>' + esc(zhErr(r.error.message)) + '</div>';
      return;
    }
    var rows = (r.data || []).slice().reverse();
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = '<div class="hsc-empty"><b>' + (dm ? '还没聊过' : '公屏还很安静') + '</b>'
        + (dm ? '打个招呼吧' : '注册过的人都能在这儿发言') + '</div>';
      return;
    }
    rows.forEach(function (m) { appendMsg(m, true); });
    list.scrollTop = list.scrollHeight;
  }

  function appendMsg(m, silent) {
    var list = $('.hsc-list', bodyEl);
    if (!list) return;
    var empty = $('.hsc-empty', list);
    if (empty) empty.remove();
    var mine = st.me && m.author === st.me.id;
    var node = d.createElement('div');
    node.className = 'hsc-msg' + (mine ? ' mine' : '');
    if (m._local) node.setAttribute('data-local', '1');
    node.setAttribute('data-t', m.ts);
    if (!silent) node.style.animationDelay = '0ms';
    node.innerHTML =
      '<div class="av">' + esc(
        mine ? (st.me.avatar || '🙂')
          : (st.peer && m.kind === 'dm' && m.author === st.peer.id ? (st.peer.avatar || '🙂') : '🙂')
      ) + '</div>'
      + '<div class="bd"><div class="who"><span>' + esc(mine ? '我' : (m.nick || '有人'))
      + '</span><span class="t">' + hhmm(m.ts) + '</span></div>'
      + '<div class="tx">' + esc(m.body) + '</div></div>';
    var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
    list.appendChild(node);
    if (atBottom || !silent) list.scrollTop = list.scrollHeight;
  }

  /* 好友视图 */
  function renderFriends() {
    var html = '<div class="hsc-friends">'
      + '<div class="hsc-add"><input maxlength="14" placeholder="输入对方昵称加好友"><button type="button" data-a="add">添加</button></div>'
      + '<div class="hsc-err"></div>';

    if (st.incoming.length) {
      html += '<div class="hsc-sec">等你通过（' + st.incoming.length + '）</div>';
      st.incoming.forEach(function (f) {
        html += '<div class="hsc-fr" data-fid="' + f.fid + '" data-uid="' + f.id + '">'
          + '<span class="av">' + esc(f.avatar) + '</span>'
          + '<span class="nm">' + esc(f.username) + '</span>'
          + '<button class="hsc-mini" data-a="accept">同意</button>'
          + '<button class="hsc-mini mute" data-a="drop">忽略</button></div>';
      });
    }
    html += '<div class="hsc-sec">好友（' + st.friends.length + '）</div>';
    if (!st.friends.length) {
      html += '<div class="hsc-fr"><span class="nm" style="color:var(--muted)">还没有好友，上面输入昵称加一个</span></div>';
    }
    st.friends.forEach(function (f) {
      html += '<div class="hsc-fr clickable" data-uid="' + f.id + '" data-name="' + esc(f.username) + '" data-av="' + esc(f.avatar) + '">'
        + '<span class="av">' + esc(f.avatar) + '</span>'
        + '<span class="nm">' + esc(f.username) + '</span>'
        + '<button class="hsc-mini" data-a="dm">私聊</button></div>';
    });
    if (st.outgoing.length) {
      html += '<div class="hsc-sec">已发出（' + st.outgoing.length + '）</div>';
      st.outgoing.forEach(function (f) {
        html += '<div class="hsc-fr"><span class="av">' + esc(f.avatar) + '</span>'
          + '<span class="nm">' + esc(f.username) + '</span>'
          + '<button class="hsc-mini mute" data-a="cancel" data-fid="' + f.fid + '">撤回</button></div>';
      });
    }
    html += '</div>';
    bodyEl.innerHTML = html;

    var wrap = $('.hsc-friends', bodyEl);
    var err = $('.hsc-err', bodyEl);
    var addInp = $('.hsc-add input', bodyEl);

    function doAdd() {
      var btn = $('[data-a="add"]', bodyEl);
      btn.disabled = true; err.textContent = '';
      sendFriend(addInp.value).then(function () {
        btn.disabled = false; addInp.value = '';
        w.HS && HS.toast && HS.toast('好友请求已发出', 'ok');
        renderFriends();
      }).catch(function (e) {
        btn.disabled = false;
        err.textContent = e.message || '添加失败';
      });
    }
    $('[data-a="add"]', bodyEl).addEventListener('click', doAdd);
    addInp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-a]');
      var row = e.target.closest('.hsc-fr');
      if (!row) return;
      var uid = row.getAttribute('data-uid');
      var fid = Number(row.getAttribute('data-fid'));
      var act = btn ? btn.getAttribute('data-a') : '';
      if (act === 'accept') { acceptFriend({ fid: fid }); return; }
      if (act === 'drop') { dropFriend({ fid: fid }); return; }
      if (act === 'cancel') { dropFriend({ fid: fid }); return; }
      // 点整行 / 点「私聊」都进私聊
      if (uid && (act === 'dm' || act === '')) {
        st.peer = {
          id: uid,
          username: row.getAttribute('data-name'),
          avatar: row.getAttribute('data-av')
        };
        st.view = 'dm';
        paint();
      }
    });
  }

  /* ── 启动 ─────────────────────────────────────────────────────── */
  function start() {
    injectCSS();
    mount();
    paintDot();
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();

  w.HS = w.HS || {};
  w.HS.chat = {
    open: function () { toggle(true); },
    close: function () { toggle(false); },
    toggle: toggle
  };
})(window, document);
