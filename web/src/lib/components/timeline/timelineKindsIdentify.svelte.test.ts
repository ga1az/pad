// TASK-31 (SPEC-24): the timeline's rail (a coloured dot per kind) is hidden in
// Linear's quiet style. With it gone, every kind's CARD must still say what it
// is, in text: a comment by its author badge and body, an activity by its action, a
// version as "Description", a note as "Note" and a decision as "Decision".
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import type { TimelineEntry } from '$lib/types';

vi.mock('$lib/api/client', () => ({
	api: {
		comments: { create: vi.fn(), update: vi.fn(), delete: vi.fn(), addReaction: vi.fn(), removeReaction: vi.fn() },
		attachments: { downloadUrl: (ws: string, id: string) => `/api/v1/workspaces/${ws}/attachments/${id}` }
	}
}));
vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: { userId: 'u1', user: { id: 'u1', role: 'member' }, identityFence: () => () => true, onIdentityChange: () => () => {} }
}));
vi.mock('$lib/stores/workspace.svelte', () => ({ workspaceStore: { canEditItem: () => false } }));

const TimelineEntryList = (await import('./TimelineEntryList.svelte')).default;

const at = '2026-09-02T10:00:00Z';
const ENTRIES = [
	{ id: 'c1', kind: 'comment', created_at: at, actor: 'user', source: 'web', comment: { id: 'c1', body: 'a plain comment body', created_at: at, created_by: 'user', author_name: 'Dave', user_id: 'u1', source: 'web' } },
	{ id: 'a1', kind: 'activity', created_at: at, actor: 'user', source: 'web', activity: { id: 'a1', action: 'created', created_at: at, metadata: '{}', actor: 'user' } },
	{ id: 'v1', kind: 'version', created_at: at, actor: 'user', source: 'web', version: { id: 'v1', version: 2, created_at: at, lines_added: 1, lines_removed: 0 } },
	{ id: 'n1', kind: 'note', created_at: at, actor: 'agent', source: 'structured', note: { id: 'n1', summary: 'a note summary' } },
	{ id: 'd1', kind: 'decision', created_at: at, actor: 'user', source: 'structured', decision: { id: 'd1', decision: 'a decision text', rationale: 'because' } }
] as unknown as TimelineEntry[];

afterEach(() => cleanup());

describe('every timeline kind identifies itself without the rail', () => {
	it('names its kind in text', () => {
		const r = render(TimelineEntryList, { props: { entries: ENTRIES, wsSlug: 'ws', itemSlug: 'TASK-1', currentContent: '' } });
		const cards = [...r.container.querySelectorAll('.entry-content')].map((c) => c.textContent?.replace(/\s+/g, ' ').trim() ?? '');
		expect(cards).toHaveLength(5);
		expect(cards[0]).toContain('a plain comment body');
		expect(cards[0]).toContain('User');
		expect(cards[1].toLowerCase()).toContain('created');
		expect(cards[2]).toContain('Description');
		expect(cards[3]).toContain('Note');
		expect(cards[3]).toContain('a note summary');
		expect(cards[4]).toContain('Decision');
		expect(cards[4]).toContain('a decision text');
	});
});
