import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/svelte';

// TASK-30: the palette wears Linear's Cmd+K. Its behavior is pinned by the
// other CommandPalette.* files; these legs pin what the restyle added or
// moved: a row reads icon, title, then the ref in gray on the right, and a
// footer hints the keys. The ARIA model stays the palette's own combobox.

vi.mock('$lib/api/client', () => ({
	api: { search: vi.fn() },
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('$lib/stores/workspace.svelte', () => ({
	workspaceStore: { current: { slug: 'ws', owner_username: 'u' }, workspaces: [] },
}));
vi.mock('$lib/stores/collections.svelte', () => ({ collectionStore: { collections: [] } }));
vi.mock('$lib/stores/localIndex.svelte', () => ({
	localIndex: { bootstrapStateFor: () => 'loading', findByIdOrSlug: () => null },
}));
vi.mock('$lib/stores/ui.svelte', () => ({
	uiStore: { searchOpen: true, isMobile: false, closeSearch: vi.fn() },
}));
vi.mock('$lib/stores/coveredPage.svelte', () => ({ coveredPage: { enter: () => () => {} } }));

import { api } from '$lib/api/client';
import CommandPalette from './CommandPalette.svelte';

const hit = {
	item: {
		id: 'srv-1',
		slug: 'pelican-notes',
		title: 'Pelican notes',
		collection_slug: 'tasks',
		collection_prefix: 'TASK',
		item_number: 7,
		workspace_slug: 'ws',
		fields: '{}',
		content: '',
		updated_at: '2026-10-01T00:00:00Z',
	},
	rank: 1,
	snippet: '',
};

beforeEach(() => {
	vi.useFakeTimers();
	vi.mocked(api.search).mockReset();
	vi.mocked(api.search).mockResolvedValue({ results: [hit], total: 1, limit: 20, offset: 0 } as never);
});
afterEach(() => {
	cleanup();
	vi.useRealTimers();
});

describe('CommandPalette, Linear layout (TASK-30)', () => {
	it('puts the ref in gray after the title, last in the row', async () => {
		const view = render(CommandPalette);
		await fireEvent.input(view.getByRole('combobox'), { target: { value: 'pelican' } });
		await vi.advanceTimersByTimeAsync(500);
		const row = view.getByRole('option');
		const kids = Array.from(row.querySelector('.result-main')!.children).map((c) => c.className.split(' ')[0]);
		expect(kids[0]).toBe('result-icon');
		expect(kids[1]).toBe('result-title');
		expect(kids[kids.length - 1]).toBe('result-ref');
		expect(row.querySelector('.result-ref')?.textContent).toBe('TASK-7');
	});

	it('has a footer with the three key hints, hidden from assistive tech', () => {
		const view = render(CommandPalette);
		const footer = view.container.querySelector('.cp-footer');
		expect(footer, 'no footer').not.toBeNull();
		expect(footer!.getAttribute('aria-hidden')).toBe('true');
		expect(footer!.textContent).toMatch(/navigate/);
		expect(footer!.textContent).toMatch(/open/);
		expect(footer!.textContent).toMatch(/close/);
	});

	it('keeps the combobox model: the input controls the listbox and points at the armed row', async () => {
		const view = render(CommandPalette);
		const input = view.getByRole('combobox');
		await fireEvent.input(input, { target: { value: 'pelican' } });
		await vi.advanceTimersByTimeAsync(500);
		expect(input.getAttribute('aria-controls')).toContain('cp-listbox');
		await fireEvent.keyDown(view.getByRole('dialog'), { key: 'ArrowDown' });
		expect(input.getAttribute('aria-activedescendant')).toBe('cp-opt-0');
		expect(view.getByRole('option').getAttribute('aria-selected')).toBe('true');
	});
});
