import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import type { AgentJoinLink, AgentJoinLinkWithCode, WorkspaceAgent } from '$lib/types';

// SPEC-15 / TASK-20: Settings → Agents. Minting a link shows its URL once
// with a copy button; revoking a link or an agent goes through the
// confirmation dialog, and the link's text says its agents go with it.

const listLinksMock = vi.fn<(ws: string) => Promise<{ links: AgentJoinLink[] | null }>>();
const createLinkMock = vi.fn<(ws: string, label?: string) => Promise<AgentJoinLinkWithCode>>();
const revokeLinkMock = vi.fn<(ws: string, id: string) => Promise<void>>();
const listAgentsMock = vi.fn<(ws: string, opts?: { all?: boolean }) => Promise<{ agents: WorkspaceAgent[] | null }>>();
const revokeAgentMock = vi.fn<(ws: string, id: string) => Promise<void>>();
const confirmMock = vi.fn<(req: { title: string; message: string }) => Promise<boolean>>();
const toastMock = vi.fn();
const copyMock = vi.fn<(text: string) => Promise<boolean>>();

vi.mock('$lib/api/client', () => ({
	api: {
		agentLinks: {
			list: (ws: string) => listLinksMock(ws),
			create: (ws: string, label?: string) => createLinkMock(ws, label),
			revoke: (ws: string, id: string) => revokeLinkMock(ws, id),
		},
		agents: {
			list: (ws: string, opts?: { all?: boolean }) => listAgentsMock(ws, opts),
			revoke: (ws: string, id: string) => revokeAgentMock(ws, id),
		},
	},
}));
vi.mock('$lib/stores/auth.svelte', () => ({ authStore: { identityEpoch: 1 } }));
vi.mock('$lib/stores/confirmDialog.svelte', () => ({
	confirmDialog: { request: (req: { title: string; message: string }) => confirmMock(req) },
}));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { show: (...a: unknown[]) => toastMock(...a) } }));
vi.mock('$lib/utils/clipboard', () => ({ copyToClipboard: (t: string) => copyMock(t) }));

const { default: AgentsTab } = await import('./AgentsTab.svelte');

const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
const past = new Date(Date.now() - 86_400_000).toISOString();

function link(over: Partial<AgentJoinLink> = {}): AgentJoinLink {
	return {
		id: 'l1',
		workspace_id: 'w1',
		label: 'CI bots',
		max_agents: 20,
		agent_count: 2,
		expires_at: future,
		created_at: '2026-10-27T11:00:00Z',
		...over,
	};
}

const builder: WorkspaceAgent = {
	id: 'a1',
	workspace_id: 'w1',
	user_id: 'u-bot-1',
	link_id: 'l1',
	display_name: 'Builder',
	created_at: '2026-10-27T11:00:00Z',
	last_seen_at: new Date(Date.now() - 3 * 60_000).toISOString(),
};

beforeEach(() => {
	vi.clearAllMocks();
	listLinksMock.mockResolvedValue({ links: [link()] });
	listAgentsMock.mockResolvedValue({ agents: [builder] });
	revokeLinkMock.mockResolvedValue(undefined);
	revokeAgentMock.mockResolvedValue(undefined);
	copyMock.mockResolvedValue(true);
});

