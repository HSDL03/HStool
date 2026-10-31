/* 只把「列窗口 / 选窗口 / 置顶」三件事暴露给页面，其他一律不碰 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hsDesktop', {
  isDesktop: true,
  listSources: () => ipcRenderer.invoke('src:list'),
  pick: (id) => ipcRenderer.invoke('src:pick', id),
  pin: (on) => ipcRenderer.invoke('win:pin', on)
});
