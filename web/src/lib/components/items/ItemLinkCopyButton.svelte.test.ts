/** TASK-31: the toolbar's "Copy link" puts the item's own URL on the clipboard. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';

const copy = vi.hoisted(() => ({ ok: true, calls: [] as string[] }));
vi.mock('$lib/utils/clipboard', () => ({
	copyToClipboard: async (t: string) => {
		copy.calls.push(t);
		return copy.ok;
	}
}));
const toast = vi.hoisted(() => ({ show: vi.fn() }));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: toast }));
vi.mock('$lib/stores/auth.svelte', () => ({ authStore: { identityFence: () => () => true } }));

import ItemLinkCopyButton from './ItemLinkCopyButton.svelte';

beforeEach(() => {
	copy.ok = true;
	copy.calls = [];
	toast.show.mockClear();
});
afterEach(() => cleanup());

describe('ItemLinkCopyButton', () => {
	it('copies the page origin plus the item path, and says Copied', async () => {
		const r = render(ItemLinkCopyButton, { props: { path: '/dave/pad/tasks/task-5' } });
		const btn = r.getByRole('button', { name: 'Copy link' });
		expect(btn.getAttribute('title')).toBe('Copy link');
		await fireEvent.click(btn);
		await waitFor(() => expect(r.container.textContent).toContain('Copied!'));
		expect(copy.calls).toEqual([`${window.location.origin}/dave/pad/tasks/task-5`]);
	});

	it('a failed copy is an error toast, not a Copied', async () => {
		copy.ok = false;
		const r = render(ItemLinkCopyButton, { props: { path: '/dave/pad/tasks/task-5' } });
		await fireEvent.click(r.getByRole('button', { name: 'Copy link' }));
		await waitFor(() => expect(toast.show).toHaveBeenCalledWith('Could not copy the link', 'error'));
		expect(r.container.textContent).not.toContain('Copied!');
	});
});