describe('AgentsTab (TASK-20)', () => {
	it('lists links with their status and agents with their last activity, revoked ones included', async () => {
		listLinksMock.mockResolvedValue({ links: [link(), link({ id: 'l2', label: '', expires_at: past })] });
		render(AgentsTab, { wsSlug: 'ws-a' });

		const rows = await screen.findAllByTestId('agent-link-row');
		expect(rows).toHaveLength(2);
		expect(rows[0].textContent).toContain('CI bots');
		expect(rows[0].textContent).toContain('Active');
		expect(rows[0].textContent).toContain('2 of 20 agents');
		expect(rows[1].textContent).toContain('Untitled link');
		expect(rows[1].textContent).toContain('Expired');

		const agent = screen.getByTestId('agent-row');
		expect(agent.textContent).toContain('Builder');
		expect(agent.textContent).toContain('Last active 3m ago');
		expect(agent.textContent).toContain('via CI bots');
		expect(listAgentsMock).toHaveBeenCalledWith('ws-a', { all: true });
	});

	it('copies the invitation message with the link, not the bare URL (TASK-23)', async () => {
		const invite = 'Join my Pad workspace "WS". Read the API instructions at the link below and use them to join, then work on the tasks assigned to you and report back on each task.\n\nhttps://pad.example/api/agent/v1/join?code=padjoin_y';
		createLinkMock.mockResolvedValue({ ...link({ id: 'l8', agent_count: 0 }), code: 'padjoin_y', url: 'https://pad.example/api/agent/v1/join?code=padjoin_y', invite_message: invite });
		render(AgentsTab, { wsSlug: 'ws-a' });
		await screen.findAllByTestId('agent-link-row');
		await fireEvent.click(screen.getByRole('button', { name: /Create link/ }));
		await screen.findByTestId('agent-link-minted');
		await fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
		await waitFor(() => expect(copyMock).toHaveBeenCalledWith(invite));
		expect(toastMock).toHaveBeenCalledWith('Invitation copied', 'success');
	});

	it('shows a minted link once, with a copy button, and forgets it on Done', async () => {
		createLinkMock.mockResolvedValue({ ...link({ id: 'l9', label: 'Night shift', agent_count: 0 }), code: 'padjoin_x', url: 'https://pad.example/api/agent/v1/join?code=padjoin_x' });
		render(AgentsTab, { wsSlug: 'ws-a' });
		await screen.findAllByTestId('agent-link-row');

		await fireEvent.input(screen.getByLabelText('Link label'), { target: { value: '  Night shift ' } });
		await fireEvent.click(screen.getByRole('button', { name: /Create link/ }));

		const panel = await screen.findByTestId('agent-link-minted');
		expect(createLinkMock).toHaveBeenCalledWith('ws-a', 'Night shift');
		expect(panel.textContent).toContain('cannot be shown again');
		expect((screen.getByLabelText('Join link URL') as HTMLInputElement).value).toBe('https://pad.example/api/agent/v1/join?code=padjoin_x');

		await fireEvent.click(screen.getByRole('button', { name: /Copy/ }));
		await waitFor(() => expect(copyMock).toHaveBeenCalledWith('https://pad.example/api/agent/v1/join?code=padjoin_x'));
		expect(toastMock).toHaveBeenCalledWith('Link copied', 'success');

		await fireEvent.click(screen.getByRole('button', { name: 'Done' }));
		expect(screen.queryByTestId('agent-link-minted')).toBeNull();
	});

	it('sends no label when the field is blank', async () => {
		createLinkMock.mockResolvedValue({ ...link(), code: 'c', url: 'u' });
		render(AgentsTab, { wsSlug: 'ws-a' });
		await screen.findAllByTestId('agent-link-row');
		await fireEvent.click(screen.getByRole('button', { name: /Create link/ }));
		await waitFor(() => expect(createLinkMock).toHaveBeenCalledWith('ws-a', undefined));
	});

	it('revoking a link warns that its agents are revoked too, and does nothing on cancel', async () => {
		confirmMock.mockResolvedValue(false);
		render(AgentsTab, { wsSlug: 'ws-a' });
		await fireEvent.click(await screen.findByRole('button', { name: 'Revoke CI bots' }));

		await waitFor(() => expect(confirmMock).toHaveBeenCalled());
		expect(confirmMock.mock.calls[0][0].message).toContain('The 2 agents that joined through it are revoked too');
		expect(revokeLinkMock).not.toHaveBeenCalled();
	});

	it('revokes a link on confirm and reloads', async () => {
		confirmMock.mockResolvedValue(true);
		render(AgentsTab, { wsSlug: 'ws-a' });
		await fireEvent.click(await screen.findByRole('button', { name: 'Revoke CI bots' }));

		await waitFor(() => expect(revokeLinkMock).toHaveBeenCalledWith('ws-a', 'l1'));
		await waitFor(() => expect(listLinksMock).toHaveBeenCalledTimes(2));
	});

	it('revokes an agent on confirm', async () => {
		confirmMock.mockResolvedValue(true);
		render(AgentsTab, { wsSlug: 'ws-a' });
		await fireEvent.click(await screen.findByRole('button', { name: 'Revoke Builder' }));

		await waitFor(() => expect(revokeAgentMock).toHaveBeenCalledWith('ws-a', 'a1'));
		expect(toastMock).toHaveBeenCalledWith('Revoked Builder', 'success');
	});

	it('offers no revoke for an already revoked link, and files revoked agents apart', async () => {
		listLinksMock.mockResolvedValue({ links: [link({ revoked_at: past, agent_count: 0 })] });
		listAgentsMock.mockResolvedValue({ agents: [{ ...builder, revoked_at: past }] });
		render(AgentsTab, { wsSlug: 'ws-a' });

		const row = await screen.findByTestId('agent-link-row');
		expect(row.textContent).toContain('Revoked');
		expect(screen.queryByRole('button', { name: 'Revoke CI bots' })).toBeNull();
		expect(screen.queryByTestId('agent-row')).toBeNull();
		expect(screen.getByText('Revoked (1)')).toBeTruthy();
	});

	it('says so when the load fails', async () => {
		listLinksMock.mockRejectedValue(new Error('owner only'));
		render(AgentsTab, { wsSlug: 'ws-a' });
		expect((await screen.findByRole('alert')).textContent).toContain('owner only');
	});
});
