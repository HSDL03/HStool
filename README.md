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

## 本地预览

```bash
python -m http.server 8000
# 或 npx serve .
```

局域网内打开 http://localhost:8000 即可，数据走相对路径，无需跨域。
