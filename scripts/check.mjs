#!/usr/bin/env node
/**
 * 站点自检：CI 里跑，也可以在本地 `node scripts/check.mjs` 手动跑。
 * 检查四件事，任何一项失败都会让 CI 变红：
 *   1. data/*.json 能否解析，工具卡片的 url 是否指向真实文件
 *   2. 所有 HTML 里的本地链接（href / src）是否存在
 *   3. 内联 <script> 是否有语法错误
 *   4. core.css 的大括号是否配对
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  '.git', '.github', '.workbuddy', 'node_modules', 'scripts',
  'dist', 'www',  // 离线版构建产物（electron-builder 输出 / 生成出来的站点快照）
  '.cache', 'build', '__pycache__', 'app'  // 打包缓存与打包中间件，不是站点内容
]);
const errors = [];
const warns = [];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');
const htmls = files.filter((f) => f.endsWith('.html'));

/* ── 1. JSON 数据 ─────────────────────────────────────────── */
const dataDir = path.join(ROOT, 'data');
let toolCount = 0;
if (fs.existsSync(dataDir)) {
  for (const f of fs.readdirSync(dataDir).filter((x) => x.endsWith('.json'))) {
    const full = path.join(dataDir, f);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(full, 'utf8'));
    } catch (e) {
      errors.push(`data/${f} JSON 解析失败：${e.message}`);
      continue;
    }
    if (!Array.isArray(data)) {
      errors.push(`data/${f} 顶层必须是数组`);
      continue;
    }
    if (f === 'tools-data.json') {
      toolCount = data.length;
      const ids = new Set();
      for (const t of data) {
        if (!t || typeof t !== 'object') { errors.push('tools-data.json 存在非对象条目'); continue; }
        if (!t.id) errors.push(`tools-data.json 有条目缺 id（name=${t.name || '?'}）`);
        else if (ids.has(t.id)) errors.push(`tools-data.json id 重复：${t.id}`);
        else ids.add(t.id);
        if (!t.name) errors.push(`tools-data.json 条目 ${t.id || '?'} 缺 name`);
        const url = String(t.url || '');
        if (!url) { errors.push(`tools-data.json 条目 ${t.id} 缺 url`); continue; }
        if (/^(https?:|mailto:|tel:|\/\/)/i.test(url)) continue;      // 站外，不检查
        const target = path.join(ROOT, url.replace(/^\.\//, '').split('#')[0]);
        if (!fs.existsSync(target)) errors.push(`tools-data.json 条目「${t.name}」的 url 不存在：${url}`);
      }
    }
  }
}

/* ── 2. HTML 本地链接 ─────────────────────────────────────── */
const LINK_RE = /\b(?:href|src)\s*=\s*"([^"]*)"/gi;
for (const file of htmls) {
  const html = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  let m;
  while ((m = LINK_RE.exec(html))) {
    const raw = m[1].trim();
    if (!raw || /^(https?:|data:|javascript:|mailto:|tel:|#|\/\/)/i.test(raw)) continue;
    // 模板字符串里的拼接片段（' + xxx + '）不是真实链接
    if (raw.includes("' +") || raw.includes('" +') || raw.includes('$')) continue;
    let target;
    if (raw.startsWith('/HStool/')) target = path.join(ROOT, raw.slice('/HStool/'.length));
    else if (raw.startsWith('/')) { errors.push(`${rel(file)} 使用了根路径 ${raw}，GitHub Pages 项目站会 404`); continue; }
    else target = path.join(dir, raw);
    const clean = target.split('#')[0].split('?')[0];
    if (!clean) continue;
    if (!fs.existsSync(clean)) errors.push(`${rel(file)} 链接失效：${raw}`);
    else if (fs.statSync(clean).isDirectory() && !fs.existsSync(path.join(clean, 'index.html'))) {
      warns.push(`${rel(file)} 链接指向目录但无 index.html：${raw}`);
    }
  }
}

/* ── 3. 内联脚本语法 ─────────────────────────────────────── */
const SCRIPT_RE = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
for (const file of htmls) {
  const html = fs.readFileSync(file, 'utf8');
  let m, i = 0;
  while ((m = SCRIPT_RE.exec(html))) {
    i++;
    if (!m[1].trim()) continue;
    try {
      new Function(m[1]);
    } catch (e) {
      errors.push(`${rel(file)} 第 ${i} 段内联脚本语法错误：${e.message}`);
    }
  }
}

/* ── 4. JS / CSS 附件 ─────────────────────────────────────── */
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const r = rel(f);
  try { new Function(fs.readFileSync(f, 'utf8')); }
  catch (e) { errors.push(`${r} 语法错误：${e.message}`); }
}
for (const f of files.filter((x) => x.endsWith('.css'))) {
  const css = fs.readFileSync(f, 'utf8');
  let depth = 0;
  for (const ch of css) {
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth < 0) break; }
  }
  if (depth !== 0) errors.push(`${rel(f)} 大括号不配对（结尾深度 ${depth}）`);
}

/* ── 汇总 ─────────────────────────────────────────────────── */
console.log(`扫描 ${htmls.length} 个 HTML、${toolCount} 个工具条目`);
for (const w of warns) console.log(`  ⚠ ${w}`);
for (const e of errors) console.log(`  ✗ ${e}`);
if (errors.length) {
  console.log(`\n✗ ${errors.length} 个问题需要修复`);
  process.exit(1);
}
console.log('\n✓ 全部检查通过');
