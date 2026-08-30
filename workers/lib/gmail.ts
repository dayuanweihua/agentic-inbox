// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * [INPUT]: Google OAuth/Gmail API, Env OAuth configuration, R2 private state, Mailbox Durable Object
 * [OUTPUT]: Gmail connection lifecycle, multi-Mailbox status and incremental From-routed Sent import
 * [POS]: workers/lib 的 Gmail 同步边界，将一个 Gmail Sent 按业务地址归档到对应 Agentic Mailbox
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import PostalMime from "postal-mime";
import { Folders } from "../../shared/folders";
import type { Env } from "../types";
import type { StoredAttachment } from "./attachments";

const CREDENTIALS_KEY = "private/integrations/gmail/credentials.json";
const STATE_PREFIX = "private/integrations/gmail/oauth-state/";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const SYNC_OVERLAP_MS = 10 * 60 * 1000;
const MAX_RESULTS_PER_PAGE = 100;

interface GmailCredentials {
	refreshToken: string;
	email: string;
	mailboxId?: string;
	mailboxIds?: string[];
	connectedAt: string;
	lastSyncedAt: string;
}

interface OAuthState {
	mailboxId: string;
	createdAt: string;
}

interface TokenResponse {
	access_token?: string;
	refresh_token?: string;
	error?: string;
	error_description?: string;
}

interface GmailMessageList {
	messages?: { id: string }[];
	nextPageToken?: string;
}

interface GmailRawMessage {
	id: string;
	internalDate?: string;
	raw?: string;
}

export interface GmailSyncStatus {
	configured: boolean;
	connected: boolean;
	email: string;
	mailboxIds: string[];
	connectedAt: string | null;
	lastSyncedAt: string | null;
}

export interface GmailSyncResult {
	imported: number;
	skipped: number;
	lastSyncedAt: string;
}

export function getGmailMailboxIds(env: Env) {
	return ((env.GMAIL_SYNC_MAILBOX_IDS ?? []) as string[])
		.map((mailboxId) => mailboxId.trim().toLowerCase())
		.filter(Boolean);
}

function requireConfig(env: Env) {
	const clientId = env.GOOGLE_CLIENT_ID?.trim();
	const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
	const email = env.GMAIL_SYNC_EMAIL?.trim().toLowerCase();
	const mailboxIds = getGmailMailboxIds(env);
	if (!clientId || !clientSecret || !email || mailboxIds.length === 0) {
		throw new Error("Gmail sync requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GMAIL_SYNC_EMAIL and GMAIL_SYNC_MAILBOX_IDS");
	}
	return { clientId, clientSecret, email, mailboxIds };
}

async function readCredentials(env: Env): Promise<GmailCredentials | null> {
	const object = await env.BUCKET.get(CREDENTIALS_KEY);
	return object ? object.json<GmailCredentials>() : null;
}

async function writeCredentials(env: Env, credentials: GmailCredentials) {
	await env.BUCKET.put(CREDENTIALS_KEY, JSON.stringify(credentials), {
		httpMetadata: { contentType: "application/json" },
	});
}

function callbackUrl(requestUrl: string) {
	return new URL("/api/v1/integrations/gmail/callback", requestUrl).toString();
}

async function googleJson<T>(url: string, accessToken: string): Promise<T> {
	const response = await fetch(url, {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	if (!response.ok) {
		throw new Error(`Gmail API request failed (${response.status})`);
	}
	return response.json<T>();
}

async function refreshAccessToken(env: Env, refreshToken: string) {
	const { clientId, clientSecret } = requireConfig(env);
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});
	const token = await response.json<TokenResponse>();
	if (!response.ok || !token.access_token) {
		throw new Error(`Google token refresh failed: ${token.error_description || token.error || response.status}`);
	}
	return token.access_token;
}

