// SPEC-24 / TASK-29: Linear's list. A group is a header (chevron, the status
// shape or priority bars, the name, the count, and a `+` on the right) over
// one 44px row per item: priority, ref, status, title, then chips, the
// assignee and the created date, in that order. At phone width the rows stay
// the cards TASK-2244 measured.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Collection, Item } from '$lib/types';
import {
	blockedDraftMessage,
	draftCreateFields,
	draftKey,
	draftTargets,
	lostLaneLabel,
} from '$lib/collections/laneDrafts';
import { parseSchema } from '$lib/types';

const vp = vi.hoisted(() => ({ mobile: false }));
vi.mock('$lib/stores/breakpoint.svelte', () => ({
	viewport: {
		get isMobile() {
			return vp.mobile;
		},
		get dragDisabled() {
			return false;
		},
	},
}));
vi.mock('$lib/stores/localIndex.svelte', () => ({
	localIndex: { findByIdOrSlug: () => null, getByCollection: () => [] },
}));
vi.mock('$lib/stores/collections.svelte', () => ({
	collectionStore: { collections: [{ slug: 'tasks' }] },
}));

import ListView from './ListView.svelte';

const FIELDS = [
	{ key: 'status', label: 'Status', type: 'select', options: ['open', 'in_progress', 'done'], terminal_options: ['done'] },
	{ key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high', 'urgent'] },
	{ key: 'area', label: 'Area', type: 'text' },
	{ key: 'score', label: 'Score', type: 'number', options: ['1', '2'], default: 1 },
];

function collection(): Collection {
	return {
		id: 'c1',
		workspace_id: 'ws1',
		name: 'Tasks',
		slug: 'tasks',
		icon: '',
		description: '',
		schema: JSON.stringify({ fields: FIELDS }),
		settings: JSON.stringify({}),
		sort_order: 0,
		is_default: true,
		is_system: false,
		created_at: '2026-01-01T00:00:00Z',
		updated_at: '2026-01-01T00:00:00Z',
		prefix: 'TASK',
	} as unknown as Collection;
}

function item(n: number, fields: Record<string, unknown>, extra: Record<string, unknown> = {}): Item {
	return {
		id: `i${n}`,
		workspace_id: 'ws1',
		collection_id: 'c1',
		slug: `i${n}`,
		title: `Item ${n}`,
		content: '',
		fields: JSON.stringify(fields),
		tags: '[]',
		item_number: n,
		collection_prefix: 'TASK',
		created_at: '2026-03-05T12:00:00Z',
		updated_at: '2026-03-05T12:00:00Z',
		...extra,
	} as unknown as Item;
}

const ITEMS = [
	item(7, { status: 'open', priority: 'high' }, { assigned_user_name: 'Ada', tags: '["backend"]' }),
	item(12, { status: 'in_progress' }),
	item(130, { status: 'done', priority: 'low', area: 'web' }),
];

function renderList(props: Record<string, unknown> = {}) {
	// The page owns (and binds) the draft state; $state proxies stand in.
	const draftText: Record<string, string> = $state({});
	const draftOpen: Record<string, boolean> = $state({});
	return render(ListView, {
		props: {
			draftText,
			draftOpen,
			items: ITEMS,
			collection: collection(),
			wsSlug: 'ws',
			groupField: 'status',
			statusOptions: ['open', 'in_progress', 'done'],
			canEdit: true,
			...props,
		} as never,
	});
}

const groupNamed = (c: HTMLElement, name: string) =>
	[...c.querySelectorAll<HTMLElement>('.item-group')].find((g) =>
		g.querySelector('.group-title')?.textContent?.trim() === name,
	)!;

afterEach(() => {
	cleanup();
	vp.mobile = false;
});

describe('the list row', () => {
	it('is one line of columns: priority, ref, status, title, chips, assignee, date', () => {
		const { container } = renderList();
		const row = groupNamed(container, 'Open').querySelector<HTMLElement>('.item-card.row')!;
		expect(row, 'the desktop list renders rows, not cards').toBeTruthy();
		const order = [...row.children].map((el) => el.classList[0]);
		expect(order).toEqual(['row-priority', 'row-ref', 'row-status', 'card-title', 'row-actions', 'row-meta', 'card-assignee', 'meta-age']);
		expect(row.querySelector('.row-priority [title="Priority: High"]')).toBeTruthy();
		expect(row.querySelector('.item-ref')?.textContent).toBe('TASK-7');
		expect(row.querySelector('.row-status .status-icon')?.getAttribute('data-status-category')).toBe('backlog');
		expect(row.querySelector('.card-title')?.textContent?.trim()).toBe('Item 7');
		expect(row.querySelector('.row-meta .card-tag')?.textContent?.trim()).toBe('backend');
		expect(row.querySelector('.card-assignee')?.getAttribute('aria-label')).toBe('Assigned to Ada');
		// Linear's short date, without the card's "Created" prefix; the full
		// timestamp stays in the tooltip.
		expect(row.querySelector('.meta-age')?.textContent?.trim()).toMatch(/^Mar 5(, 2026)?$/);
		expect(row.querySelector('.meta-age')?.getAttribute('title')).toMatch(/^Created /);
	});

	it('a missing priority is the dashes, and a missing assignee the empty glyph', () => {
		const { container } = renderList();
		const row = groupNamed(container, 'In Progress').querySelector<HTMLElement>('.item-card.row')!;
		expect(row.querySelector('.row-priority [title="No priority"]')).toBeTruthy();
		expect(row.querySelector('.card-assignee.unassigned')).toBeTruthy();
	});

	it('sizes the ref column to the longest ref in the list, so the titles align', () => {
		const { container } = renderList();
		const list = container.querySelector<HTMLElement>('.list-view')!;
		// TASK-130 is the longest: 8 characters.
		expect(list.style.getPropertyValue('--list-ref-width')).toBe(`${8 * 7.4 + 2}px`);
	});

	it('keeps the card at phone width', () => {
		vp.mobile = true;
		const { container } = renderList();
		expect(container.querySelector('.item-card.row')).toBeNull();
		expect(container.querySelectorAll('.item-card')).toHaveLength(3);
	});
});

describe('the group header', () => {
	it('draws the status shape, the name and the count inside the toggle', () => {
		const { container } = renderList();
		const header = groupNamed(container, 'Done').querySelector<HTMLElement>('.group-header')!;
		const toggle = header.querySelector('.group-toggle')!;
		expect(toggle.querySelector('.status-icon')?.getAttribute('data-status-category')).toBe('done');
		expect(toggle.querySelector('.group-count')?.textContent).toBe('1');
	});

	it('draws priority bars when grouped by priority, and nothing for another field', () => {
		const byPriority = renderList({ groupField: 'priority' });
		expect(groupNamed(byPriority.container, 'High').querySelector('.group-toggle .priority-icon')).toBeTruthy();
		expect(byPriority.container.querySelector('.group-toggle .status-icon')).toBeNull();
		cleanup();
		const byArea = renderList({ groupField: 'area' });
		expect(byArea.container.querySelector('.group-toggle .status-icon')).toBeNull();
		expect(byArea.container.querySelectorAll('.group-toggle svg')).toHaveLength(byArea.container.querySelectorAll('.group-toggle').length);
	});

	it('collapses its rows from the toggle, and the chevron turns', async () => {
		const { container } = renderList();
		const group = groupNamed(container, 'Open');
		const toggle = group.querySelector<HTMLButtonElement>('.group-toggle')!;
		await fireEvent.click(toggle);
		await tick();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(group.querySelector('.collapse-icon')?.classList.contains('collapsed')).toBe(true);
		expect(group.querySelector('.item-card')).toBeNull();
		await fireEvent.click(toggle);
		await tick();
		expect(group.querySelector('.item-card')).toBeTruthy();
	});
});

describe("the group's +", () => {
	it('opens a draft row whose Enter creates the item in that group', async () => {
		const onCreateInColumn = vi.fn(async () => {});
		const { container } = renderList({ onCreateInColumn });
		const group = groupNamed(container, 'In Progress');
		const add = group.querySelector<HTMLButtonElement>('.group-add-btn')!;
		expect(add.getAttribute('aria-label')).toBe('Add item to In Progress');
		await fireEvent.click(add);
		await tick();
		const input = group.querySelector<HTMLInputElement>('.group-draft input')!;
		expect(input, 'the draft row opens under the header').toBeTruthy();
		// The + is in the header's actions: it does not collapse the group.
		expect(group.querySelector('.group-toggle')?.getAttribute('aria-expanded')).toBe('true');
		await fireEvent.input(input, { target: { value: 'Write the docs' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await tick();
		expect(onCreateInColumn).toHaveBeenCalledWith(draftKey('status', 'in_progress'), 'Write the docs', true);
		expect(group.querySelector('.group-draft')).toBeNull();
	});

	it('Escape hides the draft and keeps its text; a failed create restores it', async () => {
		const onCreateInColumn = vi.fn(async () => {
			throw new Error('refused');
		});
		const { container } = renderList({ onCreateInColumn });
		const group = groupNamed(container, 'Open');
		await fireEvent.click(group.querySelector('.group-add-btn')!);
		await tick();
		let input = group.querySelector<HTMLInputElement>('.group-draft input')!;
		await fireEvent.input(input, { target: { value: 'Kept' } });
		await fireEvent.keyDown(input, { key: 'Escape' });
		await tick();
		expect(group.querySelector('.group-draft')).toBeNull();
		await fireEvent.click(group.querySelector('.group-add-btn')!);
		await tick();
		input = group.querySelector<HTMLInputElement>('.group-draft input')!;
		expect(input.value).toBe('Kept');
		await fireEvent.keyDown(input, { key: 'Enter' });
		await tick();
		await tick();
		expect(onCreateInColumn).toHaveBeenCalledTimes(1);
		expect(group.querySelector<HTMLInputElement>('.group-draft input')?.value).toBe('Kept');
	});

	it('expands a collapsed group to show the draft', async () => {
		const { container } = renderList({ onCreateInColumn: vi.fn() });
		const group = groupNamed(container, 'Done');
		await fireEvent.click(group.querySelector('.group-toggle')!);
		await tick();
		await fireEvent.click(group.querySelector('.group-add-btn')!);
		await tick();
		expect(group.querySelector('.group-toggle')?.getAttribute('aria-expanded')).toBe('true');
		expect(group.querySelector('.group-draft input')).toBeTruthy();
	});

	it('is withheld without a create, on the ungrouped group, and under a refused grouping', () => {
		const noCreate = renderList();
		expect(noCreate.container.querySelector('.group-add-btn')).toBeNull();
		cleanup();
		// `area` is text: item 7 and item 12 have none, so they are ungrouped.
		const byArea = renderList({ groupField: 'area', onCreateInColumn: vi.fn() });
		expect(byArea.container.querySelectorAll('.item-group')).toHaveLength(2);
		expect(byArea.container.querySelector('.group-add-btn')).toBeNull();
	});

	it('is withheld on a group the list discovered from item values, which the save path cannot place', async () => {
		// "Web" exists only because item 130 holds it. The board offers `+` on the
		// field's declared options (`draftableLanes`), and a draft typed in a lane
		// that is not one is classed as lost: it would save with `area: ''`, into
		// Uncategorized, or be refused on a required field.
		const items = [...ITEMS, item(131, { status: 'open', area: 'web' })];
		const byArea = renderList({ items, groupField: 'area', onCreateInColumn: vi.fn() });
		expect(groupNamed(byArea.container, 'Web')).toBeTruthy();
		expect(byArea.container.querySelector('.group-add-btn')).toBeNull();
	});

	it('on a declared option saves into that option, through the real draft save path', async () => {
		const field = parseSchema(collection()).fields.find((f) => f.key === 'priority');
		const created: Record<string, unknown>[] = [];
		const onCreateInColumn = vi.fn(async (key: string, _title: string) => {
			const built = draftCreateFields(key, field, 'priority', {});
			if (!built.ok) throw new Error(built.message);
			created.push(built.fields);
		});
		const { container } = renderList({ groupField: 'priority', onCreateInColumn });
		// "High" is a declared option: its + is there, and the draft saves priority=high.
		const group = groupNamed(container, 'High');
		await fireEvent.click(group.querySelector('.group-add-btn')!);
		await tick();
		const input = group.querySelector<HTMLInputElement>('.group-draft input')!;
		await fireEvent.input(input, { target: { value: 'Ship it' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		await tick();
		expect(onCreateInColumn).toHaveBeenCalledWith(draftKey('priority', 'high'), 'Ship it', true);
		expect(created).toEqual([{ priority: 'high' }]);
	});
});

// BUG-3043: a draft whose lane no longer exists is shown under Uncategorized
// ("rehomed"), or, where Uncategorized cannot receive it, kept with a notice
// and a Discard ("blocked"). The list used to render neither.
describe('a draft whose lane is gone', () => {
	const statusField = () => parseSchema(collection()).fields.find((f) => f.key === 'status');
	const scoreField = () => parseSchema(collection()).fields.find((f) => f.key === 'score');
	const labelFor = (k: string) => (k === 'score' ? 'Score' : k);

	it('shows under Uncategorized, marked with the lane it came from, even with no ungrouped item', async () => {
		const key = draftKey('status', 'wontdo');
		const draftText: Record<string, string> = $state({ [key]: 'Typed before the lane went' });
		const onCreateInColumn = vi.fn(async () => {});
		const { container } = renderList({
			// Every item has a status: no item is ungrouped.
			items: ITEMS,
			draftText,
			onCreateInColumn,
			draftPlacement: draftTargets(draftText, statusField(), {}),
		});
		const group = groupNamed(container, 'Uncategorized');
		expect(group, 'the Uncategorized group is shown for the draft').toBeTruthy();
		expect(group.querySelector('.group-draft-moved')?.textContent).toContain('Moved from');
		const input = group.querySelector<HTMLInputElement>('.group-draft input')!;
		expect(input.value).toBe('Typed before the lane went');
		await fireEvent.keyDown(input, { key: 'Enter' });
		await tick();
		// Submitted under its ORIGINAL key, which is where the page resolves the target.
		expect(onCreateInColumn).toHaveBeenCalledWith(key, 'Typed before the lane went', true);
	});

	it('is discarded from its row', async () => {
		const key = draftKey('status', 'wontdo');
		const draftText: Record<string, string> = $state({ [key]: 'Lost lane' });
		const onDiscardDraft = vi.fn();
		const { container } = renderList({
			draftText,
			onCreateInColumn: vi.fn(),
			onDiscardDraft,
			draftPlacement: draftTargets(draftText, statusField(), {}),
		});
		const group = groupNamed(container, 'Uncategorized');
		await fireEvent.click([...group.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Discard')!);
		expect(onDiscardDraft).toHaveBeenCalledWith(key);
	});

	it('a blocked draft shows its alert, and Discard draft lets it go', async () => {
		// A number field stores no value for Uncategorized (the key is omitted),
		// and `score` has a default the create would fill, so Uncategorized
		// cannot receive the draft: it is kept, not guessed into a lane.
		const key = draftKey('score', '3');
		const draftText: Record<string, string> = $state({ [key]: 'Cannot go anywhere' });
		const placement = draftTargets(draftText, scoreField(), {});
		const target = placement[key];
		expect(target?.kind).toBe('blocked');
		const message = blockedDraftMessage(lostLaneLabel(target as never, labelFor), 'Score', 'defaulted');
		const onDiscardDraft = vi.fn();
		const { container } = renderList({
			groupField: 'score',
			draftText,
			onCreateInColumn: vi.fn(),
			onDiscardDraft,
			draftPlacement: placement,
			blockedDraftNotices: [{ lane: key, message }],
		});
		const alert = container.querySelector<HTMLElement>('[role="alert"]')!;
		expect(alert.textContent).toContain(message);
		expect(alert.textContent).toContain('Cannot go anywhere');
		// A blocked draft is not re-homed: no Uncategorized row for it.
		expect(container.querySelector('.group-draft')).toBeNull();
		await fireEvent.click([...alert.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Discard draft')!);
		expect(onDiscardDraft).toHaveBeenCalledWith(key);
	});
});
