/**
 * TASK-31 (SPEC-24): the item page's Linear layout, mounted. A grid of the head
 * (title, meta line), the properties column and the main column; the toolbar of
 * round icon buttons; no duplicate breadcrumb on desktop; status and priority as
 * the status picker's rows. Mounts ItemDetail with the same stubs as
 * itemDetailAssigneeAgents. Geometry (the two columns, the stacking) is
 * measured in e2e/task-2209-balanced-fields-pane.spec.ts: jsdom has no layout.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import { finishBootstrap, resetBootstrap } from '../../../test/reactiveBootstrapMock.svelte';

const vp = vi.hoisted(() => ({ isMobile: false }));
vi.mock('$lib/stores/breakpoint.svelte', async (importOriginal) => {
	const real = await importOriginal<typeof import('$lib/stores/breakpoint.svelte')>();
	return {
		...real,
		viewport: {
			get isMobile() {
				return vp.isMobile;
			},
			get isCoarsePointer() {
				return false;
			},
			get dragDisabled() {
				return vp.isMobile;
			}
		}
	};
});

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

const SCHEMA = {
	fields: [
		{ key: 'status', label: 'Status', type: 'select', options: ['open', 'done'], terminal_options: ['done'] },
		{ key: 'priority', label: 'Priority', type: 'select', options: ['low', 'high'] },
		{ key: 'area', label: 'Area', type: 'select', options: ['web', 'api'] }
	]
};
const coll = { id: 'c-tasks', slug: 'tasks', name: 'Tasks', prefix: 'TASK', schema: JSON.stringify(SCHEMA), settings: '{}' };
function item(slug: string) {
	return {
		id: slug, slug, title: `Item ${slug}`, item_number: 1, collection_slug: 'tasks', collection_prefix: 'TASK', collection_id: 'c-tasks',
		fields: JSON.stringify({ status: 'open', priority: 'high' }), tags: '[]', content: '', seq: 1,
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

async function mountPage(props: Record<string, unknown> = {}) {
	const r = render(ItemDetail, { props: { username: 'u', wsSlug: 'ws', collSlug: 'tasks', ref: 'i1', ...props } });
	await settle();
	finishBootstrap();
	await settle();
	await waitFor(() => expect(r.container.querySelector('.item-grid')).not.toBeNull());
	return r;
}

beforeEach(() => {
	resetBootstrap();
	state.assigned = undefined;
	state.agentsFail = false;
	state.update = [];
	vp.isMobile = false;
});
afterEach(() => cleanup());

const q = (r: { container: HTMLElement }, sel: string) => r.container.querySelector<HTMLElement>(sel);

describe('the item page grid', () => {
	it('lays out the head, the properties and the main column, in that reading order', async () => {
		const r = await mountPage();
		const grid = q(r, '.item-grid')!;
		// The toolbar is the grid's first row, so it is first in the DOM too: the tab
		// order is the visual order.
		expect([...grid.children].map((c) => c.className.split(' ')[0])).toEqual(['meta-actions', 'item-head', 'item-aside', 'item-main']);
		expect(q(r, '.item-head .title')!.textContent).toContain('Item i1');
		// The meta line leads with the ref, in plain text.
		expect(q(r, '.item-head .meta-info .item-ref')!.textContent).toBe('TASK-1');
	});

	it('the properties column is outside the tab panels; wide it stays, stacked it follows Details', async () => {
		const r = await mountPage();
		const aside = q(r, '.item-aside')!;
		expect(aside.querySelector('.fields-panel')).not.toBeNull();
		expect(aside.closest('[role="tabpanel"]')).toBeNull();
		// Details is the first tab: the aside is on.
		expect(aside.classList.contains('aside-off')).toBe(false);
		await fireEvent.click(r.getByRole('tab', { name: /Relationships/ }));
		await tick();
		// Off, not unmounted: the fields keep their keys and fences. Whether it SHOWS is
		// the container query (display: none only below 860px; the wide page has no tabs
		// and always shows it): e2e/task-2209-balanced-fields-pane.spec.ts measures both.
		expect(aside.classList.contains('aside-off')).toBe(true);
		expect(aside.classList.contains('tab-hidden')).toBe(false);
		expect(aside.querySelector('.fields-panel')).not.toBeNull();
		await fireEvent.click(r.getByRole('tab', { name: /History/ }));
		await tick();
		expect(aside.classList.contains('aside-off')).toBe(true);
		await fireEvent.click(r.getByRole('tab', { name: /Details/ }));
		await tick();
		expect(aside.classList.contains('aside-off')).toBe(false);
		// The tab panels are the body, the relationships and the history; the comments
		// sit after them (they show with Details when stacked, and in the Activity
		// stream when wide).
		expect(q(r, '.item-main')!.querySelectorAll('[role="tabpanel"]')).toHaveLength(3);
	});

	it('reads body, then relationships, then Activity (comments, then history), in the DOM', async () => {
		const r = await mountPage();
		const main = q(r, '.item-main')!;
		const order = [...main.children].map((c) => {
			const label = c.getAttribute('aria-label');
			if (c.classList.contains('pane-tabs')) return 'tabs';
			if (label === 'Details') return 'details';
			if (label === 'Relationships') return 'relationships';
			if (c.classList.contains('activity-heading')) return 'activity-heading';
			if (c.id === 'item-comments') return 'comments';
			if (label === 'History') return 'history';
			if (c.classList.contains('summary-wrap')) return 'summary';
			return c.className;
		});
		expect(order).toEqual(['tabs', 'details', 'relationships', 'activity-heading', 'comments', 'history']);
		expect(q(r, '.activity-heading')!.textContent).toBe('Activity');
		// The Summary sits inside Details, below the body.
		const details = q(r, '[role="tabpanel"][aria-label="Details"]')!;
		expect([...details.children].map((c) => c.className.split(' ')[0]).slice(-2)).toEqual(['item-body', 'summary-wrap']);
		// Sub-issues come before the relationships list.
		const rel = q(r, '[role="tabpanel"][aria-label="Relationships"]')!;
		expect(rel.querySelector('#item-children')).not.toBeNull();
	});

	it('the comments follow Details, and only Details: History and Relationships do not show them', async () => {
		const r = await mountPage();
		const comments = q(r, '#item-comments')!;
		expect(comments.classList.contains('tab-hidden')).toBe(false);
		await fireEvent.click(r.getByRole('tab', { name: /History/ }));
		await tick();
		expect(comments.classList.contains('tab-hidden')).toBe(true);
		await fireEvent.click(r.getByRole('tab', { name: /Relationships/ }));
		await tick();
		expect(comments.classList.contains('tab-hidden')).toBe(true);
	});

	it('status and priority are the status picker as a row, with the icon and the name', async () => {
		const r = await mountPage();
		const status = q(r, '.item-aside button.picker-row[data-kind="status"]')!;
		const priority = q(r, '.item-aside button.picker-row[data-kind="priority"]')!;
		expect(status.textContent?.trim()).toBe('Open');
		expect(priority.textContent?.trim()).toBe('High');
		expect(status.querySelector('svg')).not.toBeNull();
		// A row says what it is: label, then value.
		expect(q(r, '.item-aside .field-row')!.querySelector('.field-label')!.textContent).toBe('Status');
	});

	it('choosing a status writes it through the page\'s own field writer', async () => {
		const r = await mountPage();
		await fireEvent.click(q(r, '.item-aside button.picker-row[data-kind="status"]')!);
		await tick();
		const row = [...document.body.querySelectorAll<HTMLElement>('[data-slot="popover-content"] [role="option"]')].find(
			(x) => x.textContent?.includes('Done')
		)!;
		await fireEvent.click(row);
		await waitFor(() => expect(state.update.length).toBe(1));
		expect(JSON.stringify(state.update[0])).toContain('"status":"done"');
	});
});

describe('the toolbar and the breadcrumb', () => {
	it('desktop: no breadcrumb of its own (the panel header shows it); round buttons instead', async () => {
		const r = await mountPage();
		expect(q(r, '.sticky-header')).toBeNull();
		expect(q(r, 'nav.breadcrumb')).toBeNull();
		const bar = q(r, '.meta-actions')!;
		for (const title of ['Copy link', 'Copy item ID', 'Star', 'More item actions']) {
			expect(bar.querySelector(`button[title="${title}"], button[aria-label="${title}"]`), title).not.toBeNull();
		}
		// Each is a round tool button; the ⋯ keeps its hook, the star its pressed state.
		expect(bar.querySelector('button.pane-more-btn.tool-btn')).not.toBeNull();
		expect(bar.querySelector('button.star-btn')!.getAttribute('aria-pressed')).toBe('false');
	});

	it('mobile: the breadcrumb stays, since the mobile chrome has none', async () => {
		vp.isMobile = true;
		const r = await mountPage();
		expect(q(r, '.sticky-header nav.breadcrumb')).not.toBeNull();
		expect(q(r, 'nav.breadcrumb')!.textContent).toContain('Tasks');
		// One copy button for the ref, in the toolbar.
		expect(r.container.querySelectorAll('button[title="Copy item ID"]')).toHaveLength(1);
	});

	it('the docked pane keeps its own header and drops the ref copy button from the toolbar', async () => {
		const r = await mountPage({ embedded: true });
		expect(q(r, 'header.pane-header')).not.toBeNull();
		expect(q(r, '.sticky-header')).toBeNull();
		expect(r.container.querySelectorAll('button[title="Copy item ID"]')).toHaveLength(1);
		expect(q(r, '.meta-actions button[title="Copy item ID"]')).toBeNull();
		expect(q(r, '.meta-actions button[title="Copy link"]')).not.toBeNull();
		// The ref is named once: the pane header has it.
		expect(q(r, '.meta-info .item-ref')).toBeNull();
	});
});
