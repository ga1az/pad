// SPEC-24 / TASK-29: the collection page's second row, Linear's. Under the
// panel header (which names the collection and holds "+ New <item>") the page
// shows pill tabs for its view scopes ("All" and each saved view), and round
// icon buttons: filter (an indigo dot while a filter is active), sort, Display
// (List / Board / Table and the saved views' management), quick actions and
// the collection ⋯. The old heading, its count and the purple "+ New" are
// gone on desktop; the count stays for assistive tech. An active filter shows
// as a chip whose × clears that filter alone.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('$lib/components/collections/BoardView.svelte', () => import('../../../../test/StubComponent.svelte'));
vi.mock('$lib/components/collections/ListView.svelte', () => import('../../../../test/StubComponent.svelte'));
vi.mock('$lib/components/collections/TableView.svelte', () => import('../../../../test/StubComponent.svelte'));
vi.mock('$lib/components/collections/PaneHost.svelte', () => import('../../../../test/StubComponent.svelte'));
vi.mock('$lib/components/collections/FilterBar.svelte', () => import('../../../../test/StubComponent.svelte'));
vi.mock('$lib/components/collections/EditCollectionModal.svelte', () => import('../../../../test/StubComponent.svelte'));
vi.mock('$lib/components/ShareDialog.svelte', () => import('../../../../test/StubComponent.svelte'));
vi.mock('$lib/components/SSEStatusIndicator.svelte', () => import('../../../../test/StubComponent.svelte'));

const toasts = vi.hoisted(() => [] as Array<{ message: string; type?: string; action?: { label: string; onAction: () => void } }>);
vi.mock('$lib/stores/toast.svelte', () => ({
	toastStore: {
		show: (
			message: string,
			type?: string,
			_d?: number,
			_l?: string,
			action?: { label: string; onAction: () => void }
		) => {
			toasts.push({ message, type, action });
			return 'toast-id';
		},
		dismiss: () => {},
		get toasts() { return []; },
	},
	quietExternalToasts: () => false,
}));

const VIEWS = vi.hoisted(() => [
	{ id: 'v1', name: 'Hot', view_type: 'list', config: JSON.stringify({ filters: [{ field: 'status', op: 'eq', value: 'open' }] }) },
	{ id: 'v2', name: 'Mine', view_type: 'board', config: '{}' },
]);
const ROW = vi.hoisted(() => ({
	id: 'i1', slug: 'i1', title: 'Row', item_number: 1, collection_slug: 'tasks',
	fields: '{"status":"open"}', tags: '[]', sort_order: 0,
	created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
}));
const collectionGets = vi.hoisted(() => [] as Array<{ resolve: (v: unknown) => void }>);
const deferredBulk = vi.hoisted(() => [] as Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>);
function defer(sink: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>) {
	return new Promise((resolve, reject) => { sink.push({ resolve, reject }); });
}

vi.mock('$app/navigation', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return { ...actual, goto: vi.fn(async () => {}), beforeNavigate: () => {}, afterNavigate: () => {} };
});

vi.mock('$lib/api/client', () => ({
	api: {
		collections: {
			get: vi.fn(() => new Promise((resolve) => { collectionGets.push({ resolve }); })),
			list: vi.fn(async () => []),
			update: vi.fn(async () => ({})),
		},
		views: { list: vi.fn(async () => VIEWS), create: vi.fn(async () => ({})), delete: vi.fn(async () => ({})) },
		members: { list: vi.fn(async () => ({ members: [], invitations: [] })) },
		items: {
			update: vi.fn(async () => ({})),
			create: vi.fn(async () => ({ id: 'i9', slug: 'i9', title: 'x', item_number: 9 })),
			restore: vi.fn(async () => ({ id: 'i1' })),
			bulk: vi.fn(() => defer(deferredBulk)),
			plansProgress: vi.fn(async () => []),
		},
		search: vi.fn(async () => ({ results: [] })),
	},
	PadApiError: class PadApiError extends Error { code = ''; },
	isPlanLimitError: (e: unknown) => (e as { code?: string })?.code === 'plan_limit_exceeded',
	planLimitMessage: (e: unknown) => (e as { message?: string })?.message ?? '',
	isConflictOrNotFound: () => false,
}));

