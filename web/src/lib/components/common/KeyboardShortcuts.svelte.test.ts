// Runs in the jsdom vitest project (filename ends `.svelte.test.ts`).
// Covers the migration off the hand-rolled backdrop div onto the shared
// dialog (AppDialog, shadcn-svelte's Dialog since TASK-26): `visible` drives
// whether it is open, aria-labelledby points at the visible heading, and the
// close button asks the parent to flip `visible` (single source of truth)
// rather than closing itself. The dialog is portaled to <body>.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { tick, flushSync } from 'svelte';
import KeyboardShortcuts from './KeyboardShortcuts.svelte';

const DIALOG = '[data-slot="dialog-content"]';
const dialog = () => document.querySelector<HTMLElement>(DIALOG);
function getDialog(): HTMLElement {
	const el = dialog();
	if (!el) throw new Error('dialog content not found');
	return el;
}

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

describe('KeyboardShortcuts.svelte', () => {
	it('renders through the shared dialog when visible', async () => {
		render(KeyboardShortcuts, { props: { visible: true, onclose: vi.fn() } });
		await tick();
		flushSync();

		const el = getDialog();
		expect(el.getAttribute('role')).toBe('dialog');
		// The heading provides the accessible name via aria-labelledby.
		expect(el.getAttribute('aria-labelledby')).toBe('keyboard-shortcuts-title');
		expect(document.getElementById('keyboard-shortcuts-title')?.textContent).toBe(
			'Keyboard Shortcuts'
		);
		// The shortcut groups render inside the dialog.
		const text = el.textContent ?? '';
		for (const group of ['Global', 'Navigation', 'Item Detail']) {
			expect(text).toContain(group);
		}
	});

	it('stays closed (content torn down) while visible=false', async () => {
		render(KeyboardShortcuts, { props: { visible: false, onclose: vi.fn() } });
		await tick();
		flushSync();

		expect(dialog()).toBeNull();
		expect(document.getElementById('keyboard-shortcuts-title')).toBeNull();
	});

	it('close button asks the parent to close instead of closing itself', async () => {
		const onclose = vi.fn();
		render(KeyboardShortcuts, { props: { visible: true, onclose } });
		await tick();
		flushSync();

		const btn = document.querySelector<HTMLButtonElement>(`${DIALOG} button[aria-label="Close"]`);
		expect(btn).not.toBeNull();
		btn?.click();
		expect(onclose).toHaveBeenCalledOnce();
		// `visible` is the single source of truth — until the parent flips it,
		// the dialog itself has not closed.
		expect(dialog()).not.toBeNull();
	});
});
