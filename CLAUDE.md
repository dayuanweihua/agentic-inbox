# Agentic Inbox - 基于 Cloudflare Workers 的自托管 AI 邮件客户端
React 19 + React Router 7 + TypeScript 5.8 + Hono 4 + Cloudflare Workers + Durable Objects SQLite + R2 + Workers AI

<directory>
app/ - React Router 前端与邮件工作台界面
docs/ - 项目实施、部署与运维文档
public/ - 站点静态资源
shared/ - 前后端共享的日期与文件夹定义
workers/ - Worker API、邮件收发、Durable Objects、AI Agent 与 MCP 服务
</directory>

<config>
package.json - Node 依赖、构建、类型检查与部署命令
wrangler.jsonc - Cloudflare Worker、邮件、R2、AI 与 Durable Objects 绑定配置
vite.config.ts - Vite、React Router 与 Cloudflare 开发构建配置
tsconfig.json - TypeScript 项目引用入口
react-router.config.ts - React Router 服务端渲染配置
</config>

法则: 极简·稳定·导航·版本精确
