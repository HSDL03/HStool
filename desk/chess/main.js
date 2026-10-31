/* 国象应招器 · Electron 主进程
   和浏览器版唯一的区别：屏幕/窗口捕捉走 desktopCapturer，
   由主进程把源直接交给 getDisplayMedia，不弹系统选择器、也不会黑屏。 */
const { app, BrowserWindow, Menu, shell, session, desktopCapturer, ipcMain } = require('electron');
const path = require('node:path');

let win = null;
let pickedId = null;          /* 用户在应用内选中的源，交给 display-media handler */

/* 自动化冒烟测试用：设了 CHESS_CDP 才开调试端口 */
if (process.env.CHESS_CDP) {
  app.commandLine.appendSwitch('remote-debugging-port', String(process.env.CHESS_CDP));
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#fffdf5',
    title: '国象应招器',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(path.join(__dirname, 'app', 'index.html'));

  /* 站外链接丢给系统浏览器 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith('file://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file://')) { e.preventDefault(); shell.openExternal(url); }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  /* getDisplayMedia → 用我们在应用里选好的那个源 */
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (pickedId) {
      desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })
        .then((list) => {
          const src = list.find((s) => s.id === pickedId) || list[0];
          callback(src ? { video: src } : {});
        })
        .catch(() => callback({}));
      return;
    }
    /* 没选过就给主屏，保证「开始识别」不会因为没源而失败 */
    desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
      .then((list) => callback(list[0] ? { video: list[0] } : {}))
      .catch(() => callback({}));
  });

  ipcMain.handle('src:list', async () => {
    const list = await desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 320, height: 200 },
      fetchWindowIcons: true
    });
    return list
      .filter((s) => s.name && s.name !== 'Program Manager')
      .map((s) => ({ id: s.id, name: s.name, thumb: s.thumbnail.toDataURL() }));
  });

  ipcMain.handle('src:pick', (_e, id) => {
    pickedId = typeof id === 'string' ? id : null;
    return true;
  });

  ipcMain.handle('win:pin', (_e, on) => {
    if (win) win.setAlwaysOnTop(!!on);
    return win ? win.isAlwaysOnTop() : false;
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
