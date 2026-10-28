/**
 * BUG-3157 — the status chip is a picker, not a one-tap cycle. On a board
 * grouped by status the old cycle moved a card a lane on a single tap meant to
 * open it (reproduced on mobile by web/e2e/bug-3157-*.spec.ts). These legs pin
 * the component's own contract; the views' tests pin that every surface uses it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';
import StatusPicker from './StatusPicker.svelte';
import { STATUS_CHIP, STATUS_ROW, chooseStatus, openStatusPicker, rowLabel, statusChipIn, statusRows } from './statusPickerTestKit';

afterEach(() => cleanup());

const OPTIONS = ['open', 'in_progress', 'done'];

function renderPicker(value = 'open') {
	const onselect = vi.fn();
	const screen = render(StatusPicker, { props: { value, options: OPTIONS, onselect } });
	return { screen, onselect };
}

describe('StatusPicker', () => {
	it('a click opens the picker and writes NOTHING — the defect was a write on the click', async () => {
		const { screen, onselect } = renderPicker();
		const rows = await openStatusPicker(screen.container);
		expect(onselect).not.toHaveBeenCalled();
		expect(rows.map(rowLabel)).toEqual(['Open', 'In Progress', 'Done']);
		expect(statusChipIn(screen.container).getAttribute('aria-expanded')).toBe('true');
	});

	it('choosing a row writes exactly that status, once, and closes', async () => {
		const { screen, onselect } = renderPicker();
		await chooseStatus(screen.container, 'done');
		expect(onselect).toHaveBeenCalledTimes(1);
		expect(onselect).toHaveBeenCalledWith('done');
		expect(statusRows()).toHaveLength(0);
		expect(statusChipIn(screen.container).getAttribute('aria-expanded')).toBe('false');
	});

	it('choosing the current status writes nothing', async () => {
		const { screen, onselect } = renderPicker('in_progress');
		await chooseStatus(screen.container, 'in_progress');
		expect(onselect).not.toHaveBeenCalled();
	});

	it('A to B (still in flight) and back to A writes both; `value` is stale until B lands', async () => {
		const onselect = vi.fn(() => new Promise<void>(() => {}));
		const screen = render(StatusPicker, { props: { value: 'open', options: OPTIONS, onselect } });
		await chooseStatus(screen.container, 'done');
		await chooseStatus(screen.container, 'open');
		expect(onselect.mock.calls).toEqual([['done'], ['open']]);
	});

	it('checks the current status and only that', async () => {
		const { screen } = renderPicker('in_progress');
		const rows = await openStatusPicker(screen.container);
		expect(rows.filter((r) => r.getAttribute('aria-checked') === 'true').map(rowLabel)).toEqual(['In Progress']);
	});

	it('renders the menu OUTSIDE the chip’s container', async () => {
		// The chip lives inside a card's <a> and the board's dnd zone. Rows
		// rendered there would sit inside a link, and svelte-dnd-action rewrites
		// the roles of what its zone contains.
		const { screen } = renderPicker();
		await openStatusPicker(screen.container);
		expect(screen.container.querySelector(STATUS_ROW)).toBeNull();
		expect(statusRows().length).toBe(OPTIONS.length);
	});

	it('a second click on the chip closes it without writing', async () => {
		const { screen, onselect } = renderPicker();
		await openStatusPicker(screen.container);
		await fireEvent.click(statusChipIn(screen.container));
		expect(statusRows()).toHaveLength(0);
		expect(onselect).not.toHaveBeenCalled();
	});

	it('is a menu trigger by its ARIA, which is also what the views’ tests find it by', () => {
		const { screen } = renderPicker();
		expect(screen.container.querySelector(STATUS_CHIP)).not.toBeNull();
		// Desktop opens a popover (TASK-30); the mobile sheet is a dialog too.
		expect(statusChipIn(screen.container).getAttribute('aria-haspopup')).toBe('dialog');
	});

	// TASK-30: the popover is a Command, operated from the keyboard.
	describe('keyboard (desktop popover)', () => {
		const searchInput = () => document.body.querySelector<HTMLInputElement>('[data-slot="command-input"]')!;

		it('opens with the search focused and the current status highlighted', async () => {
			const { screen } = renderPicker('in_progress');
			await openStatusPicker(screen.container);
			await tick();
			expect(document.activeElement).toBe(searchInput());
			expect(searchInput().placeholder).toBe('Change status…');
			const lit = statusRows().filter((r) => r.getAttribute('aria-selected') === 'true');
			expect(lit.map(rowLabel)).toEqual(['In Progress']);
		});

		it('typing filters the rows, and a search with no match says so', async () => {
			const { screen } = renderPicker();
			await openStatusPicker(screen.container);
			await fireEvent.input(searchInput(), { target: { value: 'prog' } });
			await tick();
			expect(statusRows().map(rowLabel)).toEqual(['In Progress']);
			await fireEvent.input(searchInput(), { target: { value: 'zzz' } });
			await tick();
			expect(statusRows()).toHaveLength(0);
			expect(document.body.textContent).toContain('No results');
		});

		it('a list with no row is not a listbox (axe: aria-required-children), and is one again with rows', async () => {
			const { screen } = renderPicker();
			await openStatusPicker(screen.container);
			const list = () => document.body.querySelector('[data-slot="command-list"]')!;
			await waitFor(() => expect(list().getAttribute('role')).toBe('listbox'));
			expect(list().getAttribute('aria-label')).toBeTruthy();
			await fireEvent.input(searchInput(), { target: { value: 'zzz' } });
			await waitFor(() => expect(list().hasAttribute('role')).toBe(false));
			expect(list().querySelector('[role="option"]')).toBeNull();
			expect(list().hasAttribute('aria-label')).toBe(false);
			expect(list().hasAttribute('tabindex')).toBe(false);
			expect(list().textContent).toContain('No results');
			await fireEvent.input(searchInput(), { target: { value: 'prog' } });
			await waitFor(() => expect(list().getAttribute('role')).toBe('listbox'));
			expect(list().getAttribute('tabindex')).toBe('0');
		});

		it('ArrowDown then Enter picks that row, writes once, closes, and refocuses the chip', async () => {
			const { screen, onselect } = renderPicker('open');
			await openStatusPicker(screen.container);
			await tick();
			await fireEvent.keyDown(searchInput(), { key: 'ArrowDown' });
			await fireEvent.keyDown(searchInput(), { key: 'Enter' });
			await tick();
			expect(onselect).toHaveBeenCalledTimes(1);
			expect(onselect).toHaveBeenCalledWith('in_progress');
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).toBe(statusChipIn(screen.container));
		});

		it('a digit picks the row it numbers while the search is empty', async () => {
			const { screen, onselect } = renderPicker('open');
			await openStatusPicker(screen.container);
			await tick();
			await fireEvent.keyDown(searchInput(), { key: '3' });
			await tick();
			expect(onselect).toHaveBeenCalledWith('done');
			expect(statusRows()).toHaveLength(0);
		});

		it('shows the digit hints only while the search is empty, and a digit typed into a search types', async () => {
			const { screen, onselect } = renderPicker('open');
			await openStatusPicker(screen.container);
			const hints = () =>
				statusRows().map((r) => r.querySelector('[data-slot="command-shortcut"]')?.textContent ?? null);
			expect(hints()).toEqual(['1', '2', '3']);
			await fireEvent.input(searchInput(), { target: { value: 'd' } });
			await tick();
			expect(statusRows().map(rowLabel)).toEqual(['Done']);
			expect(hints(), 'no numbers while filtering').toEqual([null]);
			// Not prevented: the browser types the digit into the field.
			expect(await fireEvent.keyDown(searchInput(), { key: '1' })).toBe(true);
			expect(onselect).not.toHaveBeenCalled();
			expect(statusRows()).toHaveLength(1);
			// Clearing the search brings them back.
			await fireEvent.input(searchInput(), { target: { value: '' } });
			await tick();
			expect(hints()).toEqual(['1', '2', '3']);
		});

		it('a digit past the last row is not a shortcut: it types, and nothing closes', async () => {
			const { screen, onselect } = renderPicker('open');
			await openStatusPicker(screen.container);
			await tick();
			expect(await fireEvent.keyDown(searchInput(), { key: '9' })).toBe(true);
			expect(onselect).not.toHaveBeenCalled();
			expect(statusRows()).toHaveLength(OPTIONS.length);
			// And the shortcut itself IS taken (prevented): control for the above.
			expect(await fireEvent.keyDown(searchInput(), { key: '2' })).toBe(false);
			expect(onselect).toHaveBeenCalledWith('in_progress');
		});

		it('Escape closes without writing and refocuses the chip', async () => {
			const { screen, onselect } = renderPicker();
			await openStatusPicker(screen.container);
			await tick();
			await fireEvent.keyDown(searchInput(), { key: 'Escape' });
			await tick();
			expect(statusRows()).toHaveLength(0);
			expect(onselect).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(statusChipIn(screen.container));
			expect(statusChipIn(screen.container).getAttribute('aria-expanded')).toBe('false');
		});

		it('an unknown stored value is shown as-is with no row checked or highlighted by it', async () => {
			const { screen } = renderPicker('legacy_state');
			const rows = await openStatusPicker(screen.container);
			expect(rows.filter((r) => r.getAttribute('aria-checked') === 'true')).toHaveLength(0);
			expect(statusChipIn(screen.container).textContent?.trim()).toBe('Legacy State');
		});
	});

	// Where focus ends up after each way of closing (TASK-30 review): Escape,
	// a pick and a press on the chip return it to the chip; an outside press
	// leaves it on whatever was pressed. bits-ui's focus trap used to pull an
	// outside focus back into the panel before the dismissal ran, so the press
	// ended with focus on <body>.
	describe('focus after closing (desktop popover)', () => {
		const searchInput = () => document.body.querySelector<HTMLInputElement>('[data-slot="command-input"]')!;
		// A real press: down and up at coordinates outside the panel (jsdom
		// lays nothing out), then the click. The browser focuses on mousedown,
		// and bits-ui judges a mouse press 10ms after it goes down.
		async function press(el: HTMLElement, focus = true) {
			const at = { bubbles: true, button: 0, pointerType: 'mouse', clientX: 500, clientY: 500 };
			el.dispatchEvent(new PointerEvent('pointerdown', at));
			if (focus) el.focus();
			await new Promise((r) => setTimeout(r, 40));
			el.dispatchEvent(new PointerEvent('pointerup', at));
			el.click();
		}
		async function settle() {
			for (let i = 0; i < 3; i++) await tick();
		}

		it('Escape returns focus to the chip', async () => {
			const { screen } = renderPicker();
			await openStatusPicker(screen.container);
			await settle();
			expect(document.activeElement).toBe(searchInput());
			await fireEvent.keyDown(searchInput(), { key: 'Escape' });
			await settle();
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).toBe(statusChipIn(screen.container));
		});

		it('Escape with focus outside the panel closes it and returns focus to the chip', async () => {
			const { screen } = renderPicker();
			const field = document.body.appendChild(document.createElement('input'));
			await openStatusPicker(screen.container);
			await settle();
			field.focus();
			field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
			await settle();
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).toBe(statusChipIn(screen.container));
			field.remove();
		});

		it('a pick returns focus to the chip', async () => {
			const { screen, onselect } = renderPicker('open');
			const rows = await openStatusPicker(screen.container);
			await settle();
			await fireEvent.click(rows[2]);
			await settle();
			expect(onselect).toHaveBeenCalledWith('done');
			expect(document.activeElement).toBe(statusChipIn(screen.container));
		});

		it('a press on the chip closes it, with focus on the chip', async () => {
			const { screen } = renderPicker();
			await openStatusPicker(screen.container);
			await settle();
			await press(statusChipIn(screen.container), false);
			await settle();
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).toBe(statusChipIn(screen.container));
		});

		it('an outside press on a text input closes it and leaves focus ON that input', async () => {
			const { screen } = renderPicker();
			const field = document.body.appendChild(document.createElement('input'));
			await openStatusPicker(screen.container);
			await settle();
			await press(field);
			await settle();
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).toBe(field);
			field.remove();
		});

		it('an outside press on another chip leaves focus on that chip', async () => {
			const { screen } = renderPicker();
			const other = document.body.appendChild(document.createElement('button'));
			await openStatusPicker(screen.container);
			await settle();
			await press(other);
			await settle();
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).toBe(other);
			other.remove();
		});

		it('an outside press on plain page background closes it without pulling focus back', async () => {
			const { screen } = renderPicker();
			await openStatusPicker(screen.container);
			await settle();
			await press(document.body, false);
			await settle();
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).not.toBe(searchInput());
		});

		it('Tab closes it and continues from the chip', async () => {
			const { screen } = renderPicker();
			await openStatusPicker(screen.container);
			await settle();
			await fireEvent.keyDown(searchInput(), { key: 'Tab' });
			await settle();
			expect(statusRows()).toHaveLength(0);
			expect(document.activeElement).toBe(statusChipIn(screen.container));
		});
	});
});

// TASK-31: the property row's value, the item page's own look of the picker.
describe('StatusPicker appearance="row"', () => {
	it('shows the icon and the name as a text action, and opens the same picker', async () => {
		const onselect = vi.fn();
		const screen = render(StatusPicker, { props: { value: 'in_progress', options: OPTIONS, onselect, appearance: 'row' } });
		const chip = screen.container.querySelector<HTMLElement>('button.picker-row')!;
		expect(chip.textContent?.trim()).toBe('In Progress');
		expect(chip.querySelector('svg')).not.toBeNull();
		expect(chip.getAttribute('aria-label')).toBe('Status: In Progress');
		expect(chip.getAttribute('aria-haspopup')).toBe('dialog');
		await fireEvent.click(chip);
		await tick();
		expect(statusRows().map(rowLabel)).toEqual(['Open', 'In Progress', 'Done']);
		expect(onselect).not.toHaveBeenCalled();
	});

	it('an unset priority says "Set priority" in gray', () => {
		const screen = render(StatusPicker, { props: { kind: 'priority', value: '', options: ['low', 'high'], onselect: vi.fn(), appearance: 'row' } });
		const chip = screen.container.querySelector<HTMLElement>('button.picker-row')!;
		expect(chip.textContent?.trim()).toBe('Set priority');
		expect(chip.querySelector('.picker-row-empty')).not.toBeNull();
	});
});
