// TASK-2202 — the toast live region exists before any toast does, errors are
// announced assertively, hover and focus hold a toast, and a link toast
// answers Space as well as Enter (but not keys pressed on its own buttons).
//
// Migrated from common/ToastContainer (TASK-26): the toasts now render in
// shadcn-svelte's Sonner, which has ONE always-mounted live region (polite)
// and marks each toast item with its own politeness; an error is `important`,
// so its item is aria-live="assertive". The assertions follow that model.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';

const nav = vi.hoisted(() => ({ goto: [] as string[] }));
vi.mock('$app/navigation', () => ({
	goto: vi.fn(async (url: string) => {
		nav.goto.push(url);
	})
}));

import AppToaster from './AppToaster.svelte';
import { toastStore } from '$lib/stores/toast.svelte';

// Sonner's region, always mounted, and the list item that holds each toast.
const region = (c: HTMLElement) => c.querySelector('[data-toast-region="polite"]') as HTMLElement | null;
const itemOf = (c: HTMLElement, text: string) =>
	[...c.querySelectorAll<HTMLElement>('[data-sonner-toast]')].find((li) => li.textContent?.includes(text)) ?? null;

// jsdom has no Web Animations API, which Svelte's fly/fade transitions use.
// A stand-in that finishes at once: these tests are about announcements and
// timers, not motion.
if (!('animate' in Element.prototype)) {
	(Element.prototype as unknown as { animate: unknown }).animate = function () {
		const animation = {
			onfinish: null as null | (() => void),
			cancel() {},
			finish() {},
			currentTime: 0,
			addEventListener() {},
			finished: Promise.resolve()
		};
		queueMicrotask(() => animation.onfinish?.());
		return animation;
	};
}

beforeEach(() => {
	nav.goto.length = 0;
	toastStore.clearAll();
});
afterEach(() => {
	cleanup();
	toastStore.clearAll();
	vi.useRealTimers();
});

describe('AppToaster announcements (TASK-2202)', () => {
	it('the live region is mounted and empty before any toast exists', () => {
		const { container } = render(AppToaster);
		const r = region(container);
		expect(r, 'the region exists with no toasts').not.toBeNull();
		expect(r!.getAttribute('aria-live')).toBe('polite');
		expect(r!.textContent?.trim()).toBe('');
	});

	it('an error is announced assertively, a success politely, each once', async () => {
		const { container } = render(AppToaster);
		const before = region(container);
		toastStore.show('Saved', 'success');
		await tick();
		toastStore.show('Could not save', 'error');
		await tick();
		flushSync();
		expect(before!.textContent).toContain('Saved');
		expect(before!.textContent).toContain('Could not save');
		expect(itemOf(container, 'Saved')!.getAttribute('aria-live')).toBe('polite');
		expect(itemOf(container, 'Could not save')!.getAttribute('aria-live')).toBe('assertive');
		// The SAME region element: content was added to a region that already
		// existed, which is what screen readers announce.
		expect(region(container)).toBe(before);
		// The toast itself sits in the region, once: no hidden copy of the
		// text that a screen reader (or a test) would find twice.
		expect(itemOf(container, 'Could not save')!.querySelector('.toast-error')).not.toBeNull();
		expect(itemOf(container, 'Saved')!.querySelector('.toast-error')).toBeNull();
		expect(container.textContent!.split('Could not save').length - 1).toBe(1);
	});

	it('the same text twice in a row is a new node, so it is read again', async () => {
		const { container } = render(AppToaster);
		const first = toastStore.show('Saved', 'success');
		await tick();
		const second = toastStore.show('Saved', 'success');
		await tick();
		flushSync();
		// By id: Sonner's toast list is module-global, so an earlier case's
		// dismissed toasts may still be leaving the DOM.
		const nodes = [first, second].map((id) => region(container)!.querySelector(`.toast[data-toast-id="${id}"]`));
		expect(first).not.toBe(second);
		expect(nodes[0]).not.toBeNull();
		expect(nodes[1]).not.toBeNull();
		expect(nodes[0]).not.toBe(nodes[1]);
	});

	it('a toast the store drops leaves Sonner, and one dismissed in Sonner leaves the store', async () => {
		const { container } = render(AppToaster);
		const a = toastStore.show('First', 'info');
		const b = toastStore.show('Second', 'info');
		await tick();
		flushSync();
		toastStore.dismiss(a);
		await tick();
		flushSync();
		expect(itemOf(container, 'First')?.dataset.removed, 'the dropped toast leaves').toBe('true');
		// The store keeps the other one, and a store-driven grouped update
		// rewrites the same node in place.
		const live = toastStore.toasts.find((t) => t.id === b)!;
		live.message = 'Second, updated';
		await tick();
		flushSync();
		expect(container.querySelector(`[data-toast-id="${b}"]`)?.textContent).toContain('Second, updated');
	});
});

describe('AppToaster hold and keys (TASK-2202)', () => {
	it('hovering a toast holds it past its duration; leaving lets it go', async () => {
		vi.useFakeTimers();
		const { container } = render(AppToaster);
		const id = toastStore.show('Saved', 'success', 3000);
		flushSync();
		const el = container.querySelector(`[data-toast-id="${id}"]`) as HTMLElement;
		await fireEvent.mouseEnter(el);
		vi.advanceTimersByTime(10_000);
		expect(toastStore.toasts.some((t) => t.id === id)).toBe(true);
		await fireEvent.mouseLeave(el);
		vi.advanceTimersByTime(3000);
		expect(toastStore.toasts.some((t) => t.id === id)).toBe(false);
	});

	it('focus inside a toast holds it, and moving focus between its own buttons keeps the hold', async () => {
		vi.useFakeTimers();
		const { container } = render(AppToaster);
		const id = toastStore.show('Archived', 'success', 3000, undefined, { label: 'Undo', onAction: () => {} });
		flushSync();
		const el = container.querySelector(`[data-toast-id="${id}"]`) as HTMLElement;
		const undo = el.querySelector('.toast-action') as HTMLElement;
		const dismiss = el.querySelector('.toast-dismiss') as HTMLElement;
		await fireEvent.focusIn(undo, { relatedTarget: null });
		await fireEvent.focusOut(undo, { relatedTarget: dismiss });
		await fireEvent.focusIn(dismiss, { relatedTarget: undo });
		vi.advanceTimersByTime(10_000);
		expect(toastStore.toasts.some((t) => t.id === id), 'held while focus stays inside').toBe(true);
		await fireEvent.focusOut(dismiss, { relatedTarget: null });
		vi.advanceTimersByTime(3000);
		expect(toastStore.toasts.some((t) => t.id === id)).toBe(false);
	});

	it('a link toast navigates on Space as well as Enter', async () => {
		const { container } = render(AppToaster);
		const id = toastStore.show('Open it', 'info', 3000, '/somewhere');
		flushSync();
		const el = container.querySelector(`[data-toast-id="${id}"]`) as HTMLElement;
		await fireEvent.keyDown(el, { key: ' ' });
		expect(nav.goto).toEqual(['/somewhere']);
	});

	it('Enter on the Dismiss button dismisses without navigating', async () => {
		const { container } = render(AppToaster);
		const id = toastStore.show('Open it', 'info', 3000, '/somewhere');
		flushSync();
		const dismiss = container.querySelector(`[data-toast-id="${id}"] .toast-dismiss`) as HTMLElement;
		await fireEvent.keyDown(dismiss, { key: 'Enter' });
		expect(nav.goto).toEqual([]);
	});
});
