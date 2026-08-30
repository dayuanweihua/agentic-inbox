// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * [INPUT]: Cloudflare-generated bindings plus project deployment variables
 * [OUTPUT]: Env type consumed by Worker API, email handlers, Gmail sync, Durable Objects and Agents
 * [POS]: workers 模块共享环境契约，集中声明 Access 与 OAuth secret 配置
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

export interface Env extends Cloudflare.Env {
	POLICY_AUD: string;
	TEAM_DOMAIN: string;
	GOOGLE_CLIENT_SECRET: string;
}
