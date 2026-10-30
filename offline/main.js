/* 红石的小站 · 离线工具集 —— Electron 主进程
   把 www/ 里的静态站点装进原生窗口：不联网、不写注册表、不装服务，
   双击 exe 就能用全部纯前端工具。 */
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

const WWW = path.join(__dirname, 'www');
const HOME = path.join(WWW, 'index.html');
const VERSION = require('./package.json').version;

/* 自动化测试用：设了 HSTOOL_CDP 才开远程调试端口，平时不开（避免端口暴露） */
if (process.env.HSTOOL_CDP) {
  const port = String(process.env.HSTOOL_CDP);
  app.commandLine.appendSwitch('remote-debugging-port', port);
  app.commandLine.appendSwitch('remote-allow-origins', '*');
}

/* 只允许打开站内文件；http(s) 一律丢给系统默认浏览器 */
function isInternal(url) {
  return url.startsWith('file://');
}

let win = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#fffdf5',
    title: '红石的小站 · 离线工具集',
    icon: path.join(__dirname, 'build', 'icon.ico'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: ['--hs-version=' + VERSION],
      spellcheck: false
    }
  });

  win.once('ready-to-show', () => win.show());
  win.loadFile(HOME);

  /* 站外链接走系统浏览器，别在应用里开新窗口 */
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isInternal(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!isInternal(url)) { e.preventDefault(); shell.openExternal(url); }
  });

  /* 站内页面不存在时给个人话，而不是 Electron 的错误页 */
  win.webContents.on('did-fail-load', (e, code, desc, url, isMain) => {
    if (!isMain) return;
    dialog.showErrorBox('页面没打开', '可能是程序文件被删了一部分。\n\n' + url + '\n' + desc);
  });
}

function buildMenu() {
  const template = [
    {
      label: '文件',
      submenu: [
        { label: '回到工具台', accelerator: 'CmdOrCtrl+H', click: () => win && win.loadFile(HOME) },
        { type: 'separator' },
        { label: '退出', accelerator: 'CmdOrCtrl+Q', role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' }, { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' }, { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' }, { role: 'selectAll', label: '全选' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '刷新页面', accelerator: 'F5', click: () => win && win.reload() },
        { label: '放大', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
        { label: '缩小', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
        { label: '实际大小', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
        { type: 'separator' },
        { label: '全屏', accelerator: 'F11', role: 'togglefullscreen' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于离线版',
          click: () => {
            const size = countTools();
            dialog.showMessageBox(win, {
              type: 'info',
              title: '关于',
              message: '红石的小站 · 离线工具集 v' + VERSION,
              detail: '共 ' + size + ' 个纯前端工具，全部在本地运行，不联网、不上传任何输入内容。\n\n' +
                '在线版：https://hsdl03.github.io/HStool/\n' +
                '素材版权归原作者所有，仅供个人学习使用。',
              buttons: ['好']
            });
          }
        },
        { label: '打开在线版', click: () => shell.openExternal('https://hsdl03.github.io/HStool/') },
        { label: '打开数据目录', click: () => shell.openPath(app.getPath('userData')) }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* 统计 www 里真正被首页列出来的工具数（读不到就返回 0，不编数） */
function countTools() {
  try {
    const html = fs.readFileSync(HOME, 'utf8');
    const m = html.match(/data-tool-count="(\d+)"/);
    return m ? Number(m[1]) : 0;
  } catch (e) { return 0; }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('io.github.hsdl03.hstool');
    buildMenu();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  });

  app.on('window-all-closed', () => app.quit());
}
