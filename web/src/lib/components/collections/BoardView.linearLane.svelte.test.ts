// TASK-28 (SPEC-24): the board's lanes as Linear draws them. The lane header
// carries the group value's icon only when the grouping is a workflow field
// (status, or a select with terminal options) or priority; the `+` at the end
// of a lane opens the same draft as the header's `+`, under the same gate.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import type { Collection, FieldDef, Item } from '$lib/types';
import { draftKey } from '$lib/collections/laneDrafts';

vi.mock('$lib/stores/localIndex.svelte', () => ({
	localIndex: { findByIdOrSlug: () => null, getByCollection: () => [] },
}));
vi.mock('$lib/stores/collections.svelte', () => ({
	collectionStore: { collections: [{ slug: 'cars' }] },
}));

import BoardView from './BoardView.svelte';

function collection(fields: FieldDef[]): Collection {
	return {
		id: 'c1', workspace_id: 'ws1', name: 'Cars', slug: 'cars', icon: '', description: '',
		schema: JSON.stringify({ fields }), settings: '{}', sort_order: 0, is_default: true, is_system: false,
		created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', prefix: 'CAR',
	} as unknown as Collection;
}

function item(id: string, fields: Record<string, unknown>): Item {
	return {
		id, workspace_id: 'ws1', collection_id: 'c1', slug: id, title: id, content: '',
		fields: JSON.stringify(fields), tags: '[]', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
	} as unknown as Item;
}

const STATUS: FieldDef = {
	key: 'status', label: 'Status', type: 'select',
	options: ['open', 'in_progress', 'review', 'done', 'cancelled'],
	terminal_options: ['done', 'cancelled'],
	abandoned_options: ['cancelled'],
} as FieldDef;
const PRIORITY: FieldDef = { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'high', 'critical'] } as FieldDef;
const COLOR: FieldDef = { key: 'color', label: 'Color', type: 'select', options: ['red', 'blue'] } as FieldDef;

function renderBoard(groupField: string, extra: Record<string, unknown> = {}) {
	// The page owns (and binds) the draft state; a $state proxy stands in.
	const draftOpen: Record<string, boolean> = $state({});
	const view = render(BoardView, {
		props: {
			items: [item('one', { status: 'open', priority: 'high', color: 'red' })],
			collection: collection([STATUS, PRIORITY, COLOR]),
			wsSlug: 'ws',
			groupField,
			canEdit: true,
			onLaneChange: () => {},
			draftOpen,
			...extra,
		} as never,
	});
	return { view, draftOpen };
}

function lane(container: HTMLElement, name: string): HTMLElement {
	const col = [...container.querySelectorAll<HTMLElement>('.kanban-column')].find(
		(c) => c.querySelector('.column-name')?.textContent?.trim() === name,
	);
	expect(col, `no "${name}" lane`).toBeTruthy();
	return col!;
}

afterEach(() => cleanup());

describe('the lane header icon', () => {
	it('draws each status lane as its workflow shape, from the schema', () => {
		const { view } = renderBoard('status');
		const category = (name: string) =>
			lane(view.container, name).querySelector('.column-header [data-status-category]')?.getAttribute('data-status-category');
		expect(category('Open')).toBe('backlog');
		expect(category('In Progress')).toBe('progress');
		expect(category('Review')).toBe('review');
		expect(category('Done')).toBe('done');
		expect(category('Cancelled')).toBe('cancelled');
	});

	it('draws priority lanes as priority bars', () => {
		const { view } = renderBoard('priority');
		const level = (name: string) =>
			lane(view.container, name).querySelector('.column-header [data-priority-level]')?.getAttribute('data-priority-level');
		expect(level('Low')).toBe('low');
		expect(level('High')).toBe('high');
		expect(level('Critical')).toBe('urgent');
	});

	it('draws no icon for any other grouping', () => {
		const { view } = renderBoard('color');
		// PRECONDITION: the lanes rendered, so "no icon" is not "no header".
		expect(lane(view.container, 'Red').querySelector('.column-header')).not.toBeNull();
		expect(view.container.querySelector('.column-header [data-status-category], .column-header [data-priority-level]')).toBeNull();
	});

	it('keeps the count after the name, outside the actions', () => {
		const { view } = renderBoard('status');
		const header = lane(view.container, 'Open').querySelector('.column-header')!;
		expect(header.querySelector('.column-count')?.textContent).toBe('1');
		expect(header.querySelector('.column-actions .column-count')).toBeNull();
	});
});

describe('the + at the end of a lane', () => {
	it('opens the lane draft, rendered below the cards', async () => {
		const onCreateInColumn = vi.fn(async () => ({}));
		const { view, draftOpen } = renderBoard('status', { onCreateInColumn });
		const open = lane(view.container, 'Open');
		const bottom = open.querySelector<HTMLButtonElement>('.lane-add-bottom');
		expect(bottom, 'no bottom +').not.toBeNull();
		await fireEvent.click(bottom!);
		await tick();
		expect(draftOpen[draftKey('status', 'open')]).toBe(true);
		const draft = open.querySelector('.lane-draft');
		expect(draft, 'the draft did not open').not.toBeNull();
		// Below the cards, where the button was, and the button gives way to it.
		const cards = open.querySelector('.column-cards')!;
		expect(cards.compareDocumentPosition(draft!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
		expect(open.querySelector('.lane-add-bottom')).toBeNull();
	});

	it('the header + still opens the draft under the header', async () => {
		const onCreateInColumn = vi.fn(async () => ({}));
		const { view } = renderBoard('status', { onCreateInColumn });
		const open = lane(view.container, 'Open');
		await fireEvent.click(open.querySelector('.lane-add-btn')!);
		await tick();
		const draft = open.querySelector('.lane-draft');
		expect(draft).not.toBeNull();
		const cards = open.querySelector('.column-cards')!;
		expect(cards.compareDocumentPosition(draft!) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
	});

	it('is withheld with the header + (no create, or a relation grouping)', () => {
		const { view } = renderBoard('status');
		expect(view.container.querySelectorAll('.kanban-column').length).toBeGreaterThan(1);
		expect(view.container.querySelector('.lane-add-bottom')).toBeNull();
		expect(view.container.querySelector('.lane-add-btn')).toBeNull();
	});
});
