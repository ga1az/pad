// Runs in the jsdom vitest project (filename ends `.svelte.test.ts`).
//
// TASK-27: the sidebar's own NotificationPanel belongs to the mobile drawer's
// bell (on desktop the bell is PanelHeader's). Opened on mobile, it must close
// when the window crosses to desktop, where its trigger is gone, rather than
// stay up holding coveredPage. A controllable matchMedia stub, installed
// before any import (breakpoint.svelte.ts reads it at module load), lets the
// test cross the breakpoint.
import { describe, it, expect, vi, afterAll } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick, flushSync } from 'svelte';

const mq = vi.hoisted(() => {
	const listeners = new Set<(e: { matches: boolean }) => void>();
	const state = { matches: true };
	const real = (globalThis as unknown as { matchMedia: unknown }).matchMedia;
	(globalThis as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({
		get matches() {
			return state.matches;
		},
		media: query,
		onchange: null,
		addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.add(fn),
		removeEventListener: (_: string, fn: (e: { matches: boolean }) => void) => listeners.delete(fn),
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	});
	return {
		real,
		cross(matches: boolean) {
			state.matches = matches;
			for (const fn of listeners) fn({ matches });
		},
	};
});

afterAll(() => {
	(globalThis as unknown as { matchMedia: unknown }).matchMedia = mq.real;
});

// jsdom has no Web Animations API (NotificationPanel's transitions).
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

vi.mock('$lib/api/client', () => ({
	api: {
		health: vi.fn(async () => ({ version: 'dev', commit: 'abcdef0' })),
		collections: { list: vi.fn(async () => []), update: vi.fn() },
	},
	isPlanLimitError: () => false,
	planLimitMessage: () => '',
}));

import Sidebar from './Sidebar.svelte';
import { uiStore } from '$lib/stores/ui.svelte';
import { coveredPage } from '$lib/stores/coveredPage.svelte';

const panel = () => document.querySelector('[role=dialog]');

async function settle() {
	for (let i = 0; i < 4; i++) await tick();
	flushSync();
}

describe('Sidebar notification panel across the breakpoint (TASK-27)', () => {
	it('opened from the drawer, it closes on crossing to desktop and stays closed', async () => {
		expect(uiStore.isMobile).toBe(true);
		uiStore.openSidebar();
		render(Sidebar);
		await settle();

		await fireEvent.click(document.querySelector<HTMLButtonElement>('aside.sidebar.mobile button.bell-btn')!);
		await settle();
		expect(panel()?.textContent).toContain('Notifications');
		expect(coveredPage.active).toBe(true);

		mq.cross(false);
		await settle();
		expect(uiStore.isMobile).toBe(false);
		expect(panel(), 'the panel outlived its trigger').toBeNull();
		expect(coveredPage.active, 'coveredPage is still held').toBe(false);

		mq.cross(true);
		await settle();
		expect(panel(), 'the panel came back on returning to mobile').toBeNull();
		cleanup();
	});
});
