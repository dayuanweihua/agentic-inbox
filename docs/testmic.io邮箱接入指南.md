<!--
[INPUT]: 依赖当前多 Mailbox wrangler 配置、Cloudflare Email Routing/Email Sending、Gmail Send mail as 与 Gmail Sent 同步
[OUTPUT]: 提供 support@testmic.io 从 DNS 到端到端验收的接入顺序
[POS]: docs 模块的新增业务邮箱操作手册，专用于 testmic.io 接入现有统一客服系统
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# support@testmic.io 接入指南

## 1. 目标链路

```text
客户 → support@testmic.io
  → Cloudflare Email Routing
  → agentic-inbox Worker
  ├→ Testmic Mailbox
  └→ keaidejim@gmail.com

Gmail 使用 support@testmic.io 回复
  → Cloudflare SMTP → 客户
  → Gmail Sent API → Testmic Mailbox Sent
```

当前 DNS 检查显示 `testmic.io` 已使用 Cloudflare nameserver，但尚无 MX 记录。必须先完成 Email Routing Onboard。

## 2. Cloudflare Email Routing 收信

进入：

```text
Cloudflare Dashboard
→ Compute
→ Email Service
→ Email Routing
→ Onboard Domain
→ testmic.io
```

允许 Cloudflare 自动添加根域名的 MX、SPF 和 Routing DKIM。不要手动猜测 MX 优先级；以控制台为准。

完成后检查：

```bash
dig MX testmic.io +short
dig TXT testmic.io +short
```

MX 应返回 `route1/route2/route3.mx.cloudflare.net`。通常 5–15 分钟可见。

此时先不要创建指向 Worker 的 Routing Rule，必须等第 5 节的 Agentic Mailbox 创建完成。

## 3. Cloudflare Email Sending 发信

进入：

```text
Cloudflare Dashboard
→ Compute
→ Email Service
→ Email Sending
→ Onboard Domain
→ testmic.io
```

等待 Sending 状态正常，确认 Cloudflare 已创建 `cf-bounce.testmic.io` 的 MX、SPF、DKIM 和 DMARC。只有完成这一步，Worker binding 和 Gmail SMTP 才能使用 `support@testmic.io` 发信。

## 4. 项目配置与部署

项目当前已经配置：

```jsonc
"DOMAINS": "appetipix.com,testmic.io",
"EMAIL_ADDRESSES": [
  "support@appetipix.com",
  "support@testmic.io"
],
"GMAIL_SYNC_MAILBOX_IDS": [
  "support@appetipix.com",
  "support@testmic.io"
],
"allowed_sender_addresses": [
  "support@appetipix.com",
  "support@testmic.io"
]
```

Email Sending Onboard 成功后再部署：

```bash
cd /Users/test/01_Projects/agentic-inbox
npm run typecheck
npm run build
npm run deploy
```

## 5. 创建 Agentic Mailbox

部署后打开 Agentic Inbox，创建：

```text
Name: Testmic Support
Email: support@testmic.io
```

确认侧边栏已经出现该 Mailbox。Worker 对白名单内但尚未创建的 Mailbox 不归档邮件，因此不能跳过这一步。

## 6. 创建 Routing Rule

进入：

```text
Email Routing
→ testmic.io
→ Routing Rules
→ Create routing rule
```

填写：

```text
Email pattern: support
Action: Send to a Worker
Worker: agentic-inbox
```

同一个 `support@testmic.io` 不要再创建直接转发 Gmail 的第二条规则。Worker 保存邮件后会使用 `message.forward()` 转发到 `keaidejim@gmail.com`。

## 7. Gmail 添加 Send mail as

进入：

```text
Gmail
→ 设置
→ 查看所有设置
→ 账号和导入
→ 用这个地址发送邮件
→ 添加另一个电子邮件地址
```

填写：

```text
名称：Testmic Support
电子邮件：support@testmic.io
```

SMTP：

```text
Server: smtp.mx.cloudflare.net
Port: 465
Username: api_token
Password: 现有 Cloudflare Email Sending API Token
Security: SSL
```

验证邮件会通过 Agentic Worker 转发到 Gmail。完成验证后，在 Gmail 选择“使用收到邮件时所用的地址回复”。

建议创建过滤器：

```text
to:(support@testmic.io)
→ 标签 Support/Testmic
```

## 8. Gmail Sent 同步

现有 Google OAuth Client、`GOOGLE_CLIENT_SECRET` 和 Gmail 授权可以继续复用。一个 Gmail OAuth 连接会同时同步：

```text
support@appetipix.com → Appetipix Mailbox Sent
support@testmic.io    → Testmic Mailbox Sent
```

同步代码读取 Gmail 邮件的真实 `From`，选择对应 Durable Object，并使用 Message-ID 去重、In-Reply-To/References 关联线程。

## 9. 验收

使用 163 或 Outlook 发送：

```text
To: support@testmic.io
Subject: Testmic E2E 001
```

依次确认：

1. Testmic Mailbox 收到一封。
2. `keaidejim@gmail.com` 收到一封。
3. Gmail 回复时 From 为 `support@testmic.io`。
4. 外部邮箱收到回复，个人 Gmail 地址不可见。
5. Gmail 原始邮件中 SPF、DKIM、DMARC 均 PASS。
6. Agentic Settings 点击 `Sync now` 后，回复进入 Testmic Sent。
7. 回复与原来来信位于同一线程。
8. 再次同步不会生成重复邮件。