function decodeBase64Url(value: string) {
	const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
	const binary = atob(padded);
	return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function normalizeMessageId(value?: string | null) {
	if (!value) return null;
	const match = value.match(/<([^>]+)>/);
	return (match ? match[1] : value.trim().split(/\s+/)[0]) || null;
}

function normalizeReferences(value?: string | null) {
	if (!value) return [];
	return Array.from(value.matchAll(/<([^>]+)>/g), (match) => match[1]);
}

function addressList(entries?: { address?: string }[]) {
	return (entries || []).map((entry) => entry.address?.trim().toLowerCase()).filter(Boolean) as string[];
}

async function storeParsedAttachments(
	env: Env,
	emailId: string,
	attachments: Awaited<ReturnType<PostalMime["parse"]>>["attachments"],
) {
	const result: StoredAttachment[] = [];
	for (const attachment of attachments || []) {
		const attachmentId = crypto.randomUUID();
		const filename = (attachment.filename || "untitled").replace(/[\/\\:*?"<>|\x00-\x1f]/g, "_");
		await env.BUCKET.put(`attachments/${emailId}/${attachmentId}/${filename}`, attachment.content);
		result.push({
			id: attachmentId,
			email_id: emailId,
			filename,
			mimetype: attachment.mimeType,
			size: typeof attachment.content === "string"
				? new TextEncoder().encode(attachment.content).byteLength
				: attachment.content.byteLength,
			content_id: attachment.contentId || null,
			disposition: attachment.disposition || "attachment",
		});
	}
	return result;
}

export async function getGmailStatus(env: Env): Promise<GmailSyncStatus> {
	const mailboxIds = getGmailMailboxIds(env);
	const configured = !!(
		env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim() &&
		env.GMAIL_SYNC_EMAIL?.trim() && mailboxIds.length > 0
	);
	const credentials = configured ? await readCredentials(env) : null;
	return {
		configured,
		connected: !!credentials,
		email: credentials?.email || env.GMAIL_SYNC_EMAIL?.trim().toLowerCase() || "",
		mailboxIds,
		connectedAt: credentials?.connectedAt || null,
		lastSyncedAt: credentials?.lastSyncedAt || null,
	};
}

export async function createGmailAuthorizationUrl(env: Env, requestUrl: string, mailboxId: string) {
	const config = requireConfig(env);
	const normalizedMailboxId = mailboxId.trim().toLowerCase();
	if (!config.mailboxIds.includes(normalizedMailboxId)) {
		throw new Error("This Gmail integration is configured for a different mailbox");
	}
	const state = crypto.randomUUID();
	await env.BUCKET.put(`${STATE_PREFIX}${state}.json`, JSON.stringify({
		mailboxId: normalizedMailboxId,
		createdAt: new Date().toISOString(),
	} satisfies OAuthState));

	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.search = new URLSearchParams({
		client_id: config.clientId,
		redirect_uri: callbackUrl(requestUrl),
		response_type: "code",
		scope: GMAIL_SCOPE,
		access_type: "offline",
		prompt: "consent",
		include_granted_scopes: "true",
		login_hint: config.email,
		state,
	}).toString();
	return url.toString();
}

export async function completeGmailAuthorization(env: Env, requestUrl: string, code: string, state: string) {
	const config = requireConfig(env);
	const stateKey = `${STATE_PREFIX}${state}.json`;
	const stateObject = await env.BUCKET.get(stateKey);
	if (!stateObject) throw new Error("Invalid or expired Google OAuth state");
	await env.BUCKET.delete(stateKey);
	const savedState = await stateObject.json<OAuthState>();
	if (Date.now() - Date.parse(savedState.createdAt) > 10 * 60 * 1000 || !config.mailboxIds.includes(savedState.mailboxId)) {
		throw new Error("Invalid or expired Google OAuth state");
	}

	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: config.clientId,
			client_secret: config.clientSecret,
			code,
			grant_type: "authorization_code",
			redirect_uri: callbackUrl(requestUrl),
		}),
	});
	const token = await response.json<TokenResponse>();
	if (!response.ok || !token.access_token || !token.refresh_token) {
		throw new Error(`Google authorization failed: ${token.error_description || token.error || response.status}`);
	}
	const profile = await googleJson<{ emailAddress: string }>("https://gmail.googleapis.com/gmail/v1/users/me/profile", token.access_token);
	if (profile.emailAddress.toLowerCase() !== config.email) {
		throw new Error(`Authorized Gmail account must be ${config.email}`);
	}
	const now = new Date().toISOString();
	await writeCredentials(env, {
		refreshToken: token.refresh_token,
		email: config.email,
		mailboxIds: config.mailboxIds,
		connectedAt: now,
		lastSyncedAt: now,
	});
	return savedState.mailboxId;
}

