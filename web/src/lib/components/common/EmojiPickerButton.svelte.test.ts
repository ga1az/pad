/**
 * TASK-30 — the desktop icon picker is a Popover holding a Command: a search
 * field over a grid, operated from the keyboard. The stored value is still the
 * emoji itself. The mobile sheet keeps the old EmojiPicker grid.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import EmojiPickerButton from './EmojiPickerButton.svelte';

const viewportState = vi.hoisted(() => ({ isMobile: false }));
vi.mock('$lib/stores/breakpoint.svelte', () => ({
	viewport: {
		get isMobile() {
			return viewportState.isMobile;
		},
	},
}));

afterEach(() => {
	cleanup();
	viewportState.isMobile = false;
});

const trigger = (c: ParentNode) => c.querySelector<HTMLButtonElement>('button.trigger')!;
const search = () => document.body.querySelector<HTMLInputElement>('[data-slot="command-input"]');
const options = () => Array.from(document.body.querySelectorAll<HTMLElement>('[data-slot="popover-content"] [role="option"]'));

async function open(value = '📋') {
	const screen = render(EmojiPickerButton, { props: { value } });
	await fireEvent.click(trigger(screen.container));
	await tick();
	await tick();
	return screen;
}

describe('EmojiPickerButton (desktop)', () => {
	it('opens a popover with a search field and every icon, outside the button', async () => {
		const screen = await open();
		expect(trigger(screen.container).getAttribute('aria-expanded')).toBe('true');
		expect(search()?.placeholder).toBe('Search icons…');
		expect(document.activeElement).toBe(search());
		expect(options()).toHaveLength(48);
		expect(screen.container.querySelector('[role="option"]')).toBeNull();
	});

	it('marks the current icon', async () => {
		await open('🚀');
		expect(options().filter((o) => o.getAttribute('aria-checked') === 'true').map((o) => o.textContent?.trim())).toEqual(['🚀']);
	});

	it('typing filters by name or group', async () => {
		await open();
		await fireEvent.input(search()!, { target: { value: 'rocket' } });
		await tick();
		expect(options().map((o) => o.textContent?.trim())).toEqual(['🚀']);
		await fireEvent.input(search()!, { target: { value: 'nature' } });
		await tick();
		expect(options()).toHaveLength(12);
		await fireEvent.input(search()!, { target: { value: 'zzzz' } });
		await tick();
		expect(options()).toHaveLength(0);
		expect(document.body.textContent).toContain('No icons found');
	});

	it('clicking an icon stores that emoji, closes, and refocuses the button', async () => {
		const screen = await open();
		const fire = options().find((o) => o.textContent?.trim() === '🔥')!;
		await fireEvent.click(fire);
		await tick();
		await tick();
		expect(trigger(screen.container).textContent?.trim()).toBe('🔥');
		expect(options()).toHaveLength(0);
		expect(document.activeElement).toBe(trigger(screen.container));
	});

	it('the arrows move through the grid: right by one icon, down by a row of six', async () => {
		const screen = await open('📋');
		const lit = () => options().filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.textContent?.trim());
		expect(lit()).toEqual(['📋']);
		await fireEvent.keyDown(search()!, { key: 'ArrowRight' });
		expect(lit()).toEqual(['📝']);
		await fireEvent.keyDown(search()!, { key: 'ArrowDown' });
		expect(lit()).toEqual(['🔖']);
		await fireEvent.keyDown(search()!, { key: 'Enter' });
		await tick();
		await tick();
		expect(trigger(screen.container).textContent?.trim()).toBe('🔖');
	});

	it('search, an arrow and Enter pick from the keyboard alone', async () => {
		const screen = await open();
		await fireEvent.input(search()!, { target: { value: 'chart' } });
		await tick();
		expect(options().map((o) => o.textContent?.trim())).toEqual(['📊', '📈', '📉']);
		await fireEvent.keyDown(search()!, { key: 'ArrowRight' });
		await fireEvent.keyDown(search()!, { key: 'Enter' });
		await tick();
		await tick();
		expect(trigger(screen.container).textContent?.trim()).toBe('📈');
		expect(options()).toHaveLength(0);
	});

	it('Escape closes without changing the icon and refocuses the button', async () => {
		const screen = await open('🧠');
		await fireEvent.keyDown(search()!, { key: 'Escape' });
		await tick();
		await tick();
		expect(options()).toHaveLength(0);
		expect(trigger(screen.container).textContent?.trim()).toBe('🧠');
		expect(document.activeElement).toBe(trigger(screen.container));
	});

	it('a second click on the button closes it', async () => {
		const screen = await open();
		await fireEvent.click(trigger(screen.container));
		await tick();
		expect(options()).toHaveLength(0);
	});

	it('the panel carries .epb-dropdown, which QuickActionsMenu exempts from its outside presses', async () => {
		await open();
		expect(document.body.querySelector('.epb-dropdown [role="option"]')).not.toBeNull();
	});
});

describe('EmojiPickerButton (mobile)', () => {
	it('keeps the BottomSheet with the plain grid: no popover, no search', async () => {
		viewportState.isMobile = true;
		const screen = render(EmojiPickerButton, { props: { value: '📋' } });
		await fireEvent.click(trigger(screen.container));
		await tick();
		expect(document.body.querySelector('[role="dialog"]')).not.toBeNull();
		expect(document.body.querySelector('[data-slot="popover-content"]')).toBeNull();
		expect(search()).toBeNull();
		const buttons = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.emoji-btn'));
		expect(buttons).toHaveLength(48);
		await fireEvent.click(buttons.find((b) => b.textContent?.trim() === '🔥')!);
		await tick();
		expect(trigger(screen.container).textContent?.trim()).toBe('🔥');
	});
});
