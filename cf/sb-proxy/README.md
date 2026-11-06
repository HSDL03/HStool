# 红石的小站 · Supabase 反代（Cloudflare Worker）

把 `*.supabase.co` 换成自己的域名去访问，绕开国内被重置的连接。
前端不用改逻辑，只有一处后端地址。

---

## 一、拿到免费域名（约 10 分钟，GitHub 登录即可）

1. 打开 <https://dash.domain.digitalplat.org/>，用 **GitHub 账号登录**
2. 选后缀 **`.dpdns.org`** 或 **`.qzz.io`**（这两个完全免费，且已进入公共后缀列表，能托管到 Cloudflare）
   - 别选 `us.kg` / `xx.kg`，现在要收 $3
3. 填一个前缀，比如 `hs`，就得到 `hs.dpdns.org`
4. 提交后进「Nameservers」一栏，先空着 —— 下一步拿到 Cloudflare 的 NS 再回来填

> 每个账号默认 1 个域名插槽。用邀请链接注册或给官方仓库点 Star 可再加。

## 二、把域名交给 Cloudflare 托管

1. 注册 <https://dash.cloudflare.com>（邮箱即可，**不需要实名、不需要备案**）
2. 首页 → **Add a site** → 输入 `hs.dpdns.org` → 选 **Free** 套餐
3. Cloudflare 会给你两个 NS，例如：
   ```
   ada.ns.cloudflare.com
   bob.ns.cloudflare.com
   ```
4. 回到 DigitalPlat 的域名面板，把这两个 NS 填进去，保存
5. 等 5~30 分钟，Cloudflare 那边显示 **Active** 就通了

## 三、部署 Worker

1. Cloudflare 控制台 → 左侧 **Workers & Pages** → **Create** → **Worker**
2. 名字填 `sb-proxy` → **Deploy**
3. 点 **Edit code**，把 `worker.mjs` 的全部内容粘进去（文件名无所谓，内容是关键），覆盖掉默认代码 → **Deploy**
4. 这时你会有个 `sb-proxy.<你的子域>.workers.dev` 的地址

**先验证一下**（这个域名在国内不稳，挂不挂代理都能测）：

浏览器打开 `https://sb-proxy.<你的子域>.workers.dev/__health`

应该看到：
```json
{ "worker": "ok", "upstream": "https://lxdyrajbsjftduesvosh.supabase.co",
  "reachable": true, "ms": 320, "detail": { "ok": true, "status": 200 } }
```

`reachable: true` 就说明 Worker 能连上 Supabase。

## 四、绑到自己的域名上（关键一步）

这一步做完，国内才能稳定访问（`*.workers.dev` 本身是被污染的）。

1. 进那个 Worker → **Settings** → **Domains & Routes** → **Add** → **Custom Domain**
2. 填 `api.hs.dpdns.org` → 确认
3. Cloudflare 会自动加 DNS 记录并签发证书，几分钟生效

再测一次：`https://api.hs.dpdns.org/__health` 也返回 `reachable: true` 就成功了。

## 五、告诉前端用这个地址

打开 `assets/js/account.js`，找到：

```js
var SB_PROXY = '';   // ← 反代域名下来后填这里
```

改成：

```js
var SB_PROXY = 'https://api.hs.dpdns.org';
```

推上去就完事。前端会自动优先走反代，反代挂了自动退回直连，两种网络环境都能用。

---

## 为什么这样在国内能用

| | 直连 supabase.co | 走自己的域名 + CF |
|---|---|---|
| TCP 连接 | 被中途 reset | 正常 |
| 解析 | 被污染 | 自己的域名，没被针对 |
| 延迟 | —— | 50~150ms（香港/日本节点） |
| 实名 / 备案 | 不需要 | 不需要（节点在境外） |

## 限制

- **免费额度**：每天 10 万次请求。聊天站这点量根本用不完。
- **免费域名不是永久的**：DigitalPlat 要求每年提前手动续期一次，忘了会掉。掉了重新绑一个就行，前端只改一行。
- **Realtime（WebSocket）也走反代**：Worker 支持 WS 双向转发，但 Cloudflare 对空闲连接有超时，长时间挂着不动可能被断，SDK 会自动重连。
- 这个反代**谁拿到地址都能用**（因为 anon key 本来就在前端）。想收紧就在 `worker.mjs` 顶部的 `ALLOW_ORIGINS` 里填白名单：

  ```js
  const ALLOW_ORIGINS = ['https://hsdl03.github.io', 'http://127.0.0.1:8000'];
  ```

  填了之后别的站点跨域调它会拿到 403。

## 换 Supabase 项目怎么办

改 `worker.mjs` 里的 `UPSTREAM_DEFAULT`，或者在 Worker 的 **Settings → Variables** 里加一个 `UPSTREAM` 变量覆盖，代码不用动。

## 本地测试

```bash
node .workbuddy/t-proxy.mjs
```

起一个假的上游，验证转发、CORS、预检、自检、上游不可达的兜底，25 项断言。
