/**
 * BUG-3157 — the status chip is a picker, not a one-tap cycle. On a board
 * grouped by status the old cycle moved a card a lane on a single tap meant to
 * open it (reproduced on mobile by web/e2e/bug-3157-*.spec.ts). These legs pin
 * the component's own contract; the views' tests pin that every surface uses it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
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

		it('numbers the rows that are showing, and a digit typed into a search filters instead', async () => {
			const { screen, onselect } = renderPicker('open');
			await openStatusPicker(screen.container);
			await fireEvent.input(searchInput(), { target: { value: 'd' } });
			await tick();
			expect(statusRows().map((r) => r.querySelector('[data-slot="command-shortcut"]')?.textContent)).toEqual(['1']);
			await fireEvent.keyDown(searchInput(), { key: '1' });
			expect(onselect).not.toHaveBeenCalled();
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
});
