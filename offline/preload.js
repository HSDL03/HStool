/* 离线版预加载：只暴露一点点只读信息（版本号从主进程传进来），页面仍按普通网页跑 */
const { contextBridge } = require('electron');

const arg = process.argv.find((a) => a.startsWith('--hs-version=')) || '';
try {
  contextBridge.exposeInMainWorld('HS_OFFLINE', {
    version: arg.slice('--hs-version='.length) || '1.0.0',
    platform: process.platform
  });
} catch (e) { /* 暴露失败也不影响页面 */ }
