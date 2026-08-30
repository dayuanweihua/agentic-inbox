<!--
[INPUT]: 依赖 Gmail API OAuth Client、Cloudflare Worker Secret、Cron、R2 与 Agentic Inbox Mailbox
[OUTPUT]: 提供 Gmail Sent 增量同步的启用、授权、测试、故障排查与撤权步骤
[POS]: docs 模块的 Gmail Sent 同步运维手册，补全 Gmail 回复写回 Agentic Inbox 的链路
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# Gmail Sent 同步配置与验收

## 1. 同步目标

当前配置：

```text
Gmail 账号：keaidejim@gmail.com
业务邮箱：support@appetipix.com、support@testmic.io
Worker：https://agentic-inbox.keaidejim.workers.dev
OAuth Client ID：953063607063-c7hmqb24d91kj25lc1deg50001t4g1m4.apps.googleusercontent.com
OAuth Callback：https://agentic-inbox.keaidejim.workers.dev/api/v1/integrations/gmail/callback
```

同步链路：

```text
Gmail 使用任一已配置 support 地址回复客户
  → 邮件进入 Gmail Sent
  → Worker Cron 每 5 分钟调用 Gmail API
  → 按 From 选择对应 Agentic Mailbox
  → Message-ID 去重
  → In-Reply-To / References 关联原线程
  → 写入 Agentic Inbox Sent
```

连接时会记录同步水位，连接前的 Gmail 历史邮件不会回填。每次同步保留 10 分钟重叠查询窗口，并通过 Message-ID 去重，降低 Gmail 索引延迟造成的漏信风险。

## 2. Google Cloud 必须完成的配置

在项目 `agentic-inbox-gmail-sync` 中确认：

1. `APIs & Services → Library → Gmail API` 状态为 Enabled。
2. OAuth consent screen 的 Audience 为 External。
3. Data Access 包含：

   ```text
   https://www.googleapis.com/auth/gmail.readonly
   ```

4. OAuth Client 类型为 Web application。
5. Authorized redirect URI 必须逐字等于：

   ```text
   https://agentic-inbox.keaidejim.workers.dev/api/v1/integrations/gmail/callback
   ```

6. 如果应用仍处于 Testing，将 `keaidejim@gmail.com` 加入 Test users。Testing 场景的 refresh token 可能较快失效；个人长期使用应在确认功能后切到 In production，并接受未验证应用提示或按 Google 要求完成验证。

## 3. 写入 Cloudflare Secret

OAuth Client Secret 绝不能写入 `wrangler.jsonc`、Git、聊天或截图。在项目目录执行：

```bash
cd /Users/test/01_Projects/agentic-inbox
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

终端出现输入提示后，粘贴 Google Cloud OAuth Client 的 Client secret 并回车。输入不会显示在屏幕上。

确认 Secret 名称已经存在：

```bash
npx wrangler secret list
```

结果中应出现：

```text
GOOGLE_CLIENT_SECRET
POLICY_AUD
TEAM_DOMAIN
```

Secret 值无法从 Cloudflare 读取回来，这是正常安全机制。

## 4. 部署

```bash
cd /Users/test/01_Projects/agentic-inbox
npm run typecheck
npm run build
npm run deploy
```

部署输出应显示 Cron：

```text
*/5 * * * *
```

## 5. 首次连接 Gmail

1. 登录 Agentic Inbox。
2. 打开 `support@appetipix.com`。
3. 进入 Settings。
4. 在 Gmail Sent Sync 卡片点击 `Connect keaidejim@gmail.com`。
5. Google 登录时只能选择 `keaidejim@gmail.com`。
6. 同意只读 Gmail 权限。
7. 返回 Settings 后确认状态为 `Connected`。

Worker 只请求 `gmail.readonly`，不会通过 Gmail API 发送、删除或修改 Gmail 邮件。refresh token 保存在私有 R2 key：

```text
private/integrations/gmail/credentials.json
```

API 状态响应不会返回 refresh token。

## 6. 验收测试

### 6.1 建立原始线程

使用 163 邮箱发送：

```text
To: support@appetipix.com
Subject: Gmail sync E2E 001
```

确认邮件同时进入 Agentic Inbox 和 Gmail。

### 6.2 从 Gmail 回复

在 Gmail 中回复，发送前确认：

```text
From: support@appetipix.com
```

163 收到回复后，回到 Agentic Inbox Settings 点击 `Sync now`，不必等待 Cron。

通过标准：

- 提示 `1 imported`；
- Agentic Inbox Sent 出现该回复；
- 回复与原始 163 来信位于同一线程；
- 再次点击 `Sync now` 显示 `0 imported`，不会重复写入。

### 6.3 自动同步

再从 Gmail 回复一封新邮件，不点击 `Sync now`。等待最多 5–7 分钟，刷新 Agentic Inbox Sent，确认自动出现。

## 7. 重要行为

- 只有 Gmail Sent 中 From 严格等于 `GMAIL_SYNC_MAILBOX_IDS` 白名单成员的邮件会导入。
- 一份 Gmail OAuth 连接服务全部已配置 Support Mailbox；无需为每个业务域名重复授权。
- 从个人地址 `keaidejim@gmail.com` 发出的邮件不会导入。
- Agentic Inbox 自己发出的回复已经直接写入 Sent；即使 Gmail 收到副本，Message-ID 去重会阻止重复导入。
- Gmail API 只补齐 Agentic Inbox 的 Sent 记录，不改变客户实际收件链路。
- 删除或断开 Gmail 集成不会删除已经导入 Agentic Inbox 的邮件。

## 8. 故障排查

### Connect 按钮不可点击

运行：

```bash
npx wrangler secret list
```

确认存在 `GOOGLE_CLIENT_SECRET`，然后重新部署。

### `redirect_uri_mismatch`

Google Cloud OAuth Client 的 Authorized redirect URI 与本文第 2 节不完全一致。协议、域名、路径、尾部斜杠都必须一致。

### 授权后返回 error

检查：

- 登录账号是否为 `keaidejim@gmail.com`；
- Gmail API 是否 Enabled；
- Test users 是否包含该 Gmail；
- OAuth Client Secret 是否来自当前 `agentic-inbox-gmail-sync` 项目；
- Cloudflare Access 登录会话是否仍有效。

### 手动同步失败

查看 Worker 日志：

```bash
npx wrangler tail
```

常见原因是 refresh token 已撤销、OAuth 应用仍处于 Testing 导致 token 到期，或 Gmail API 未启用。

### 邮件进入 Sent 但没有归入原线程

先确认 Gmail 的回复确实通过原邮件的 Reply 操作产生，而不是复制主题后新建邮件。线程关联依赖标准 `In-Reply-To` 和 `References` 邮件头；没有这些头时只能作为独立线程导入。

## 9. 断开与重新授权

在 Settings 点击 `Disconnect` 会尝试撤销 Google 授权，并删除 R2 中保存的 refresh token。之后可重新点击 Connect；新的连接会建立新的同步水位，不回填断开期间的历史邮件。
