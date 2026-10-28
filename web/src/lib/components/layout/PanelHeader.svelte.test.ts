// Runs in the jsdom vitest project (filename ends `.svelte.test.ts`).
//
// TASK-27: the content panel's header. The crumbs come from the route and the
// stores, and "+ New <item>" is the sidebar's old "+ New Task": the same gate
// (a collection the caller may create in) and the same request Cmd+N makes.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

const ws = vi.hoisted(() => ({ editable: true }));

vi.mock('$lib/stores/workspace.svelte', () => ({
	workspaceStore: {
		current: { slug: 'ws', owner_username: 'u', name: 'Demo', is_guest: false },
		canEditCollection: () => ws.editable,
		membershipKnown: true,
	},
}));
vi.mock('$lib/stores/collections.svelte', async () => await import('./sidebarQuickAdd.fixture.svelte'));

// jsdom has no Web Animations API, and NotificationPanel's transitions call
// element.animate: the NotificationPanel test's stand-in, finishing at once.
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

import { page } from '$app/state';
import PanelHeader from './PanelHeader.svelte';
import { titleStore } from '$lib/stores/title.svelte';
import { uiStore } from '$lib/stores/ui.svelte';

const crumbs = () =>
	[...document.querySelectorAll('[data-slot=breadcrumb-link], [data-slot=breadcrumb-page]')].map((el) => ({
		text: el.textContent?.trim(),
		href: el.getAttribute('href'),
		current: el.getAttribute('aria-current'),
	}));
const newBtn = () => document.querySelector<HTMLButtonElement>('button.new-item-btn');

async function mountAt(path: string) {
	page.url = new URL(`http://localhost${path}`);
	page.params = { username: 'u', workspace: 'ws' };
	render(PanelHeader);
	await tick();
}

beforeEach(() => {
	cleanup();
	ws.editable = true;
	uiStore.clearQuickAddRequest();
	titleStore.clearPageTitle();
});

describe('PanelHeader breadcrumb (TASK-27)', () => {
	it('names the workspace and the collection, the collection as the current page', async () => {
		await mountAt('/u/ws/tasks');
		expect(crumbs()).toEqual([
			{ text: 'D Demo', href: '/u/ws', current: null },
			{ text: 'Tasks', href: null, current: 'page' },
		]);
	});

	it('adds the item ref on an item, and the collection becomes a link', async () => {
		page.url = new URL('http://localhost/u/ws/tasks/TASK-9');
		titleStore.setPageTitle({ item: 'TASK-9' });
		await mountAt('/u/ws/tasks/TASK-9');
		expect(crumbs().slice(1)).toEqual([
			{ text: 'Tasks', href: '/u/ws/tasks', current: null },
			{ text: 'TASK-9', href: null, current: 'page' },
		]);
	});

	it('names a page by the sidebar destination label', async () => {
		await mountAt('/u/ws/insights');
		expect(crumbs()[1]).toEqual({ text: 'Insights', href: null, current: 'page' });
	});

	// Sub-routes and page titles (review of TASK-27): the section links back
	// up, and the page's own title (titleStore.section) is the last crumb.
	async function mountTitled(path: string, section: string | null) {
		page.url = new URL(`http://localhost${path}`);
		page.params = { username: 'u', workspace: 'ws' };
		titleStore.setPageTitle({ section, item: null });
		render(PanelHeader);
		await tick();
	}

	it('on a tag, Tags links back and the tag is the current page', async () => {
		await mountTitled('/u/ws/tags/release', '#release');
		expect(crumbs().slice(1)).toEqual([
			{ text: 'Tags', href: '/u/ws/tags', current: null },
			{ text: '#release', href: null, current: 'page' },
		]);
	});

	it('on the insights report, Insights links back and Report is the current page', async () => {
		await mountTitled('/u/ws/insights/print', 'Report');
		expect(crumbs().slice(1)).toEqual([
			{ text: 'Insights', href: '/u/ws/insights', current: null },
			{ text: 'Report', href: null, current: 'page' },
		]);
	});

	it('a page the sidebar list does not name falls back to its own title', async () => {
		// /conventions whose collection was renamed: no collection matches the slug.
		await mountTitled('/u/ws/conventions', 'Conventions');
		expect(crumbs().slice(1)).toEqual([{ text: 'Conventions', href: null, current: 'page' }]);
	});

	it('a title that repeats the section is not shown twice', async () => {
		await mountTitled('/u/ws/tasks', 'Tasks');
		expect(crumbs().slice(1)).toEqual([{ text: 'Tasks', href: null, current: 'page' }]);
	});

	it('below a collection with no title of its own, the collection still links back', async () => {
		// e.g. /playbooks/<slug>, which sets no title.
		await mountTitled('/u/ws/tasks/sub-page', null);
		expect(crumbs().slice(1)).toEqual([{ text: 'Tasks', href: '/u/ws/tasks', current: null }]);
	});

	it('renders no crumbs outside a workspace route', async () => {
		page.url = new URL('http://localhost/u');
		page.params = { username: 'u' };
		render(PanelHeader);
		await tick();
		expect(crumbs()).toEqual([]);
	});
});

describe('PanelHeader "+ New <item>" (TASK-27, the sidebar\'s old "+ New Task")', () => {
	it('asks for quick-add on the collection on screen', async () => {
		await mountAt('/u/ws/tasks');
		expect(newBtn()?.textContent?.trim()).toBe('New Task');
		await fireEvent.click(newBtn()!);
		expect(uiStore.quickAddRequested).toBe(true);
		expect(uiStore.quickAddTargetSlug).toBe('tasks');
	});

	it('is absent on a collection the caller may not create in (BUG-3258)', async () => {
		ws.editable = false;
		await mountAt('/u/ws/tasks');
		expect(newBtn()).toBeNull();
	});

	it('is absent off a collection page', async () => {
		await mountAt('/u/ws');
		expect(newBtn()).toBeNull();
	});
});

describe('PanelHeader bell', () => {
	it('opens the notification history', async () => {
		await mountAt('/u/ws/tasks');
		const bell = document.querySelector<HTMLButtonElement>('button.bell-btn')!;
		expect(bell.getAttribute('aria-label')).toBe('Notification history');
		await fireEvent.click(bell);
		await tick();
		expect(document.querySelector('[role=dialog]')?.textContent).toContain('Notifications');
	});
});

describe('PanelHeader while the notification panel covers the page (TASK-3520)', () => {
	it('inerts the header but not the panel it holds', async () => {
		await mountAt('/u/ws/tasks');
		const bell = document.querySelector<HTMLButtonElement>('button.bell-btn')!;
		expect(document.querySelector('header.content-panel-header')!.hasAttribute('inert') || (document.querySelector('header.content-panel-header') as HTMLElement & { inert?: boolean }).inert).toBeFalsy();
		await fireEvent.click(bell);
		await tick();
		const panel = document.querySelector('[role="dialog"][aria-label="Notifications"], [role="dialog"]')!;
		expect(panel, 'the panel opened').not.toBeNull();
		// jsdom has no `inert` reflection: Svelte's property write is the evidence.
		await waitFor(() => expect((document.querySelector('header.content-panel-header') as HTMLElement & { inert?: boolean }).inert).toBe(true));
		expect(panel.closest('[inert]'), 'the panel is not inside an inert region').toBeNull();
	});
});
