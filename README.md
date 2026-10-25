# 红石的小站

个人小站 · 工具集 / 资源下载 / 个人 Wiki

🤖 **本项目由 AI 制作**

在线访问：https://hsdl03.github.io/HStool/

---

## 结构

```
index.html          工具箱首页（搜索 / 筛选 / 排序 / 命令面板）
404.html            自定义 404（必须留在根目录）
README.md
assets/css/core.css 设计系统：主题令牌 + 通用组件
assets/js/core.js   主题引擎 / 命令面板 / 装饰背景 / Toast / 状态条

pages/
  wiki.html         答辩 Wiki 阅读器（章节树 / 目录 / 全文搜索 / 阅读进度）
  download.html     下载站（GitHub Releases + 手动补录）
  admin.html        数据管理后台（用 GitHub Token 直接写 JSON）
  chat.html         聊天室（Supabase）

tools/
  bigcalc.html      计算器
  qrcode.html       二维码生成器
  mcname.html       MC 名称随机器
  gacha.html        挖矿抽卡
  pixel.html        像素画板

games/
  mc.html           MC 小游戏（three.js）
  pvpga.html        PVP 小游戏
  wuzi_game.html    五子棋对局
  wuzi_hotel.html   五子棋大厅（Supabase）

data/
  tools-data.json   工具卡片
  wiki-data.json    Wiki 条目
  download-data.json 资源补录
  announcement.json 公告
```

> 路径约定：`index.html` 与 `404.html` 在根目录，其余页面都下沉到子目录，
> 所以页内资源用 `../assets/`、数据用 `../data/`，首页引用页面用 `./pages/xxx.html`。

## 数据文件

| 文件 | 用途 |
| --- | --- |
| `data/tools-data.json` | 工具卡片：`id/icon/name/desc/tag/url/category/deprecated/disabled/hidden` |
| `data/wiki-data.json` | Wiki 条目：`id/title/chapter/section/category/content` |
| `data/download-data.json` | 资源补录：`releaseTag/fileName/name/desc/tag/version/hidden/offline` |
| `data/announcement.json` | 公告：`id/type/category/icon/title/content/link/linkText/enabled` |

字段含义与旧版完全一致，`admin.html` 不需要改动即可继续使用。

## 视觉与主题

- 主色继承原版 MC Wiki 风格：米黄纸底 `#fffdf5` + 橄榄绿 `#3d521f`，2px 描边、硬投影、方块化圆角。
- 内置 8 套主题：MC Wiki / 夜晚 / 下界 / 末地 / 樱花 / 海洋 / GitHub 浅色 / 深色，外加「跟随系统」。
- 主题存于 `localStorage: hs-theme`（兼容读取旧键 `wiki-theme`）。

## 快捷键

| 键 | 作用 |
| --- | --- |
| `/` | 聚焦搜索框 |
| `Ctrl / ⌘ + K` | 命令面板（搜索页面、工具、条目、操作） |
| `T` | 打开主题选择器 |
| `Ctrl + B` | Wiki 页展开 / 收起目录 |
| `Esc` | 关闭面板或清空搜索 |

## 代码怎么接（新增页面 / 工具时看这里）

所有公共能力都在 `assets/js/core.js`，页面只写自己的业务逻辑，**不要重复实现**。

### 换仓库 / 换分支

只改一处：`assets/js/core.js` 里的 `SITE`

```js
var SITE = { repo: 'HSDL03/HStool', branch: 'main', ... };
```

页面里不要再硬编码 `HSDL03`、`HStool`，用 `HS.site.repo` / `HS.site.url('pages/wiki.html')`。

### 新增一个页面

1. 放到 `pages/`（整站页面）或 `tools/`（小工具）。
2. 头部三件套（路径按目录层级写死，不要写绝对路径）：

```html
<link rel="stylesheet" href="../assets/css/core.css">
<script>try{var t=localStorage.getItem('hs-theme')||localStorage.getItem('wiki-theme');if(t==='auto')t=matchMedia('(prefers-color-scheme:dark)').matches?'mc-night':'mc-wiki';if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>
...
<header class="topbar">…<button class="iconbtn" data-act="theme">🎨</button></header>
<div class="decor" aria-hidden="true"></div>
<main class="wrap">…</main>
<script src="../assets/js/core.js"></script>
```

主题按钮、装饰背景、Toast、命令面板都由 `core.js` 提供，页面不用自己写。

### 读数据

```js
HS.data('tools-data')     // → data/tools-data.json，自动走 本地 → raw → jsDelivr 三级回落
HS.dataURL('wiki-data')   // → 只要地址（给状态条、预加载用）
```

文件名传完整基名（`tools-data` 而不是 `tools`）。

### 常用 API

| 调用 | 作用 |
| --- | --- |
| `HS.toast(msg,{icon})` | 底部提示 |
| `HS.copy(text)` | 复制到剪贴板（带降级） |
| `HS.absUrl(p)` / `HS.isExternal(p)` | 相对路径转绝对、判断站外 |
| `HS.site.url(p)` | 站内路径 → 绝对地址（页面在任意层级都对） |
| `HS.theme.open()` / `HS.theme.set(id)` | 主题面板 / 直接切主题 |
| `HS.palette.init({actions,source})` | 命令面板；`切换风格`、`回工具台` 已内置，只传自己特有的 |
| `HS.status.mount(url)` | 右下角延迟胶囊 |
| `HS.esc(s)` / `HS.$` / `HS.$$` | 转义与选择器 |
| `HS.store.json(k,d)` | 读写 localStorage（自带 try/catch） |

### 新增一个工具卡片

编辑 `data/tools-data.json`（或走 `pages/admin.html` 后台），`url` 写**相对站点根**的路径：

```json
{ "id": "tool-xxx", "icon": "🎲", "name": "名字", "desc": "一句话",
  "tag": "工具", "url": "./tools/xxx.html", "category": "noDB",
  "deprecated": false, "disabled": false, "hidden": false }
```

`category` 用 `noDB`（纯前端）或 `needDB`（要后端/账号），首页据此显示「⚡ 纯前端 / ☁ 需后端」徽标。

## 本地预览

```bash
python -m http.server 8000
# 或 npx serve .
```

局域网内打开 http://localhost:8000 即可，数据走相对路径，无需跨域。
