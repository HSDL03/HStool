/* ============================================================================
   红石的小站 · 全站聊天框 v2
   chat.js — 右下角悬浮入口：公屏发言 / 加好友 / 私聊

   账号已经独立到 assets/js/account.js（顶栏右上角），这里只消费 HS.account：
   登录态、Supabase client 都从那边拿，不再自己建一套。
   ========================================================================== */
(function (w, d) {
  'use strict';

  var HS = w.HS || {};
  var acc = HS.account || null;
  if (!acc) return;          // account.js 一定先于本文件加载

  /* ── 小工具 ───────────────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function $(s, r) { return (r || d).querySelector(s); }
  function hhmm(ts) {
    var t = new Date(Number(ts) || Date.now());
    var p = function (n) { return n < 10 ? '0' + n : n; };
    return p(t.getHours()) + ':' + p(t.getMinutes());
  }
  function zhErr(msg) {
    var m = String(msg || '');
    if (/Failed to fetch|NetworkError|ERR_|fetch failed|load failed/i.test(m)) {
      return '连不上服务器，检查一下网络';
    }
    if (/duplicate|23505/i.test(m)) return '已经发过请求了';
    return m.slice(0, 70);
  }
  function meId() { return acc.me ? acc.me.id : null; }
  function sb() { return acc.sb; }

  /* ── 状态 ─────────────────────────────────────────────────────── */
  var st = {
    open: false, view: 'public', peer: null,
    friends: [], incoming: [], outgoing: [],
    unread: 0, chan: null, mounted: false
  };

  var root, fab, dot, panel, tabsEl, bodyEl;

  /* ── 壳 ───────────────────────────────────────────────────────── */
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
    tabsEl = $('.hsc-tabs', root);
    bodyEl = $('.hsc-view', root);

    fab.addEventListener('click', function () { toggle(); });
    $('[data-a="close"]', root).addEventListener('click', function () { toggle(false); });
    tabsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      st.view = b.getAttribute('data-tab');
      st.peer = null;
      paint();
    });
    panel.addEventListener('click', function (e) { e.stopPropagation(); });
    d.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && st.open) toggle(false);
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
      paint();
      var inp = $('.hsc-form input', panel);
      if (inp) setTimeout(function () { inp.focus(); }, 180);
    }
  }

  /* ── 数据 ─────────────────────────────────────────────────────── */
  async function loadFriends() {
    if (!meId() || !sb()) return;
    var uid = meId();
    var r = await sb().from('friendships').select('*')
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
      var p = await sb().from('profiles').select('id,username,avatar').in('id', ids);
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
    if (name === acc.me.username) throw new Error('不能加自己');
    var p = await sb().from('profiles').select('id,username').eq('username', name).maybeSingle();
    if (!p.data) throw new Error('没有叫「' + name + '」的用户');
    if (st.friends.some(function (f) { return f.id === p.data.id; })) throw new Error('你们已经是好友了');
    var r = await sb().from('friendships')
      .insert({ requester: meId(), addressee: p.data.id, status: 'pending', created_at: Date.now() });
    if (r.error) {
      if (r.error.code === '23505') throw new Error('已经发过请求了，等对方同意');
      if (r.error.code === '23514') throw new Error('不能加自己');
      throw new Error(zhErr(r.error.message));
    }
    await loadFriends();
  }

  async function acceptFriend(item) {
    await sb().from('friendships').update({ status: 'accepted' }).eq('id', item.fid);
    await loadFriends();
  }
  async function dropFriend(item) {
    await sb().from('friendships').delete().eq('id', item.fid);
    await loadFriends();
  }

  function unsubscribe() {
    if (st.chan && sb()) { try { sb().removeChannel(st.chan); } catch (e) { } }
    st.chan = null;
  }

  function subscribe() {
    if (!sb() || !meId() || st.chan) return;
    st.chan = sb().channel('hs-chat')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_msgs' }, function (p) {
        onIncoming(p.new);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, function () {
        loadFriends();
      })
      .subscribe();
  }

  function onIncoming(m) {
    if (!m || !meId()) return;
    var mine = m.author === meId();
    var here = (m.kind === 'public' && st.view === 'public' && st.open)
      || (m.kind === 'dm' && st.view === 'dm' && st.open && st.peer
        && (m.author === st.peer.id || m.peer === st.peer.id));
    if (here) { appendMsg(m); return; }
    if (mine) return;
    st.unread++;
    paintDot();
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

  function paint() {
    if (!root) return;
    var signed = !!acc.me;
    tabsEl.hidden = !signed;
    root.classList.toggle('guest', !signed);

    if (!sb()) {
      bodyEl.innerHTML = '<div class="hsc-empty"><b>正在连接聊天服务…</b>'
        + (acc.failed ? '连不上服务器，检查网络后重开这个面板' : '第一次打开需要下载一小段脚本')
        + '</div>';
      return;
    }
    if (!signed) { st.view = 'public'; st.peer = null; renderChat(); return; }

    [].forEach.call(tabsEl.querySelectorAll('button'), function (b) {
      var on = b.getAttribute('data-tab') === (st.view === 'dm' ? 'friends' : st.view);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    paintBadge();

    if (st.view === 'friends') renderFriends();
    else renderChat();
  }

  /* 消息视图 */
  function renderChat() {
    var signed = !!acc.me;
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
        acc.open('login');
      });
      // 面板没展开就不联网，展开时才拉公屏
      if (st.open) loadMsgs(list, false, null);
      else list.innerHTML = '<div class="hsc-empty"><b>公屏</b>点开看看大家在聊什么</div>';
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
      var row = { author: meId(), nick: acc.me.username, body: text, kind: dm ? 'dm' : 'public', ts: Date.now() };
      if (dm) row.peer = target.id;
      sb().from('chat_msgs').insert(row).then(function (r) {
        btn.disabled = false;
        if (r.error) { w.HS && HS.toast && HS.toast('发送失败：' + zhErr(r.error.message), 'err'); return; }
        inp.value = '';
        if (!list.querySelector('[data-t="' + row.ts + '"]')) {
          appendMsg(Object.assign({ id: 'local-' + row.ts, _local: 1 }, row));
        }
      });
      inp.focus();
    });
    if (dm) {
      var bk = $('[data-a="back"]', bodyEl);
      if (bk) bk.addEventListener('click', function () {
        st.view = 'friends'; st.peer = null; paint();
      });
    }
    if (st.open) loadMsgs(list, dm, target);
  }

  async function loadMsgs(list, dm, target) {
    if (!sb()) return;
    var q;
    if (dm && meId()) {
      q = sb().from('chat_msgs').select('*').eq('kind', 'dm')
        .or('and(author.eq.' + meId() + ',peer.eq.' + target.id + '),and(author.eq.' + target.id + ',peer.eq.' + meId() + ')')
        .order('ts', { ascending: false }).limit(60);
    } else {
      q = sb().from('chat_msgs').select('*').eq('kind', 'public')
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
    var mine = meId() && m.author === meId();
    var node = d.createElement('div');
    node.className = 'hsc-msg' + (mine ? ' mine' : '');
    if (m._local) node.setAttribute('data-local', '1');
    node.setAttribute('data-t', m.ts);
    var av = mine
      ? (acc.me.avatar || '🙂')
      : (st.peer && m.kind === 'dm' && m.author === st.peer.id ? (st.peer.avatar || '🙂') : '🙂');
    node.innerHTML =
      '<div class="av">' + esc(av) + '</div>'
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
      html += '<div class="hsc-empty" style="padding:14px 6px;text-align:left">还没有好友，上面输入昵称加一个</div>';
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

    // 取 DOM 一律现查：面板会整体重绘，闭包里存着的旧节点会脱离文档
    function doAdd() {
      var inp = $('.hsc-add input', bodyEl);
      var btn = $('[data-a="add"]', bodyEl);
      var err = $('.hsc-err', bodyEl);
      if (!inp || !btn) return;
      btn.disabled = true;
      if (err) err.textContent = '';
      sendFriend(inp.value).then(function () {
        var b2 = $('[data-a="add"]', bodyEl);
        var i2 = $('.hsc-add input', bodyEl);
        if (b2) b2.disabled = false;
        if (i2) i2.value = '';
        w.HS && HS.toast && HS.toast('好友请求已发出', 'ok');
        renderFriends();
      }).catch(function (e) {
        var b2 = $('[data-a="add"]', bodyEl);
        var e2 = $('.hsc-err', bodyEl);
        if (b2) b2.disabled = false;
        if (e2) e2.textContent = e.message || '添加失败';
      });
    }

    wrap.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-a]');
      var act = btn ? btn.getAttribute('data-a') : '';

      if (act === 'add') { doAdd(); return; }

      var row = e.target.closest('.hsc-fr');
      if (!row) return;
      var uid = row.getAttribute('data-uid');
      var fid = Number(row.getAttribute('data-fid'));
      if (act === 'accept') { acceptFriend({ fid: fid }); return; }
      if (act === 'drop' || act === 'cancel') { dropFriend({ fid: fid }); return; }
      if (uid && (act === 'dm' || act === '')) {
        st.peer = { id: uid, username: row.getAttribute('data-name'), avatar: row.getAttribute('data-av') };
        st.view = 'dm';
        paint();
      }
    });

    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.closest('.hsc-add')) { e.preventDefault(); doAdd(); }
    });
  }

  /* ── 跟着账号走 ───────────────────────────────────────────────── */
  acc.onChange(function (me) {
    if (!st.mounted) return;
    if (me) {
      loadFriends();
      subscribe();
      paint();
    } else {
      unsubscribe();
      st.friends = []; st.incoming = []; st.outgoing = [];
      st.view = 'public'; st.peer = null; st.unread = 0;
      paintDot();
      paint();
    }
  });

  /* ── 启动 ─────────────────────────────────────────────────────── */
  function start() {
    var here = d.currentScript && d.currentScript.src;
    var base = here ? here.replace(/assets\/js\/chat\.js.*$/, '') : '';
    var l = d.createElement('link');
    l.rel = 'stylesheet';
    l.href = base + 'assets/css/chat.css';
    d.head.appendChild(l);

    mount();
    paintDot();
    // 未登录不预拉公屏：面板没打开就联网，网络差的时候每页控制台都会红
    if (acc.me) { loadFriends(); subscribe(); paint(); }
  }

  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start);
  else start();

  w.HS = HS;
  HS.chat = {
    open: function () { toggle(true); },
    close: function () { toggle(false); },
    toggle: toggle
  };
})(window, document);
