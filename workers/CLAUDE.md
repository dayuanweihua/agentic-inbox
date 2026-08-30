# workers/
> L2 | 父级: /CLAUDE.md

成员清单
app.ts: Worker HTTP/SSR/MCP/Agent 入口与 Cloudflare Access JWT 校验，编排 inbound email 与 Gmail sync cron
index.ts: Hono API、Mailbox 管理、邮件发送、Gmail OAuth API、MIME 收件解析、白名单路由、Gmail 转发与 AI 草稿触发
types.ts: Env 共享绑定契约，包含 Access 与 Google OAuth secret
email-sender.ts: Cloudflare Email Service Workers binding 发信适配器与附件/线程头映射
durableObject/index.ts: Mailbox Durable Object 的 SQLite 邮件、线程、附件、文件夹和限流操作
durableObject/migrations.ts: Mailbox SQLite 迁移执行器与版本迁移清单
db/schema.ts: Drizzle SQLite 表定义，包含 folders、emails、attachments
agent/index.ts: 每个 Mailbox 的 AIChatAgent、系统提示词与新邮件草稿处理
mcp/index.ts: Email MCP server 暴露的 Mailbox 工具与资源
lib/ai.ts: Workers AI provider 与模型调用辅助
lib/attachments.ts: R2 附件写入与附件数据转换
lib/email-helpers.ts: 发件人校验、Message-ID、线程头和 Mailbox 列表辅助
lib/gmail.ts: Google OAuth、私有 refresh token、多 Mailbox 增量 Gmail Sent 查询、From 路由、Message-ID 去重与 Sent 导入
lib/mailbox.ts: Mailbox 路由中间件与 Durable Object 上下文
lib/schemas.ts: API 邮件请求 Zod schema
lib/tools.ts: AI Agent 邮件工具实现
routes/reply-forward.ts: 回复/转发邮件 API 路由

法则: 成员完整·一行一文件·技术词前置·父级链接

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
