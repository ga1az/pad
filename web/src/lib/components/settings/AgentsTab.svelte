<script lang="ts">
	import { Input } from '$lib/components/ui/input';
	import { onMount } from 'svelte';
	import { BotIcon, Copy01Icon, Delete02Icon, Link01Icon } from '@hugeicons/core-free-icons';
	import Icon from '$lib/icons/Icon.svelte';
	import { api } from '$lib/api/client';
	import { authStore } from '$lib/stores/auth.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { confirmDialog } from '$lib/stores/confirmDialog.svelte';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import { AGENT_LINK_STATUS_LABEL, agentLastActivity, agentLinkStatus, type AgentLinkStatus } from '$lib/agent/joinedAgents';
	import type { AgentJoinLink, AgentJoinLinkWithCode, WorkspaceAgent } from '$lib/types';

	/**
	 * Settings → Agents (SPEC-15, TASK-20): mint, copy and revoke the links
	 * an agent joins through, and see and revoke the agents that joined.
	 * Owner-only; the parent renders it only for an owner and keys it on
	 * (workspace, identity), and the server refuses anyone else regardless.
	 */
	interface Props {
		wsSlug: string;
	}
	let { wsSlug }: Props = $props();

	const LABEL_MAX = 80;

	let links = $state<AgentJoinLink[] | null>(null);
	let agents = $state<WorkspaceAgent[]>([]);
	let loadError = $state('');
	let label = $state('');
	let creating = $state(false);
	// The link just minted: its URL exists only in the create response.
	let minted = $state<AgentJoinLinkWithCode | null>(null);

	// A load that answers for another identity or an older load is dropped.
	let loadGen = 0;

	async function load() {
		const gen = ++loadGen;
		const asked = authStore.identityEpoch;
		loadError = '';
		try {
			const [l, a] = await Promise.all([api.agentLinks.list(wsSlug), api.agents.list(wsSlug, { all: true })]);
			if (gen !== loadGen || authStore.identityEpoch !== asked) return;
			links = l.links ?? [];
			agents = a.agents ?? [];
		} catch (e) {
			if (gen !== loadGen || authStore.identityEpoch !== asked) return;
			loadError = e instanceof Error ? e.message : 'Could not load agents';
		}
	}

	onMount(load);

	async function createLink(e: SubmitEvent) {
		e.preventDefault();
		if (creating) return;
		const asked = authStore.identityEpoch;
		creating = true;
		try {
			const created = await api.agentLinks.create(wsSlug, label.trim() || undefined);
			if (authStore.identityEpoch !== asked) return;
			minted = created;
			label = '';
			await load();
		} catch (err) {
			if (authStore.identityEpoch !== asked) return;
			toastStore.show(err instanceof Error ? err.message : 'Failed to create link', 'error');
		} finally {
			creating = false;
		}
	}

	async function copyMinted() {
		if (!minted) return;
		const asked = authStore.identityEpoch;
		// The invitation with the link (TASK-23), as an agent's session needs it.
		const ok = await copyToClipboard(minted.invite_message || minted.url);
		if (authStore.identityEpoch !== asked) return;
		const what = minted.invite_message ? 'Invitation' : 'Link';
		toastStore.show(ok ? `${what} copied` : 'Failed to copy link', ok ? 'success' : 'error');
	}

	function linkName(link: AgentJoinLink): string {
		return link.label || 'Untitled link';
	}

	async function revokeLink(link: AgentJoinLink) {
		const asked = authStore.identityEpoch;
		const n = link.agent_count;
		const ok = await confirmDialog.request({
			title: 'Revoke join link?',
			message:
				`No new agent can join through "${linkName(link)}". ` +
				(n === 0
					? 'No agent has joined through it yet.'
					: `The ${n === 1 ? 'agent' : `${n} agents`} that joined through it ${n === 1 ? 'is' : 'are'} revoked too and lose access immediately.`),
			confirmLabel: 'Revoke',
			danger: true,
		});
		if (!ok || authStore.identityEpoch !== asked) return;
		try {
			await api.agentLinks.revoke(wsSlug, link.id);
			if (authStore.identityEpoch !== asked) return;
			if (minted?.id === link.id) minted = null;
			toastStore.show('Link revoked', 'success');
			await load();
		} catch (err) {
			if (authStore.identityEpoch !== asked) return;
			toastStore.show(err instanceof Error ? err.message : 'Failed to revoke link', 'error');
		}
	}

	async function revokeAgent(agent: WorkspaceAgent) {
		const asked = authStore.identityEpoch;
		const ok = await confirmDialog.request({
			title: 'Revoke agent?',
			message: `${agent.display_name} loses access to this workspace immediately. Items it created or is assigned keep its name.`,
			confirmLabel: 'Revoke',
			danger: true,
		});
		if (!ok || authStore.identityEpoch !== asked) return;
		try {
			await api.agents.revoke(wsSlug, agent.id);
			if (authStore.identityEpoch !== asked) return;
			toastStore.show(`Revoked ${agent.display_name}`, 'success');
			await load();
		} catch (err) {
			if (authStore.identityEpoch !== asked) return;
			toastStore.show(err instanceof Error ? err.message : 'Failed to revoke agent', 'error');
		}
	}

	const STATUS_COLOR: Record<AgentLinkStatus, string> = {
		active: 'var(--accent-green)',
		full: 'var(--accent-amber)',
		expired: 'var(--accent-gray)',
		revoked: 'var(--accent-gray)',
	};

	let linkLabels = $derived(new Map((links ?? []).map((l) => [l.id, linkName(l)])));
	let liveAgents = $derived(agents.filter((a) => !a.revoked_at));
	let revokedAgents = $derived(agents.filter((a) => a.revoked_at));

	function formatDate(iso: string): string {
		return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}