vi.mock('$lib/collections/progressMerge', () => ({
	plansProgressToMap: () => ({}),
	fetchCollectionProgress: vi.fn(async () => ({})),
}));
vi.mock('$lib/services/sse.svelte', () => ({
	sseService: {
		connect: vi.fn(), disconnect: vi.fn(), onItemEvent: () => () => {},
		get connected() { return true; }, get state() { return 'open'; },
	},
}));
vi.mock('$lib/services/sync.svelte', () => ({ syncService: { onSync: () => () => {}, sync: vi.fn(async () => true) } }));
vi.mock('$lib/stores/localIndex.svelte', () => ({
	localIndex: {
		bootstrap: vi.fn(async () => {}), reconcile: vi.fn(async () => true),
		getByCollection: () => [ROW], upsert: () => {}, scopeEpochFor: () => 1,
		retagCollection: vi.fn(), reset: vi.fn(), bootstrapStateFor: () => 'ready',
		accessRevokedFor: () => false, pendingResyncFor: () => false,
		includesUnparentedMetadataFor: () => true,
	},
}));
vi.mock('$lib/stores/localSearch.svelte', () => ({
	localSearch: { epoch: () => 0, search: () => [] },
	parseSearchQuery: (q: string) => ({ text: q, body: false, collection: null, archived: false, ref: null, number: null }),
}));
vi.mock('$lib/stores/ui.svelte', () => ({
	uiStore: { registerCollectionSearch: () => {}, unregisterCollectionSearch: () => {} },
}));
vi.mock('$lib/stores/workspace.svelte', () => ({
	workspaceStore: {
		setCurrent: vi.fn(async () => {}), get isOwner() { return true; },
		get currentRole() { return 'owner'; }, canEditCollection: () => true,
		get current() { return { id: 'ws1', slug: 'ws', name: 'WS' }; },
	},
}));
// Identity never moves here — this suite is about the toast's CONTENT, and the
// fence's behaviour is owned by collectionIdentityFence.svelte.test.ts. A fence
// that always holds is the right double for that: it takes the fence out of the
// set of things that could explain a missing toast.
vi.mock('$lib/stores/auth.svelte', () => ({
	authStore: {
		get identityEpoch() { return 0; },
		get userId() { return 'u1'; },
		get user() { return { id: 'u1', name: 'A', email: 'a@example.com' }; },
		get session() { return { user: { id: 'u1' } }; },
		identityFence() { return () => true; },
		onIdentityChange() { return () => {}; },
		clear() {},
	},
}));
vi.mock('$lib/stores/collections.svelte', () => ({
	collectionStore: {
		loadCollections: vi.fn(async () => {}), cachedCollection: vi.fn(async () => null),
		get collections() { return []; }, get activeItem() { return null; },
	},
}));

import { page } from '$app/state';
import CollectionPage from './+page.svelte';
import { draftKey } from '$lib/collections/laneDrafts';

const COLLECTION = {
	id: 'c1', slug: 'tasks', name: 'Tasks',
	schema: JSON.stringify({ fields: [{ key: 'status', type: 'select', options: ['open', 'done'] }] }),
	settings: '{}', updated_at: '2026-01-01T00:00:00Z',
};

type Props = Record<string, unknown>;
function lastViewProps(): Props | undefined {
	const all = (globalThis as { __stubProps?: Props[] }).__stubProps ?? [];
	return [...all].reverse().find((p) => 'onGroupReorder' in p);
}

async function mountPage(search = '', collection: Record<string, unknown> = COLLECTION) {
	(globalThis as { __stubProps?: Props[] }).__stubProps = [];
	toasts.length = 0;
	collectionGets.length = 0;
	page.params = { username: 'dave', workspace: 'ws', collection: 'tasks' };
	page.url = new URL(`http://localhost/dave/ws/tasks${search}`);
	const r = render(CollectionPage);
	const get = await waitFor(() => {
		if (collectionGets.length === 0) throw new Error('no collection fetch yet');
		return collectionGets[0]!;
	});
	get.resolve({ ...collection });
	await waitFor(() => {
		if (!r.container.querySelector('.view-toolbar')) throw new Error('toolbar not rendered yet');
		if (r.container.querySelectorAll('.view-tab').length < 3) throw new Error('saved views not loaded yet');
	});
	return r;
}

const tabs = (c: HTMLElement) =>
	[...c.querySelectorAll<HTMLButtonElement>('.view-tab')].map((b) => [b.textContent?.trim(), b.getAttribute('aria-pressed')]);
const filterButton = () => screen.getByRole('button', { name: 'Toggle filters' });

