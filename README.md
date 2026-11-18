<div align="center">

# 红石的小站

**工具集 · 结构编辑器 · 资源下载 · 个人 Wiki · 小游戏**

[![站点自检](https://github.com/HSDL03/HStool/actions/workflows/check.yml/badge.svg)](https://github.com/HSDL03/HStool/actions/workflows/check.yml)
[![在线访问](https://img.shields.io/badge/在线访问-hsdl03.github.io%2FHStool-3d521f?style=flat-square)](https://hsdl03.github.io/HStool/)
[![收录条目](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FHSDL03%2FHStool%2Fmain%2Fdata%2Ftools-data.json&query=%24.length&label=%E6%94%B6%E5%BD%95%E6%9D%A1%E7%9B%AE&color=3d521f&style=flat-square)](data/tools-data.json)
[![纯静态](https://img.shields.io/badge/部署-GitHub%20Pages-222?style=flat-square&logo=githubpages&logoColor=white)](https://hsdl03.github.io/HStool/)
[![AI 制作](https://img.shields.io/badge/本项目由-AI%20制作-8b5cf6?style=flat-square)](#声明)

<sub>没有框架、没有构建步骤、没有后端 —— <code>push</code> 就上线。</sub>

</div>

纯静态的个人站点：`push` 到 `main` 后 GitHub Pages 自动部署（30~60 秒生效）。
所有页面共用一套设计系统（`assets/css/core.css`）和一份公共能力（`assets/js/core.js`），新页面只写自己的业务逻辑。

> **一眼看全站**：85 个条目 / 69 个可见 —— **71 个单页工具**（23 个 MC 相关）、13 个游戏与棋牌、3 个整站页面（Wiki / 下载站 / 数据后台）。
> 82 个纯前端（`noDB`），只剩 3 个走 GitHub API（`needDB`）。

## 亮点

| | |
| --- | --- |
| 🧱 **结构处理器** | 浏览器里打开 `.mcstructure` / `.schem` / `.nbt`，原版贴图 3D 渲染、方块级编辑、NBT 编辑、导出回游戏。还能用**地图画**（抖动算法可调）和**文字**生成结构 |
| 🎮 **MC 复刻** | three.js 手写体素引擎：地形噪声、方块朝向、门、流动的水、活塞、物品栏与合成台 |
| 🧮 **71 个小工具** | 坐标 / 经验 / 红石 / 附魔 / 酿造 / 合成 等 MC 计算，加上 JSON / 编解码 / 正则 / 时间戳 / 二维码 等日常工具 |
| 🎲 **13 个游戏** | 围棋 · 中国象棋 · 国际象棋 · 斗地主 · UNO · 麻将 · 五子棋 · A\* 演示，支持局域网与 AI |
| 📦 **离线也能用** | 全部纯前端工具可打成绿色单文件 exe（Electron portable），双击即用 |

---

## 目录

- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [结构处理器](#结构处理器)
- [页面地图](#页面地图)
- [桌面版 / 离线版](#桌面版--离线版)
- [数据文件](#数据文件)
- [视觉与主题](#视觉与主题)
- [快捷键](#快捷键)
- [代码怎么接](#代码怎么接)
- [新增一个工具（最短路径）](#新增一个工具最短路径)
- [自检与部署](#自检与部署)
- [声明](#声明)

## 快速开始

```bash
git clone https://github.com/HSDL03/HStool.git
cd HStool
python -m http.server 8000     # 或 npx serve .
```

浏览器打开 <http://localhost:8000> 即可。数据全走相对路径，**不需要起后端，也没有跨域问题**。

| 想做 | 看哪 |
| --- | --- |
| 加一个小工具 | [`tools/`](tools) + [`data/tools-data.json`](data/tools-data.json) |
| 加一个整站页面 | [`pages/`](pages) |
| 改主题配色 | [`assets/css/core.css`](assets/css/core.css) 顶部的主题令牌 |
| 改公共能力 | [`assets/js/core.js`](assets/js/core.js) |
| 改数据内容 | [`pages/admin.html`](pages/admin.html)（网页后台）或直接编辑 JSON |

## 目录结构

```text
.
├─ index.html              工具箱首页：搜索 / 分类筛选 / 收藏置顶 / 命令面板
├─ 404.html                自定义 404（必须留在根目录）
├─ .nojekyll               关掉 Jekyll，保证下划线开头的路径也能发布
├─ README.md
│
├─ assets/
│  ├─ css/core.css         设计系统：主题令牌 + 通用组件（.tool/.panel/.fld/.btn…）
│  ├─ js/core.js           主题引擎 / 命令面板 / 装饰背景 / Toast / 数据三级回落
│  ├─ vendor/              本地化的第三方库（three.js、qrcode.js），缺失才回落 CDN
│  ├─ mc-items-data.js     方块 / 物品 / 贴图索引（1164 方块 · 748 物品 · 1589 图集格）
│  ├─ mc-models-data.js    692 个原版方块模型（elements + 逐面 UV）
│  ├─ mc-recipes-data.js   1723 条原版合成配方
│  ├─ mc-inline-textures.js 贴图内联成 data URL，离线也能显示
│  ├─ mc-icons/            工具卡片用的 MC 官方渲染图
│  ├─ mc-gui/              原版 GUI 贴图与控件素材
│  └─ mc-textures/ mc-sounds/   原版贴图与音效
│
├─ pages/
│  ├─ wiki.html            答辩 Wiki 阅读器：章节树 / 目录 / 全文搜索 / 阅读进度
│  ├─ download.html        下载站：GitHub Releases + 手动补录
│  └─ admin.html           数据后台：用 GitHub Token 直接读写 JSON
│
├─ tools/                  单页工具，每页一个 .html（71 个文件）
│  │                       通用：计算器 / JSON / 编解码 / 时间戳 / 颜色 / 正则 / JWT…
│  │                       MC 专区：附魔 / 酿造 / 红石 / 挖掘 / 伤害 / 合成 / 指令…
│  └─ structure.html       ★ 结构处理器（导入 / 编辑 / 地图画 / 导出）
│
├─ games/
│  ├─ index.html           游戏厅：棋牌入口
│  ├─ rules.html           玩法说明书（含与标准规则的差别）
│  ├─ tri-chess.html       围棋 / 中国象棋 / 国际象棋三合一
│  ├─ chess-auto.html      国象应招器：自动应招 / 评分 / 编辑棋局
│  ├─ doudizhu.html uno.html mahjong.html
│  ├─ mc.html              MC 复刻（three.js 体素引擎，主战场）
│  ├─ astar.html           A* 寻路 3D 演示
│  ├─ pvpga.html           方块战场（人机）
│  └─ wuzi_game/hotel.html 五子棋 + 局域网大厅（同一浏览器多标签页）
│
├─ data/                   tools / wiki / download / announcement 四个 JSON
├─ scripts/                check（站点自检）· serve-local · build-offline · guard（熔断器）
├─ offline/                Electron 打包工程（构建产物不入库）
├─ desk/                   国象应招器桌面版（Python / Electron）
└─ .github/workflows/check.yml   push / PR 时自动跑自检
```

> **路径约定**：只有 `index.html`、`404.html`、`README.md` 在根目录，其余页面都下沉一层。
> 所以子目录页用 `../assets/`、`../data/`；`404.html` 里的资源必须写 `/HStool/` 绝对路径
> （GitHub Pages 会在任意深度的坏链接上渲染它）。

## 结构处理器

[`tools/structure.html`](tools/structure.html) —— 一个完全跑在浏览器里的 Minecraft 结构编辑器，文件不上传、不联网。

**能读**：`.mcstructure`（基岩，含 gzip）· `.schem`（Sponge v2/v3）· `.nbt`（Java 结构）· 本站 JSON。
NBT 读写器全部手写（小端 + UTF-8 短长度字符串），导出的文件用 Python 独立解析器回读校验过「无冗余字节、偏移量对齐」。

**能看**：原版贴图 + 原版模型渲染，一张方块图集（`tile → 图集格`）、Lambert 光照、按区块分块重建。
51 MB / 109 万方块的结构导入 + 渲染约 6 秒，编辑时只重建所在分区。

**能改**

| 模式 | 快捷键 | 说明 |
| --- | --- | --- |
| 查看 | <kbd>1</kbd> | 右键拖动旋转（物体跟着鼠标走）· 滚轮缩放 · 中键平移 |
| 放置 | <kbd>2</kbd> | 左键放方块，按住拖动连续画；1164 种方块可搜索 |
| 删除 | <kbd>3</kbd> | 左键擦方块 |
| 方块数据 | <kbd>4</kbd> | 点选 / Shift 多选 / 拖动框选，编辑 `block_entity_data`（命令方块的 Command、箱子内容、告示牌文字…） |
| 移动 | <kbd>5</kbd> | 拖拽整体平移（有选区就只挪选区），<kbd>Shift</kbd>+拖只上下，方向键逐格微调。<br>推出去会自动扩边，方块一块不丢 |

**能生成**

- **文字**：中英文直接变方块字，字高 / 厚度 / 精细度（2×~8× 超采样）可调。
- 地图画已独立成 **[我的世界结构生成](./tools/mcgen.html)**（见下一节），那边生成完下载 `.mcstructure`，
  拖回这里就能继续编辑、移动、改 NBT。

**能导出**：`.mcstructure`（调色板按「方块名 + 状态」去重，朝向等状态原样写回）· 本站 JSON（无损可再编辑）· PNG。

> 基岩的 `block_indices` 是 **x 最慢、z 最快**（`i = (x·sizeY + y)·sizeZ + z`）。
> 按 x 最快读会把整栋建筑摊成一层层散落的薄片 —— 这个坑自检脚本查不出来，只能拿真实存档验
> （用「孤立方块比例」判定：正确顺序 0%，错误顺序 0.5%~2.7%）。

## 我的世界结构生成

独立的生成器页面（[tools/mcgen.html](./tools/mcgen.html)）：只负责「素材进、结构出」，打开就能用，不需要先有文件。

- **地图画**：上传图片或选一个方块图标，左边原图右边结果实时对照。尺寸自定义、
  立放 / 平铺、厚度 1~8 层、适应（留白）/ 填充（裁切）；可用方块逐格开关（111 种，
  混凝土 / 羊毛 / 石材 / 木头 / 金属矿物分组）；7 种抖动 + 强度；CIELAB（ΔE76）配色，
  灰阶不会被判成彩色。超过单张地图 128×128 会算「约占几张地图」。
- **红石音乐（MIDI）**：自己写的 SMF 解析器（`MThd` / 多个 `MTrk` / 变长 delta / 首速），
  读所有音轨的音符 → 音符盒乐谱墙（时间沿 X、同一刻的音符在 Z 排开，每个音符盒写好
  `note` 与 `instrument` 状态）。音高按音色基准八度折叠，超出就按设置丢弃。
  另外导出 `.mcfunction`：`scoreboard` 计时 + `execute if score … run playsound`，
  挂到 `minecraft:tick` 标签就能循环播放。
- **我的作品（本地账号）**：不联网、不注册，昵称只用来署名。作品存在浏览器的
  IndexedDB 里（结构数组 + 缩略图），可以重命名、删除、下载 `.mcstructure`，
  也能把外部 `.mcstructure` / 本站 JSON 导进来收进作品库。
  地图画参数、当前分区等设置存在 `localStorage`，下次打开接着用。

## 页面地图

### 工具（⚡ 纯前端，`noDB`）

71 个单页工具，其中 **23 个 MC 相关**，大致分四类：

| 类别 | 代表 | 说明 |
| --- | --- | --- |
| MC 数值换算 | 坐标 · 经验 · 时间 · 区块 · 光照 | 游戏内数值 ↔ 现实数值 |
| MC 规划计算 | 红石信号 · 信标范围 · 史莱姆区块 · 合成 | 提前算好再去游戏里造 |
| MC 查询参考 | 附魔等级 · 药水酿造 · 燃料 · 食物 · 耐久 | 原版数值表 + 计算 |
| 通用工具 | JSON · 编解码 · 正则 · 时间戳 · 颜色 · JWT · 二维码 | 开发者日常 |

首页支持搜索、分类筛选、**右键收藏 / 置顶 / 隐藏**（隐藏的收进右上角设置里）。

### 游戏

| 页面 | 路径 | 说明 |
| --- | --- | --- |
| 游戏厅 | `games/index.html` | 棋牌入口 + 玩法说明书 |
| 围棋 / 中国象棋 / 国际象棋 | `games/tri-chess.html` | 三合一（`#go` / `#xq` / `#ch` 直达），国象可连云端 Stockfish |
| 国象应招器 | `games/chess-auto.html` | 读屏幕上的棋盘给最优应手，带评分 / 深度 / 拖拽摆子 |
| 斗地主 · UNO · 麻将 | `games/*.html` | 单机对局，规则见说明书 |
| MC 复刻 | `games/mc.html` | 区块生成、方块朝向、门、水、活塞、物品栏与合成台 |
| A\* 寻路演示 | `games/astar.html` | 3D 网格画墙铺水，可视化搜索过程 |
| 方块战场 / 五子棋 | `games/pvpga.html` / `wuzi_*.html` | 人机 / 局域网对战（在线房间已下线） |
| 挖矿抽卡 | `tools/gacha.html` | 单抽 / 十连，带保底与图鉴 |

### 需要 GitHub API（☁ `needDB`）

| 页面 | 说明 |
| --- | --- |
| 下载站 | GitHub Releases 聚合 + 手动补录 |
| 答辩 Wiki | 章节树 + 全文搜索 + 阅读进度 |
| 数据后台 | 用 GitHub Token 提交 JSON 改动 |

> 站内自建后端（Supabase）**已全部下线**：账号、聊天、在线房间都不再连接任何服务器，
> 代码里的地址与密钥已清空，`supabase.js` 与反代 Worker 也已删除。
> MC 复刻只剩单机，五子棋改用局域网（同一浏览器开多个标签页）。

## 桌面版 / 离线版

<details>
<summary><b>国象应招器桌面版 exe</b> —— 读屏幕棋盘，自动给应手</summary>

**下载**：[Releases · 国象应招器](https://github.com/HSDL03/HStool/releases/tag/chess-v1.3.1) 里的 `ChessAssist-1.3.1.exe`（单文件免安装）。
源码在 `desk/py`，Python + tkinter，识图与自动落子都在本地。

```bash
cd desk/py && build.cmd        # 或：py -m PyInstaller --onefile --windowed --name 国象应招器 chess_assist.py
```

- **框选与对齐**：自动裁掉纯色背景，再按「相邻格明暗交替 + 格内是否单色」搜出 8×8 范围（框偏几十像素、差两成都能纠回）。
- **识别**：每 0.5 秒截一次，缩到 192×192，每格先减本格平均亮度 —— 高亮、悬停这类「整格一起变亮」的干扰就被消掉了。
- **认子**：取每格内部 6×6 做去均值单位化，归一化互相关匹配「棋子库」，与皮肤配色无关；库存在 `%APPDATA%\ChessAssist\book.json`。
- **漏识别**：基线只在确认过的画面上推进；轮到我方却看见画面变了，会用**对手的合法走法**再匹配一次补上。
- 规则与网页版同一套（易位 / 过路兵 / 升变 / 将杀 / 逼和 / 50 回合 / 三次重复 / 子力不足），perft 与 chess.js 对齐。

</details>

<details>
<summary><b>离线版 exe</b> —— 全部纯前端工具打成一个绿色单文件</summary>

Electron portable：双击即用，不安装、不联网、不写注册表、不留服务。
`needDB` 的页面（下载站 / 答辩 Wiki / 数据后台 / MC 游戏）不会进包。

```bash
node scripts/build-offline.mjs              # 只挑 category=noDB 的条目，生成 offline/www
cd offline && npm install && npm run dist   # → offline/dist/HStool-Offline-<版本>.exe
```

`build-offline.mjs` 结尾会自检：生成的页面里只要还残留 `http(s)://` 外链就报错退出 ——
「离线版能不能真的离线」是构建时卡住的，不靠人工检查。

</details>

## 数据文件

| 文件 | 用途 | 主要字段 |
| --- | --- | --- |
| `data/tools-data.json` | 首页工具卡片 | `id / icon / name / desc / tag / url / category / deprecated / disabled / hidden` |
| `data/wiki-data.json` | Wiki 条目 | `id / title / chapter / section / category / content` |
| `data/download-data.json` | 资源补录 | `releaseTag / fileName / name / desc / tag / version / hidden / offline` |
| `data/announcement.json` | 公告 | `id / type / category / icon / title / content / link / linkText / enabled` |

- `url` 写**相对站点根**的路径，如 `./tools/xxx.html`；`category` 取 `noDB`（纯前端）或 `needDB`（要后端/账号）。
- 首页按 `category` 显示「⚡ 纯前端 / ☁ 需后端」徽标，`hidden` 的条目不下发。
- 既可以用 `pages/admin.html` 改，也可以直接编辑提交 —— 字段与旧版一致，后台无需同步改动。

## 视觉与主题

- 主色继承 MC Wiki 风格：米黄纸底 `#fffdf5` + 橄榄绿 `#3d521f`，2px 描边、硬投影、方块化圆角；
  首页另行采用浅色科技风（`#f6f8fb` 底 + 蓝紫点缀）。
- 内置 8 套主题：MC Wiki / 夜晚 / 下界 / 末地 / 樱花 / 海洋 / GitHub 浅色 / 深色，外加「跟随系统」。
- 主题存 `localStorage: hs-theme`（兼容旧键 `wiki-theme`），切主题只改 `<html data-theme>`。
- 页面里**只用 CSS 变量**（`--bg / --bd / --ac / --text / --muted …`），写死颜色换主题就会花。
- 动效遵循系统「减弱动态效果」；触屏设备自动关掉鼠标跟随光晕这类桌面专属效果。

## 快捷键

| 键 | 作用 |
| --- | --- |
| <kbd>/</kbd> | 聚焦搜索框 |
| <kbd>Ctrl</kbd> / <kbd>⌘</kbd> + <kbd>K</kbd> | 命令面板（搜索页面、工具、条目、操作） |
| <kbd>T</kbd> | 打开主题选择器 |
| <kbd>Ctrl</kbd> + <kbd>B</kbd> | Wiki 页展开 / 收起目录 |
| <kbd>Esc</kbd> | 关闭面板或清空搜索 |

卡片上**右键**（手机长按）可以收藏 / 置顶 / 隐藏。

## 代码怎么接

所有公共能力都在 `assets/js/core.js`，页面只写自己的业务逻辑，**不要重复实现**。

### 换仓库 / 换分支

只改一处 —— `core.js` 里的 `SITE`：

```js
var SITE = { repo: 'HSDL03/HStool', branch: 'main', ... };
```

页面里不要再硬编码仓库名，用 `HS.site.repo` / `HS.site.url('pages/wiki.html')`。

### 新增一个页面

放到 `pages/` 或 `tools/`，头部三件套（路径按层级写，别写绝对路径）：

```html
<link rel="stylesheet" href="../assets/css/core.css">
<script>try{var t=localStorage.getItem('hs-theme')||localStorage.getItem('wiki-theme');if(t==='auto')t=matchMedia('(prefers-color-scheme:dark)').matches?'mc-night':'mc-wiki';if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>

<header class="topbar">…<button class="iconbtn" data-act="theme">🎨</button></header>
<div class="decor" aria-hidden="true"></div>
<main class="wrap">…</main>
<script src="../assets/js/core.js"></script>
```

主题按钮、装饰背景、Toast、命令面板都由 `core.js` 提供。

### 读数据

```js
HS.data('tools-data')     // → data/tools-data.json，自动走 本地 → raw → jsDelivr 三级回落
HS.dataURL('wiki-data')   // → 只要地址（状态条、预加载用）
```

文件名传**完整基名**（`tools-data`，不是 `tools`）。

### 常用 API

| 调用 | 作用 |
| --- | --- |
| `HS.toast(msg, {icon})` | 底部提示 |
| `HS.copy(text)` | 复制到剪贴板（带降级） |
| `HS.absUrl(p)` / `HS.isExternal(p)` | 相对路径转绝对（**按站点根解析**）、判断站外 |
| `HS.site.url(p)` | 站内路径 → 绝对地址（页面在任意层级都对） |
| `HS.theme.open()` / `HS.theme.set(id)` | 主题面板 / 直接切主题 |
| `HS.palette.init({actions, source})` | 命令面板；「切换风格」「回工具台」已内置 |
| `HS.status.mount(url)` | 右下角延迟胶囊 |
| `HS.esc(s)` / `HS.$` / `HS.$$` | 转义与选择器 |
| `HS.store.json(k, d)` | 读写 localStorage（自带 try/catch） |

## 新增一个工具（最短路径）

1. 新建 `tools/<slug>.html` —— 拿 [`tools/timestamp.html`](tools/timestamp.html) 当版式范本。
2. 页面内只写 `<style>` 和一段 IIFE，颜色全用 CSS 变量，复制用 `HS.copy()`，提示用 `HS.toast()`。
3. 在 `data/tools-data.json` 末尾追加一张卡：

```json
{ "id": "tool-xxx", "icon": "🎲", "name": "名字", "desc": "一句话",
  "tag": "工具", "url": "./tools/xxx.html", "category": "noDB",
  "deprecated": false, "disabled": false, "hidden": false }
```

4. 跑 `node scripts/check.mjs`，全绿就 `push` —— 首页会自动渲染新卡片，不用动 `index.html`。

**别踩的坑**

- 不要引外部 CDN、字体、图片；需要第三方库就放 `assets/vendor/`。
- 不要改 `assets/css/core.css` 的既有规则（会波及全站），页面专属样式写在页面内。
- 手机宽度 390 下必须能用：输入框、按钮不溢出。
- 不确定的游戏内数值宁可不算，也不要写死一个猜的。

## 自检与部署

```bash
node scripts/check.mjs
```

`check.mjs` 检查四类问题：

1. `data/*.json` 能否解析、顶层是否是数组；工具卡片的 `id` 是否唯一、`url` 是否指向真实文件；
2. 所有 HTML 里的本地 `href` / `src` 是否存在（写成根路径 `/xxx` 会直接报错，项目站必 404）；
3. 内联 `<script>` 与 `assets/js/` 下脚本的语法；
4. CSS 大括号是否配对。

- 本地：`push` 前跑一遍，出错会打印具体文件和行。
- CI：`.github/workflows/check.yml` 在 `push` / PR 时自动跑同一份脚本（见顶部徽标）。
- 部署：推到 `main` 后 GitHub Pages 自动构建，**30~60 秒**生效；改动没上线先等等再排查。

## 声明

- 本站由 AI 参与制作，代码与文案都是「够用就行」的个人项目，不保证工业级质量。
- 《我的世界》相关贴图、音效、数值版权归 Mojang / Microsoft 所有，这里只用于学习与个人演示，**非商业用途**；如权利方不希望被使用，告知后立刻移除。
- 站内引用的第三方开源项目均在页面内标注出处与许可，如有侵权请联系删除。