</script>

<div class="agents-tab">
	{#if loadError}
		<p class="error" role="alert">{loadError}</p>
		<Button variant="ghost" size="sm" onclick={load}>Try again</Button>
	{:else if !links}
		<p class="hint">Loading…</p>
	{:else}
		<p class="hint">
			An agent joins this workspace through a link you hand it, with nothing but HTTP. It becomes an editor member, so
			tasks can be assigned to it. Links expire after 7 days.
		</p>

		<h3>Join links</h3>
		<form class="create" onsubmit={createLink}>
			<Input type="text" aria-label="Link label" placeholder="Label (optional)" maxlength={LABEL_MAX} bind:value={label} disabled={creating} />
			<Button variant="default" size="sm" type="submit" disabled={creating}>
				<Icon icon={Link01Icon} />
				{creating ? 'Creating…' : 'Create link'}
			</Button>
		</form>

		{#if minted}
			<div class="minted" data-testid="agent-link-minted">
				<strong>{linkName(minted)}</strong>
				<p class="warn">Copy this link now. It cannot be shown again.</p>
				<div class="url-row">
					<Input type="text" readonly aria-label="Join link URL" value={minted.url} onfocus={(e) => e.currentTarget.select()} />
					<Button variant="ghost" size="sm" onclick={copyMinted}><Icon icon={Copy01Icon} /> Copy</Button>
					<Button size="sm" variant="default" onclick={() => (minted = null)}>Done</Button>
				</div>
			</div>
		{/if}

		{#if links.length === 0}
			<p class="empty">No join links yet.</p>
		{:else}
			<ul class="list">
				{#each links as link (link.id)}
					{@const status = agentLinkStatus(link)}
					<li class="row" data-testid="agent-link-row">
						<span class="name">{linkName(link)}</span>
						<Badge size="sm" color={STATUS_COLOR[status]}>{AGENT_LINK_STATUS_LABEL[status]}</Badge>
						<span class="meta">{link.agent_count} of {link.max_agents} agents</span>
						<span class="meta">
							{status === 'expired' ? 'Expired' : 'Expires'}
							{formatDate(link.expires_at)}
						</span>
						{#if status !== 'revoked'}
							<Button size="sm" variant="destructive" class="end" onclick={() => revokeLink(link)} aria-label="Revoke {linkName(link)}">
								<Icon icon={Delete02Icon} /> Revoke
							</Button>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}

		<h3>Agents</h3>
		{#if liveAgents.length === 0}
			<p class="empty">No agent has joined yet.</p>
		{:else}
			<ul class="list">
				{#each liveAgents as agent (agent.id)}
					<li class="row" data-testid="agent-row">
						<Icon icon={BotIcon} />
						<span class="name">{agent.display_name}</span>
						<span class="meta">{agentLastActivity(agent)}</span>
						{#if agent.link_id && linkLabels.get(agent.link_id)}
							<span class="meta">via {linkLabels.get(agent.link_id)}</span>
						{/if}
						<Button size="sm" variant="destructive" class="end" onclick={() => revokeAgent(agent)} aria-label="Revoke {agent.display_name}">
							<Icon icon={Delete02Icon} /> Revoke
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
		{#if revokedAgents.length > 0}
			<details class="revoked">
				<summary>Revoked ({revokedAgents.length})</summary>
				<ul class="list">
					{#each revokedAgents as agent (agent.id)}
						<li class="row muted">
							<Icon icon={BotIcon} />
							<span class="name">{agent.display_name}</span>
							<span class="meta">{agentLastActivity(agent)}</span>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}
</div>

<style>
	.agents-tab {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: flex-start;
	}
	h3 {
		margin: var(--space-2) 0 0;
		font-size: 0.95em;
	}
	.hint,
	.empty {
		margin: 0;
		font-size: 0.9em;
		color: var(--text-secondary);
	}
	.error {
		margin: 0;
		color: var(--accent-red);
	}
	.create,
	.url-row {
		display: flex;
		gap: var(--space-2);
		align-items: center;
		width: 100%;
	}
	.minted {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		padding: var(--space-3);
		border: 1px solid var(--accent-green);
		border-radius: var(--radius);
		background: var(--bg-secondary);
	}
	.warn {
		margin: 0;
		font-size: 0.85em;
		color: var(--accent-orange);
	}
	.list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: 100%;
	}
	.row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		background: var(--bg-secondary);
	}
	.row.muted {
		color: var(--text-secondary);
	}
	.row :global(.end) {
		margin-left: auto;
	}
	.name {
		font-weight: 600;
	}
	.meta {
		font-size: 0.85em;
		color: var(--text-secondary);
	}
	.revoked {
		width: 100%;
		font-size: 0.9em;
	}
</style>
