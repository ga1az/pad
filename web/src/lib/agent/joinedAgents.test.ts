import { describe, it, expect } from 'vitest';
import type { AgentJoinLink, WorkspaceAgent } from '$lib/types';
import { agentLinkStatus, agentLastActivity, assigneeGroups, assigneeName } from './joinedAgents';

const NOW = Date.parse('2026-10-27T12:00:00Z');

function link(over: Partial<AgentJoinLink> = {}): AgentJoinLink {
	return {
		id: 'l1',
		workspace_id: 'w1',
		label: 'CI bots',
		max_agents: 20,
		agent_count: 0,
		expires_at: '2026-11-03T12:00:00Z',
		created_at: '2026-10-27T11:00:00Z',
		...over,
	};
}

function agent(over: Partial<WorkspaceAgent> = {}): WorkspaceAgent {
	return {
		id: 'a1',
		workspace_id: 'w1',
		user_id: 'u-bot-1',
		display_name: 'Builder',
		created_at: '2026-10-27T11:00:00Z',
		...over,
	};
}

describe('agentLinkStatus (TASK-20)', () => {
	it('is active before expiry and under the cap', () => {
		expect(agentLinkStatus(link(), NOW)).toBe('active');
	});
	it('is expired once expires_at has passed', () => {
		expect(agentLinkStatus(link({ expires_at: '2026-10-27T11:59:59Z' }), NOW)).toBe('expired');
	});
	it('is full at the cap', () => {
		expect(agentLinkStatus(link({ agent_count: 20 }), NOW)).toBe('full');
	});
	it('revoked wins over expired and full', () => {
		expect(
			agentLinkStatus(link({ revoked_at: '2026-10-27T11:30:00Z', expires_at: '2026-10-01T00:00:00Z', agent_count: 20 }), NOW)
		).toBe('revoked');
	});
});

describe('agentLastActivity', () => {
	it('says never for an agent with no activity', () => {
		expect(agentLastActivity(agent())).toBe('Never active');
	});
	it('says how long ago it was seen', () => {
		const seen = new Date(Date.now() - 5 * 60_000).toISOString();
		expect(agentLastActivity(agent({ last_seen_at: seen }))).toBe('Last active 5m ago');
	});
});

describe('assigneeGroups', () => {
	const members = [
		{ user_id: 'u1', user_name: 'Dave' },
		{ user_id: 'u2', user_name: 'Ana' },
	];

	it('keeps people as they are and lists live agents by their bot user', () => {
		const g = assigneeGroups(members, [agent(), agent({ id: 'a2', user_id: 'u-bot-2', display_name: 'Gone', revoked_at: '2026-10-27T11:00:00Z' })]);
		expect(g.people).toEqual([
			{ user_id: 'u1', name: 'Dave' },
			{ user_id: 'u2', name: 'Ana' },
		]);
		expect(g.agents).toEqual([{ user_id: 'u-bot-1', name: 'Builder' }]);
		expect(g.other).toBeNull();
	});

	it('never offers one user id twice', () => {
		const g = assigneeGroups(members, [agent({ user_id: 'u1' }), agent({ id: 'a3' }), agent({ id: 'a4' })]);
		expect(g.agents).toEqual([{ user_id: 'u-bot-1', name: 'Builder' }]);
	});

	it('keeps an assignee no group holds, named from the item', () => {
		const g = assigneeGroups(members, [], { user_id: 'u-bot-9', user_name: 'Old agent' });
		expect(g.other).toEqual({ user_id: 'u-bot-9', name: 'Old agent' });
		expect(assigneeName(g, 'u-bot-9')).toBe('Old agent');
	});

	it('names an agent assignee', () => {
		const g = assigneeGroups(members, [agent()], { user_id: 'u-bot-1', user_name: 'Builder' });
		expect(g.other).toBeNull();
		expect(assigneeName(g, 'u-bot-1')).toBe('Builder');
		expect(assigneeName(g, null)).toBeNull();
	});
});