describe('the tabs row (TASK-29)', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('replaces the old heading: no h1, no purple New, the count kept for assistive tech', async () => {
		const { container } = await mountPage();
		expect(container.querySelector('h1')).toBeNull();
		expect(container.querySelector('.new-btn')).toBeNull();
		expect(container.querySelector('.view-toolbar .sr-only .item-count')?.textContent).toBe('1');
		// The realtime status rides the row (stubbed here, but mounted).
		expect(container.querySelector('.view-toolbar .header-actions')).toBeTruthy();
	});

	it('shows All and each saved view as pills; a pill applies its view', async () => {
		const { container } = await mountPage();
		expect(tabs(container)).toEqual([
			['All tasks', 'true'],
			['Hot', 'false'],
			['Mine', 'false'],
		]);
		await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.view-tab')[1]!);
		await tick();
		expect(tabs(container).map((t) => t[1])).toEqual(['false', 'true', 'false']);
		// Applying "Hot" set its filter: the filter button carries the dot.
		expect(filterButton().querySelector('.filter-badge')).toBeTruthy();
		await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.view-tab')[0]!);
		await tick();
		expect(tabs(container).map((t) => t[1])).toEqual(['true', 'false', 'false']);
		expect(filterButton().querySelector('.filter-badge')).toBeNull();
	});

	it('Display opens the view menu: List, Board and Table switch the view', async () => {
		const { container } = await mountPage();
		const display = screen.getByRole('button', { name: 'Change view' });
		expect(display.getAttribute('aria-haspopup')).toBe('menu');
		await fireEvent.click(display);
		const table = await waitFor(() => {
			const el = [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')].find((m) => m.textContent?.includes('Table'));
			if (!el) throw new Error('menu not open yet');
			return el;
		});
		for (const name of ['List', 'Board', 'Saved views', 'Hot', 'Save current view']) {
			expect(document.body.textContent, `the Display menu offers ${name}`).toContain(name);
		}
		await fireEvent.click(table);
		await tick();
		expect(container.querySelector('.collection-page')?.classList.contains('table-active')).toBe(true);
	});

	it('an active filter is a chip; its × clears that filter, and the dot goes', async () => {
		const { container } = await mountPage('?status=open');
		const chip = await waitFor(() => {
			const el = container.querySelector<HTMLElement>('.filter-summary .filter-chip');
			if (!el) throw new Error('no chip yet');
			return el;
		});
		expect(chip.textContent).toContain('status: open');
		expect(container.querySelector('.filter-summary-count')?.textContent).toMatch(/^\d+ of \d+$/);
		expect(filterButton().querySelector('.filter-badge')).toBeTruthy();
		await fireEvent.click(screen.getByRole('button', { name: 'Remove filter status: open' }));
		await tick();
		expect(container.querySelector('.filter-summary')).toBeNull();
		expect(filterButton().querySelector('.filter-badge')).toBeNull();
		expect(lastViewProps()?.filtered).toBe(false);
	});
});

describe('a saved view stays pressed only while its filters are applied (TASK-29)', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	const filterBarProps = (): Props | undefined => {
		const all = (globalThis as { __stubProps?: Props[] }).__stubProps ?? [];
		return [...all].reverse().find((p) => 'onFilterChange' in p);
	};

	it('a filter chip x releases the pill', async () => {
		const { container } = await mountPage();
		await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.view-tab')[1]!);
		await tick();
		expect(tabs(container).map((t) => t[1])).toEqual(['false', 'true', 'false']);
		// Close the panel: the closed-panel summary shows the view's filter as a chip.
		await fireEvent.click(filterButton());
		await tick();
		await fireEvent.click(screen.getByRole('button', { name: 'Remove filter status: open' }));
		await tick();
		expect(tabs(container).map((t) => t[1])).toEqual(['true', 'false', 'false']);
	});

	it('an edit of the filters from the filter bar releases the pill', async () => {
		const { container } = await mountPage();
		await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.view-tab')[1]!);
		await tick();
		(filterBarProps()!.onFilterChange as (f: Record<string, string>) => void)({ status: 'done' });
		await tick();
		expect(tabs(container).map((t) => t[1])).toEqual(['true', 'false', 'false']);
	});

	it('a tag filter edit releases it too, and a search does not', async () => {
		const { container } = await mountPage();
		await fireEvent.click(container.querySelectorAll<HTMLButtonElement>('.view-tab')[1]!);
		await tick();
		(filterBarProps()!.onSearchChange as (q: string) => void)('row');
		await tick();
		// A search is not part of a view's config.
		expect(tabs(container).map((t) => t[1])).toEqual(['false', 'true', 'false']);
		(filterBarProps()!.onTagFilterChange as (t: string[]) => void)(['backend']);
		await tick();
		expect(tabs(container).map((t) => t[1])).toEqual(['true', 'false', 'false']);
	});
});

describe('the list view carries the board\'s draft wiring (BUG-3043, TASK-29)', () => {
	beforeEach(() => { vi.clearAllMocks(); });

	it('hands the list the placement, the blocked notices and a Discard', async () => {
		// A number group field stores nothing for Uncategorized, and its default
		// would fill the key, so a draft typed in a lane that is gone cannot be rehomed.
		const withDefault = {
			...COLLECTION,
			schema: JSON.stringify({ fields: [{ key: 'status', type: 'number', options: ['1', '2'], default: 1 }] }),
		};
		await mountPage('?view=list', withDefault);
		const props = lastViewProps()!;
		expect('statusOptions' in props, 'the list is mounted, not the board').toBe(true);
		const key = draftKey('status', '3');
		(props.draftText as Record<string, string>)[key] = 'Typed in a lane that is gone';
		await tick();
		expect((props.draftPlacement as Record<string, { kind: string }>)[key]?.kind).toBe('blocked');
		const notices = props.blockedDraftNotices as { lane: string; message: string }[];
		expect(notices.map((n) => n.lane)).toEqual([key]);
		expect(notices[0]!.message).toContain('3');
		(props.onDiscardDraft as (lane: string) => void)(key);
		await tick();
		expect((props.draftText as Record<string, string>)[key]).toBeUndefined();
		expect(props.blockedDraftNotices).toEqual([]);
	});
});
