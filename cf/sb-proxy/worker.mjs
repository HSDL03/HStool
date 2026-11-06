/**
 * 红石的小站 · Supabase 反向代理（Cloudflare Worker）
 *
 * 作用：把 https://api.<你的域名>/* 原样转发到 Supabase 项目，
 *      让国内访问绕开 *.supabase.co 那条被掐掉的线路。
 *
 * 前端用法：window.HS_CHAT_SB_URL = 'https://api.<你的域名>'
 * 或者改 assets/js/account.js 里的 SB_HOSTS 第一项。
 *
 * 支持：
 *   - REST  /rest/v1/*        （PostgREST，聊天/好友/游戏房间全走这里）
 *   - Auth  /auth/v1/*        （注册、登录、刷新 token）
 *   - Realtime /realtime/v1/websocket  （WebSocket 双向转发）
 *   - Storage /storage/v1/*
 *   - GET /__health           自检：Worker 活着 + 上游通不通
 */

// 上游 Supabase 项目。想换项目：改这里，或者在 Worker 里加环境变量 UPSTREAM
const UPSTREAM_DEFAULT = 'https://lxdyrajbsjftduesvosh.supabase.co';

// 允许跨域调用的来源。留空数组 = 不限制（自己的项目用 anon key，key 本来就是公开的）。
// 想收紧就填，例如 ['https://hsdl03.github.io', 'http://127.0.0.1:8000']
const ALLOW_ORIGINS = [];

// 这些头是逐跳头，不能原样透传
const HOP_BY_HOP = [
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade'
];

function corsFor(origin) {
  const allowAll = ALLOW_ORIGINS.length === 0;
  const ok = allowAll || (origin && ALLOW_ORIGINS.indexOf(origin) > -1);
  if (!ok) return null;
  return {
    'Access-Control-Allow-Origin': allowAll ? (origin || '*') : origin,
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS,HEAD',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Content-Range,Content-Location,Location,ETag',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(body, status, extra) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, extra || {})
  });
}

export default {
  async fetch(request, env) {
    const UPSTREAM = (env && env.UPSTREAM) || UPSTREAM_DEFAULT;
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsFor(origin);

    if (!cors) {
      return json({ error: 'origin_not_allowed', origin }, 403);
    }

    // ── 自检：不碰上游也能看出 Worker 有没有跑起来
    if (url.pathname === '/__health') {
      const started = Date.now();
      let upstream = { ok: false };
      try {
        const t = new AbortController();
        const timer = setTimeout(() => t.abort(), 6000);
        const r = await fetch(UPSTREAM + '/auth/v1/health', {
          headers: { apikey: 'probe' },
          signal: t.signal
        });
        clearTimeout(timer);
        upstream = { ok: true, status: r.status };
      } catch (e) {
        upstream = { ok: false, error: String((e && e.message) || e) };
      }
      return json({
        worker: 'ok',
        upstream: UPSTREAM,
        reachable: upstream.ok,
        ms: Date.now() - started,
        detail: upstream
      }, upstream.ok ? 200 : 502, cors);
    }

    // ── 预检：浏览器带 apikey / authorization 头时一定先发 OPTIONS，
    //    这一步直接由 Worker 应答，省一次往返（上游也会答，但没必要绕）
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // ── 组装转发请求
    const target = UPSTREAM + url.pathname + url.search;

    const headers = new Headers();
    for (const [k, v] of request.headers) {
      if (HOP_BY_HOP.indexOf(k.toLowerCase()) > -1) continue;
      headers.set(k, v);
    }
    // 上游按自己的域名路由，Host 必须是 supabase.co
    headers.delete('host');
    // 让上游知道真实来源（排查问题时有用）
    headers.set('X-Forwarded-Host', url.host);

    const isWs = (request.headers.get('Upgrade') || '').toLowerCase() === 'websocket';

    const init = {
      method: request.method,
      headers,
      redirect: 'manual'
    };
    // 先把 body 读成字节再转发：聊天消息都是几百字节，缓冲开销可忽略，
    // 但能避开不同运行时对「流式 body 需要 duplex 标记」的差异。
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const buf = await request.arrayBuffer();
      if (buf.byteLength) init.body = buf;
    }

    // WebSocket 要保留 Upgrade 头（它在逐跳列表里，上面被删了，这里补回去）
    if (isWs) {
      init.headers = new Headers(headers);
      init.headers.set('Upgrade', 'websocket');
      init.headers.set('Connection', 'Upgrade');
    }

    let upstreamRes;
    try {
      upstreamRes = await fetch(target, init);
    } catch (e) {
      return json({
        error: 'upstream_unreachable',
        message: 'Worker 连不上 Supabase（这次是 Cloudflare 到上游的问题，不是你本地网络）',
        detail: String((e && e.message) || e)
      }, 502, cors);
    }

    // ── WebSocket：把上游的 socket 原样交还给浏览器
    if (isWs) {
      if (!upstreamRes.webSocket) {
        return new Response('upstream refused websocket upgrade', { status: 502, headers: cors });
      }
      return new Response(null, { status: 101, webSocket: upstreamRes.webSocket });
    }

    // ── 普通 HTTP 响应
    const out = new Headers();
    for (const [k, v] of upstreamRes.headers) {
      const lk = k.toLowerCase();
      if (lk === 'content-encoding' || lk === 'content-length') continue; // 让 CF 重新压缩
      if (lk.startsWith('access-control-')) continue;                     // 用自己算的 CORS
      out.set(k, v);
    }
    for (const k in cors) out.set(k, cors[k]);
    // 上游偶尔会返回相对 Location，统一成绝对，前端重定向才不会跑偏
    const loc = out.get('Location');
    if (loc && loc.startsWith('/')) out.set('Location', UPSTREAM + loc);

    return new Response(upstreamRes.body, {
      status: upstreamRes.status,
      statusText: upstreamRes.statusText,
      headers: out
    });
  }
};
