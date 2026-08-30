# app/
> L2 | 父级: /CLAUDE.md

成员清单
components/AgentPanel.tsx: AI Agent 主面板
components/AgentSidebar.tsx: AI Agent 侧边栏容器
components/ComposeEmail.tsx: 邮件撰写表单
components/ComposePanel.tsx: 撰写面板布局与状态
components/EmailAttachmentList.tsx: 邮件附件列表与下载
components/EmailIframe.tsx: 隔离渲染 HTML 邮件正文
components/EmailPanel.tsx: 邮件详情与线程主面板
components/Header.tsx: 应用顶部导航
components/MCPPanel.tsx: MCP 连接说明面板
components/MailboxSplitView.tsx: 邮件列表与详情分栏布局
components/RichTextEditor.tsx: 富文本邮件编辑器
components/Sidebar.tsx: Mailbox、文件夹与设置导航
components/email-panel/EmailPanelDialogs.tsx: 邮件详情对话框集合
components/email-panel/EmailPanelHeader.tsx: 邮件详情头部
components/email-panel/EmailPanelToolbar.tsx: 邮件操作工具栏
components/email-panel/SingleMessageView.tsx: 单封邮件详情视图
components/email-panel/ThreadMessage.tsx: 线程内单条邮件视图
entry.server.tsx: React Router SSR 服务端入口
hooks/useComposeForm.ts: 撰写表单状态与校验
hooks/useUIStore.ts: 全局界面状态存储
index.css: Tailwind 与应用全局样式
lib/search-parser.ts: 邮件搜索语法解析
lib/utils.ts: 前端通用辅助函数
queries/emails.ts: 邮件 TanStack Query 与 mutation
queries/folders.ts: 文件夹 TanStack Query 与 mutation
queries/keys.ts: Query key 工厂
queries/mailboxes.ts: Mailbox TanStack Query 与 mutation
queries/search.ts: 搜索 TanStack Query
root.tsx: React Router 根布局与 Provider
routes.ts: 前端路由定义
routes/email-list.tsx: 文件夹邮件列表路由
routes/home.tsx: 首页路由
routes/mailbox-index.tsx: Mailbox 默认跳转路由
routes/mailbox.tsx: Mailbox 布局路由
routes/not-found.tsx: 404 路由
routes/search-results.tsx: 搜索结果路由
routes/settings.tsx: Mailbox 设置、Gmail Sent 同步与 AI Prompt 页面
services/api.ts: Worker HTTP API 类型化客户端
types/index.ts: 前端 Mailbox、Email、Folder 等共享类型

法则: 成员完整·一行一文件·技术词前置·父级链接

[PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
