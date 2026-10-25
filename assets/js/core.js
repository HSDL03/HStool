/* ============================================================================
   红石的小站 · 核心脚本 v2
   core.js — 主题引擎 / 装饰背景 / 命令面板 / Toast / 滚动进场 / 状态条
   无依赖，所有浏览器通用 API，不加载任何外部资源
   ========================================================================== */
(function (window, document) {
  'use strict';

  var HS = window.HS || {};

  /* ─────────────────────────── 基础工具 ─────────────────────────── */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function raf(fn) { return window.requestAnimationFrame(fn); }
  function on(node, type, fn, opt) { if (node) node.addEventListener(type, fn, opt); }

  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem(k); return true; } catch (e) { return false; } },
    json: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    setJson: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────────────────────── 主题 ─────────────────────────────── */
  var THEMES = [
    { id: 'mc-wiki', name: '🟩 MC Wiki', desc: '我的世界中文 Wiki', colors: ['#3d521f', '#fffdf5', '#56682c'], shape: 'square' },
    { id: 'mc-night', name: '⬛ MC 夜晚', desc: 'Minecraft 夜间', colors: ['#8ec44a', '#1a1a1a', '#3d521f'], shape: 'square' },
    { id: 'mc-nether', name: '🔥 MC 下界', desc: '地狱岩浆风', colors: ['#ff6030', '#1a0a0a', '#8a2010'], shape: 'lava' },
    { id: 'mc-end', name: '🌌 MC 末地', desc: '末地虚空紫', colors: ['#a060ff', '#0f0a1a', '#4a2080'], shape: 'spark' },
    { id: 'sakura', name: '🌸 樱花', desc: '粉嫩柔和', colors: ['#d04080', '#fffafc', '#ff80a0'], shape: 'petal' },
    { id: 'ocean', name: '🌊 海洋', desc: '清凉海蓝', colors: ['#0066cc', '#f0f8ff', '#40a0dc'], shape: 'bubble' },
    { id: 'github-light', name: '☀️ GitHub 浅色', desc: '清爽默认', colors: ['#0969da', '#f6f8fa', '#1f2328'], shape: 'square' },
    { id: 'github-dark', name: '🌙 GitHub 暗色', desc: '护眼夜间', colors: ['#4493f8', '#161b22', '#e6edf3'], shape: 'square' }
  ];
  var K_THEME = 'hs-theme';
  var curTheme = 'mc-wiki';
  var themeListeners = [];

  function themeMeta(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
    return THEMES[0];
  }
  function systemTheme() {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return dark ? 'mc-night' : 'mc-wiki';
  }
  function resolveTheme(pref) {
    return (!pref || pref === 'auto') ? systemTheme() : pref;
  }
  function paintTheme(id, pref) {
    curTheme = id;
    document.documentElement.setAttribute('data-theme', id);
    document.documentElement.setAttribute('data-theme-pref', pref || id);
    var meta = themeMeta(id);
    var tc = document.querySelector('meta[name="theme-color"]');
    if (!tc) { tc = el('meta'); tc.name = 'theme-color'; document.head.appendChild(tc); }
    tc.content = meta.colors[0];
    buildThemeGrid(pref);
    for (var i = 0; i < themeListeners.length; i++) { try { themeListeners[i](id); } catch (e) { } }
  }
  function setTheme(pref) {
    store.set(K_THEME, pref);
    paintTheme(resolveTheme(pref), pref);
    decor.refresh();
  }
  function getThemePref() {
    var p = store.get(K_THEME, 'mc-wiki');
    if (p === 'auto') return p;
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === p) return p;
    return 'mc-wiki';
  }

  function buildThemeGrid(pref) {
    var grid = $('#themeGrid');
    if (!grid) return;
    var active = pref || curTheme;
    var html = '';
    html += '<button type="button" class="theme-card' + (active === 'auto' ? ' active' : '') + '" data-theme-val="auto">' +
      '<div class="theme-prev"><span style="background:linear-gradient(135deg,#0d1117,#f6f8fa)"></span></div>' +
      '<div class="theme-name">🌗 跟随系统</div>' +
      '<div class="theme-desc">随系统深浅色自动切换</div></button>';
    THEMES.forEach(function (th) {
      html += '<button type="button" class="theme-card' + (active === th.id ? ' active' : '') + '" data-theme-val="' + esc(th.id) + '">' +
        '<div class="theme-prev"><span style="background:' + th.colors[0] + '"></span><span style="background:' + th.colors[1] + '"></span><span style="background:' + th.colors[2] + '"></span></div>' +
        '<div class="theme-name">' + esc(th.name) + '</div>' +
        '<div class="theme-desc">' + esc(th.desc) + '</div></button>';
    });
    grid.innerHTML = html;
  }

  /* 主题弹窗（自动注入） */
  function ensureThemeModal() {
    if ($('#themeOverlay')) return;
    var ov = el('div', 'overlay');
    ov.id = 'themeOverlay';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', '选择风格');
    ov.innerHTML =
      '<div class="modal" style="max-width:520px">' +
      '<div class="modal-head"><strong>🎨 选择风格</strong><span class="spacer"></span>' +
      '<button class="iconbtn" data-close-theme title="关闭">✕</button></div>' +
      '<div class="modal-body"><div class="theme-grid" id="themeGrid"></div></div>' +
      '<div class="modal-foot"><span class="muted" style="margin-right:auto;font-size:11.5px">选择会自动保存在本机</span>' +
      '<button class="btn sm ghost" data-close-theme>关闭</button></div></div>';
    document.body.appendChild(ov);
    on(ov, 'click', function (e) {
      if (e.target === ov || e.target.closest('[data-close-theme]')) { closeTheme(); return; }
      var c = e.target.closest('[data-theme-val]');
      if (c) { setTheme(c.getAttribute('data-theme-val')); toast('已切换风格：' + (c.querySelector('.theme-name') || {}).textContent); }
    });
  }
  var lastFocus = null;
  function openTheme() {
    ensureThemeModal();
    buildThemeGrid(getThemePref());
    lastFocus = document.activeElement;
    $('#themeOverlay').classList.add('show');
    var first = $('#themeOverlay .theme-card.active') || $('#themeOverlay .theme-card');
    if (first) first.focus();
  }
  function closeTheme() {
    var ov = $('#themeOverlay');
    if (ov) ov.classList.remove('show');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* 系统主题变化时跟随 */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onSys = function () {
      if (getThemePref() === 'auto') paintTheme(systemTheme(), 'auto');
    };
    if (mq.addEventListener) mq.addEventListener('change', onSys);
    else if (mq.addListener) mq.addListener(onSys);
  }

  /* ─────────────────────────── Toast ────────────────────────────── */
  var toastEl = null, toastTimer = null;
  function toast(msg, opt) {
    opt = opt || {};
    if (!toastEl) { toastEl = el('div', 'toast'); toastEl.id = 'hsToast'; document.body.appendChild(toastEl); }
    toastEl.innerHTML = (opt.icon ? '<span class="ti">' + opt.icon + '</span>' : '') + '<span>' + esc(msg) + '</span>';
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, opt.duration || 2400);
  }

  /* ─────────────────────────── 装饰背景 ─────────────────────────── */
  var decor = {
    canvas: null, ctx: null, raf: null, parts: [], w: 0, h: 0, visible: true,
    init: function () {
      if (reduced) return;
      var host = $('.decor');
      if (!host) { host = el('div', 'decor'); document.body.insertBefore(host, document.body.firstChild); }
      if (!host.querySelector('.blob')) {
        host.innerHTML = '<div class="blob b1"></div><div class="blob b2"></div><div class="blob b3"></div>' +
          '<div class="grid"></div><canvas id="hsParticles"></canvas>';
      }
      this.canvas = $('#hsParticles', host);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      var self = this;
      on(window, 'resize', function () { self.resize(); });
      document.addEventListener('visibilitychange', function () {
        self.visible = !document.hidden;
        if (self.visible) self.start(); else self.stop();
      });
      this.refresh();
      this.start();
    },
    resize: function () {
      if (!this.canvas) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = this.canvas.clientWidth || window.innerWidth;
      this.h = this.canvas.clientHeight || window.innerHeight;
      this.canvas.width = Math.floor(this.w * dpr);
      this.canvas.height = Math.floor(this.h * dpr);
      if (this.ctx) this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },
    shape: function () {
      return (themeMeta(curTheme).shape || 'square');
    },
    seed: function () {
      var n = window.innerWidth < 640 ? 16 : 30;
      var shape = this.shape();
      this.parts = [];
      for (var i = 0; i < n; i++) {
        this.parts.push({
          x: Math.random() * this.w,
          y: Math.random() * this.h,
          r: 1.4 + Math.random() * (shape === 'bubble' ? 5 : 2.6),
          vx: (Math.random() - 0.5) * (shape === 'petal' ? 0.42 : 0.16),
          vy: -(0.06 + Math.random() * (shape === 'lava' ? 0.42 : 0.24)),
          a: 0.10 + Math.random() * 0.30,
          rot: Math.random() * Math.PI * 2,
          vr: (Math.random() - 0.5) * 0.02
        });
      }
    },
    refresh: function () { this.seed(); },
    start: function () {
      if (!this.canvas || reduced || this.raf) return;
      var self = this;
      var loop = function () {
        self.raf = raf(loop);
        if (!self.visible) return;
        self.draw();
      };
      this.raf = raf(loop);
    },
    stop: function () { if (this.raf) { window.cancelAnimationFrame(this.raf); this.raf = null; } },
    draw: function () {
      var c = this.ctx, w = this.w, h = this.h;
      if (!c) return;
      c.clearRect(0, 0, w, h);
      var cs = getComputedStyle(document.documentElement);
      var rgb = (cs.getPropertyValue('--p1') || '61,82,31').trim();
      var rgb3 = (cs.getPropertyValue('--p3') || '140,180,60').trim();
      var shape = this.shape();
      for (var i = 0; i < this.parts.length; i++) {
        var p = this.parts[i];
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (shape === 'petal' || shape === 'spark') p.x += Math.sin((p.y + i * 40) / 90) * 0.22;
        if (p.y < -20) { p.y = h + 15; p.x = Math.random() * w; }
        if (p.x < -25) p.x = w + 15;
        if (p.x > w + 25) p.x = -15;
        var col = i % 3 === 0 ? rgb3 : rgb;
        c.fillStyle = 'rgba(' + col + ',' + p.a + ')';
        c.strokeStyle = 'rgba(' + col + ',' + Math.min(1, p.a + 0.16) + ')';
        if (shape === 'bubble') {
          c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.stroke();
        } else if (shape === 'petal') {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          c.beginPath(); c.ellipse(0, 0, p.r * 1.5, p.r * 0.7, 0, 0, Math.PI * 2); c.fill(); c.restore();
        } else if (shape === 'lava') {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          c.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 1.8); c.restore();
        } else if (shape === 'spark') {
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
          c.beginPath();
          c.moveTo(0, -p.r * 2); c.lineTo(p.r * 0.55, 0); c.lineTo(0, p.r * 2); c.lineTo(-p.r * 0.55, 0);
          c.closePath(); c.fill(); c.restore();
        } else {
          c.fillRect(p.x, p.y, p.r, p.r);
        }
      }
    }
  };

  /* ─────────────────────────── 滚动进场 ─────────────────────────── */
  function reveal(root) {
    var nodes = $$('.reveal:not(.in)', root || document);
    if (!nodes.length) return;
    if (reduced || !('IntersectionObserver' in window)) {
      nodes.forEach(function (n) { n.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    nodes.forEach(function (n, i) {
      n.style.transitionDelay = Math.min(i * 24, 260) + 'ms';
      io.observe(n);
    });
  }

  /* ─────────────────────────── 命令面板 ─────────────────────────── */
  var palette = {
    root: null, input: null, list: null, items: [], sel: 0, source: null, actions: [],
    init: function (opts) {
      opts = opts || {};
      this.source = opts.source || null;
      this.actions = this.mergeActions(opts.actions);
      var self = this;
      if (!this.root) this.mount();
      on(document, 'keydown', function (e) {
        var mod = e.ctrlKey || e.metaKey;
        if (mod && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); self.toggle(); return; }
        if (!self.root.classList.contains('show')) return;
        if (e.key === 'Escape') { e.preventDefault(); self.close(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); self.move(1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); self.move(-1); }
        else if (e.key === 'Enter') { e.preventDefault(); self.commit(); }
      });
    },
    /* 每个页面都需要的动作放这里，页面只传自己的，标题去重 */
    mergeActions: function (extra) {
      var common = [
        { icon: '🎨', title: '切换风格', desc: '打开主题选择器', kbd: 'T', run: function () { openTheme(); } },
        { icon: '🧰', title: '回工具台', desc: '红石的小站首页', run: function () { location.href = SITE.url('index.html'); } }
      ];
      var out = [], seen = {};
      common.concat(extra || []).forEach(function (a) {
        if (!a || seen[a.title]) return;
        seen[a.title] = 1;
        out.push(a);
      });
      return out;
    },
    mount: function () {
      var self = this;
      var root = el('div', 'cmdk');
      root.id = 'hsCmdk';
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.innerHTML =
        '<div class="cmdk-panel">' +
        '<div class="cmdk-input"><span class="sico">⌕</span>' +
        '<input id="hsCmdkInput" type="text" placeholder="搜索工具、页面、条目…" autocomplete="off" spellcheck="false" aria-label="搜索">' +
        '<span class="kbd">ESC</span></div>' +
        '<div class="cmdk-list" id="hsCmdkList" role="listbox"></div>' +
        '<div class="cmdk-foot">' +
        '<span class="k"><span class="kbd">↑</span><span class="kbd">↓</span> 选择</span>' +
        '<span class="k"><span class="kbd">↵</span> 打开</span>' +
        '<span class="k" style="margin-left:auto">共 <b id="hsCmdkCount">0</b> 项</span>' +
        '</div></div>';
      document.body.appendChild(root);
      this.root = root;
      this.input = $('#hsCmdkInput', root);
      this.list = $('#hsCmdkList', root);
      on(root, 'click', function (e) { if (e.target === root) self.close(); });
      on(this.input, 'input', function () { self.render(); });
      on(this.list, 'mousemove', function (e) {
        var it = e.target.closest('.cmdk-item');
        if (!it) return;
        var idx = Number(it.getAttribute('data-idx'));
        if (!isNaN(idx) && idx !== self.sel) { self.sel = idx; self.paint(); }
      });
      on(this.list, 'click', function (e) {
        var it = e.target.closest('.cmdk-item');
        if (!it) return;
        self.sel = Number(it.getAttribute('data-idx')) || 0;
        self.commit();
      });
    },
    open: function () {
      if (!this.root) this.mount();
      this.input.value = '';
      this.sel = 0;
      this.render();
      this.root.classList.add('show');
      var self = this;
      setTimeout(function () { self.input.focus(); }, 30);
    },
    close: function () { if (this.root) this.root.classList.remove('show'); },
    toggle: function () { this.root && this.root.classList.contains('show') ? this.close() : this.open(); },
    build: function (q) {
      var out = [];
      var groups = {};
      var push = function (g, item) { (groups[g] = groups[g] || []).push(item); };
      // 快捷操作
      this.actions.forEach(function (a) { push('快捷操作', a); });
      // 动态条目
      var dyn = [];
      try { dyn = (this.source && this.source(q)) || []; } catch (e) { dyn = []; }
      dyn.forEach(function (d) { push(d.group || '内容', d); });
      Object.keys(groups).forEach(function (g) {
        groups[g].forEach(function (it) { it._group = g; out.push(it); });
      });
      if (q) {
        var ql = q.toLowerCase();
        out = out.filter(function (it) {
          return (it.title + ' ' + (it.desc || '') + ' ' + (it.keywords || '')).toLowerCase().indexOf(ql) > -1;
        });
      }
      return out;
    },
    render: function () {
      var q = this.input.value.trim();
      this.items = this.build(q);
      if (this.sel >= this.items.length) this.sel = 0;
      var html = '', lastGroup = null, counts = $('#hsCmdkCount');
      if (counts) counts.textContent = this.items.length;
      if (!this.items.length) {
        html = '<div class="cmdk-group">没有匹配结果</div>' +
          '<div class="cmdk-item" style="cursor:default;opacity:.6"><span class="ci">🫥</span><span class="cn">换个关键词试试</span></div>';
      } else {
        this.items.forEach(function (it, i) {
          if (it._group !== lastGroup) { html += '<div class="cmdk-group">' + esc(it._group) + '</div>'; lastGroup = it._group; }
          html += '<div class="cmdk-item" role="option" data-idx="' + i + '" aria-selected="' + (i === this.sel ? 'true' : 'false') + '">' +
            '<span class="ci">' + esc(it.icon || '•') + '</span>' +
            '<span class="cn">' + esc(it.title) + '</span>' +
            (it.desc ? '<span class="cd">' + esc(it.desc) + '</span>' : '') +
            (it.kbd ? '<span class="ck"><span class="kbd">' + esc(it.kbd) + '</span></span>' : '') +
            '</div>';
        }, this);
      }
      this.list.innerHTML = html;
    },
    paint: function () {
      $$('.cmdk-item', this.list).forEach(function (n) {
        n.setAttribute('aria-selected', Number(n.getAttribute('data-idx')) === palette.sel ? 'true' : 'false');
      });
    },
    move: function (d) {
      if (!this.items.length) return;
      this.sel = (this.sel + d + this.items.length) % this.items.length;
      this.paint();
      var active = this.list.querySelector('[aria-selected="true"]');
      if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    },
    commit: function () {
      var it = this.items[this.sel];
      if (!it) return;
      this.close();
      if (typeof it.run === 'function') { setTimeout(it.run, 60); return; }
      if (it.href) location.href = it.href;
    }
  };

  /* ─────────────────────────── 状态条 ───────────────────────────── */
  var status = {
    el: null, url: null, timer: null, pingTimer: null,
    mount: function (url, label) {
      this.url = url;
      if (!this.el) {
        this.el = el('div', 'statuspill');
        this.el.id = 'hsStatus';
        this.el.title = '点击立即刷新状态';
        this.el.innerHTML = '<span class="d"></span><span class="txt">' +
          '<span class="t">--:--</span><span class="sep"> · </span><span class="lat">--ms</span></span>';
        document.body.appendChild(this.el);
        var self = this;
        on(this.el, 'click', function () { self.ping(); self.tick(); });
      }
      this.tick();
      clearInterval(this.timer);
      this.timer = setInterval(this.tick.bind(this), 1000);
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(this.ping.bind(this), 30000);
      this.ping();
    },
    tick: function () {
      if (!this.el) return;
      var d = new Date(), p = function (n) { return n < 10 ? '0' + n : n; };
      var t = this.el.querySelector('.t');
      if (t) t.textContent = p(d.getHours()) + ':' + p(d.getMinutes());
    },
    ping: function () {
      if (!this.url || !this.el) return;
      var self = this, t0 = Date.now();
      this.el.classList.add('busy');
      fetch(this.url + (this.url.indexOf('?') > -1 ? '&' : '?') + '_=' + Date.now(), { method: 'HEAD', cache: 'no-store' })
        .then(function (r) {
          var lat = Date.now() - t0;
          if (!r.ok) throw new Error('HTTP ' + r.status);
          self.el.classList.remove('busy', 'err');
          var l = self.el.querySelector('.lat');
          if (l) l.textContent = lat + 'ms';
        })
        .catch(function () {
          self.el.classList.remove('busy');
          self.el.classList.add('err');
          var l = self.el.querySelector('.lat');
          if (l) l.textContent = '离线';
        });
    }
  };

  /* ─────────────────────────── 站点配置（只在这里改） ─────────────
     仓库、分支、路径全部集中于此：换仓库或改目录只改 SITE 一处。
     base 从 core.js 自身的地址反推，页面在根目录还是子目录都不用管层级。
  ────────────────────────────────────────────────────────────── */
  var BASE = (function () {
    var s = document.currentScript && document.currentScript.src;
    if (!s) return location.origin + '/';
    return s.replace(/assets\/js\/core\.js.*$/, '');
  })();

  var SITE = {
    repo: 'HSDL03/HStool',
    branch: 'main',
    base: BASE,
    /* 站内路径 → 绝对地址 */
    url: function (p) { return new URL(String(p).replace(/^\.\//, ''), BASE).href; },
    repoUrl: function (p) { return 'https://github.com/' + SITE.repo + (p || ''); }
  };

  /* 数据文件：data/<name>.json（传入完整基名，如 'tools-data'），本地 → raw → jsDelivr 三级回落 */
  function dataURL(name) { return SITE.url('data/' + name + '.json'); }
  function data(name) {
    var tail = 'data/' + name + '.json';
    var t = '?_=' + Date.now();
    return firstOK([
      dataURL(name) + t,
      'https://raw.githubusercontent.com/' + SITE.repo + '/' + SITE.branch + '/' + tail + t,
      'https://cdn.jsdelivr.net/gh/' + SITE.repo + '@' + SITE.branch + '/' + tail
    ]);
  }

  /* ─────────────────────────── 通用取数 ─────────────────────────── */
  function firstOK(urls) {
    return new Promise(function (resolve, reject) {
      (function next(i) {
        if (i >= urls.length) { reject(new Error('全部数据源均失败')); return; }
        fetch(urls[i], { cache: 'no-store' })
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
          .then(resolve)
          .catch(function (e) { if (i === urls.length - 1) reject(e); else next(i + 1); });
      })(0);
    });
  }
  /* ─────────────────────────── 通用小工具 ───────────────────────── */
  function absUrl(u) {
    if (!u) return '';
    if (/^(https?:|mailto:|tel:|javascript:|data:|\/\/)/i.test(u)) return u;
    try { return new URL(u, location.href).href; } catch (e) { return u; }
  }
  function isExternal(u) {
    try { return new URL(u, location.href).host !== location.host; } catch (e) { return false; }
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy') ? resolve() : reject(new Error('复制失败')); }
      catch (e) { reject(e); }
      document.body.removeChild(ta);
    });
  }

  /* ─────────────────────────── 顶栏 / 全局事件 ──────────────────── */
  function bindChrome() {
    var top = $('.topbar');
    if (top) {
      var tick = function () { top.classList.toggle('scrolled', window.scrollY > 4); };
      on(window, 'scroll', tick, { passive: true });
      tick();
    }
    on(document, 'click', function (e) {
      if (e.target.closest('[data-act="theme"]')) { e.preventDefault(); openTheme(); }
    });
    // 记录页脚年份
    $$('[data-year]').forEach(function (n) { n.textContent = new Date().getFullYear(); });
    // 顶栏高度暴露给 CSS
    if (top) document.documentElement.style.setProperty('--topbar-h', top.offsetHeight + 'px');
  }

  /* ─────────────────────────── 导出 ─────────────────────────────── */
  HS.$ = $;
  HS.$$ = $$;
  HS.esc = esc;
  HS.el = el;
  HS.on = on;
  HS.store = store;
  HS.reduced = reduced;
  HS.toast = toast;
  HS.reveal = reveal;
  HS.site = SITE;
  HS.data = data;
  HS.dataURL = dataURL;
  HS.absUrl = absUrl;
  HS.isExternal = isExternal;
  HS.copy = copy;
  HS.THEMES = THEMES;
  HS.theme = {
    get: function () { return curTheme; },
    pref: getThemePref,
    set: setTheme,
    open: openTheme,
    close: closeTheme,
    onChange: function (fn) { themeListeners.push(fn); fn(curTheme); },
    list: function () { return THEMES.slice(); }
  };
  HS.palette = {
    init: palette.init.bind(palette),
    open: palette.open.bind(palette),
    close: palette.close.bind(palette),
    toggle: palette.toggle.bind(palette),
    setSource: function (fn) { palette.source = fn; }
  };
  HS.decor = decor;
  HS.status = status;
  HS.fmt = {
    size: function (b) {
      if (!b || b <= 0) return '';
      if (b < 1024) return b + ' B';
      if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
      var mb = b / 1048576;
      if (mb < 1024) return mb.toFixed(1) + ' MB';
      return (mb / 1024).toFixed(2) + ' GB';
    },
    date: function (s) {
      if (!s) return '';
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      var d = new Date(s);
      if (isNaN(d.getTime())) return String(s);
      var p = function (n) { return n < 10 ? '0' + n : n; };
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },
    timeAgo: function (s) {
      var d = new Date(s);
      if (isNaN(d.getTime())) return '';
      var s2 = (Date.now() - d.getTime()) / 1000;
      if (s2 < 60) return '刚刚';
      if (s2 < 3600) return Math.floor(s2 / 60) + ' 分钟前';
      if (s2 < 86400) return Math.floor(s2 / 3600) + ' 小时前';
      if (s2 < 86400 * 30) return Math.floor(s2 / 86400) + ' 天前';
      if (s2 < 86400 * 365) return Math.floor(s2 / 86400 / 30) + ' 个月前';
      return Math.floor(s2 / 86400 / 365) + ' 年前';
    }
  };

  /* 启动 */
  function boot() {
    paintTheme(resolveTheme(getThemePref()), getThemePref());
    bindChrome();
    decor.init();
    reveal();
    // 图片/内容变化后再扫一次
    on(window, 'load', function () { decor.resize(); reveal(); });
    document.documentElement.classList.add('hs-ready');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HS = HS;
})(window, document);
