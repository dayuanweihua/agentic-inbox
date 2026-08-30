// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * [INPUT]: Mailbox query/update hooks, Gmail synchronization API and Kumo form/toast components
 * [OUTPUT]: Mailbox settings page with account, Gmail Sent sync and AI prompt controls
 * [POS]: app/routes 的 mailbox settings route，承载外部 Gmail 集成入口
 * [PROTOCOL]: 变更时更新此头部，然后检查 CLAUDE.md
 */

import { Badge, Button, Input, Loader, useKumoToastManager } from "@cloudflare/kumo";
import {
	RobotIcon,
	ArrowCounterClockwiseIcon,
	ArrowsClockwiseIcon,
	EnvelopeSimpleIcon,
	LinkBreakIcon,
} from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useMailbox, useUpdateMailbox } from "~/queries/mailboxes";
import api, { type GmailSyncStatus } from "~/services/api";

// Placeholder shown in the textarea when no custom prompt is set.
// The authoritative default prompt lives in workers/agent/index.ts (DEFAULT_SYSTEM_PROMPT).
const PROMPT_PLACEHOLDER = `You are an email assistant that helps manage this inbox. You read emails, draft replies, and help organize conversations.\n\nWrite like a real person. Short, direct, flowing prose. Plain text only.\n\n(Leave empty to use the full built-in default prompt)`;

