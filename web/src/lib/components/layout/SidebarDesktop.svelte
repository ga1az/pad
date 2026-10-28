<!--
	SidebarDesktop — the desktop sidebar's contents, on shadcn-svelte's Sidebar
	(SPEC-24 / TASK-27), laid out like Linear's (measured at 1:1):
	- a 44px top row: the workspace switcher, then Search and a round compose
	  button;
	- 28px rows on a 29px pitch, icon at x=18, label at x=37, 13px, the count
	  right-aligned in gray; the active row filled --ui-sidebar-accent;
	- collapsible sections ("Workspace ▾", "Collections ▾", "Agent ▾") in 12px
	  gray with the caret after the label, about 16px above each;
	- a 35px footer strip of small gray actions, level with the strip below the
	  content panel.
	The sidebar has no fill: it is the app frame (+layout.svelte).

	Sidebar.svelte owns every behaviour (quick-add, the reorder writes, theme,
	version, the collapse) and passes it in; this file is markup. It is a
	separate component so Sidebar.svelte's scoped rules, which still style the
	mobile drawer under the same class names, never reach these rows. The class
	names (`nav-item`, `nav-row`, `nav-section`, `section-header`, `search-btn`,
	`settings-btn`, ...) are kept as hooks: tests and the e2e suite find the
	sidebar by them.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { dndzone } from 'svelte-dnd-action';
	import type { DndEvent } from 'svelte-dnd-action';
	import type { IconSvgElement } from '@hugeicons/svelte';
	import * as Sidebar from '$lib/components/ui/sidebar';
	import { Button } from '$lib/components/ui/button';
	import ResponsiveMenu from '$lib/components/ui-adapters/ResponsiveMenu.svelte';
	import ResponsiveMenuItem from '$lib/components/ui-adapters/ResponsiveMenuItem.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { GITHUB_REPO_URL } from '$lib/brand/links';
	import { modKeyLabel } from '$lib/utils/platform';
	import { avatarColor, avatarInitial } from '$lib/utils/avatar';
	import { workspaceRestoreTarget } from '$lib/utils/workspace-route';
	import type { Collection } from '$lib/types';
	import {
		Add01Icon,
		ArrowDown01Icon,
		ChartLineData01Icon,
		ClipboardIcon,
		DashboardSquare01Icon,
		HierarchySquare01Icon,
		LibraryIcon,
		Moon02Icon,
		PencilEdit02Icon,
		Search01Icon,
		Settings01Icon,
		SidebarLeftIcon,
		StarIcon,
		Sun01Icon,
		Tag01Icon,
		UserGroupIcon
	} from '@hugeicons/core-free-icons';

	interface Props {
		wsPrefix: string;
		isGuest: boolean;
		activeKey: string | null;
		activeCollectionSlug: string | null;
		/** The regular collections, in sidebar order (the drag zone's items). */
		collections: Collection[];
		agentCollections: Collection[];
		dragDisabled: boolean;
		flipDurationMs: number;
		onconsider: (e: CustomEvent<DndEvent<Collection>>) => void;
		onfinalize: (e: CustomEvent<DndEvent<Collection>>) => void;
		canQuickAdd: (c: Collection) => boolean;
		onquickadd: (c: Collection) => void;
		/** Compose: what Cmd+N does. Absent when nothing is creatable. */
		oncompose?: () => void;
		/** "+" on Collections; owner-only (BUG-3261). */
		onnewcollection?: () => void;
		theme: 'dark' | 'light';
		ontoggletheme: () => void;
		versionLabel: string;
	}

	let {
		wsPrefix,
		isGuest,
		activeKey,
		activeCollectionSlug,
		collections,
		agentCollections,
		dragDisabled,
		flipDurationMs,
		onconsider,
		onfinalize,
		canQuickAdd,
		onquickadd,
		oncompose,
		onnewcollection,
		theme,
		ontoggletheme,
		versionLabel
	}: Props = $props();

	type Dest = { key: string; label: string; icon: IconSvgElement };
	// Linear keeps four rows above its first section; the pages Pad visits
	// most stay there and the rest go under "Workspace".
	const primary: Dest[] = [
		{ key: 'dashboard', label: 'Dashboard', icon: DashboardSquare01Icon },
		{ key: 'activity', label: 'Activity', icon: ClipboardIcon },
		{ key: 'starred', label: 'Starred', icon: StarIcon }
	];
	const secondary: Dest[] = [
		{ key: 'insights', label: 'Insights', icon: ChartLineData01Icon },
		{ key: 'graph', label: 'Graph', icon: HierarchySquare01Icon },
		{ key: 'roles', label: 'Roles', icon: UserGroupIcon },
		{ key: 'tags', label: 'Tags', icon: Tag01Icon }
	];
	const destHref = (key: string) => (key === 'dashboard' ? wsPrefix : `${wsPrefix}/${key}`);

	// ── Collapsible sections, remembered per browser ──────────────────────
	const SECTIONS_KEY = 'pad-sidebar-sections';
	let collapsed = $state<Record<string, boolean>>(readCollapsed());
	function readCollapsed(): Record<string, boolean> {
		try {
			const raw = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '{}');
			return raw && typeof raw === 'object' ? raw : {};
		} catch {
			return {};
		}
	}
	function toggleSection(id: string) {
		collapsed = { ...collapsed, [id]: !collapsed[id] };
		try {
			localStorage.setItem(SECTIONS_KEY, JSON.stringify(collapsed));
		} catch {
			// Private mode: the state lasts this page.
		}
	}

	// ── Workspace switcher ────────────────────────────────────────────────
	let switcherOpen = $state(false);
	let switcherEl = $state<HTMLButtonElement | null>(null);
	let ws = $derived(workspaceStore.current);

	// Like WorkspaceSwitcher.select: the current workspace goes to its
	// dashboard, another one to the route it was last on.
	function selectWorkspace(target: { slug: string; owner_username?: string }) {
		switcherOpen = false;
		const current = workspaceStore.current;
		goto(
			current && target.slug === current.slug
				? `/${current.owner_username}/${current.slug}`
				: workspaceRestoreTarget(target)
		);
	}

	function openSearch() {
		uiStore.openSearch();
		uiStore.onNavigate();
	}
