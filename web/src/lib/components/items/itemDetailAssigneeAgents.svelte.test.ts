/**
 * TASK-20 (SPEC-15): the item's assignee picker offers the workspace's
 * joined agents, by their bot user, in their own "Agents" group; people are
 * listed as before. An item assigned to an agent shows the agent.
 *
 * Mounts ItemDetail with the same stubs as itemDetailAppAttribution.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { finishBootstrap, resetBootstrap } from '../../../test/reactiveBootstrapMock.svelte';

vi.mock('$lib/components/editor/Editor.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/editor/EditorBubbleMenu.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/editor/EditorLinkPopover.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/editor/RawMarkdownEditor.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/fields/FieldEditor.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/fields/TagInput.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/timeline/ItemTimeline.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/timeline/TimelineEntryList.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/ChildItems.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/BacklinksPanel.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/items/DecisionChips.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/RelationBacklinksPanel.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('./ItemPicker.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/common/QuickActionsMenu.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/common/BottomSheet.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/collections/EditCollectionModal.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/ShareDialog.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/items/CopyItemDialog.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/items/PushToAgentDialog.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/items/ItemAttachmentStrip.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/components/attachments/AttachmentSurfaceHost.svelte', () => import('../../../test/StubComponent.svelte'));
vi.mock('$lib/collab/wsProvider.svelte', () => ({
	CollabProvider: class {
		state = 'connecting';
		synced = false;
		lastOpLogID = undefined;
		itemID: string;
		awareness = { setLocalStateField() {}, on() {}, off() {}, getStates: () => new Map() };
		constructor(itemId: string) {
			this.itemID = itemId;
		}
		destroy() {}
	},
}));

const state = vi.hoisted(() => ({
	assigned: undefined as undefined | { id: string; name: string },
	agentsFail: false,
	update: [] as Record<string, unknown>[],
}));

const coll = { id: 'c-tasks', slug: 'tasks', name: 'tasks', prefix: 'TASK', schema: '{"fields":[]}', settings: '{}' };
function item(slug: string) {
	return {
		id: slug, slug, title: `Item ${slug}`, item_number: 1, collection_slug: 'tasks', collection_id: 'c-tasks',
		fields: '{}', tags: '[]', content: '', seq: 1,
		created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', created_by: 'user',
		...(state.assigned ? { assigned_user_id: state.assigned.id, assigned_user_name: state.assigned.name } : {}),
	};
}

const members = [{ workspace_id: 'w', user_id: 'u1', role: 'owner', created_at: '', user_name: 'Dave', user_email: 'd@x' }];
const agents = [
	{ id: 'a1', workspace_id: 'w', user_id: 'u-bot-1', display_name: 'Builder', created_at: '' },
	{ id: 'a2', workspace_id: 'w', user_id: 'u-bot-2', display_name: 'Retired', created_at: '', revoked_at: '2026-01-02T00:00:00Z' },
];

vi.mock('$lib/api/client', () => ({
	api: {
		items: {
			get: vi.fn(async (_ws: string, slug: string) => item(slug)),
			update: vi.fn(async (_ws: string, id: string, body: Record<string, unknown>) => {
				state.update.push(body);
				return item(id);
			}),
			flushCollabContent: vi.fn(async (_ws: string, id: string) => item(id)),
			progress: vi.fn(async () => ({ total: 0, done: 0, percentage: 0 })),
		},
		collections: { get: vi.fn(async () => coll), list: vi.fn(async () => [coll]) },
		links: { list: vi.fn(async () => []) },
		members: { list: vi.fn(async () => ({ members })) },
		agents: {
			list: vi.fn(async () => {
				if (state.agentsFail) throw new Error('404');
				return { agents };
			}),
		},
		agentRoles: { list: vi.fn(async () => []) },
		tags: { list: vi.fn(async () => []) },
	},
	PadApiError: class PadApiError extends Error { code = ''; },
	isUpdateConflictError: () => false,
}));
vi.mock('$lib/services/sse.svelte', () => ({
	sseService: {
		onItemEvent: () => () => {},
		connect: vi.fn(), disconnect: vi.fn(),
		get connected() { return true; }, get state() { return 'open'; },
	},
}));
vi.mock('$lib/services/sync.svelte', () => ({
	syncService: { onSync: () => () => {}, markSynced: vi.fn() },
}));
vi.mock('$lib/stores/localIndex.svelte', async () => {
	const m = await import('../../../test/reactiveBootstrapMock.svelte');
	return {
		localIndex: { bootstrap: vi.fn(() => m.reactiveBootstrap()), getAll: () => [], retagCollection: vi.fn(), bootstrapStateFor: () => 'cold' },
	};
});
vi.mock('$lib/stores/workspace.svelte', () => ({
	workspaceStore: { canEditItem: () => true, get isOwner() { return true; }, setCurrent: vi.fn(async () => {}) },
}));
vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: {
		get identityEpoch() { return 0; },
		get userId() { return 'u1'; },
		get user() { return { id: 'u1', name: 'A' }; },
		get authenticated() { return true; },
		identityFence: () => () => true,
		onIdentityChange: () => () => {},
	},
}));

import ItemDetail from './ItemDetail.svelte';

async function settle() {
	flushSync();
	await tick();
	await new Promise((r) => setTimeout(r, 0));
	await tick();
}

async function mountPicker() {
	const r = render(ItemDetail, { props: { username: 'u', wsSlug: 'ws', collSlug: 'tasks', ref: 'i1' } });
	await settle();
	finishBootstrap();
	await settle();
	let select: HTMLSelectElement | null = null;
	await waitFor(() => {
		select = r.container.querySelector<HTMLSelectElement>('select[aria-label="Assigned to"]');
		expect(select).not.toBeNull();
	});
	return { r, select: select! };
}

function groups(select: HTMLSelectElement) {
	return [...select.querySelectorAll('optgroup')].map((g) => ({
		label: g.label,
		options: [...g.querySelectorAll('option')].map((o) => [o.value, o.textContent?.trim()]),
	}));
}

beforeEach(() => {
	resetBootstrap();
	state.assigned = undefined;
	state.agentsFail = false;
	state.update = [];
});
afterEach(() => cleanup());

describe('assignee picker lists the joined agents (TASK-20)', () => {
	it('offers people and live agents in their own groups', async () => {
		const { select } = await mountPicker();
		expect(groups(select)).toEqual([
			{ label: 'People', options: [['u1', 'Dave']] },
			{ label: 'Agents', options: [['u-bot-1', 'Builder (agent)']] },
		]);
		expect(select.options[0].value).toBe('');
	});

	it('assigns a task to an agent as its bot user', async () => {
		const { select } = await mountPicker();
		await fireEvent.change(select, { target: { value: 'u-bot-1' } });
		await waitFor(() => expect(state.update).toEqual([{ assigned_user_id: 'u-bot-1' }]));
	});

	it('shows an item already assigned to an agent as that agent', async () => {
		state.assigned = { id: 'u-bot-1', name: 'Builder' };
		const { r, select } = await mountPicker();
		await waitFor(() => expect(select.value).toBe('u-bot-1'));
		expect(r.container.querySelector('.assignment-agent')).not.toBeNull();
	});

	it('keeps an assignee no group holds (a revoked agent), named from the item', async () => {
		state.assigned = { id: 'u-bot-2', name: 'Retired' };
		const { select } = await mountPicker();
		await waitFor(() => expect(select.value).toBe('u-bot-2'));
		expect(select.selectedOptions[0].textContent?.trim()).toBe('Retired');
	});

	it('lists the people exactly as before when the agents cannot be read', async () => {
		state.agentsFail = true;
		const { select } = await mountPicker();
		expect(select.querySelectorAll('optgroup')).toHaveLength(0);
		expect([...select.options].map((o) => [o.value, o.textContent?.trim()])).toEqual([
			['', 'Unassigned'],
			['u1', 'Dave'],
		]);
	});
});
