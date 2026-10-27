import { api } from '$lib/api/client';
import type { WorkspaceAgent } from '$lib/types';

/**
 * The workspace's joined agents for the assignee picker (SPEC-15, TASK-20).
 * Never rejects: a server without the agents endpoint, or any failure,
 * answers no agents, so the picker keeps offering the people it always did.
 */
export async function listAssignableAgents(ws: string): Promise<WorkspaceAgent[]> {
	try {
		const r = await api.agents.list(ws);
		return r.agents ?? [];
	} catch {
		return [];
	}
}
