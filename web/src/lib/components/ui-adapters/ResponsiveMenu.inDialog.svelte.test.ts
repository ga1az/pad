// A ResponsiveMenu opened from inside an AppDialog (TASK-26 review): the
// panel portals into the dialog's content, so the dialog's focus trap lets
// focus into the menu, and Escape closes the menu alone, whichever element
// has focus; the next Escape closes the dialog.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import DialogMenuHarness from './fixtures/DialogMenuHarness.svelte';

vi.mock('$lib/stores/breakpoint.svelte', () => ({
	viewport: {
		get isMobile() {
			return false;
		},
	},
}));

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

async function settle(ms = 0) {
	for (let i = 0; i < 3; i++) {
		await tick();
		flushSync();
	}
	if (ms) {
		await new Promise((r) => setTimeout(r, ms));
		flushSync();
	}
}

const dialog = () => document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
const menu = () => document.querySelector<HTMLElement>('[data-slot="dropdown-menu-content"]');
const trigger = () => document.getElementById('menu-trigger') as HTMLButtonElement;
const escape = (el: Element) =>
	el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

async function openMenu() {
	render(DialogMenuHarness);
	await settle(30);
	expect(dialog(), 'precondition: the dialog is open').not.toBeNull();
	trigger().click();
	await settle(30);
	expect(menu(), 'precondition: the menu is open').not.toBeNull();
}

describe('ResponsiveMenu inside an AppDialog', () => {
	it('portals the panel into the dialog, and focus moves into the menu and stays', async () => {
		await openMenu();
		expect(dialog()!.contains(menu())).toBe(true);
		const first = [...menu()!.querySelectorAll<HTMLElement>('[role="menuitem"]')][0];
		expect(document.activeElement).toBe(first);
		// The dialog's trap would pull focus out of a panel outside its content.
		await settle(50);
		expect(document.activeElement).toBe(first);
	});

	it('Escape with focus on the trigger closes the menu and leaves the dialog; the next Escape closes the dialog', async () => {
		await openMenu();
		trigger().focus();
		expect(document.activeElement).toBe(trigger());
		escape(trigger());
		await settle(30);
		expect(menu(), 'the menu closed').toBeNull();
		expect(dialog(), 'the dialog is still open').not.toBeNull();

		escape(document.activeElement ?? trigger());
		await settle(30);
		expect(dialog(), 'the second Escape closed the dialog').toBeNull();
	});

	it('Escape inside the menu closes the menu alone and returns focus to the trigger', async () => {
		await openMenu();
		escape(document.activeElement!);
		await settle(30);
		expect(menu()).toBeNull();
		expect(dialog()).not.toBeNull();
		expect(document.activeElement).toBe(trigger());
	});
});