</script>

{#snippet caret(open: boolean)}
	<!-- In a span: the label's `[&>svg]:size-4` sizes direct svg children. -->
	<span class="grid size-2 shrink-0 place-items-center transition-transform duration-150 {open ? '' : '-rotate-90'}">
		<svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true"><path d="M1.5 2.5h5L4 5.5z" /></svg>
	</span>
{/snippet}

{#snippet navLink(href: string, label: string, icon: IconSvgElement | string, active: boolean, count?: number | null)}
	<Sidebar.MenuItem>
		<Sidebar.MenuButton isActive={active} class="nav-item">
			{#snippet child({ props })}
				<a
					{href}
					{...props}
					class:active
					aria-current={active ? 'page' : undefined}
					onclick={() => uiStore.onNavigate()}
				>
					<span class="nav-icon grid size-[15px] place-items-center text-muted-foreground"><Icon {icon} size={15} /></span>
					<span class="nav-label">{label}</span>
				</a>
			{/snippet}
		</Sidebar.MenuButton>
		{#if count != null}
			<Sidebar.MenuBadge class="nav-count">{count}</Sidebar.MenuBadge>
		{/if}
	</Sidebar.MenuItem>
{/snippet}

{#snippet sectionHeader(id: string, label: string, extraClass = '', add?: { label: string; onclick: () => void })}
	<div class="section-header {extraClass} relative mt-4 flex items-center">
		<Sidebar.GroupLabel class="h-7 px-0">
			{#snippet child({ props })}
				<button
					{...props}
					type="button"
					class="{props.class} section-toggle gap-1.5 pl-2.5 hover:text-foreground"
					aria-expanded={!collapsed[id]}
					aria-controls="sidebar-section-{id}"
					onclick={() => toggleSection(id)}
				>
					<span class="section-label">{label}</span>
					{@render caret(!collapsed[id])}
				</button>
			{/snippet}
		</Sidebar.GroupLabel>
		{#if add}
			<button
				type="button"
				class="section-add-btn absolute top-1 right-1 grid size-5 place-items-center rounded-sm text-muted-foreground hover:bg-foreground/6 hover:text-foreground"
				title={add.label}
				aria-label={add.label}
				onclick={add.onclick}
			>
				<Icon icon={Add01Icon} size={14} />
			</button>
		{/if}
	</div>
{/snippet}

<Sidebar.Provider open={uiStore.sidebarOpen} class="h-full">
	<Sidebar.Root collapsible="none" class="bg-transparent">
		<Sidebar.Header class="h-11 shrink-0 flex-row items-center gap-0 py-0 pr-[13px] pl-2">
			{#if ws && wsPrefix}
				<button
					type="button"
					class="ws-switcher flex h-7 min-w-0 items-center gap-2 rounded-md px-2 text-[13px] font-semibold text-foreground hover:bg-foreground/4"
					bind:this={switcherEl}
					aria-haspopup="menu"
					aria-expanded={switcherOpen}
					aria-label="Switch workspace ({ws.name})"
					onclick={() => (switcherOpen = !switcherOpen)}
				>
					<span
						class="grid size-4 shrink-0 place-items-center rounded-[4px] text-[10px] leading-none font-bold text-[#191922]"
						style:background={avatarColor(ws.name)}
						aria-hidden="true">{avatarInitial(ws.name)}</span
					>
					<span class="truncate">{ws.name}</span>
					<span class="shrink-0 text-muted-foreground"><Icon icon={ArrowDown01Icon} size={12} /></span>
				</button>
				<ResponsiveMenu
					open={switcherOpen}
					onclose={() => (switcherOpen = false)}
					trigger={switcherEl}
					align="left"
					ariaLabel="Workspaces"
				>
					{#each workspaceStore.workspaces as w (w.slug)}
						<ResponsiveMenuItem checked={w.slug === ws.slug} onclick={() => selectWorkspace(w)}>{w.name}</ResponsiveMenuItem>
					{/each}
					<div class="menu-divider my-1 h-px bg-border" role="separator"></div>
					{#if !isGuest}
						<ResponsiveMenuItem
							href="{wsPrefix}/settings"
							onclick={() => {
								switcherOpen = false;
								uiStore.onNavigate();
							}}>Workspace settings</ResponsiveMenuItem
						>
					{/if}
					<ResponsiveMenuItem
						onclick={() => {
							switcherOpen = false;
							uiStore.onNavigate();
							uiStore.openCreateWorkspace();
						}}>New workspace…</ResponsiveMenuItem
					>
				</ResponsiveMenu>
			{/if}
			<div class="ml-auto flex shrink-0 items-center gap-[5px]">
				<Button
					variant="ghost"
					size="icon"
					class="search-btn rounded-full"
					aria-label="Search"
					title="Search ({modKeyLabel('K')})"
					aria-keyshortcuts="Control+K Meta+K"
					onclick={openSearch}
				>
					<Icon icon={Search01Icon} size={15} />
				</Button>
				{#if oncompose}
					<Button
						variant="icon"
						size="icon"
						class="compose-btn text-foreground"
						aria-label="New item"
						title="New item (C)"
						onclick={oncompose}
					>
						<Icon icon={PencilEdit02Icon} size={15} />
					</Button>
				{/if}
			</div>
		</Sidebar.Header>

		<Sidebar.Content class="pb-3">
			{#if wsPrefix}
				<!--
					`data-membership` says whether the caller's membership has settled
					(BUG-3267); the e2e permission walk waits on it.
				-->
				<nav
					class="collection-nav flex flex-col"
					data-membership={workspaceStore.membershipKnown ? 'known' : 'pending'}
				>
					{#if !isGuest}
						<Sidebar.Group class="px-2 pt-1 pb-0">
							<Sidebar.Menu>
								{#each primary as d (d.key)}
									{@render navLink(destHref(d.key), d.label, d.icon, activeKey === d.key)}
								{/each}
							</Sidebar.Menu>
						</Sidebar.Group>
						<Sidebar.Group class="px-2 py-0">
							{@render sectionHeader('workspace', 'Workspace')}
							{#if !collapsed.workspace}
								<Sidebar.Menu id="sidebar-section-workspace">
									{#each secondary as d (d.key)}
										{@render navLink(destHref(d.key), d.label, d.icon, activeKey === d.key)}
									{/each}
								</Sidebar.Menu>
							{/if}
						</Sidebar.Group>
					{/if}

					{#if collections.length > 0}
						<Sidebar.Group class="px-2 py-0">
							{@render sectionHeader(
								'collections',
								isGuest ? 'Shared with you' : 'Collections',
								'',
								onnewcollection && !isGuest ? { label: 'New collection', onclick: onnewcollection } : undefined
							)}
							{#if !collapsed.collections}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<ul
									id="sidebar-section-collections"
									data-slot="sidebar-menu"
									class="nav-section flex w-full list-none min-w-0 flex-col gap-px"
									use:dndzone={{ items: collections, flipDurationMs, type: 'sidebar-collection', dragDisabled }}
									{onconsider}
									{onfinalize}
								>
									{#each collections as collection (collection.id)}
										{@const quickAdd = canQuickAdd(collection)}
										{@const active = activeCollectionSlug === collection.slug}
										<!-- The link and the quick-add button are siblings in the
										     row (TASK-2237, audit C29); the row is the drag item. -->
										<Sidebar.MenuItem class="nav-row {quickAdd ? 'has-quick-add' : ''}">
											<Sidebar.MenuButton isActive={active} class="nav-item draggable cursor-default">
												{#snippet child({ props })}
													<a
														href="{wsPrefix}/{collection.slug}"
														{...props}
														class:active
														aria-current={active ? 'page' : undefined}
														onclick={() => uiStore.onNavigate()}
													>
														<span class="nav-icon grid size-[15px] place-items-center text-muted-foreground"
															><Icon icon={collection.icon} size={15} /></span
														>
														<span class="nav-label">{collection.name}</span>
													</a>
												{/snippet}
											</Sidebar.MenuButton>
											{#if collection.item_count != null && collection.item_count > 0}
												<Sidebar.MenuBadge class="nav-count {quickAdd ? 'right-7' : ''}"
													>{collection.active_item_count}</Sidebar.MenuBadge
												>
											{/if}
											{#if quickAdd}
												<Sidebar.MenuAction
													class="nav-quick-add"
													title="New {collection.name.replace(/s$/, '')}"
													aria-label="New {collection.name.replace(/s$/, '')}"
													onclick={(e) => {
														e.stopPropagation();
														e.preventDefault();
														onquickadd(collection);
													}}
												>
													<Icon icon={Add01Icon} size={14} />
												</Sidebar.MenuAction>
											{/if}
										</Sidebar.MenuItem>
									{/each}
								</ul>
							{/if}
						</Sidebar.Group>
					{/if}

					{#if agentCollections.length > 0 || !isGuest}
						<Sidebar.Group class="px-2 py-0">
							{@render sectionHeader('agent', 'Agent', 'agent-section')}
							{#if !collapsed.agent}
								<Sidebar.Menu id="sidebar-section-agent">
									{#each agentCollections as collection (collection.id)}
										{@render navLink(
											`${wsPrefix}/${collection.slug}`,
											collection.name,
											collection.icon,
											activeCollectionSlug === collection.slug,
											collection.item_count
										)}
									{/each}
									<!-- The library (TASK-2258, audit C43): every member may
									     browse it; a guest does not get the link. -->
									{#if !isGuest}
										{@render navLink(`${wsPrefix}/library`, 'Library', LibraryIcon, activeKey === 'library')}
									{/if}
								</Sidebar.Menu>
							{/if}
						</Sidebar.Group>
					{/if}
				</nav>
			{/if}
		</Sidebar.Content>

		<!-- The footer strip: Linear's "?" and plan pill, as Pad's shortcuts,
		     settings and the small chrome controls. -->
		<Sidebar.Footer class="sidebar-footer h-[35px] shrink-0 flex-row items-center p-0 pr-2 pl-[7px]">
			<div class="footer-row flex w-full min-w-0 items-center gap-1">
				<button
					type="button"
					class="help-btn grid size-[22px] shrink-0 place-items-center rounded-full border border-foreground/10 text-[11px] font-medium text-muted-foreground hover:text-foreground"
					aria-label="Keyboard shortcuts"
					title="Keyboard shortcuts (?)"
					onclick={() => uiStore.openShortcuts()}>?</button
				>
				{#if wsPrefix && !isGuest}
					<a
						href="{wsPrefix}/settings"
						class="settings-btn inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 px-2 text-xs font-medium whitespace-nowrap text-foreground hover:bg-foreground/4"
						onclick={() => uiStore.onNavigate()}
					>
						<Icon icon={Settings01Icon} size={12} />
						Settings
					</a>
				{/if}
				<span class="version-label ml-1 min-w-0 flex-1 truncate text-[11px] text-subtle-foreground select-text" title={versionLabel}
					>{versionLabel}</span
				>
				<Button
					variant="ghost"
					size="icon-sm"
					class="collapse-sidebar-btn"
					onclick={() => uiStore.closeSidebar()}
					title="Hide sidebar ({modKeyLabel('\\')} hides both bars)"
					aria-label="Hide sidebar"
				>
					<Icon icon={SidebarLeftIcon} size={14} />
				</Button>
				<Button
					variant="ghost"
					size="icon-sm"
					class="theme-btn"
					onclick={ontoggletheme}
					title="{theme === 'dark' ? 'Light' : 'Dark'} mode"
					aria-label="Toggle theme"
				>
					<Icon icon={theme === 'dark' ? Sun01Icon : Moon02Icon} size={14} />
				</Button>
				<!-- THE REPO LINK (IDEA-2711): icon-only, so the accessible name
				     carries the destination; the URL comes from $lib/brand/links. -->
				<Button
					variant="ghost"
					size="icon-sm"
					class="github-btn"
					href={GITHUB_REPO_URL}
					target="_blank"
					rel="noopener noreferrer"
					title="Pad on GitHub"
					aria-label="Pad on GitHub (opens in a new tab)"
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
						<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
					</svg>
				</Button>
			</div>
		</Sidebar.Footer>
	</Sidebar.Root>
</Sidebar.Provider>