export default function SettingsRoute() {
	const { mailboxId } = useParams<{ mailboxId: string }>();
	const toastManager = useKumoToastManager();
	const { data: mailbox } = useMailbox(mailboxId);
	const updateMailboxMutation = useUpdateMailbox();

	const [displayName, setDisplayName] = useState("");
	const [agentPrompt, setAgentPrompt] = useState("");
	const [isSaving, setIsSaving] = useState(false);
	const [gmailStatus, setGmailStatus] = useState<GmailSyncStatus | null>(null);
	const [isGmailLoading, setIsGmailLoading] = useState(true);
	const [isSyncing, setIsSyncing] = useState(false);
	const [isDisconnecting, setIsDisconnecting] = useState(false);

	useEffect(() => {
		if (mailbox) {
			setDisplayName(mailbox.settings?.fromName || mailbox.name || "");
			setAgentPrompt(mailbox.settings?.agentSystemPrompt || "");
		}
	}, [mailbox]);

	const loadGmailStatus = async () => {
		try {
			setGmailStatus(await api.getGmailSyncStatus());
		} catch {
			toastManager.add({ title: "Failed to load Gmail sync status", variant: "error" });
		} finally {
			setIsGmailLoading(false);
		}
	};

	useEffect(() => {
		void loadGmailStatus();
	}, []);

	const handleConnectGmail = () => {
		if (!mailboxId) return;
		window.location.assign(`/api/v1/integrations/gmail/connect?mailboxId=${encodeURIComponent(mailboxId)}`);
	};

	const handleSyncGmail = async () => {
		setIsSyncing(true);
		try {
			const result = await api.syncGmailSent();
			toastManager.add({ title: `Gmail sync complete: ${result.imported} imported` });
			await loadGmailStatus();
		} catch {
			toastManager.add({ title: "Gmail sync failed", variant: "error" });
		} finally {
			setIsSyncing(false);
		}
	};

	const handleDisconnectGmail = async () => {
		setIsDisconnecting(true);
		try {
			await api.disconnectGmail();
			await loadGmailStatus();
			toastManager.add({ title: "Gmail disconnected" });
		} catch {
			toastManager.add({ title: "Failed to disconnect Gmail", variant: "error" });
		} finally {
			setIsDisconnecting(false);
		}
	};

	const handleSave = async () => {
		if (!mailbox || !mailboxId) return;
		setIsSaving(true);
		const settings = {
			...mailbox.settings,
			fromName: displayName,
			agentSystemPrompt: agentPrompt.trim() || undefined,
		};
		try {
			await updateMailboxMutation.mutateAsync({ mailboxId, settings });
			toastManager.add({ title: "Settings saved!" });
		} catch {
			toastManager.add({
				title: "Failed to save settings",
				variant: "error",
			});
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetPrompt = () => {
		setAgentPrompt("");
	};

	if (!mailbox) {
		return (
			<div className="flex justify-center py-20">
				<Loader size="lg" />
			</div>
		);
	}

	const isCustomPrompt = agentPrompt.trim().length > 0;
	const isGmailMailbox = !!mailboxId && !!gmailStatus?.mailboxIds.includes(mailboxId);

	return (
		<div className="max-w-2xl px-4 py-4 md:px-8 md:py-6 h-full overflow-y-auto">
			<h1 className="text-lg font-semibold text-kumo-default mb-6">Settings</h1>

			<div className="space-y-6">
				{/* Account */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="text-sm font-medium text-kumo-default mb-4">
						Account
					</div>
					<div className="space-y-3">
						<Input
							label="Display Name"
							value={displayName}
							onChange={(e) => setDisplayName(e.target.value)}
						/>
						<Input label="Email" type="email" value={mailbox.email} disabled />
					</div>
				</div>

				{/* Gmail Sent sync */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<EnvelopeSimpleIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">Gmail Sent Sync</span>
							{gmailStatus?.connected ? (
								<Badge variant="primary">Connected</Badge>
							) : (
								<Badge variant="secondary">Not connected</Badge>
							)}
						</div>
					</div>
					<p className="text-xs text-kumo-subtle mb-4">
						Imports replies sent from Gmail as {mailbox.email} into this mailbox's Sent folder every five minutes.
						One Gmail connection is shared by all configured support mailboxes.
					</p>
					{isGmailLoading ? (
						<Loader size="sm" />
					) : gmailStatus?.connected && isGmailMailbox ? (
						<div className="space-y-3">
							<div className="text-xs text-kumo-subtle">
								Connected account: <span className="text-kumo-default">{gmailStatus.email}</span>
								{gmailStatus.lastSyncedAt && (
									<span className="block mt-1">Last sync: {new Date(gmailStatus.lastSyncedAt).toLocaleString()}</span>
								)}
							</div>
							<div className="flex gap-2">
								<Button
									variant="secondary"
									size="sm"
									icon={<ArrowsClockwiseIcon size={14} />}
									onClick={handleSyncGmail}
									loading={isSyncing}
								>
									Sync now
								</Button>
								<Button
									variant="ghost"
									size="sm"
									icon={<LinkBreakIcon size={14} />}
									onClick={handleDisconnectGmail}
									loading={isDisconnecting}
								>
									Disconnect Gmail for all mailboxes
								</Button>
							</div>
						</div>
					) : (
						<div>
							<Button
								variant="primary"
								size="sm"
								onClick={handleConnectGmail}
								disabled={!gmailStatus?.configured || !isGmailMailbox}
							>
								Connect {gmailStatus?.email || "Gmail"}
							</Button>
							{!gmailStatus?.configured && (
								<p className="text-xs text-kumo-danger mt-2">Google OAuth is not fully configured on this Worker.</p>
							)}
						</div>
					)}
				</div>

				{/* Agent System Prompt */}
				<div className="rounded-lg border border-kumo-line bg-kumo-base p-5">
					<div className="flex items-center justify-between mb-4">
						<div className="flex items-center gap-2">
							<RobotIcon size={16} weight="duotone" className="text-kumo-subtle" />
							<span className="text-sm font-medium text-kumo-default">
								AI Agent Prompt
							</span>
							{isCustomPrompt ? (
								<Badge variant="primary">Custom</Badge>
							) : (
								<Badge variant="secondary">Default</Badge>
							)}
						</div>
						{isCustomPrompt && (
							<Button
								variant="ghost"
								size="xs"
								icon={<ArrowCounterClockwiseIcon size={14} />}
								onClick={handleResetPrompt}
							>
								Reset to default
							</Button>
						)}
					</div>
					<p className="text-xs text-kumo-subtle mb-3">
						Customize how the AI agent behaves for this mailbox.
						Leave empty to use the built-in default prompt.
					</p>
					<textarea
						value={agentPrompt}
						onChange={(e) => setAgentPrompt(e.target.value)}
						placeholder={PROMPT_PLACEHOLDER}
						rows={12}
						className="w-full resize-y rounded-lg border border-kumo-line bg-kumo-recessed px-3 py-2 text-xs text-kumo-default placeholder:text-kumo-subtle focus:outline-none focus:ring-1 focus:ring-kumo-ring font-mono leading-relaxed"
					/>
					<p className="text-xs text-kumo-subtle mt-2">
						The prompt is sent as the system message to the AI model.
						It controls the agent's personality, writing style, and behavior rules.
					</p>
				</div>

				{/* Save */}
				<div className="flex justify-end">
					<Button variant="primary" onClick={handleSave} loading={isSaving}>
						Save Changes
					</Button>
				</div>
			</div>
		</div>
	);
}
