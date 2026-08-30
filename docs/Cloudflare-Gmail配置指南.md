<!--
[INPUT]: 依赖当前 wrangler.jsonc、Cloudflare Email Service、Cloudflare Access 与 Gmail 官方配置能力
[OUTPUT]: 提供 appetipix.com 的 DNS/MX、Email Routing、Email Sending、Access 与 Gmail SMTP 配置步骤
[POS]: docs 模块的实际控制台操作指南，服务于实施部署方案的域名接入阶段
[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
-->

# appetipix.com + Gmail 配置指南

## 1. 当前目标

```text
客户发送到：support@appetipix.com
统一收件箱：keaidejim@gmail.com
Worker：agentic-inbox
Worker 地址：https://agentic-inbox.keaidejim.workers.dev
```

收信链路：

```text
support@appetipix.com
  → Cloudflare Email Routing
  → agentic-inbox Worker
  → Agentic Inbox Mailbox
  → message.forward()
  → keaidejim@gmail.com
```

回信链路：

```text
Gmail
  → Send mail as: support@appetipix.com
  → Cloudflare SMTP
  → 客户
```

项目代码中的生产变量已经替换为：

```jsonc
{
  "DOMAINS": "appetipix.com",
  "EMAIL_ADDRESSES": ["support@appetipix.com"],
  "FORWARD_TO_EMAIL": "keaidejim@gmail.com"
}
```

## 2. 先理解两类 MX 记录

Cloudflare Email Service 会产生两组不同用途的 DNS 记录：

| 用途 | 记录位置 | 作用 |
|---|---|---|
| Email Routing 收信 | `appetipix.com` 根域名 | 让发往 `support@appetipix.com` 的邮件先进入 Cloudflare |
| Email Sending 发信退信处理 | `cf-bounce.appetipix.com` | 处理从 `support@appetipix.com` 发出的退信和认证 |

不要把两组记录混在一起：

- 收信 MX 的 Name 是 `@`。
- 发信 MX 的 Name 是 `cf-bounce`。
- 发送邮件不需要把 `support` 单独做成 MX 记录。
- MX 优先级由 Cloudflare Dashboard 提供，不要自行猜数字。

Cloudflare 官方建议在 Email Routing 和 Email Sending 的 Onboard 流程中自动生成这些记录；只有自动添加失败时，才按 Dashboard 显示的值手动添加。[官方域名配置说明](https://developers.cloudflare.com/email-service/configuration/domains/)

## 3. 前置检查

### 3.1 域名 Nameserver

进入域名注册商后台，确认 `appetipix.com` 的 Nameserver 已经改为 Cloudflare 提供的两个 Nameserver。

如果域名不在当前 Cloudflare Account，先把域名添加到当前账号，或者把 Worker 部署到拥有该域名的账号。

### 3.2 当前 DNS 状态

在终端执行：

```bash
dig NS appetipix.com +short
dig MX appetipix.com +short
dig TXT appetipix.com +short
```

当前项目检查结果中，`appetipix.com` 尚未出现 Cloudflare Email Routing 的 MX，因此收信还没有生效。

### 3.3 “已锁定”但 DNS 页面看不到

如果在：

```text
Email Routing → Settings → DNS records
```

看到记录状态为“已锁定”，这通常表示记录由 Cloudflare Email Service 管理，不代表需要再去 DNS 页面手动复制一份。Cloudflare 说明，锁定记录由 Email Service 管理；Email Routing 的根域名记录只有在需要迁移或人工接管时才解锁。

截图中显示的三条收信 MX 是：

```text
MX appetipix.com  priority 97  route1.mx.cloudflare.net.
MX appetipix.com  priority 66  route2.mx.cloudflare.net.
MX appetipix.com  priority 97  route3.mx.cloudflare.net.
```

截图中的 Routing DKIM 是：

```text
TXT cf2024-1._domainkey.appetipix.com
```

正确处理顺序：

1. 先等待 5–15 分钟，并刷新 Email Routing → Settings 页面。
2. 用权威 DNS 查询确认，而不是只看 Dashboard：

   ```bash
   dig @gannon.ns.cloudflare.com MX appetipix.com +short
   dig @gannon.ns.cloudflare.com TXT appetipix.com +short
   ```

3. 如果能返回三条 `route*.mx.cloudflare.net`，说明 DNS 已生效，普通 DNS 页面不显示锁定记录是可以接受的。
4. 如果超过 30 分钟仍然没有 MX，回到 Email Routing → Settings，确认 `appetipix.com` 的 Onboard 状态没有待确认、错误或暂停。
5. 只有 Cloudflare 明确提示需要手动接管时，才点击“解锁”，然后在 DNS → Records 中按截图逐条添加；不要自行修改优先级，也不要创建第二组相同 MX。

当前实测状态是：`cf2024-1._domainkey.appetipix.com` 已有权威 DNS 返回，但 `MX appetipix.com` 和根域名 SPF 尚未返回。因此当前还不能判断收信链路已完成，先把 MX 状态处理到可查询再继续 Gmail 验证。

## 4. Cloudflare Access 配置

### 4.1 首次使用 Access 时先完成初始化

如果进入 Cloudflare Access 后只看到“开始使用”，说明当前 Cloudflare Account 还没有创建 Zero Trust organization，One-click Access 按钮暂时不会出现在 Worker 页面。

操作顺序：

1. 点击 Cloudflare Access 页面右上角的“开始使用”。
2. 在“您要保护哪种类型的应用程序？”页面，不要选择“连接专用 Web 应用程序”。该路径会要求内部主机名、端口并创建 Cloudflare Tunnel，不适用于已经部署在 `workers.dev` 的 Agentic Inbox。
3. 点击页面底部：

   ```text
   暂时跳过此步骤
   ```

   如果已经进入“定义应用程序/内部主机名/IP/端口”的 Tunnel 向导，返回上一页或选择“返回到所有开始路径”，再点击“暂时跳过此步骤”。这些输入框全部留空。
4. 按后续向导创建 Zero Trust organization，并设置一个稳定、唯一的 Team name，例如：

   ```text
   appetipix
   ```

   对应 Team domain 通常为：

   ```text
   https://appetipix.cloudflareaccess.com
   ```

   如果 `appetipix` 已被占用，使用 Dashboard 最终接受的名称，并以实际 Team domain 为准。
5. 选择 Zero Trust Free 套餐，完成初始化。即使选择 Free，Cloudflare 的向导也可能要求完成订阅确认。
6. 新创建的 Zero Trust organization 默认可使用 Cloudflare 身份提供商；个人管理后台可先只允许当前 Cloudflare Account 成员登录，后续也可添加 One-time PIN。

完成以上首次初始化后，再回到 Worker 页面启用 One-click Access。

### 4.2 在 Worker 上启用 One-click Access

进入：

```text
Cloudflare Dashboard
→ Workers & Pages
→ agentic-inbox
→ 域（新版界面）
```

启用 One-click Cloudflare Access，只允许登录邮箱：

```text
keaidejim@gmail.com
```

新版界面中：

1. 在 `Worker URL` 卡片中找到生产地址 `agentic-inbox.keaidejim.workers.dev`。
2. 保持最右侧蓝色 URL 开关为开启状态；它只控制 URL 是否启用，不是 Access 开关。
3. 点击生产地址下方的“公开”下拉框。
4. 在菜单中选择带有“Access”“要求登录”或“受保护”字样的选项，确认启用。
5. Preview URL 可暂时保持公开或关闭；生产地址必须启用 Access。

旧版文档所说的 `Settings → Domains & Routes → Enable Cloudflare Access`，在当前中文新版 Dashboard 中对应“域 → Worker URL → 公开下拉框”。

### 4.3 写入 Worker secrets 并验证

启用后记录弹窗显示的：

```text
POLICY_AUD
TEAM_DOMAIN
```

当前 `agentic-inbox.keaidejim.workers.dev` 从 Cloudflare Access 登录跳转中确认的实际值为：

```text
POLICY_AUD=442cbcf7161583b670edef94038538446ca883bf6fed0d83b170029cd991546c
TEAM_DOMAIN=https://dawn-butterfly-3fdb.cloudflareaccess.com
```

这两个值是 Access 应用的公开标识，不是邮箱验证码或 API Token。`POLICY_AUD` 必须是完整的 Application Audience tag，不能填写 Policy ID、Application ID 或其他 `kid`；`TEAM_DOMAIN` 不能填写 Worker URL。

在项目目录执行：

```bash
npx wrangler secret put POLICY_AUD
npx wrangler secret put TEAM_DOMAIN
```

分别粘贴对应值。`TEAM_DOMAIN` 可以使用 Access team 基础地址，或 Dashboard 提供的 `/cdn-cgi/access/certs` 地址。

如果启用时没有保存弹窗内容，可以从以下位置重新获取：

```text
POLICY_AUD:
Zero Trust → Access controls → Applications
→ agentic-inbox → Configure → Additional settings
→ Application Audience (AUD) Tag

TEAM_DOMAIN:
Zero Trust → Settings → Team domain
```

验证：

```bash
curl -i https://agentic-inbox.keaidejim.workers.dev/
```

未登录时应被 Access 拦截；登录后才可以打开后台。当前代码在生产环境缺少 Access secrets 时会 fail closed。

## 5. Email Routing 收信与 MX 记录

### 5.1 推荐方式：让 Cloudflare 自动添加

进入：

```text
Compute
→ Email Service
→ Email Routing
→ Onboard Domain
```

选择：

```text
appetipix.com
```

Cloudflare 会要求确认以下 Routing 记录：

```text
MX  @                    route1.mx.cloudflare.net
MX  @                    route2.mx.cloudflare.net
MX  @                    route3.mx.cloudflare.net
TXT @                    v=spf1 include:_spf.mx.cloudflare.net ~all
TXT cf2024-1._domainkey  Cloudflare Dashboard 提供的 DKIM 公钥
```

点击完成后，回到：

```text
Email Routing → appetipix.com → Settings
```

确认 DNS 状态为可用或已锁定。

### 5.2 手动添加收信 MX

如果 Onboard 页面无法自动写 DNS，进入：

```text
Cloudflare Dashboard
→ appetipix.com
→ DNS
→ Records
→ Add record
```

分别添加 Dashboard 显示的三条 MX：

```text
Type: MX
Name: @
Mail server: route1.mx.cloudflare.net
Priority: 使用 Email Routing 页面显示的优先级
TTL: Auto
```

```text
Type: MX
Name: @
Mail server: route2.mx.cloudflare.net
Priority: 使用 Email Routing 页面显示的优先级
TTL: Auto
```

```text
Type: MX
Name: @
Mail server: route3.mx.cloudflare.net
Priority: 使用 Email Routing 页面显示的优先级
TTL: Auto
```

Cloudflare 官方记录名称是 `route1.mx.cloudflare.net`、`route2.mx.cloudflare.net`、`route3.mx.cloudflare.net`，但优先级以当前 Dashboard 为准。

### 5.3 收信 SPF 与 DKIM

收信 Routing 通常还需要：

```text
Type: TXT
Name: @
Content: v=spf1 include:_spf.mx.cloudflare.net ~all
TTL: Auto
```

以及 Cloudflare Dashboard 提供的 Routing DKIM：

```text
Type: TXT
Name: cf2024-1._domainkey
Content: 从 Email Routing 页面复制完整 DKIM 公钥
TTL: Auto
```

不要手写 DKIM 公钥，必须复制 Dashboard 中的完整值。

如果根域名已经有其他 SPF，例如：

```text
v=spf1 include:_spf.google.com ~all
```

不能创建第二条 `v=spf1` TXT。应该合并为一条，例如：

```text
v=spf1 include:_spf.mx.cloudflare.net include:_spf.google.com ~all
```

SPF 的 DNS lookup 总数不能超过 10 次。[Cloudflare SPF 排障说明](https://developers.cloudflare.com/email-service/reference/troubleshooting/)

### 5.4 创建 Worker Routing Rule

进入：

```text
Compute
→ Email Service
→ Email Routing
→ appetipix.com
→ Routing Rules
→ Create routing rule
```

填写：

```text
Email pattern: support
Domain: appetipix.com
Action: Send to a Worker
Worker: agentic-inbox
```

保存后最终效果：

```text
support@appetipix.com → agentic-inbox Worker
```

不要在同一地址上再创建：

```text
support@appetipix.com → Send to an email → keaidejim@gmail.com
```

否则可能绕过 Agentic Inbox，或者因重复规则顺序导致行为不明确。

## 6. Email Sending 发信与 MX 记录

### 6.1 自动 Onboard 发信域名

进入：

```text
Compute
→ Email Service
→ Email Sending
→ Onboard Domain
```

选择：

```text
appetipix.com
```

Email Sending 会为 `cf-bounce.appetipix.com` 添加：

```text
MX  cf-bounce  route1.mx.cloudflare.net
MX  cf-bounce  route2.mx.cloudflare.net
MX  cf-bounce  route3.mx.cloudflare.net
TXT cf-bounce  v=spf1 include:_spf.mx.cloudflare.net ~all
TXT cf-bounce._domainkey  Cloudflare 提供的 Sending DKIM 公钥
TXT _dmarc  Cloudflare 提供的 DMARC 值
```

这里的 MX Name 是 `cf-bounce`，不是 `@`。

### 6.2 手动添加发信 MX

只有 Cloudflare Dashboard 明确要求手动添加时才操作。进入：

```text
appetipix.com
→ DNS
→ Records
→ Add record
```

添加三条 MX：

```text
Type: MX
Name: cf-bounce
Mail server: route1.mx.cloudflare.net
Priority: 使用 Email Sending 页面显示的优先级
TTL: Auto
```

对 `route2`、`route3` 重复添加。

再添加 Dashboard 提供的 SPF、DKIM、DMARC。不要复制示例公钥或自行生成 DKIM 值。

Email Sending 的 DKIM selector 是：

```text
cf-bounce._domainkey
```

它和 Email Routing 的：

```text
cf2024-1._domainkey
```

不是同一条记录，不能互相替代。

## 7. 验证 DNS 记录

等待几分钟后执行：

```bash
dig MX appetipix.com +short
dig TXT appetipix.com +short
dig MX cf-bounce.appetipix.com +short
dig TXT cf-bounce.appetipix.com +short
dig TXT cf2024-1._domainkey.appetipix.com +short
dig TXT cf-bounce._domainkey.appetipix.com +short
dig TXT _dmarc.appetipix.com +short
```

预期：

- `MX appetipix.com` 返回三条 Cloudflare Routing MX。
- `MX cf-bounce.appetipix.com` 返回三条 Cloudflare Sending MX。
- 根域名和 `cf-bounce` 各自只有正确的 SPF。
- 两个 DKIM selector 都能查询到对应公钥。
- `_dmarc.appetipix.com` 有有效的 `v=DMARC1` 记录。

DNS 传播通常需要 5–15 分钟，最长可能需要 24 小时；以 Cloudflare Email Service 页面显示的验证状态为准。

## 8. Cloudflare Destination Address

进入：

```text
Compute
→ Email Service
→ Email Routing
→ Destination Addresses
```

添加并验证：

```text
keaidejim@gmail.com
```

这一步和 Gmail 的 Send mail as 验证是两次不同的验证，必须都完成。

## 9. Gmail 发信配置

### 9.1 创建 API Token

Cloudflare：

```text
My Profile
→ API Tokens
→ Create Token
→ Create Custom Token
```

权限：

```text
Account → Email Sending → Edit
```

### 9.2 Gmail 添加发件身份

Gmail：

```text
设置
→ 查看所有设置
→ 账号和导入
→ 用这个地址发送邮件
→ 添加另一个电子邮件地址
```

填写：

```text
Name: Appetipix Support
Email: support@appetipix.com
```

SMTP 参数：

```text
SMTP Server: smtp.mx.cloudflare.net
Port: 465
Security: SSL / Implicit TLS
Username: api_token
Password: Cloudflare Email Sending API Token
```

不能使用端口 587 或 STARTTLS。[Cloudflare SMTP 官方参数](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)

### 9.3 完成 Gmail 验证

Gmail 会把验证邮件发往 `support@appetipix.com`。完整链路应为：

```text
Gmail 验证邮件
→ Email Routing Worker
→ Agentic Inbox
→ Gmail Destination Address
```

打开验证邮件并完成确认。

### 9.4 设置回复身份

在 Gmail 的 Send mail as 设置中：

```text
回复邮件时：使用收到邮件时所用的地址回复
```

并将 Reply-To 设置为：

```text
support@appetipix.com
```

每次发送前检查：

```text
From: Appetipix Support <support@appetipix.com>
```

## 10. 创建 Gmail 标签

创建标签：

```text
Support/Appetipix
```

创建搜索过滤器：

```text
to:(support@appetipix.com)
```

动作：

```text
应用标签：Support/Appetipix
```

## 11. 最终测试

使用另一个邮箱发送，不要从 `keaidejim@gmail.com` 自发自收。

### 收信测试

```text
To: support@appetipix.com
Subject: Appetipix support test
```

确认 Gmail 和 Agentic Inbox 都能收到。

### 回信测试

在 Gmail 回复，客户侧必须看到：

```text
From: support@appetipix.com
```

客户再次回复后，邮件应再次进入 Agentic Inbox 并转发 Gmail。

### 认证测试

在客户邮箱中查看原始邮件，确认：

```text
SPF: PASS
DKIM: PASS
DMARC: PASS
```

## 12. 常见问题

### MX 还是空的

检查：

- 域名 Nameserver 是否已指向 Cloudflare；
- 是否完成 Email Routing Onboard；
- DNS 页面是否存在旧 MX；
- 是否刚修改不久，等待传播；
- 是否把 MX 错加到了 `support` 而不是 `@`。

### Routing 页面提示规则禁用

通常是 Gmail Destination Address 还没有完成验证。先验证 `keaidejim@gmail.com`，再回到 Routing Rules 启用规则。

### Gmail SMTP 报 550

通常表示 `appetipix.com` 尚未完成 Email Sending Onboard，或者发件地址不是已认证域名。

### Gmail 回复仍显示个人 Gmail

检查：

- Send mail as 是否已验证；
- From 是否选择了 `support@appetipix.com`；
- Reply-To 是否设置为 Support 地址；
- 是否使用了 Gmail 自动回复或过滤器自动发送。

### 后台返回 Access 配置错误

执行：

```bash
npx wrangler secret put POLICY_AUD
npx wrangler secret put TEAM_DOMAIN
```

然后重新访问 Worker。邮件入口本身不依赖网页 Access，但后台和 MCP 依赖 Access。

## 13. 配置完成清单

```text
[ ] appetipix.com Nameserver 已指向 Cloudflare
[ ] Email Routing 已 Onboard
[ ] 根域名 @ 的三条 MX 已生效
[ ] 根域名 SPF/DKIM 已生效
[ ] support@appetipix.com Routing Rule 已指向 agentic-inbox Worker
[ ] Email Sending 已 Onboard
[ ] cf-bounce 的三条 MX 已生效
[ ] cf-bounce SPF/DKIM/DMARC 已生效
[ ] keaidejim@gmail.com Destination Address 已验证
[ ] Cloudflare Access 已启用
[ ] POLICY_AUD / TEAM_DOMAIN 已设置
[ ] Agentic Inbox Mailbox 已创建
[ ] Gmail Send mail as 已验证
[ ] Gmail Reply-To 已设置
[ ] 外部邮箱收发测试通过
[ ] SPF/DKIM/DMARC 测试通过
```

## 官方参考

- [Cloudflare Domain configuration](https://developers.cloudflare.com/email-service/configuration/domains/)
- [Cloudflare Route emails](https://developers.cloudflare.com/email-service/get-started/route-emails/)
- [Cloudflare SMTP](https://developers.cloudflare.com/email-service/api/send-emails/smtp/)
- [Gmail Send mail as](https://support.google.com/mail/answer/22370)
