<!--
	PanelHeader — the top row of the content panel on desktop (SPEC-24 /
	TASK-27), Linear's "Workspace › Issues" header: the breadcrumb on the left,
	text actions on the right (the notification bell and "+ New <item>").

	It belongs to the layout, not to a page: the crumbs come from the route and
	the stores every page already fills (the workspace, the collection, and the
	item ref ItemDetail writes to titleStore), so a page needs no wiring.

	"+ New <item>" is the sidebar's old "+ New Task" button, moved here with its
	gate and its class (`new-item-btn`): it shows on the page of a collection
	the caller may create in, and it opens the sidebar's quick-add on that
	collection, the same request Cmd+N / `c` makes.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { workspaceStore } from '$lib/stores/workspace.svelte';
	import { collectionStore } from '$lib/stores/collections.svelte';
	import { titleStore } from '$lib/stores/title.svelte';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { uiStore } from '$lib/stores/ui.svelte';
	import { getActiveKey, getPrimaryDestinations } from '$lib/nav/destinations';
	import { isAgentCollection } from '$lib/types';
	import { avatarColor, avatarInitial } from '$lib/utils/avatar';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb';
	import { Button } from '$lib/components/ui/button';
	import NotificationPanel from '$lib/components/common/NotificationPanel.svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import { Add01Icon, Notification03Icon } from '@hugeicons/core-free-icons';

	let notificationPanelOpen = $state(false);

	// Only inside a workspace route: the store keeps the last workspace on
	// the shell pages outside one.
	let ws = $derived(page.params.workspace ? workspaceStore.current : null);
	let wsPrefix = $derived(ws?.owner_username && ws.slug ? `/${ws.owner_username}/${ws.slug}` : '');
	let activeKey = $derived(getActiveKey(page.url.pathname, wsPrefix));

	let activeColl = $derived(
		activeKey?.startsWith('collection:')
			? collectionStore.collections.find((c) => c.slug === activeKey!.slice('collection:'.length))
			: undefined
	);

	// The second crumb: the collection, or the page's own name (from the
	// sidebar's destination list, so the two never name a page differently).
	let section = $derived.by((): { label: string; href: string; icon?: string } | null => {
		if (!wsPrefix) return null;
		if (activeColl) return { label: activeColl.name, href: `${wsPrefix}/${activeColl.slug}`, icon: activeColl.icon };
		const key = activeKey ?? (page.url.pathname.startsWith(`${wsPrefix}/settings`) ? 'settings' : null);
		const dest = key ? getPrimaryDestinations(wsPrefix).find((d) => d.key === key) : undefined;
		return dest ? { label: dest.label, href: dest.href } : null;
	});

	// The item on screen (full page or the split pane): ItemDetail writes its
	// ref to the title store, scoped to the route it was set for.
	let itemRef = $derived(titleStore.item);

	let newTarget = $derived(
		activeColl && !isAgentCollection(activeColl) && workspaceStore.canEditCollection(activeColl.id)
			? activeColl
			: null
	);
</script>

<header class="content-panel-header flex h-11 shrink-0 items-center gap-2 border-b border-border pr-3 pl-[19px]">
	{#if ws && wsPrefix}
		<Breadcrumb.Root class="min-w-0">
			<Breadcrumb.List class="flex-nowrap gap-1.5 text-[13px] leading-5 font-medium text-foreground">
				<Breadcrumb.Item class="min-w-0">
					<Breadcrumb.Link href={wsPrefix} class="crumb flex min-w-0 items-center gap-2 text-foreground hover:text-foreground">
						<span
							class="grid size-3.5 shrink-0 place-items-center rounded-[3px] text-[9px] leading-none font-bold text-[#191922]"
							style:background={avatarColor(ws.name)}
							aria-hidden="true">{avatarInitial(ws.name)}</span
						>
						<span class="truncate">{ws.name}</span>
					</Breadcrumb.Link>
				</Breadcrumb.Item>
				{#if section}
					<Breadcrumb.Separator class="text-muted-foreground" />
					<Breadcrumb.Item class="min-w-0">
						{#if itemRef}
							<Breadcrumb.Link href={section.href} class="crumb truncate text-foreground hover:text-foreground">{section.label}</Breadcrumb.Link>
						{:else}
							<Breadcrumb.Page class="truncate font-medium">{section.label}</Breadcrumb.Page>
						{/if}
					</Breadcrumb.Item>
				{/if}
				{#if itemRef}
					<Breadcrumb.Separator class="text-muted-foreground" />
					<Breadcrumb.Item>
						<Breadcrumb.Page class="font-medium whitespace-nowrap">{itemRef}</Breadcrumb.Page>
					</Breadcrumb.Item>
				{/if}
			</Breadcrumb.List>
		</Breadcrumb.Root>
	{/if}

	<div class="ml-auto flex shrink-0 items-center gap-0.5">
		<Button
			variant="ghost"
			size="icon"
			class="bell-btn relative"
			onclick={() => (notificationPanelOpen = !notificationPanelOpen)}
			aria-label="Notification history"
			title="Notification history"
		>
			<Icon icon={Notification03Icon} size={16} />
			{#if toastStore.unreadCount > 0}
				<span
					class="pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] leading-4 font-bold text-white"
					>{toastStore.unreadCount > 9 ? '9+' : toastStore.unreadCount}</span
				>
			{/if}
		</Button>
		{#if newTarget}
			<Button variant="ghost" class="new-item-btn" onclick={() => uiStore.requestQuickAdd(newTarget.slug)}>
				<Icon icon={Add01Icon} size={14} />
				New {newTarget.name.replace(/s$/, '')}
			</Button>
		{/if}
	</div>
</header>

<NotificationPanel visible={notificationPanelOpen} onclose={() => (notificationPanelOpen = false)} />
