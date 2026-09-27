```markdown
# 红石的小工具箱

> 🤖 **本项目由 AI 全程制作**（DeepSeek 辅助编写）
> 从页面设计、交互逻辑到数据管理后台，全部代码由 AI 生成，人工仅负责需求描述、测试和部署。

一个轻量的个人工具箱 + 资源下载站，纯静态、零依赖、即开即用。

---

## ✨ 功能

### 🧰 工具箱首页（`index.html`）
- 工具卡片集合，分为「可用工具」和「已废弃」两栏
- 支持点击跳转、禁用点击、隐藏
- 工具列表从 `tools-data.json` 动态加载

### 📥 下载站（`download.html`）
- 自动读取 GitHub Releases 的所有附件
- 显示文件名、大小、更新时间、下载次数
- 分类筛选 + 关键词搜索
- 支持手动添加独立资源（不来自 Releases）
- 已下架 / 隐藏状态

### 🗂️ 数据管理后台（`admin.html`）
三个独立 Tab，改完点「保存并推送」直接写入仓库：

| Tab | 作用 | 写入文件 |
|---|---|---|
| 🏷️ 分类管理 | Wiki 分类的重命名、合并、删除、排序 | `wiki-data.json` |
| 📥 下载源管理 | Releases 覆盖层、独立资源增删改 | `download-data.json` |
| 🧰 工具管理 | 首页工具的图标、名称、链接、废弃/隐藏 | `tools-data.json` |

---

## 🎨 特性

- **四套主题**：MC Wiki / MC 夜晚 / GitHub 浅色 / GitHub 暗色，一键切换，跨页同步
- **粒子背景**：Canvas 渐变小方块，跟随主题色变化
- **完全静态**：无后端、无数据库、无构建步骤
- **零依赖**：不加载任何外部库和字体
- **响应式**：桌面 / 平板 / 手机自适应
- **无刷新更新**：数据从 GitHub 拉取，改完刷新即生效

---

## 📁 文件结构

```
HSwiki/
├── index.html              # 工具箱首页
├── download.html           # 下载站
├── admin.html              # 数据管理后台
├── wiki.html               # （已废弃）Wiki 页面
├── wiki-data.json          # Wiki 分类数据
├── download-data.json      # 下载源手动覆盖层
├── tools-data.json         # 首页工具列表
└── README.md
```

---

## 🚀 部署

### 方式一：GitHub Pages（当前使用）

1. 把仓库推送到 GitHub
2. `Settings → Pages`
3. **Source** 选 `Deploy from a branch`
4. **Branch** 选 `main`，目录选 `/ (root)`
5. Save

等 1-2 分钟，访问：

```
https://你的用户名.github.io/仓库名/
```

### 方式二：其他静态托管

纯静态文件，可直接丢到 Cloudflare Pages、Vercel、Netlify 等平台。

---

## 🛠️ 使用指南

### 首次配置

1. 打开 `admin.html`
2. 点「🔑 连接 GitHub」
3. 填一个 **Personal Access Token**
   - 去 [github.com/settings/tokens](https://github.com/settings/tokens?type=beta) 生成
   - 权限只需 **Contents: Read and write**
4. 填 Owner / Repo / 分支，三个数据文件路径保持默认
5. 保存并连接

Token 只存在浏览器 `localStorage`，不会上传到任何地方。

### 发布资源

1. 去 `https://github.com/你的用户名/仓库名/releases/new`
2. 填 Tag（如 `v1.0.0`）
3. 把文件拖到 **Attach binaries** 区
4. 点 **Publish release**

下载站刷新即可看到新资源。

### 修改首页工具

1. 打开 `admin.html` → 切到「🧰 工具管理」
2. 点「＋ 添加工具」或卡片右侧 ✏️
3. 填图标、名称、描述、分类、链接
4. 勾「已废弃」→ 移到右侧灰色栏
5. 勾「隐藏」→ 首页不显示
6. 点「💾 保存并推送」

---

## 📊 数据文件格式

### `tools-data.json`

```json
[
  {
    "id": "download",
    "icon": "📥",
    "name": "下载站",
    "desc": "资源文件 · 便捷下载",
    "tag": "资源",
    "url": "./download.html",
    "deprecated": false,
    "disabled": false,
    "hidden": false
  }
]
```

### `download-data.json`

**独立资源**（不在 Releases 里的）：

```json
[
  {
    "releaseTag": "",
    "fileName": "",
    "icon": "📦",
    "name": "资源名",
    "desc": "描述",
    "tag": "分类",
    "version": "v1.0",
    "url": "https://...",
    "size": "",
    "date": "",
    "hidden": false,
    "offline": false
  }
]
```

**Releases 覆盖层**（改 Releases 自动条目的字段）：

```json
[
  {
    "releaseTag": "v1.0.0",
    "fileName": "texture.zip",
    "icon": "🎨",
    "name": "高清材质包",
    "desc": "自定义描述",
    "tag": "资源包",
    "version": "v1.0.0",
    "hidden": false,
    "offline": false
  }
]
```

> ⚠️ 注意：`releaseTag` 和 `fileName` 必须和 Releases 里的**完全一致**，否则这条数据会被丢弃。如果不是要覆盖 Releases，两个字段都留空。

---

## 🔧 技术栈

| 层 | 使用 |
|---|---|
| 结构 | 原生 HTML5 |
| 样式 | 原生 CSS（CSS 变量做主题） |
| 脚本 | 原生 JavaScript（ES5 风格，无框架） |
| 数据 | GitHub Contents API + Releases API |
| CDN | jsDelivr（数据读取） |
| 部署 | GitHub Pages |

---

## ⚠️ 注意事项

- **GitHub API 限流**：未登录 60 次/小时，管理页填了 Token 后是 5000 次/小时
- **jsDelivr 缓存**：改完数据有 1-5 分钟延迟，点顶栏 🔄 可强制刷新
- **Releases 单文件上限 2 GB**，仓库内文件上限 100 MB
- **CORS**：Releases 附件不能前端 `fetch`，所有信息从 API 读取

---

## 🐛 常见问题

**Q：首页工具不显示？**
A：检查 `tools-data.json` 是否存在，或者管理页里是否保存过。

**Q：下载站看不到 Releases 的文件？**
A：确认 Release 已 **Publish**（不是 Draft），然后点下载站顶栏 🔄 刷新。

**Q：部署报错 `Unable to cancel deployment`？**
A：GitHub 自带 workflow 的已知误报，站点实际已部署成功，可忽略。

**Q：蓝奏云链接失效？**
A：蓝奏云的临时直链有效期只有几小时到几天，应使用分享页短链接（`https://wwt.lanzouw.com/xxx`）。

---

## 📄 License

MIT

---

## 🤖 AI 声明

**本项目的所有代码——包括页面结构、样式、交互逻辑、数据管理后台、API 集成——均由 AI（DeepSeek）生成。**

人类参与的部分仅限：
- 提出需求和修改意见
- 测试功能并反馈问题
- 配置 GitHub 仓库和部署

如果你是开发者，可以自由 fork、修改、二次开发，无需署名。

---

**红石的小工具箱 · 使用 AI 制作**
[GitHub 仓库](https://github.com/HSDL03/HSwiki)
```
