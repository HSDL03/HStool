#!/usr/bin/env node
/**
 * 打包「离线版」的网页部分：只挑 data/tools-data.json 里 category=noDB 的条目，
 * 把它们真正用到的资源拷进 offline/www，并生成一个写死卡片的首页。
 *
 *   node scripts/build-offline.mjs
 *
 * 生成结果：offline/www/ （之后由 electron-builder 打成一个 exe）
 * 首页不 fetch 任何数据，卡片在构建时就写进 HTML —— 离线打开零请求。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'offline', 'www');
const VERSION = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'offline', 'package.json'), 'utf8')).version; }
  catch (e) { return '1.0.0'; }
})();

const p = (...a) => path.join(ROOT, ...a);

function rmrf(dir) {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}
function copy(src, dest) {
  const from = p(src);
  if (!fs.existsSync(from)) throw new Error('缺少文件：' + src);
  fs.mkdirSync(path.dirname(p(dest)), { recursive: true });
  fs.copyFileSync(from, p(dest));
}
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── 1. 挑工具 ──────────────────────────────────────────── */
const all = JSON.parse(fs.readFileSync(p('data', 'tools-data.json'), 'utf8'));
const offline = all.filter((t) => {
  if (!t || !t.url) return false;
  if (t.category !== 'noDB') return false;              // 要后端的（聊天室/下载站/wiki/后台/mc）一律不进
  if (t.hidden || t.disabled || t.deprecated) return false;
  if (/^https?:/i.test(t.url)) return false;            // 站外的不进包
  if (/^\.\/pages\//.test(t.url)) return false;         // pages 下全是 needDB，保险起见再挡一次
  return true;
});
if (!offline.length) throw new Error('没有可离线的工具，先检查 tools-data.json');

console.log(`离线工具 ${offline.length} / 全部 ${all.length}`);

/* ── 2. 复制资源 ────────────────────────────────────────── */
rmrf(OUT);
fs.mkdirSync(OUT, { recursive: true });

const SHARED = [
  ['assets/css/core.css', 'assets/css/core.css'],
  ['assets/js/core.js', 'assets/js/core.js'],
  ['assets/vendor/three.min.js', 'assets/vendor/three.min.js'],
  ['assets/vendor/qrcode.js', 'assets/vendor/qrcode.js']
];
for (const [src, dest] of SHARED) copy(src, 'offline/www/' + dest);

const missing = [];
for (const t of offline) {
  const rel = t.url.replace(/^\.\//, '');               // 例如 tools/json.html
  if (!fs.existsSync(p(rel))) { missing.push(rel); continue; }
  copy(rel, 'offline/www/' + rel);
}
if (missing.length) throw new Error('这些条目的 url 指向的文件不存在：' + missing.join(', '));

/* ── 3. 生成首页（卡片写死，不 fetch） ──────────────────── */
const games = offline.filter((t) => t.url.includes('/games/'));
const tools = offline.filter((t) => !t.url.includes('/games/'));

function card(t, i) {
  const href = './' + t.url.replace(/^\.\//, '');
  return `
      <a class="card" href="${esc(href)}" data-search="${esc((t.name + ' ' + (t.desc || '') + ' ' + (t.tag || '')).toLowerCase())}" style="animation-delay:${Math.min(i * 18, 300)}ms">
        <span class="glow"></span>
        <div class="card-body">
          <div class="cico">${esc(t.icon || '🧰')}</div>
          <div class="cinfo">
            <div class="cname">${esc(t.name)}</div>
            ${t.desc ? `<div class="cdesc">${esc(t.desc)}</div>` : ''}
            <div class="cmeta"><span class="badge">${esc(t.tag || '工具')}</span><span class="badge ok" title="纯前端，断网可用">离线可用</span></div>
          </div>
          <span class="carrow">→</span>
        </div>
      </a>`;
}

const html = `<!DOCTYPE html>
<html lang="zh-CN" data-theme="mc-wiki">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>红石的小站 · 离线工具集 v${esc(VERSION)}</title>
<meta name="description" content="红石的小站离线版：全部纯前端工具，不联网也能用。">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧰</text></svg>">
<script>try{var t=localStorage.getItem('hs-theme')||localStorage.getItem('wiki-theme');if(t==='auto')t=matchMedia('(prefers-color-scheme:dark)').matches?'mc-night':'mc-wiki';if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
<link rel="stylesheet" href="./assets/css/core.css">
<style>
  .offline-bar{
    display:flex;align-items:center;gap:10px;flex-wrap:wrap;
    padding:11px 15px;margin-bottom:18px;
    background:var(--bg2);border:2px solid var(--bd2);border-radius:var(--r);box-shadow:var(--bevel);
    font-size:12.5px;color:var(--muted);
  }
  .offline-bar b{color:var(--text);font-weight:800}
  .offline-bar .dot{width:7px;height:7px;border-radius:50%;background:var(--ac);flex:none}
  .offline-bar .grow{flex:1;min-width:0}
  .offline-bar input{
    flex:0 1 260px;min-width:150px;padding:7px 10px;
    font-family:inherit;font-size:12.5px;color:var(--text);
    background:var(--bg);border:2px solid var(--bd);border-radius:var(--r);
  }
  .offline-bar input:focus{outline:none;border-color:var(--ac)}
  .topbar .ver{
    flex:none;margin-left:10px;padding:3px 9px;border-radius:999px;
    font-size:11px;font-weight:800;line-height:1.5;letter-spacing:.02em;
    color:var(--on-ac);background:var(--ac);border:1px solid var(--ac2);
    box-shadow:0 1px 0 rgba(0,0,0,.18);
  }
  .empty-tip{display:none;padding:26px 0;text-align:center;color:var(--faint);font-size:13px}
  .empty-tip.on{display:block}
  .foot .fr span{white-space:nowrap}
</style>
</head>
<body data-tool-count="${tools.length + games.length}">

<header class="topbar">
  <a class="brand" href="./index.html" aria-label="回工具台"><span class="ico">🧰</span><span class="txt">红石的小站</span></a>
  <span class="ver">离线版 v${esc(VERSION)}</span>
  <span class="spacer"></span>
  <button class="iconbtn" data-act="theme" title="切换风格" aria-label="切换风格">🎨</button>
</header>

<div class="decor" aria-hidden="true"></div>

<main class="wrap">
  <div class="page-head">
    <div>
      <h1>离线工具集</h1>
      <p class="sub">${tools.length + games.length} 个工具全部在本地跑 · 不联网 · 不上传任何输入</p>
    </div>
  </div>

  <div class="offline-bar">
    <span class="dot"></span>
    <b>离线可用</b>
    <span class="grow">这些页面不依赖任何接口和账号，断网也能打开；数据只存在这台电脑的浏览器存储里。</span>
    <input id="q" type="search" placeholder="搜索工具…" autocomplete="off" spellcheck="false" aria-label="搜索工具">
  </div>

  <div class="sec-title">工具 <span class="count">${tools.length}</span></div>
  <div class="grid" id="gridTools">${tools.map(card).join('')}
  </div>

  ${games.length ? `
  <div class="sec-title" style="margin-top:26px">小游戏 <span class="count">${games.length}</span></div>
  <div class="grid" id="gridGames">${games.map(card).join('')}
  </div>` : ''}

  <div class="empty-tip" id="emptyTip">没有匹配的工具，换个关键词试试。</div>
</main>

<footer class="foot">
  <div class="fl">
    <span>🧰 红石的小站 · 离线版 v${esc(VERSION)}</span>
    <span>在线版 hsdl03.github.io/HStool</span>
  </div>
  <div class="fr">
    <span>© <span data-year>2026</span></span>
  </div>
</footer>

<script src="./assets/js/core.js"></script>
<script>
(function () {
  'use strict';
  /* 本地搜索：纯前端过滤，没有任何请求 */
  var input = document.getElementById('q');
  var tip = document.getElementById('emptyTip');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.card'));
  var secs = Array.prototype.slice.call(document.querySelectorAll('.sec-title'));
  if (input) {
    input.addEventListener('input', function () {
      var q = input.value.trim().toLowerCase();
      var shown = 0;
      cards.forEach(function (c) {
        var hit = !q || (c.getAttribute('data-search') || '').indexOf(q) > -1;
        c.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      if (tip) tip.classList.toggle('on', shown === 0);
      secs.forEach(function (s) {
        var grid = s.nextElementSibling;
        var any = grid ? Array.prototype.some.call(grid.children, function (c) { return c.style.display !== 'none'; }) : true;
        s.style.display = any ? '' : 'none';
      });
    });
    input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; input.dispatchEvent(new Event('input')); } });
  }
})();
</script>
</body>
</html>
`;

fs.writeFileSync(path.join(OUT, 'index.html'), html);

/* ── 4. 体检：确认没有残留外链 / 缺失资源 ──────────────── */
const walk = (dir, out = []) => {
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n);
    if (fs.statSync(f).isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
};
const built = walk(OUT);
const external = [];
for (const f of built.filter((x) => /\.(html|css|js)$/.test(x) && !x.includes('vendor'))) {
  const txt = fs.readFileSync(f, 'utf8');
  const re = /(?:src|href)\s*=\s*"(https?:)?\/\/[^"]+"/gi;
  let m;
  while ((m = re.exec(txt))) external.push(path.relative(OUT, f) + ' → ' + m[0]);
}
const bytes = built.reduce((s, f) => s + fs.statSync(f).size, 0);
console.log(`生成 ${built.length} 个文件，共 ${(bytes / 1024 / 1024).toFixed(2)} MB → offline/www`);
if (external.length) {
  console.log('\n⚠ 还有外链（离线打开会失败）：');
  external.forEach((x) => console.log('  ' + x));
  process.exitCode = 1;
} else {
  console.log('✓ 没有外部链接，纯离线');
}
