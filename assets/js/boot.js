/* ============================================================================
   红石的小站 · 启动加载层 v1
   boot.js — 首屏遮罩 + 真实资源进度，加载完成后才放行页面

   用法：在每页 <head> 末尾、core.css 之后同步引入一行
     <script src="../assets/js/boot.js"></script>
   它是阻塞脚本，浏览器解析到它时 body 还没开始渲染，所以遮罩先铺满、
   不会出现「先看到半截页面再盖上去」的白闪。

   进度不是假数据：
     · 解析阶段        0 → 14%，按解析耗时推进
     · 资源阶段       15 → 90%，按 img/script/link[stylesheet]/iframe 的
                                真实 load/error 事件完成率计算
     · 数据阶段       如果页面还在跑 HS.data() 取 JSON，封顶 90%
     · window.load + 数据取完 → 100% → 淡出
   另有卡壳守护（6 秒没动静缓慢自增，封顶 92%）和 15 秒强制放行，
   保证任何情况下都不会把用户锁死。
   ========================================================================== */
(function (w, d) {
  'use strict';

  var ROOT = d.documentElement;
  if (!ROOT || w.__hsbActive) return;

  /* ── 主题取色：遮罩要跟随用户主题，但 core.css 可能还没下完 ────────
     每个主题 [背景, 文字, 主色, 是否深色]；与 core.css 的 --bg/--text/--ac 一致 */
  var MAP = {
    'mc-wiki':      ['#fffdf5', '#1f1f1f', '#3d521f', 0],
    'mc-night':     ['#1a1a1a', '#e0e0e0', '#8ec44a', 1],
    'mc-nether':    ['#1a0a0a', '#f0d0d0', '#ff6030', 1],
    'mc-end':       ['#0f0a1a', '#e0d0f0', '#a060ff', 1],
    'sakura':       ['#fffafc', '#2a1a20', '#d04080', 0],
    'ocean':        ['#f0f8ff', '#0a1a2a', '#0066cc', 0],
    'paper':        ['#f6f0e4', '#3a3228', '#b06a2c', 0],
    'lavender':     ['#f7f5fb', '#2f2a3d', '#6d4fc4', 0],
    'midnight':     ['#0e1220', '#dfe6f5', '#6ea8ff', 1],
    'github-light': ['#ffffff', '#1f2328', '#0969da', 0],
    'github-dark':  ['#0d1117', '#e6edf3', '#4493f8', 1]
  };

  function themeId() {
    var cur = ROOT.getAttribute('data-theme');
    if (cur && MAP[cur]) return cur;
    var pref = 'auto';
    try { pref = localStorage.getItem('hs-theme') || localStorage.getItem('wiki-theme') || 'auto'; } catch (e) { }
    if (!pref || pref === 'auto') {
      var dark = w.matchMedia && w.matchMedia('(prefers-color-scheme: dark)').matches;
      return dark ? 'mc-night' : 'mc-wiki';
    }
    return MAP[pref] ? pref : 'mc-wiki';
  }

  var c = MAP[themeId()] || MAP['mc-wiki'];
  var dark = !!c[3];
  var rs = ROOT.style;
  rs.setProperty('--hsb-bg', c[0]);
  rs.setProperty('--hsb-fg', c[1]);
  rs.setProperty('--hsb-ac', c[2]);
  rs.setProperty('--hsb-bd', dark ? 'rgba(255,255,255,.34)' : 'rgba(0,0,0,.26)');
  rs.setProperty('--hsb-track', dark ? 'rgba(255,255,255,.09)' : 'rgba(0,0,0,.06)');
  rs.setProperty('--hsb-shadow', dark ? 'rgba(0,0,0,.55)' : 'rgba(0,0,0,.16)');
  rs.setProperty('--hsb-muted', dark ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.48)');
  // 红石粉本身是暗红，深色底上会糊成一团，稍微提亮 + 拉饱和
  rs.setProperty('--hsb-icon-fx', dark
    ? 'brightness(1.28) saturate(1.15) drop-shadow(0 3px 0 rgba(0,0,0,.55))'
    : 'drop-shadow(0 3px 0 rgba(0,0,0,.16))');

  /* ── 样式 ─────────────────────────────────────────────────────── */
  var css = ''
    + '#hsBoot{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;'
    + 'align-items:center;justify-content:center;box-sizing:border-box;padding:24px;'
    + 'background:var(--hsb-bg,#fffdf5);color:var(--hsb-fg,#1f1f1f);'
    + 'font-family:"Microsoft YaHei UI","Microsoft YaHei","PingFang SC","Hiragino Sans GB",'
    + '"Noto Sans SC","Segoe UI",system-ui,sans-serif;'
    + 'overflow:hidden;transition:opacity .32s ease,visibility .32s ease}'
    + '#hsBoot.hsb-out{opacity:0;visibility:hidden;pointer-events:none}'
    + '#hsBoot .hsb-in{width:min(372px,76vw);display:flex;flex-direction:column;'
    + 'align-items:center;gap:14px}'
    /* 图标：原版红石粉物品贴图 16×16，整数倍放大（64 / 48）保持像素锐利 */
    + '#hsBoot .hsb-icon{display:block;width:80px;height:80px;flex:none;'
    + 'image-rendering:pixelated;filter:var(--hsb-icon-fx,drop-shadow(0 3px 0 rgba(0,0,0,.16)));'
    + 'animation:hsbFloat 2.6s ease-in-out infinite}'
    + '#hsBoot .hsb-name{font-size:23px;font-weight:800;letter-spacing:.06em;line-height:1.1;'
    + 'text-indent:.06em;color:var(--hsb-fg)}'
    + '#hsBoot .hsb-sub{margin-top:-9px;font-size:10.5px;font-weight:700;letter-spacing:.2em;'
    + 'text-indent:.2em;color:var(--hsb-muted)}'
    /* 进度槽：2px 描边 + 2px 内衬，仿原版经验条 */
    + '#hsBoot .hsb-bar{position:relative;width:100%;height:18px;box-sizing:border-box;padding:3px;'
    + 'margin-top:4px;background:var(--hsb-track);border:2px solid var(--hsb-bd);overflow:hidden}'
    + '#hsBoot .hsb-fill{position:relative;display:block;height:100%;width:0;'
    + 'background:var(--hsb-ac);transition:width .2s linear}'
    + '#hsBoot .hsb-fill::after{content:"";position:absolute;inset:0;'
    + 'background:repeating-linear-gradient(115deg,rgba(255,255,255,.26) 0 7px,rgba(255,255,255,0) 7px 14px);'
    + 'animation:hsbStripe .85s linear infinite}'
    + '#hsBoot .hsb-meta{display:flex;align-items:baseline;justify-content:space-between;gap:12px;'
    + 'width:100%;font-size:11px;font-weight:700;letter-spacing:.06em;'
    + 'font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,monospace;color:var(--hsb-muted)}'
    + '#hsBoot .hsb-pct{font-variant-numeric:tabular-nums;color:var(--hsb-ac);font-weight:800}'
    + '#hsBoot .hsb-stage{text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '@keyframes hsbFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}'
    + '@keyframes hsbStripe{from{background-position:0 0}to{background-position:14px 0}}'
    + '@media (prefers-reduced-motion:reduce){'
    + '#hsBoot .hsb-icon,#hsBoot .hsb-fill::after{animation:none}'
    + '#hsBoot,#hsBoot .hsb-fill{transition:none}}'
    + '@media (max-width:420px){'
    + '#hsBoot .hsb-in{width:min(300px,72vw)}'
    + '#hsBoot .hsb-name{font-size:20px}'
    + '#hsBoot .hsb-icon{width:64px;height:64px}'
    + '}';

  var st = d.createElement('style');
  st.id = 'hsBootStyle';
  st.appendChild(d.createTextNode(css));
  (d.head || ROOT).appendChild(st);

  /* ── DOM ──────────────────────────────────────────────────────── */
  // 图标路径从 boot.js 自身地址反推站点根，根目录/子目录/404 页都不用改
  var selfSrc = d.currentScript && d.currentScript.src;
  var baseURL = selfSrc ? selfSrc.replace(/assets\/js\/boot\.js.*$/, '') : '';
  var ICON = baseURL + 'assets/mc-textures/item_redstone.png';

  var layer = d.createElement('div');
  layer.id = 'hsBoot';
  layer.setAttribute('role', 'status');
  layer.setAttribute('aria-live', 'polite');
  layer.setAttribute('aria-label', '页面加载中');
  layer.innerHTML = '<div class="hsb-in">'
    + '<img class="hsb-icon" alt="" width="80" height="80">'
    + '<div class="hsb-name">红石的小站</div>'
    + '<div class="hsb-sub">工具与资源集散地</div>'
    + '<div class="hsb-bar"><i class="hsb-fill"></i></div>'
    + '<div class="hsb-meta"><span class="hsb-pct">0%</span><span class="hsb-stage">正在解析页面</span></div>'
    + '</div>';
  var ico = layer.querySelector('.hsb-icon');
  // 万一贴图取不到（离线/路径异常），隐藏图标而不是留一个破图框
  ico.addEventListener('error', function () { ico.style.display = 'none'; });
  ico.src = ICON;

  var host = d.body || ROOT;
  host.appendChild(layer);

  var fill = layer.querySelector('.hsb-fill');
  var pctEl = layer.querySelector('.hsb-pct');
  var stageEl = layer.querySelector('.hsb-stage');

  // 锁滚动：加载期间不能滚，不然后面的页面会跟着跑
  var prevOverflow = ROOT.style.overflow;
  ROOT.style.overflow = 'hidden';
  ROOT.classList.add('hs-booting');

  /* ── 进度状态 ─────────────────────────────────────────────────── */
  var reduced = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MIN_MS = 480;      // 最短显示，缓存秒开时也不闪一下就走
  var HARD_MS = 15000;   // 兜底放行
  var t0 = Date.now();

  var phase = 'parse';   // parse | res
  var shown = 0;         // 已显示的百分比（只增不减）
  var total = 0;         // 资源总数
  var done = 0;          // 已完成资源数
  var seen = [];         // 已计过数的元素（用 indexOf，避免 WeakSet 兼容问题）
  var dataPend = 0;      // 未完成的 HS.data 请求
  var loadFired = false;
  var finished = false;
  var finishing = false;

  function ratio() {
    if (!total) return 0;
    var r = done / total;
    return r > 1 ? 1 : r;
  }

  // 用捕获阶段统一接住所有资源元素的 load / error（它们本身不冒泡）
  function onRes(e) {
    var t = e.target;
    if (!t || t === w || !t.tagName) return;
    var tag = t.tagName;
    if (tag !== 'IMG' && tag !== 'SCRIPT' && tag !== 'LINK' && tag !== 'IFRAME' && tag !== 'VIDEO') return;
    if (seen.indexOf(t) > -1) return;
    seen.push(t);
    done++;
  }
  w.addEventListener('load', onRes, true);
  w.addEventListener('error', onRes, true);

  function countAssets() {
    var list = d.querySelectorAll('img,script[src],link[rel="stylesheet"],iframe,video');
    total = list.length;
    done = 0;
    seen = [];
    for (var i = 0; i < list.length; i++) {
      var n = list[i];
      var ok = false;
      if (n.tagName === 'IMG') ok = n.complete;
      else if (n.tagName === 'LINK') ok = !!n.sheet;
      else if (n.tagName === 'SCRIPT') ok = true; // 解析到这里说明已执行完
      else ok = false;
      if (ok) { seen.push(n); done++; }
    }
  }

  function stageText() {
    if (finished) return '准备就绪';
    if (phase === 'parse') return '正在解析页面';
    if (dataPend > 0) return '正在获取数据';
    if (total && done < total) return '正在加载资源 ' + done + '/' + total;
    return '正在准备界面';
  }

  function render() {
    var p = Math.floor(shown);
    fill.style.width = shown + '%';
    pctEl.textContent = p + '%';
    stageEl.textContent = stageText();
  }

  function tick() {
    if (finished) return;
    var now = Date.now();
    var t = now - t0;
    var target;

    if (phase === 'parse') {
      target = Math.min(14, 2 + (t / 820) * 12);
    } else {
      target = 15 + 75 * ratio();
    }
    if (dataPend > 0 && target > 90) target = 90;
    if (loadFired && dataPend === 0) target = 100;

    // 卡壳守护：6 秒后还停着就慢慢爬，封顶 92，避免看起来死掉
    if (!loadFired && t > 6000) {
      var creep = 40 + (t - 6000) / 300;
      if (creep > 92) creep = 92;
      if (creep > target) target = creep;
    }
    if (target < shown) target = shown;

    var gap = target - shown;
    if (gap > 0) {
      shown += gap * (reduced ? 1 : 0.14) + (reduced ? 0 : 0.12);
      if (shown > target) shown = target;
    }
    render();

    if (shown >= 99.6) {
      shown = 100;
      render();
      setTimeout(finish, 260);
      return;
    }
    setTimeout(tick, 16);
  }

  function finish() {
    if (finished || finishing) return;
    // 最少显示一会儿，避免缓存秒开时进度条一闪而过
    var wait = MIN_MS - (Date.now() - t0);
    if (wait > 0) {
      finishing = true;
      setTimeout(function () { finishing = false; finish(); }, wait);
      return;
    }
    finished = true;
    layer.classList.add('hsb-out');
    ROOT.classList.remove('hs-booting');
    ROOT.classList.add('hs-loaded');
    setTimeout(function () {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
      ROOT.style.overflow = prevOverflow || '';
      // 主题变量已用不到了，撤掉免得以后改动互相干扰
      ['--hsb-bg', '--hsb-fg', '--hsb-ac', '--hsb-bd', '--hsb-track', '--hsb-shadow', '--hsb-muted', '--hsb-icon-fx']
        .forEach(function (k) { rs.removeProperty(k); });
    }, 380);
  }

  /* ── 对外：给 HS.data() 报「还有几个请求没回来」 ───────────────── */
  w.__hsb = {
    track: function () {
      if (finished) return function () { };
      dataPend++;
      var off = false;
      return function () {
        if (off) return;
        off = true;
        if (dataPend > 0) dataPend--;
      };
    },
    done: finish,
    state: function () { return { pct: shown, total: total, done: done, phase: phase, data: dataPend, load: loadFired }; }
  };

  /* ── 生命周期 ─────────────────────────────────────────────────── */
  d.addEventListener('DOMContentLoaded', function () {
    phase = 'res';
    countAssets();
    if (d.body && layer.parentNode === ROOT) d.body.appendChild(layer);
    render();
  });

  w.addEventListener('load', function () {
    loadFired = true;
    countAssets();
  });

  setTimeout(function () { if (!finished) finish(); }, HARD_MS);

  w.__hsbActive = true;
  render();
  setTimeout(tick, 16);
})(window, document);
