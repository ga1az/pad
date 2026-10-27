// Agents that join a workspace through a link (SPEC-15, TASK-20): the pure
// logic behind Settings → Agents and the item assignee picker.
import type { AgentJoinLink, WorkspaceAgent } from '$lib/types';
import { relativeTime } from '$lib/utils/markdown';
import { uniqueBy } from '$lib/utils/unique';

export type AgentLinkStatus = 'active' | 'full' | 'expired' | 'revoked';

/**
 * Where a join link stands. Revoked wins over expired, and expired over
 * full: a link that can no longer be used for any reason says the reason
 * that cannot be undone.
 */
export function agentLinkStatus(link: AgentJoinLink, now: number = Date.now()): AgentLinkStatus {
	if (link.revoked_at) return 'revoked';
	if (new Date(link.expires_at).getTime() <= now) return 'expired';
	if (link.max_agents > 0 && link.agent_count >= link.max_agents) return 'full';
	return 'active';
}

export const AGENT_LINK_STATUS_LABEL: Record<AgentLinkStatus, string> = {
	active: 'Active',
	full: 'Full',
	expired: 'Expired',
	revoked: 'Revoked',
};

/** "Last active 5m ago", or "Never active" for an agent that registered and went quiet. */
export function agentLastActivity(agent: WorkspaceAgent): string {
	return agent.last_seen_at ? `Last active ${relativeTime(agent.last_seen_at)}` : 'Never active';
}

export interface AssigneeOption {
	user_id: string;
	name: string;
}

export interface AssigneeGroups {
	people: AssigneeOption[];
	agents: AssigneeOption[];
	/**
	 * The current assignee when neither group holds it (a revoked agent, a
	 * removed member), so the select still shows who the item is assigned to
	 * instead of silently reading as the first option.
	 */
	other: AssigneeOption | null;
}

/**
 * The assignee picker's options. People are the workspace's human members,
 * unchanged; agents are the live (not revoked) joined agents, whose bot
 * user is what an item is assigned to. An agent whose bot also appears in
 * `members` stays a person, so no user id is offered twice.
 */
export function assigneeGroups(
	members: readonly { user_id: string; user_name: string }[],
	agents: readonly WorkspaceAgent[],
	assigned?: { user_id?: string | null; user_name?: string | null }
): AssigneeGroups {
	const people = members.map((m) => ({ user_id: m.user_id, name: m.user_name }));
	const personIds = new Set(people.map((p) => p.user_id));
	const agentOptions = uniqueBy(
		agents.filter((a) => !a.revoked_at && !personIds.has(a.user_id)),
		(a) => a.user_id
	).map((a) => ({ user_id: a.user_id, name: a.display_name }));

	const id = assigned?.user_id;
	let other: AssigneeOption | null = null;
	if (id && !personIds.has(id) && !agentOptions.some((a) => a.user_id === id)) {
		other = { user_id: id, name: assigned?.user_name || 'Unknown user' };
	}
	return { people, agents: agentOptions, other };
}

/** The display name of `userId` among the groups, or null when it is in none. */
export function assigneeName(groups: AssigneeGroups, userId: string | null | undefined): string | null {
	if (!userId) return null;
	const all = [...groups.people, ...groups.agents, ...(groups.other ? [groups.other] : [])];
	return all.find((o) => o.user_id === userId)?.name ?? null;
}
