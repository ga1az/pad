// TASK-28 (SPEC-24): the desktop card as Linear draws it. The ref and the
// assignee on top, the status shape beside the title (never inside
// `.card-title`, which holds the title alone), the priority box (dashes when
// unset), and "Created <date>". The star and the ⋮ are hover affordances,
// still in the DOM and reachable by keyboard.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import type { Collection, Item } from '$lib/types';

vi.mock('$app/state', () => ({ page: { params: { username: 'u', workspace: 'ws' }, url: new URL('http://x/') } }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/stores/workspace.svelte', () => ({ workspaceStore: { canEditItem: () => false } }));

import ItemCard from './ItemCard.svelte';

const PRIORITY = { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'high'] };
function collection(withPriority = true): Collection {
	const fields = [
		{ key: 'status', label: 'Status', type: 'select', options: ['open', 'shipped'], terminal_options: ['shipped'] },
		...(withPriority ? [PRIORITY] : []),
	];
	return {
		id: 'c1', workspace_id: 'ws1', name: 'Tasks', slug: 'tasks', icon: '', description: '',
		schema: JSON.stringify({ fields }), settings: '{}', sort_order: 0, is_default: true, is_system: false,
		created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', prefix: 'TASK',
	} as unknown as Collection;
}

function item(fields: Record<string, unknown>, extra: Partial<Item> = {}): Item {
	return {
		id: 'i1', workspace_id: 'ws1', collection_id: 'c1', slug: 't-1', title: 'Task One', content: '',
		item_number: 12, collection_prefix: 'TASK',
		fields: JSON.stringify(fields), tags: '["ui"]', created_at: '2025-09-16T12:00:00Z', updated_at: '2026-01-01T00:00:00Z',
		...extra,
	} as unknown as Item;
}

afterEach(() => cleanup());

describe('the Linear card (TASK-28)', () => {
	it('shows the ref, the status shape from the schema beside the title, and the created date', () => {
		const { container } = render(ItemCard, { props: { item: item({ status: 'shipped', priority: 'high' }), collection: collection() } as never });
		expect(container.querySelector('.item-ref')?.textContent).toBe('TASK-12');
		// `shipped` is done only because the schema says it is terminal.
		const status = container.querySelector('.card-title-row .card-status');
		expect(status?.querySelector('[data-status-category="done"]')).not.toBeNull();
		expect(status?.textContent).toContain('Status: Shipped');
		expect(container.querySelector('.card-title')?.textContent?.trim()).toBe('Task One');
		expect(container.querySelector('.meta-age')?.textContent).toMatch(/^Created Sep 1[56], 2025$/);
	});

	it('draws the priority box, and the dashes for an item without one', () => {
		let c = render(ItemCard, { props: { item: item({ status: 'open', priority: 'high' }), collection: collection() } as never }).container;
		expect(c.querySelector('.card-priority [data-priority-level="high"]')).not.toBeNull();
		cleanup();
		c = render(ItemCard, { props: { item: item({ status: 'open' }), collection: collection() } as never }).container;
		expect(c.querySelector('.card-priority [data-priority-level="none"]')).not.toBeNull();
		expect(c.querySelector('.card-priority')?.textContent).toContain('No priority');
		cleanup();
		// A collection with no priority field draws no box at all.
		c = render(ItemCard, { props: { item: item({ status: 'open' }), collection: collection(false) } as never }).container;
		expect(c.querySelector('.card-priority')).toBeNull();
	});

	it('shows the assignee as an initial, or the empty-assignee glyph', () => {
		let c = render(ItemCard, { props: { item: item({ status: 'open' }, { assigned_user_name: 'Sergio' } as Partial<Item>), collection: collection() } as never }).container;
		const avatar = c.querySelector('.card-assignee');
		expect(avatar?.textContent).toBe('S');
		expect(avatar?.getAttribute('aria-label')).toBe('Assigned to Sergio');
		cleanup();
		c = render(ItemCard, { props: { item: item({ status: 'open' }), collection: collection() } as never }).container;
		expect(c.querySelector('.card-assignee.unassigned')).not.toBeNull();
	});

	it('keeps the tags as chips, and the star and the ⋮ in the DOM for the keyboard', () => {
		const { container } = render(ItemCard, {
			props: { item: item({ status: 'open' }), collection: collection(), onReorderItem: vi.fn() } as never,
		});
		expect(container.querySelector('.card-meta .card-tag')?.textContent?.trim()).toBe('ui');
		expect(container.querySelector('button.star-btn')).not.toBeNull();
		expect(container.querySelector('.hover-action .iam-trigger')).not.toBeNull();
	});
});
