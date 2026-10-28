// AppDialog (TASK-26): the app's modal dialog on shadcn-svelte's Dialog
// (bits-ui). Migrated from common/Modal.svelte.test.ts: the same contract,
// asserted on the new markup. bits-ui portals the content to <body>, so
// every query goes through `document`.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { createRawSnippet, tick, flushSync } from 'svelte';
import AppDialog from './AppDialog.svelte';

// A snippet the parent would normally write as <AppDialog> children: the
// labelled heading and a focusable control used by the focus-restore test.
const bodySnippet = createRawSnippet(() => ({
	render: () =>
		`<div><h2 id="modal-title">Dialog heading</h2><button id="inner-btn" type="button">OK</button></div>`
}));

function baseProps(overrides: Record<string, unknown> = {}) {
	return {
		open: true,
		onclose: vi.fn(),
		labelledby: 'modal-title',
		children: bodySnippet,
		...overrides
	};
}

async function settle() {
	for (let i = 0; i < 3; i++) {
		await tick();
		flushSync();
	}
}

const dialog = () => document.querySelector<HTMLElement>('[data-slot="dialog-content"]');
function getDialog(): HTMLElement {
	const el = dialog();
	if (!el) throw new Error('dialog content not found');
	return el;
}
function getBackdrop(): HTMLElement {
	const el = document.querySelector<HTMLElement>('[data-slot="dialog-overlay"]');
	if (!el) throw new Error('dialog overlay not found');
	return el;
}

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
});

describe('AppDialog', () => {
	it('opens on open=true: a modal dialog, aria + content wired', async () => {
		render(AppDialog, { props: baseProps({ open: true }) });
		await settle();

		const el = getDialog();
		expect(el.getAttribute('role')).toBe('dialog');
		expect(el.getAttribute('aria-modal')).toBe('true');
		// aria-labelledby points at the heading inside the children.
		expect(el.getAttribute('aria-labelledby')).toBe('modal-title');
		// Inner content is gated on `open`, so it renders only while open.
		expect(document.getElementById('modal-title')).not.toBeNull();
	});

	it('closes when open flips to false and tears down the gated content', async () => {
		const { rerender } = render(AppDialog, { props: baseProps({ open: true }) });
		await settle();
		expect(dialog()).not.toBeNull();

		await rerender(baseProps({ open: false }));
		await settle();
		// bits-ui unmounts after its exit-presence check, a frame or two later.
		await new Promise((r) => setTimeout(r, 50));
		await settle();

		expect(dialog()).toBeNull();
		expect(document.getElementById('modal-title')).toBeNull();
	});

	it('Escape asks the parent to close, and the dialog stays until the parent flips open', async () => {
		const onclose = vi.fn();
		render(AppDialog, { props: baseProps({ open: true, onclose }) });
		await settle();

		document.getElementById('inner-btn')!.dispatchEvent(
			new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
		);
		await settle();

		expect(onclose).toHaveBeenCalledTimes(1);
		// `open` is still true: the parent decides (an unsaved-draft guard may refuse).
		expect(dialog()).not.toBeNull();
	});

	// A press is pointerdown on one target, pointerup on another, then a click on
	// their nearest common ancestor.
	function press(down: Element, up: Element, click: Element) {
		down.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		up.dispatchEvent(new Event('pointerup', { bubbles: true }));
		click.dispatchEvent(new MouseEvent('click', { bubbles: true }));
	}

	it('fires onclose on a backdrop press (down and up both on the backdrop)', async () => {
		const onclose = vi.fn();
		render(AppDialog, { props: baseProps({ open: true, onclose }) });
		await settle();

		press(getBackdrop(), getBackdrop(), getBackdrop());
		await settle();
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('does NOT close when a selection starts in the content and is released on the backdrop (BUG-3229)', async () => {
		const onclose = vi.fn();
		render(AppDialog, { props: baseProps({ open: true, onclose }) });
		await settle();

		// The overlay is the content's sibling, so the click lands on their parent.
		press(getDialog(), getBackdrop(), getBackdrop().parentElement!);
		await settle();
		expect(onclose).not.toHaveBeenCalled();
	});

	it('does NOT close when a press starts on the backdrop and is released in the content (BUG-3229)', async () => {
		const onclose = vi.fn();
		render(AppDialog, { props: baseProps({ open: true, onclose }) });
		await settle();

		// bits-ui dismisses on pointerdown outside by default; the adapter must not.
		press(getBackdrop(), getDialog(), getBackdrop().parentElement!);
		await new Promise((r) => setTimeout(r, 30));
		await settle();
		expect(onclose).not.toHaveBeenCalled();
	});

	it('does NOT close on a bare click with no press behind it', async () => {
		const onclose = vi.fn();
		render(AppDialog, { props: baseProps({ open: true, onclose }) });
		await settle();

		getBackdrop().dispatchEvent(new MouseEvent('click', { bubbles: true }));
		await settle();
		expect(onclose).not.toHaveBeenCalled();
	});

	it('does NOT close on a backdrop press when closeOnBackdrop=false', async () => {
		const onclose = vi.fn();
		render(AppDialog, { props: baseProps({ open: true, onclose, closeOnBackdrop: false }) });
		await settle();

		press(getBackdrop(), getBackdrop(), getBackdrop());
		await new Promise((r) => setTimeout(r, 30));
		await settle();
		expect(onclose).not.toHaveBeenCalled();
	});

	it('focuses the [autofocus] element, not the first tabbable one, as showModal() did', async () => {
		const marked = createRawSnippet(() => ({
			render: () =>
				`<div><h2 id="modal-title">Heading</h2><button id="close-x" type="button">x</button><input id="url" autofocus /></div>`
		}));
		render(AppDialog, { props: baseProps({ children: marked }) });
		await settle();
		await new Promise((r) => setTimeout(r, 30));
		expect(document.activeElement).toBe(document.getElementById('url'));
	});

	it('CONTROL: without [autofocus] the same input does not take focus (bits-ui picks the first tabbable, or the content in jsdom)', async () => {
		const plain = createRawSnippet(() => ({
			render: () => `<div><h2 id="modal-title">Heading</h2><button id="close-x" type="button">x</button><input id="url" /></div>`
		}));
		render(AppDialog, { props: baseProps({ children: plain }) });
		await settle();
		await new Promise((r) => setTimeout(r, 30));
		expect(document.activeElement).not.toBe(document.getElementById('url'));
		expect(getDialog().contains(document.activeElement)).toBe(true);
	});

	it('restores focus to the previously-focused element on close', async () => {
		const trigger = document.createElement('button');
		trigger.type = 'button';
		trigger.textContent = 'Open';
		document.body.appendChild(trigger);
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		const { rerender } = render(AppDialog, { props: baseProps({ open: true }) });
		await settle();

		// Focus moves into the dialog while it's open.
		const inner = document.getElementById('inner-btn') as HTMLButtonElement;
		inner.focus();
		expect(document.activeElement).toBe(inner);

		await rerender(baseProps({ open: false }));
		await settle();
		await new Promise((r) => setTimeout(r, 0));

		// Focus returns to whatever was focused before the dialog opened.
		expect(document.activeElement).toBe(trigger);
	});
});
