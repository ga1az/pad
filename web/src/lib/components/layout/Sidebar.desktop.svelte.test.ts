// Runs in the jsdom vitest project (filename ends `.svelte.test.ts`).
//
// TASK-27: the desktop sidebar (SidebarDesktop, through Sidebar). Its top row
// keeps Search and adds compose, which makes the request Cmd+N makes; its
// sections collapse and remember it; the workspace switcher navigates like
// WorkspaceSwitcher does.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

vi.mock('$lib/api/client', () => ({
	api: {
		health: vi.fn(async () => ({ version: 'dev', commit: 'abcdef0' })),
		collections: { list: vi.fn(async () => []), update: vi.fn() },
		items: { create: vi.fn() },
	},
	isPlanLimitError: () => false,
	planLimitMessage: () => '',
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), afterNavigate: vi.fn(), beforeNavigate: vi.fn() }));
vi.mock('$lib/stores/workspace.svelte', () => ({
	workspaceStore: {
		current: { slug: 'ws', owner_username: 'u', name: 'Demo', is_guest: false },
		workspaces: [
			{ slug: 'ws', owner_username: 'u', name: 'Demo' },
			{ slug: 'kept', owner_username: 'u', name: 'Kept' },
			{ slug: 'other', owner_username: 'u', name: 'Other' },
		],
		canEditCollection: () => true,
		isOwner: true,
		membershipKnown: true,
	},
}));
vi.mock('$lib/stores/collections.svelte', async () => await import('./sidebarQuickAdd.fixture.svelte'));
const tabs = vi.hoisted(() => ({ open: vi.fn(async () => {}), order: [] as string[] }));
vi.mock('$lib/stores/tabs.svelte', () => ({
	tabsStore: {
		// The open set: 'ws' and 'kept'; 'other' is not open.
		tabs: [
			{ slug: 'ws', owner_username: 'u', name: 'Demo' },
			{ slug: 'kept', owner_username: 'u', name: 'Kept' },
		],
		open: tabs.open,
		routeFor: () => null,
	},
}));

import Sidebar from './Sidebar.svelte';
import { goto } from '$app/navigation';
import { uiStore } from '$lib/stores/ui.svelte';

async function settle() {
	for (let i = 0; i < 4; i++) await tick();
}

const toggle = (id: string) =>
	document.querySelector<HTMLButtonElement>(`button[aria-controls="sidebar-section-${id}"]`)!;

beforeEach(() => {
	cleanup();
	uiStore.openSidebar();
	uiStore.closeSearch();
	uiStore.clearQuickAddRequest();
	vi.mocked(goto).mockReset();
	tabs.open.mockReset();
	tabs.order.length = 0;
	tabs.open.mockImplementation(async () => {
		tabs.order.push('open');
	});
	vi.mocked(goto).mockImplementation(async () => {
		tabs.order.push('goto');
	});
});

describe('desktop sidebar (TASK-27)', () => {
	it('renders the desktop markup, not the mobile drawer', async () => {
		render(Sidebar);
		await settle();
		expect(document.querySelector('aside.sidebar.mobile')).toBeNull();
		expect(document.querySelector('[data-slot=sidebar]')).not.toBeNull();
		expect(document.querySelector('.nav-section a.nav-item .nav-label')?.textContent).toBe('Tasks');
	});

	it('Search opens the palette', async () => {
		render(Sidebar);
		await settle();
		await fireEvent.click(document.querySelector<HTMLButtonElement>('.sidebar button.search-btn')!);
		expect(uiStore.searchOpen).toBe(true);
	});

	it('compose opens quick-add, the way Cmd+N does', async () => {
		render(Sidebar);
		await settle();
		const compose = document.querySelector<HTMLButtonElement>('button.compose-btn')!;
		expect(compose.getAttribute('aria-label')).toBe('New item');
		await fireEvent.click(compose);
		await settle();
		expect(document.querySelector('.quick-add-modal')).not.toBeNull();
	});

	it('a section collapses, says so, and stays collapsed on the next mount', async () => {
		render(Sidebar);
		await settle();
		expect(toggle('collections').getAttribute('aria-expanded')).toBe('true');
		await fireEvent.click(toggle('collections'));
		expect(toggle('collections').getAttribute('aria-expanded')).toBe('false');
		expect(document.querySelector('#sidebar-section-collections')).toBeNull();

		cleanup();
		render(Sidebar);
		await settle();
		expect(toggle('collections').getAttribute('aria-expanded')).toBe('false');
		await fireEvent.click(toggle('collections'));
		expect(document.querySelector('#sidebar-section-collections .nav-label')?.textContent).toBe('Tasks');
	});

	async function pick(name: string) {
		render(Sidebar);
		await settle();
		await fireEvent.click(document.querySelector<HTMLButtonElement>('button.ws-switcher')!);
		await settle();
		const row = [...document.querySelectorAll<HTMLElement>('[role^=menuitem]')].find(
			(el) => el.textContent?.trim() === name
		);
		expect(row, `${name} is not in the switcher`).toBeDefined();
		await fireEvent.click(row!);
		await settle();
	}

	it('a workspace outside the open set is opened as a kept tab, then shown', async () => {
		// Like WorkspaceSwitcher.selectOther and WorkspaceDiscovery: without
		// the open it would land as an ephemeral tab.
		await pick('Other');
		expect(tabs.open).toHaveBeenCalledWith('other', false);
		expect(goto).toHaveBeenCalledWith('/u/other');
		expect(tabs.order).toEqual(['open', 'goto']);
	});

	it('an open tab is shown without opening it again', async () => {
		await pick('Kept');
		expect(tabs.open).not.toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/u/kept');
	});

	it('the current workspace goes to its dashboard', async () => {
		await pick('Demo');
		expect(tabs.open).not.toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/u/ws');
	});
});