export async function disconnectGmail(env: Env) {
	const credentials = await readCredentials(env);
	if (credentials) {
		const accessToken = await refreshAccessToken(env, credentials.refreshToken).catch(() => null);
		if (accessToken) {
			await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(accessToken)}`, {
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
			}).catch(() => undefined);
		}
	}
	await env.BUCKET.delete(CREDENTIALS_KEY);
}

export async function syncGmailSent(env: Env): Promise<GmailSyncResult> {
	const config = requireConfig(env);
	const credentials = await readCredentials(env);
	if (!credentials) throw new Error("Gmail is not connected");
	const accessToken = await refreshAccessToken(env, credentials.refreshToken);
	const connectedAt = Date.parse(credentials.connectedAt);
	const lastSyncedAt = Date.parse(credentials.lastSyncedAt);
	const lowerBound = Math.max(connectedAt, lastSyncedAt - SYNC_OVERLAP_MS);
	const messageIds = new Set<string>();
	for (const mailboxId of config.mailboxIds) {
		let pageToken: string | undefined;
		do {
			const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
			url.searchParams.set("labelIds", "SENT");
			url.searchParams.set("q", `after:${Math.floor(lowerBound / 1000)} from:${mailboxId}`);
			url.searchParams.set("maxResults", String(MAX_RESULTS_PER_PAGE));
			if (pageToken) url.searchParams.set("pageToken", pageToken);
			const page = await googleJson<GmailMessageList>(url.toString(), accessToken);
			for (const message of page.messages || []) messageIds.add(message.id);
			pageToken = page.nextPageToken;
		} while (pageToken);
	}

	let imported = 0;
	let skipped = 0;

	for (const gmailId of messageIds) {
		const message = await googleJson<GmailRawMessage>(
			`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailId)}?format=raw`,
			accessToken,
		);
		if (!message.raw || Number(message.internalDate || 0) < connectedAt) {
			skipped++;
			continue;
		}
		const parsed = await new PostalMime().parse(decodeBase64Url(message.raw));
		const from = parsed.from?.address?.trim().toLowerCase() || "";
		if (!config.mailboxIds.includes(from)) {
			skipped++;
			continue;
		}
		if (!(await env.BUCKET.head(`mailboxes/${from}.json`))) {
			skipped++;
			continue;
		}
		const stub = env.MAILBOX.get(env.MAILBOX.idFromName(from));
		const messageId = normalizeMessageId(parsed.messageId) || `gmail:${gmailId}`;
		if (await (stub as any).hasEmailByMessageId(messageId)) {
			skipped++;
			continue;
		}

		const inReplyTo = normalizeMessageId(parsed.inReplyTo);
		const references = normalizeReferences(parsed.references);
		const relatedIds = [inReplyTo, ...references.slice().reverse()].filter(Boolean) as string[];
		const existingThread = relatedIds.length > 0
			? await (stub as any).findThreadByMessageIds(relatedIds)
			: null;
		const emailId = crypto.randomUUID();
		const attachments = await storeParsedAttachments(env, emailId, parsed.attachments);
		const created = await (stub as any).createEmailIfMessageIdMissing(Folders.SENT, {
			id: emailId,
			subject: parsed.subject || "",
			sender: from,
			recipient: addressList(parsed.to).join(", "),
			cc: addressList(parsed.cc).join(", ") || null,
			bcc: addressList(parsed.bcc).join(", ") || null,
			date: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString(),
			body: parsed.html || parsed.text || "",
			in_reply_to: inReplyTo,
			email_references: references.length > 0 ? JSON.stringify(references) : null,
			thread_id: existingThread || relatedIds[relatedIds.length - 1] || messageId,
			message_id: messageId,
			raw_headers: JSON.stringify(parsed.headers),
		}, attachments);
		if (!created) {
			if (attachments.length > 0) {
				await env.BUCKET.delete(attachments.map((attachment) =>
					`attachments/${emailId}/${attachment.id}/${attachment.filename}`,
				));
			}
			skipped++;
		} else {
			imported++;
		}
	}

	const now = new Date().toISOString();
	await writeCredentials(env, { ...credentials, lastSyncedAt: now });
	return { imported, skipped, lastSyncedAt: now };
}
