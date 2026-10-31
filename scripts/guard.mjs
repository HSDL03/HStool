#!/usr/bin/env node
/* 90 秒熔断器 —— 跑一条命令，超时立刻杀掉并给出「换哪条路」。
 *
 * 为什么要有：卡住的时候最贵的不是命令本身，是我一直等着它、不换办法。
 * 用法：
 *   node scripts/guard.mjs --limit 90 -- npm install
 *   node scripts/guard.mjs --alt "改用本地缓存" -- curl ...
 * 退出码：命令本身的退出码；超时为 124（与 coreutils timeout 一致）。
 */
import { spawn, spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
let limit = Number(process.env.GUARD_LIMIT || 90);
const alts = [];
let cmd = null;

for (let i = 0; i < argv.length; i++){
  const a = argv[i];
  if (a === '--limit'){ limit = Number(argv[++i]) || limit; }
  else if (a === '--alt'){ alts.push(argv[++i] || ''); }
  else if (a === '--'){ cmd = argv.slice(i + 1).join(' '); break; }
  else { cmd = argv.slice(i).join(' '); break; }
}
if (!cmd || !(limit > 0)){
  console.error('用法: node scripts/guard.mjs [--limit 90] [--alt "备选方案"] -- <命令>');
  process.exit(2);
}

const t0 = Date.now();
const child = spawn('bash', ['-c', cmd], { stdio: 'inherit', windowsHide: true, env: process.env });
let killed = false;

const timer = setTimeout(() => {
  killed = true;
  /* Windows 下必须整棵进程树杀，否则 npm/electron 的子进程会留下来继续占端口 */
  try { spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) {}
  try { child.kill('SIGKILL'); } catch (e) {}
}, limit * 1000);

child.on('error', (e) => {
  clearTimeout(timer);
  console.error('启动失败：' + e.message);
  process.exit(127);
});

child.on('exit', (code) => {
  clearTimeout(timer);
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  if (killed){
    console.error('\n⏱ ' + dt + 's 超过 ' + limit + 's 上限，已强制结束；不要原样重试，换路子：');
    const list = alts.filter(Boolean);
    const fallback = [
      '放后台跑（run_in_background），隔一会儿只看一段输出',
      '换等价但不联网/不安装的办法（本地文件、已有依赖、缓存）',
      '缩小规模先验证：单文件、单页、小样本',
      '拆成两步：能确定的部分先做完，卡住那步单独处理'
    ];
    (list.length ? list : fallback).forEach((s, i) => console.error('   ' + (i + 1) + '. ' + s));
    process.exit(124);
  }
  console.log('\n✓ ' + dt + 's 完成（上限 ' + limit + 's）');
  process.exit(code == null ? 0 : code);
});
