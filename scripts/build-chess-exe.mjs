/* 打包「国象应招器」桌面版
   把 games/chess-auto.html 和它用到的公共资源拷进 desk/chess/app，
   再借 offline/ 里已装好的 electron + electron-builder 出一个 portable exe。
   用法：node scripts/build-chess-exe.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const APP = path.join(ROOT, 'desk', 'chess');
const WWW = path.join(APP, 'app');
const OFFLINE = path.join(ROOT, 'offline');

function copy(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

function step(msg) { console.log('· ' + msg); }

/* 1. 组装 app 目录 */
step('拷贝页面与公共资源');
fs.rmSync(WWW, { recursive: true, force: true });
copy(path.join(ROOT, 'games', 'chess-auto.html'), path.join(WWW, 'index.html'));
copy(path.join(ROOT, 'assets', 'css', 'core.css'), path.join(WWW, 'assets', 'css', 'core.css'));
copy(path.join(ROOT, 'assets', 'js', 'core.js'), path.join(WWW, 'assets', 'js', 'core.js'));

/* 2. 借 offline 的 node_modules（junction，不复制 555MB） */
const nm = path.join(APP, 'node_modules');
if (!fs.existsSync(nm)) {
  step('挂 node_modules → offline/node_modules');
  const r = spawnSync('cmd', ['/c', 'mklink', '/J', nm, path.join(OFFLINE, 'node_modules')], { encoding: 'utf8' });
  if (r.status !== 0) {
    console.error('挂接失败：', r.stdout || r.stderr);
    process.exit(1);
  }
}

/* 3. 出 exe */
const cli = path.join(nm, 'electron-builder', 'cli.js');
if (!fs.existsSync(cli)) {
  console.error('找不到 electron-builder：' + cli);
  process.exit(1);
}
step('electron-builder --win portable（第一次要几分钟）');
const build = spawnSync(process.execPath, [cli, '--win', 'portable'], {
  cwd: APP,
  stdio: 'inherit',
  env: {
    ...process.env,
    ELECTRON_BUILDER_CACHE: path.join(OFFLINE, '.cache'),
    /* 国内镜像：electron 运行时与 electron-builder 的 nsis / winCodeSign 都从这里取 */
    ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
    ELECTRON_BUILDER_BINARIES_MIRROR: 'https://npmmirror.com/mirrors/electron-builder-binaries/',
    npm_config_electron_mirror: 'https://npmmirror.com/mirrors/electron/',
    npm_config_electron_builder_binaries_mirror: 'https://npmmirror.com/mirrors/electron-builder-binaries/'
  }
});
if (build.status !== 0) process.exit(build.status || 1);

/* 4. 补图标与版本信息（打包时跳过了 rcedit，这里用缓存里的 rcedit 自己写） */
const rcedit = path.join(OFFLINE, '.cache', 'winCodeSign', '137488531', 'rcedit-x64.exe');
if (fs.existsSync(rcedit)) {
  const distNow = path.join(APP, 'dist');
  const targets = [];
  if (fs.existsSync(distNow)) {
    for (const f of fs.readdirSync(distNow)) {
      if (f.endsWith('.exe')) targets.push(path.join(distNow, f));
      if (f === 'win-unpacked') {
        for (const g of fs.readdirSync(path.join(distNow, f))) {
          if (g.endsWith('.exe')) targets.push(path.join(distNow, f, g));
        }
      }
    }
  }
  step('用 rcedit 写图标 / 版本信息');
  for (const t of targets) {
    const r = spawnSync(rcedit, [
      t,
      '--set-icon', path.join(APP, 'build', 'icon.ico'),
      '--set-file-version', '1.0.0.0',
      '--set-product-version', '1.0.0',
      '--set-version-string', 'ProductName', '国象应招器',
      '--set-version-string', 'FileDescription', '国际象棋 · 自动应招'
    ], { encoding: 'utf8' });
    console.log('  · ' + path.basename(t) + (r.status === 0 ? ' ok' : ' 失败(忽略)'));
  }
} else {
  step('没找到 rcedit，图标保持 Electron 默认');
}

/* 5. 报产物 */
const dist = path.join(APP, 'dist');
const exe = fs.existsSync(dist) ? fs.readdirSync(dist).find((f) => f.endsWith('.exe')) : null;
if (!exe) { console.error('没找到 exe，看上面的日志'); process.exit(1); }
const size = (fs.statSync(path.join(dist, exe)).size / 1048576).toFixed(1);
console.log('\n✓ ' + path.join(dist, exe) + '  (' + size + ' MB)');
