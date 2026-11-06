/* ============================================================================
   红石的小站 · 全站账号 v1
   account.js — 顶栏右上角的账号入口（登录 / 注册 / 资料 / 退出）

   账号属于整站身份（聊天、以后的好友/收藏都靠它），所以入口放顶栏，不塞在聊天面板里。
   内部用 Supabase Auth 的邮箱+密码，但用户只填「昵称 + 密码」：
   昵称哈希成 u<base36>@hs.local，省掉邮箱验证。
   ========================================================================== */
(function (w, d) {
  'use strict';

  var HS = w.HS || {};

  /* ── 后端地址 ────────────────────────────────────────────────────
     按优先级排，第一个能连上的就用。
       1. window.HS_CHAT_SB_URL  —— 手动覆盖（调试用）
       2. SB_PROXY               —— Cloudflare 反代，国内可达
       3. SB_DEFAULT             —— 直连 Supabase，反代挂了时的兜底
     换后端只改这三行，别处不用动。 */
  var SB_DEFAULT = 'https://lxdyrajbsjftduesvosh.supabase.co';
  var SB_PROXY = '';   // ← 反代域名下来后填这里，例如 'https://api.hs.dpdns.org'

  var SB_HOSTS = [w.HS_CHAT_SB_URL, SB_PROXY, SB_DEFAULT]
    .map(function (x) { return String(x || '').replace(/\/+$/, ''); })
    .filter(function (x, i, a) { return x && a.indexOf(x) === i; });

  var SB_URL = SB_HOSTS[0];
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4ZHlyYWpic2pmdGR1ZXN2b3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzkyMzksImV4cCI6MjEwNjA1NTIzOX0.ZEC7EohRqr0YCxqACBRTVI3-TGNFWUGxq-aH_yqIhig';

  function url(p) {
    if (HS.site && HS.site.url) return HS.site.url(p);
    var s = d.currentScript && d.currentScript.src;
    if (s) return s.replace(/assets\/js\/account\.js.*$/, '') + p;
    return p;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(s, r) { return (r || d).querySelector(s); }

  function slugOf(name) {
    var h = 2166136261, s = String(name).trim().toLowerCase();
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return 'u' + h.toString(36);
  }
  function mailOf(name) { return slugOf(name) + '@hs.local'; }

  /* 把 Supabase 的英文错误翻成人话；网络问题要说得比「稍后再试」具体 */
  function zhErr(msg) {
    var m = String(msg || '');
    if (/Invalid login credentials/i.test(m)) return '昵称或密码不对';
    if (/already registered|already exists|User already/i.test(m)) return '这个昵称已经被占用了';
    if (/Password should be at least/i.test(m)) return '密码至少 6 位';
    if (/Email not confirmed/i.test(m)) return '账号还没确认，稍后再试一次';
    if (/rate limit|too many|Too many/i.test(m)) return '操作太频繁，歇一会儿';
    if (/Failed to fetch|NetworkError|ERR_|fetch failed|load failed|aborted/i.test(m)) {
      var host = String(SB_URL || '').replace(/^https?:\/\//, '').split('/')[0];
      if (SB_PROXY && SB_URL === SB_PROXY) {
        return '连不上 ' + host + '（不是密码问题）：反代这边出状况了，稍后再试或换个网络。';
      }
      return '连不上 ' + host + '（不是密码问题）：你的网络到这个地址的连接被中断了，换个网络或开代理再试。';
    }
    return m.slice(0, 90);
  }

  /* ── 状态 ─────────────────────────────────────────────────────── */
  var st = {
    sb: null, session: null, me: null,
    mode: 'login',   // login | register | profile
    busy: false, open: false, failed: null,
    waiters: [], listeners: [], booted: false, stat: null
  };

  function emit() {
    for (var i = 0; i < st.listeners.length; i++) {
      try { st.listeners[i](st.me); } catch (e) { }
    }
  }

  /* ── SDK / 客户端 ─────────────────────────────────────────────── */
  var readyPromise = null;

  function loadSDK() {
    if (w.supabase && w.supabase.createClient) return Promise.resolve();
    return new Promise(function (res, rej) {
      var s = d.createElement('script');
      s.src = url('assets/vendor/supabase.js');
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('Failed to fetch')); };
      d.head.appendChild(s);
    });
  }

  /* 只判断「这个地址连不连得上」，不读内容：no-cors 下拿不到响应体也无所谓 */
  function probe(base, ms) {
    return new Promise(function (res) {
      var done = false;
      function fin(v) { if (!done) { done = true; res(v); } }
      var timer = setTimeout(function () { fin(false); }, ms);
      try {
        fetch(base + '/auth/v1/health', { mode: 'no-cors', cache: 'no-store' })
          .then(function () { clearTimeout(timer); fin(true); })
          .catch(function () { clearTimeout(timer); fin(false); });
      } catch (e) { clearTimeout(timer); fin(false); }
    });
  }

  /* 并发探一遍候选，按优先级取第一个通的。结果存 sessionStorage，
     同一次会话里不重复等；换个标签页/新会话会重新判断（因为可能要挂梯子）。 */
  function pickHost() {
    if (SB_HOSTS.length < 2) return Promise.resolve(SB_HOSTS[0]);
    try {
      var c = JSON.parse(w.sessionStorage.getItem('hs-sb-host') || 'null');
      if (c && c.h && Date.now() - c.t < 10 * 60 * 1000 && SB_HOSTS.indexOf(c.h) > -1) {
        return Promise.resolve(c.h);
      }
    } catch (e) { }

    // 串行试：第一个通了就不再去碰后面的，避免控制台多出一堆无谓的失败请求
    var i = 0;
    function next() {
      if (i >= SB_HOSTS.length) return Promise.resolve(SB_HOSTS[0]);  // 全不通：先按第一个来，让报错文案说清楚
      var h = SB_HOSTS[i++];
      return probe(h, 2200).then(function (ok) { return ok ? h : next(); });
    }

    return next().then(function (pick) {
      try { w.sessionStorage.setItem('hs-sb-host', JSON.stringify({ h: pick, t: Date.now() })); } catch (e) { }
      return pick;
    });
  }

  function ensure() {
    if (!readyPromise) {
      readyPromise = pickHost().then(function (host) {
        SB_URL = host;
        return loadSDK();
      }).then(function () {
        st.sb = w.supabase.createClient(SB_URL, SB_KEY, { realtime: { params: { eventsPerSecond: 10 } } });
        st.sb.auth.onAuthStateChange(function (_ev, session) {
          var was = st.session && st.session.user ? st.session.user.id : null;
          var now = session && session.user ? session.user.id : null;
          st.session = session;
          if (was !== now) {
            st.me = null;
            if (now) loadMe().then(emit, emit);
            else emit();
          }
        });
        return st.sb.auth.getSession();
      }).then(function (r) {
        var s = r && r.data ? r.data.session : null;
        st.session = s;
        if (s && s.user) return loadMe();
      }).then(function () {
        st.failed = null;
        paintBtn();
        emit();
      }).catch(function (e) {
        st.failed = (e && e.message) || '加载失败';
        readyPromise = null;   // 允许下次重试
        paintBtn();
        throw e;
      });
    }
    return readyPromise;
  }

  async function loadMe() {
    if (!st.session || !st.session.user) { st.me = null; return; }
    var uid = st.session.user.id;
    var r = await st.sb.from('profiles').select('id,username,avatar').eq('id', uid).maybeSingle();
    if (r.data) {
      st.me = { id: uid, username: r.data.username, avatar: r.data.avatar || '🙂' };
    } else {
      var mail = (st.session.user.email || '').split('@')[0] || '用户';
      st.me = { id: uid, username: mail, avatar: '🙂' };
    }
    loadStat();
    paintBtn();
  }

  async function loadStat() {
    if (!st.me || !st.sb) return;
    var uid = st.me.id;
    var out = { friends: 0, msgs: 0 };
    try {
      var f = await st.sb.from('friendships').select('id,status')
        .or('requester.eq.' + uid + ',addressee.eq.' + uid).eq('status', 'accepted');
      out.friends = (f.data || []).length;
      var m = await st.sb.from('chat_msgs').select('id', { count: 'exact', head: true }).eq('author', uid);
      out.msgs = m.count || 0;
    } catch (e) { }
    st.stat = out;
    if (st.open && st.mode === 'profile') paintBox();
  }

  /* ── 登录 / 注册 / 退出 ───────────────────────────────────────── */
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
    // 23505 = 并发注册撞车，说明名额被抢了
    if (ins.error && ins.error.code !== '23505') throw new Error('昵称保存失败：' + zhErr(ins.error.message));
    await loadMe();
    emit();
  }

  async function signIn(name, pass) {
    var res = await st.sb.auth.signInWithPassword({ email: mailOf(String(name || '').trim()), password: pass });
    if (res.error) throw new Error(zhErr(res.error.message));
    st.session = res.data.session;
    await loadMe();
    emit();
  }

  async function signOut() {
    try { await st.sb.auth.signOut(); } catch (e) { }
    st.session = null; st.me = null; st.stat = null;
    emit();
    close();
  }

  /* ── 顶栏按钮 ─────────────────────────────────────────────────── */
  var btn = null;

  function paintBtn() {
    if (!btn) return;
    if (st.me) {
      btn.className = '';
      btn.innerHTML = '<span class="acc-av">' + esc(st.me.avatar) + '</span>'
        + '<span class="acc-nm">' + esc(st.me.username) + '</span>';
      btn.title = '账号：' + st.me.username;
    } else {
      btn.className = 'guest';
      btn.innerHTML = '<span class="acc-av">👤</span><span class="acc-nm">登录</span>';
      btn.title = st.failed ? '连不上服务器，点击重试' : '登录 / 注册';
    }
  }

  function mountBtn() {
    if (btn) return;
    var top = $('.topbar');
    if (!top) return;
    btn = d.createElement('button');
    btn.id = 'hsAccount';
    btn.type = 'button';
    btn.className = 'guest';
    btn.innerHTML = '<span class="acc-av">👤</span><span class="acc-nm">登录</span>';
    btn.addEventListener('click', function () {
      if (st.me) open('profile');
      else if (st.failed) { st.failed = null; ensure().then(function () { open('login'); }).catch(function () { open('login'); }); }
      else open('login');
    });
    top.appendChild(btn);
    paintBtn();
  }

  /* ── 弹窗 ─────────────────────────────────────────────────────── */
  var mask = null, box = null;

  function mountBox() {
    if (mask) return;
    mask = d.createElement('div');
    mask.id = 'hsAccMask';
    mask.innerHTML = '<div id="hsAccBox" role="dialog" aria-modal="true" aria-label="账号"></div>';
    d.body.appendChild(mask);
    box = $('#hsAccBox', mask);

    mask.addEventListener('click', function (e) {
      if (e.target === mask) close();
    });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && st.open) close();
    });
  }

  function paintBox() {
    if (!box) return;
    var signed = !!st.me;

    if (signed && st.mode !== 'login' && st.mode !== 'register') st.mode = 'profile';
    if (!signed && (st.mode === 'profile')) st.mode = 'login';

    var head = '<div class="acc-head"><b>'
      + (st.mode === 'register' ? '注册账号' : st.mode === 'profile' ? '我的账号' : '登录')
      + '</b><button class="acc-x" type="button" data-a="close" aria-label="关闭">✕</button></div>';

    var body;
    if (st.mode === 'profile') {
      var s = st.stat || { friends: 0, msgs: 0 };
      body = '<div class="acc-body">'
        + '<div class="acc-me"><div class="big">' + esc(st.me.avatar) + '</div>'
        + '<div class="meta"><b>' + esc(st.me.username) + '</b><span>已登录 · 全站通用</span></div></div>'
        + '<div class="acc-stat">'
        + '<div><b>' + s.friends + '</b><span>好友</span></div>'
        + '<div><b>' + s.msgs + '</b><span>发言</span></div>'
        + '</div>'
        + '<div class="acc-row"><button type="button" data-a="logout">退出登录</button></div>'
        + '<div class="acc-tip">想聊天点右下角的 💬，你的昵称会显示在消息上。</div>'
        + '</div>';
    } else {
      var reg = st.mode === 'register';
      body = '<div class="acc-body">'
        + '<p>' + (reg
          ? '只填昵称和密码，不用邮箱。昵称就是别人加你好友用的名字。'
          : '用注册时填的昵称和密码登录。登录后整站都认这个账号。') + '</p>'
        + '<label for="accU">昵称</label>'
        + '<input id="accU" class="acc-u" maxlength="14" autocomplete="username" placeholder="2~14 个字">'
        + '<label for="accP">密码</label>'
        + '<input id="accP" class="acc-p" type="password" autocomplete="' + (reg ? 'new-password' : 'current-password') + '" placeholder="至少 6 位">'
        + '<div class="acc-err"></div>'
        + '<div class="acc-row">'
        + '<button type="button" data-a="submit">' + (reg ? '注册并登录' : '登录') + '</button>'
        + '<button type="button" class="ghost" data-a="switch">' + (reg ? '已有账号' : '去注册') + '</button>'
        + '</div></div>';
    }
    box.innerHTML = head + body;
    bind();
    var u = $('.acc-u', box);
    if (u) setTimeout(function () { u.focus(); }, 80);
  }

  function setErr(msg) {
    var e = $('.acc-err', box);
    if (!e) return;
    e.textContent = msg || '';
    e.classList.remove('shake');
    if (msg) { void e.offsetWidth; e.classList.add('shake'); }
  }

  function bind() {
    var x = $('[data-a="close"]', box);
    if (x) x.addEventListener('click', close);

    var sw = $('[data-a="switch"]', box);
    if (sw) sw.addEventListener('click', function () {
      st.mode = st.mode === 'register' ? 'login' : 'register';
      st.failed = null;
      paintBox();
    });

    var lo = $('[data-a="logout"]', box);
    if (lo) lo.addEventListener('click', function () { signOut(); });

    var sub = $('[data-a="submit"]', box);
    if (sub) {
      var go = function () {
        if (st.busy) return;
        var u = $('.acc-u', box), p = $('.acc-p', box);
        var name = u.value.trim(), pass = p.value;
        if (!name || !pass) { setErr('昵称和密码都要填'); return; }
        st.busy = true;
        setErr('');
        var reg = st.mode === 'register';
        sub.disabled = true;
        sub.textContent = reg ? '注册中…' : '登录中…';

        var pre = st.sb ? Promise.resolve() : ensure();
        pre.then(function () {
          return reg ? signUp(name, pass) : signIn(name, pass);
        }).then(function () {
          st.busy = false;
          st.mode = 'profile';
          paintBox();
          w.HS && HS.toast && HS.toast(reg ? '注册成功，欢迎 ' + name : '欢迎回来，' + name, 'ok');
        }).catch(function (e) {
          st.busy = false;
          sub.disabled = false;
          sub.textContent = reg ? '注册并登录' : '登录';
          setErr(e.message || '出错了');
        });
      };
      sub.addEventListener('click', go);
      box.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
    }
  }

  function open(mode) {
    mountBtn();
    mountBox();
    if (mode) st.mode = mode;
    if (st.me && (st.mode === 'login' || st.mode === 'register')) st.mode = 'profile';
    st.open = true;
    mask.classList.add('on');
    paintBox();
    // 每次打开都重算一次好友数/发言数（loadStat 完成后会自己重绘资料页）
    if (st.me) loadStat();
    if (!st.sb) {
      ensure().then(function () {
        if (st.open) paintBox();
      }).catch(function (e) {
        if (st.open) setErr(zhErr((e && e.message) || 'Failed to fetch'));
      });
    }
  }

  function close() {
    st.open = false;
    if (mask) mask.classList.remove('on');
  }

  /* ── 对外 ─────────────────────────────────────────────────────── */
  HS.account = {
    ready: function () { return ensure(); },
    get sb() { return st.sb; },
    get me() { return st.me; },
    onChange: function (fn) {
      st.listeners.push(fn);
      try { fn(st.me); } catch (e) { }
    },
    open: open,
    close: close,
    require: function (mode) {
      if (st.me) return true;
      open(mode || 'login');
      return false;
    },
    refresh: function () {
      if (st.me) { loadMe().then(function () { paintBtn(); emit(); }); }
    }
  };
  w.HS = HS;

  /* ── 启动 ─────────────────────────────────────────────────────── */
  function start() {
    if (st.booted) return;
    st.booted = true;
    var l = d.createElement('link');
    l.rel = 'stylesheet';
    l.href = url('assets/css/account.css');
    d.head.appendChild(l);

    mountBtn();
    mountBox();

    // 顶栏按钮先出现，SDK 等页面空闲了再加载，不抢首屏
    var kick = function () { ensure().catch(function () { }); };
    if (w.requestIdleCallback) w.requestIdleCallback(kick, { timeout: 2500 });
    else setTimeout(kick, 800);

    // 账号就绪后再挂聊天（聊天依赖账号）
    var chat = d.createElement('script');
    chat.src = url('assets/js/chat.js');
    chat.async = true;
    d.body.appendChild(chat);
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();
})(window, document);
