// The TASK-30 pickers inside a REAL AppDialog (review of TASK-30): the panel
// portals into the dialog's content, so its focus trap lets focus into the
// panel; Escape closes the picker alone, whichever element has focus, and the
// next Escape closes the dialog; an outside press on a field of the dialog
// leaves focus on that field.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import DialogPickerHarness from './fixtures/DialogPickerHarness.svelte';

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
const panel = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');
const search = () => document.querySelector<HTMLInputElement>('[data-slot="command-input"]');
const field = () => document.getElementById('dialog-field') as HTMLInputElement;
const trigger = (kind: 'status' | 'emoji') =>
	document.querySelector<HTMLElement>(kind === 'status' ? '[aria-haspopup][title="Change status"]' : 'button.trigger')!;
const escape = (el: Element) =>
	el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

async function openPicker(kind: 'status' | 'emoji') {
	render(DialogPickerHarness, { props: { kind } });
	await settle(30);
	expect(dialog(), 'precondition: the dialog is open').not.toBeNull();
	trigger(kind).click();
	await settle(30);
	expect(panel(), 'precondition: the picker is open').not.toBeNull();
}

describe.each(['status', 'emoji'] as const)('the %s picker inside an AppDialog', (kind) => {
	it('portals into the dialog, and focus is in the search and stays there', async () => {
		await openPicker(kind);
		expect(dialog()!.contains(panel())).toBe(true);
		expect(document.activeElement).toBe(search());
		await settle(50);
		expect(document.activeElement).toBe(search());
	});

	it('Escape inside the panel closes the picker alone and returns focus to the trigger', async () => {
		await openPicker(kind);
		escape(search()!);
		await settle(30);
		expect(panel(), 'the picker closed').toBeNull();
		expect(dialog(), 'the dialog is still open').not.toBeNull();
		expect(document.activeElement).toBe(trigger(kind));
	});

	it('Escape with focus elsewhere in the dialog closes the picker alone; the next Escape closes the dialog', async () => {
		await openPicker(kind);
		field().focus();
		expect(document.activeElement).toBe(field());
		escape(field());
		await settle(30);
		expect(panel(), 'the picker closed').toBeNull();
		expect(dialog(), 'the dialog is still open').not.toBeNull();

		escape(document.activeElement ?? field());
		await settle(30);
		expect(dialog(), 'the second Escape closed the dialog').toBeNull();
	});

	it('an outside press on a field of the dialog closes the picker and leaves focus on the field', async () => {
		await openPicker(kind);
		const at = { bubbles: true, button: 0, pointerType: 'mouse', clientX: 500, clientY: 500 };
		field().dispatchEvent(new PointerEvent('pointerdown', at));
		field().focus();
		await settle(40);
		field().dispatchEvent(new PointerEvent('pointerup', at));
		field().click();
		await settle(30);
		expect(panel(), 'the picker closed').toBeNull();
		expect(dialog(), 'the dialog is still open').not.toBeNull();
		expect(document.activeElement).toBe(field());
	});
});
