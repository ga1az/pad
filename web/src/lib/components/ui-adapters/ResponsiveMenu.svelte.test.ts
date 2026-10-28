// ResponsiveMenu on desktop (TASK-26): shadcn-svelte's Dropdown Menu with
// the behaviour of the common/Menu it replaced. The sheet branch and the
// portal scroll dismissal have their own files; the row markup is covered by
// ResponsiveMenuItem.svelte.test.ts. bits-ui portals the panel to <body>.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import MenuHarness from './fixtures/MenuHarness.svelte';

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

async function settle() {
	for (let i = 0; i < 3; i++) {
		await tick();
		flushSync();
	}
}

const panel = () => document.querySelector<HTMLElement>('[role="menu"]');
const rows = () => [...document.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
const row = (label: string) => rows().find((r) => r.textContent?.trim() === label)!;
const key = (el: Element, k: string) =>
	el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
// bits-ui also checks the press lands outside the panel's rect; jsdom lays out
// nothing (every rect is 0,0), so the press needs real coordinates.
const press = (el: Element) => {
	const at = { bubbles: true, button: 0, pointerType: 'mouse', clientX: 500, clientY: 500 };
	el.dispatchEvent(new PointerEvent('pointerdown', at));
	el.dispatchEvent(new PointerEvent('pointerup', at));
	(el as HTMLElement).click();
};

async function openMenu(onpick = vi.fn()) {
	const r = render(MenuHarness, { props: { onpick } });
	await settle();
	expect(panel(), 'precondition: the menu rendered').not.toBeNull();
	return { ...r, onpick };
}

describe('ResponsiveMenu (desktop dropdown)', () => {
	it('renders a labelled menu of real buttons and links, as a dropdown surface', async () => {
		await openMenu();
		const menu = panel()!;
		expect(menu.getAttribute('aria-label')).toBe('Actions');
		expect(menu.dataset.slot).toBe('dropdown-menu-content');
		expect(menu.style.width).toBe('240px');
		expect(row('Rename').tagName).toBe('BUTTON');
		expect(row('Open').tagName).toBe('A');
		expect(row('Open').getAttribute('href')).toBe('/somewhere');
		expect(row('Starred').getAttribute('role')).toBe('menuitemradio');
		expect(row('Starred').getAttribute('aria-checked')).toBe('true');
		expect((row('Unavailable') as HTMLButtonElement).disabled).toBe(true);
		expect(row('Delete').classList.contains('danger')).toBe(true);
	});

	it('focuses the first row on open', async () => {
		await openMenu();
		expect(document.activeElement).toBe(row('Rename'));
	});

	it('arrow keys move between enabled rows and wrap; Home/End jump', async () => {
		await openMenu();
		key(document.activeElement!, 'ArrowDown');
		expect(document.activeElement).toBe(row('Starred'));
		key(document.activeElement!, 'ArrowDown');
		// The disabled row is skipped.
		expect(document.activeElement).toBe(row('Open'));
		key(document.activeElement!, 'End');
		expect(document.activeElement).toBe(row('Delete'));
		key(document.activeElement!, 'ArrowDown');
		expect(document.activeElement).toBe(row('Rename'));
		key(document.activeElement!, 'ArrowUp');
		expect(document.activeElement).toBe(row('Delete'));
		key(document.activeElement!, 'Home');
		expect(document.activeElement).toBe(row('Rename'));
	});

	it('a row click runs its handler and leaves the menu open (the consumer decides)', async () => {
		const { onpick } = await openMenu();
		row('Rename').click();
		await settle();
		expect(onpick).toHaveBeenCalledWith('rename');
		expect(panel()).not.toBeNull();
	});

	it('Enter on a row activates it once', async () => {
		const { onpick } = await openMenu();
		key(row('Rename'), 'Enter');
		await settle();
		expect(onpick).toHaveBeenCalledTimes(1);
		expect(onpick).toHaveBeenCalledWith('rename');
	});

	it('a disabled row does nothing', async () => {
		const { onpick } = await openMenu();
		row('Unavailable').click();
		await settle();
		expect(onpick).not.toHaveBeenCalled();
	});

	it('Escape closes the menu and returns focus to the trigger', async () => {
		await openMenu();
		key(document.activeElement!, 'Escape');
		await settle();
		expect(panel()).toBeNull();
		expect(document.activeElement).toBe(document.getElementById('trigger'));
	});

	it('an outside press closes the menu without moving focus to the trigger', async () => {
		await openMenu();
		const outside = document.getElementById('outside')!;
		press(outside);
		await new Promise((r) => setTimeout(r, 30));
		await settle();
		expect(panel()).toBeNull();
		expect(document.activeElement).not.toBe(document.getElementById('trigger'));
	});

	it("a press on the trigger is not an outside press: the trigger's own click toggles it shut", async () => {
		const { component } = await openMenu();
		press(document.getElementById('trigger')!);
		await new Promise((r) => setTimeout(r, 30));
		await settle();
		expect(panel()).toBeNull();
		expect((component as unknown as { isOpen(): boolean }).isOpen()).toBe(false);
	});

	it('a text field inside the menu keeps its keystrokes (no typeahead jump)', async () => {
		await openMenu();
		const input = document.getElementById('menu-input') as HTMLInputElement;
		input.focus();
		key(input, 'd');
		key(input, 'r');
		await settle();
		expect(document.activeElement).toBe(input);
	});
});
