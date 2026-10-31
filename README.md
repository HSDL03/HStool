<div align="center">

# 红石的小站

**工具集 · 资源下载 · 个人 Wiki · 小游戏**

[![站点自检](https://github.com/HSDL03/HStool/actions/workflows/check.yml/badge.svg)](https://github.com/HSDL03/HStool/actions/workflows/check.yml)
[![在线访问](https://img.shields.io/badge/在线访问-hsdl03.github.io%2FHStool-3d521f?style=flat-square)](https://hsdl03.github.io/HStool/)
[![收录条目](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FHSDL03%2FHStool%2Fmain%2Fdata%2Ftools-data.json&query=%24.length&label=%E6%94%B6%E5%BD%95%E6%9D%A1%E7%9B%AE&color=3d521f&style=flat-square)](data/tools-data.json)
[![纯静态](https://img.shields.io/badge/部署-GitHub%20Pages-222?style=flat-square&logo=githubpages&logoColor=white)](https://hsdl03.github.io/HStool/)
[![AI 制作](https://img.shields.io/badge/本项目由-AI%20制作-8b5cf6?style=flat-square)](#声明)

</div>

一个纯静态的个人站点：**没有框架、没有构建步骤**，`push` 到 `main` 后 GitHub Pages 自动上线（30~60 秒生效）。
所有页面共用一套设计系统（`assets/css/core.css`）和一份公共能力（`assets/js/core.js`），新页面只写自己的业务逻辑。

> **数字一览**：收录 75 个条目、可见 68 个 —— 59 个工具（其中 22 个 MC 相关）、游戏厅 + 棋牌室、聊天室、下载站、Wiki、数据后台。

---

## 目录

- [快速开始](#快速开始)
- [目录结构](#目录结构)
- [页面地图](#页面地图)
- [离线版 exe](#离线版-exe)
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
│  ├─ css/core.css         设计系统：8 套主题令牌 + 通用组件（.tool/.panel/.fld/.btn…）
│  ├─ js/core.js           主题引擎 / 命令面板 / 装饰背景 / Toast / 数据三级回落
│  ├─ vendor/              本地化的第三方库（three.js、supabase.js、qrcode.js），缺失才回落 CDN
│  ├─ mc-*.js              MC 复刻用的方块 / 模型 / 配方 / 贴图索引数据
│  ├─ mc-icons/            工具卡片用的 MC 官方渲染图（zh.minecraft.wiki）
│  ├─ mc-gui/              MC 原版 GUI 贴图与控件素材
│  ├─ mc-textures/         MC 原版贴图（16px 图集、GUI、实体）
│  └─ mc-sounds/           MC 原版音效
│
├─ pages/
│  ├─ wiki.html            答辩 Wiki 阅读器：章节树 / 目录 / 全文搜索 / 阅读进度
│  ├─ download.html        下载站：GitHub Releases + 手动补录
│  ├─ admin.html           数据后台：用 GitHub Token 直接读写 JSON
│  └─ chat.html            聊天室（Supabase）
│
├─ tools/                  单文件小工具，每页一个 .html（61 个文件）
│                          通用：计算器 / JSON / 编解码 / 时间戳 / 颜色 / 正则 / JWT…
│                          MC 专区：附魔 / 酿造 / 红石 / 挖掘 / 伤害 / 合成 / 指令…共 22 个
│
├─ games/
│  ├─ index.html           游戏厅：六张棋牌入口
│  ├─ rules.html           六种玩法说明书（含与标准规则的差别）
│  ├─ tri-chess.html       围棋 / 中国象棋 / 国际象棋三合一，国象可连云端引擎
│  ├─ chess-auto.html      国象应招器（作弊向）：自动应招 / 评分 / 编辑棋局
│  ├─ doudizhu.html        斗地主
│  ├─ uno.html             UNO
│  ├─ mahjong.html         麻将
│  ├─ mc.html              MC 复刻（three.js，主战场）
│  ├─ astar.html           A* 寻路 3D 演示
│  ├─ pvpga.html           PVP 小游戏
│  └─ wuzi_game/hotel.html 五子棋对局 + 联机大厅（Supabase）
│
├─ data/
│  ├─ tools-data.json      工具卡片（顺序即首页渲染顺序）
│  ├─ wiki-data.json       Wiki 条目
│  ├─ download-data.json   资源补录
│  └─ announcement.json    公告
│
├─ scripts/
│  ├─ check.mjs            站点自检脚本（CI 与本地共用）
│  ├─ build-offline.mjs    离线版打包（只挑 noDB 条目）
│  └─ guard.mjs            命令熔断器（超时自动杀进程换方案）
│
├─ offline/                Electron 打包工程（构建产物不入库）
└─ .github/workflows/check.yml   push / PR 时自动跑自检
```

> **路径约定**：只有 `index.html`、`404.html`、`README.md` 在根目录，其余页面都下沉一层。
> 所以子目录页用 `../assets/`、`../data/`，首页引用页面用 `./pages/xxx.html`；
> `404.html` 里的资源必须写 `/HStool/` 绝对路径（GitHub Pages 会在任意深度的坏链接上渲染它）。

## 页面地图

### 工具（⚡ 纯前端，`noDB`）

59 个可见工具，其中 **22 个 MC 相关**，大致分四类：

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
| 游戏厅 | `games/index.html` | 六张棋牌入口 + 玩法说明书 |
| 围棋 / 中国象棋 / 国际象棋 | `games/tri-chess.html` | 三合一页面（`#go` / `#xq` / `#ch` 直达），国象可连云端 Stockfish |
| 国象作弊器 | `games/chess-auto.html` | 输了对手走法就给你最优应手，带评分 / 深度 / 拖拽摆子 / 棋局编辑 |
| 斗地主 · UNO · 麻将 | `games/doudizhu.html` 等 | 单机对局，规则见说明书 |
| MC 复刻 | `games/mc.html` | three.js 手写体素引擎：区块生成、方块朝向、门、水、活塞、物品栏 |
| A\* 寻路演示 | `games/astar.html` | 3D 网格画墙铺水，可视化搜索过程；支持批量模拟 1~1000 局 |
| PVP / 五子棋 | `games/pvpga.html` / `wuzi_*.html` | 双人对战；五子棋带联机大厅 |
| 挖矿抽卡 | `tools/gacha.html` | 单抽 / 十连，带保底与图鉴 |

### 需要后端（☁ `needDB`）

| 页面 | 说明 |
| --- | --- |
| MC 复刻 | 登录与存档走 Supabase |
| 聊天室 / 点击游戏 / 五子棋大厅 | Supabase 实时能力 |
| 下载站 | GitHub Releases 聚合 + 手动补录 |
| 答辩 Wiki | 章节树 + 全文搜索 + 阅读进度 |
| 数据后台 | 用 GitHub Token 提交 JSON 改动 |

## 离线版 exe

把全部**纯前端**工具打成一个绿色单文件 exe（Electron portable）：双击即用，不安装、不联网、不写注册表、不留服务。
`needDB` 的页面（聊天室 / 下载站 / 答辩 Wiki / 数据后台 / MC 游戏）不会进包。

- 下载：[Releases](https://github.com/HSDL03/HStool/releases) 里的 `HStool-Offline-<版本>.exe`，或站内[下载站](https://hsdl03.github.io/HStool/pages/download.html)。
- 重新打包：

```bash
node scripts/build-offline.mjs          # 只挑 category=noDB 的条目，生成 offline/www
cd offline
npm install
npm run dist                            # → offline/dist/HStool-Offline-<版本>.exe
```

`build-offline.mjs` 会在最后自检一遍：只要生成的页面里还残留 `http(s)://` 外链就报错退出，
所以「离线版还能不能真的离线」是构建时就卡住的，不是靠人工检查。

构建脚本挑工具的依据只有一条：`data/tools-data.json` 里 `category === 'noDB'` 且没隐藏/停用。
新加的工具只要是纯前端，下次打包会自动进离线版，不用改脚本。

## 数据文件

| 文件 | 用途 | 主要字段 |
| --- | --- | --- |
| `data/tools-data.json` | 首页工具卡片 | `id / icon / name / desc / tag / url / category / deprecated / disabled / hidden` |
| `data/wiki-data.json` | Wiki 条目 | `id / title / chapter / section / category / content` |
| `data/download-data.json` | 资源补录 | `releaseTag / fileName / name / desc / tag / version / hidden / offline` |
| `data/announcement.json` | 公告 | `id / type / category / icon / title / content / link / linkText / enabled` |

- `url` 写**相对站点根**的路径，如 `./tools/xxx.html`；`category` 取 `noDB`（纯前端）或 `needDB`（要后端/账号）。
- 首页按 `category` 显示「⚡ 纯前端 / ☁ 需后端」徽标，`hidden` 的条目不下发。
- 这些文件既可以用 `pages/admin.html` 改，也可以直接编辑提交——字段与旧版完全一致，后台无需同步改动。

## 视觉与主题

- 主色继承 MC Wiki 风格：米黄纸底 `#fffdf5` + 橄榄绿 `#3d521f`，2px 描边、硬投影、方块化圆角。
- 内置 8 套主题：MC Wiki / 夜晚 / 下界 / 末地 / 樱花 / 海洋 / GitHub 浅色 / 深色，外加「跟随系统」。
- 主题存在 `localStorage: hs-theme`（兼容读取旧键 `wiki-theme`），切主题只改 `<html data-theme>`。
- 页面里**只用 CSS 变量**（`--bg / --bg2 / --bd / --bd2 / --ac / --text / --muted …`），写死颜色换主题就会花。
- 动效遵循系统「减弱动态效果」设置；触屏设备自动关掉鼠标跟随光晕这类桌面专属效果。

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

只改一处——`assets/js/core.js` 里的 `SITE`：

```js
var SITE = { repo: 'HSDL03/HStool', branch: 'main', ... };
```

页面里不要再硬编码仓库名，用 `HS.site.repo` / `HS.site.url('pages/wiki.html')`。

### 新增一个页面

1. 放到 `pages/`（整站页面）或 `tools/`（小工具）。
2. 头部三件套（路径按目录层级写死，不要写绝对路径）：

```html
<link rel="stylesheet" href="../assets/css/core.css">
<script>try{var t=localStorage.getItem('hs-theme')||localStorage.getItem('wiki-theme');if(t==='auto')t=matchMedia('(prefers-color-scheme:dark)').matches?'mc-night':'mc-wiki';if(t)document.documentElement.setAttribute('data-theme',t)}catch(e){}</script>

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

文件名传**完整基名**（`tools-data`，不是 `tools`）。

### 常用 API

| 调用 | 作用 |
| --- | --- |
| `HS.toast(msg, {icon})` | 底部提示 |
| `HS.copy(text)` | 复制到剪贴板（带降级） |
| `HS.absUrl(p)` / `HS.isExternal(p)` | 相对路径转绝对、判断站外 |
| `HS.site.url(p)` | 站内路径 → 绝对地址（页面在任意层级都对） |
| `HS.theme.open()` / `HS.theme.set(id)` | 主题面板 / 直接切主题 |
| `HS.palette.init({actions, source})` | 命令面板；「切换风格」「回工具台」已内置，只传自己特有的 |
| `HS.status.mount(url)` | 右下角延迟胶囊 |
| `HS.esc(s)` / `HS.$` / `HS.$$` | 转义与选择器 |
| `HS.store.json(k, d)` | 读写 localStorage（自带 try/catch） |

## 新增一个工具（最短路径）

1. 新建 `tools/<slug>.html`——拿 [`tools/timestamp.html`](tools/timestamp.html) 当版式范本抄。
2. 页面内只写 `<style>` 和一段 IIFE，颜色全用 CSS 变量，复制用 `HS.copy()`，提示用 `HS.toast()`。
3. 在 `data/tools-data.json` 末尾追加一张卡：

```json
{ "id": "tool-xxx", "icon": "🎲", "name": "名字", "desc": "一句话",
  "tag": "工具", "url": "./tools/xxx.html", "category": "noDB",
  "deprecated": false, "disabled": false, "hidden": false }
```

4. 跑 `node scripts/check.mjs`，全绿就 `push`——首页会自动渲染新卡片，不用动 `index.html`。

**别踩的坑**

- 不要引外部 CDN、字体、图片；需要第三方库就放 `assets/vendor/`。
- 不要改 `assets/css/core.css` 的既有规则（会波及全站），页面专属样式写在页面内。
- 手机宽度 390 下必须能用：输入框、按钮不溢出。
- 不确定的游戏内数值宁可不算，也不要写死一个猜的。

## 自检与部署

```bash
node scripts/check.mjs
```

`check.mjs` 会检查四类问题：

1. `data/*.json` 能否解析、顶层是否是数组；工具卡片的 `id` 是否唯一、`url` 是否指向真实文件；
2. 所有 HTML 里的本地 `href` / `src` 是否存在（写成根路径 `/xxx` 会直接报错，GitHub Pages 项目站必 404）；
3. 内联 `<script>` 与 `assets/js/` 下脚本的语法；
4. CSS 大括号是否配对。

- 本地：`push` 前跑一遍，出错会打印具体文件和行。
- CI：`.github/workflows/check.yml` 在 `push` / PR 时自动跑同样的脚本（见页面顶部的徽标）。
- 部署：推到 `main` 后 GitHub Pages 自动构建，**30~60 秒**生效；改动没上线先等等再排查。

## 声明

- 本站由 AI 参与制作，代码与文案都是「够用就行」的个人项目，不保证工业级质量。
- 《我的世界》相关贴图、音效、数值版权归 Mojang / Microsoft 所有，这里只用于学习与个人演示，**非商业用途**；如权利方不希望被使用，告知后立刻移除。
- 站内引用的第三方开源项目均在页面内标注出处与许可，如有侵权请联系删除。
