<!--
  AppToaster — the app's toasts, rendered by shadcn-svelte's Sonner
  (svelte-sonner) (SPEC-24 / TASK-26). It replaces common/ToastContainer.

  The toastStore stays the single source of truth and keeps everything it
  did: durations (errors and actionable toasts linger), the hover/focus hold,
  burst grouping (a grouped toast updates in place), the history tray and
  the unread count. This component only MIRRORS the store into Sonner: each
  live store toast becomes one Sonner toast with the same id and no timer of
  its own (duration Infinity), whose body is AppToast; a toast the store
  drops is dismissed from Sonner; a toast swiped away in Sonner is dismissed
  from the store. Sonner brings the stacking, motion and swipe.

  ANNOUNCEMENT (TASK-2202), in Sonner's model: its list region is mounted for
  the page's whole life (polite, empty until a toast arrives), every toast is
  its own node (the same text twice is read twice), and an ERROR is marked
  `important`, which Sonner announces assertively. The text lives once, in
  the toast. `expand` keeps every toast on screen, as the old column did.
-->
<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { toast as sonner } from 'svelte-sonner';
	import { Toaster } from '$lib/components/ui/sonner';
	import { toastStore } from '$lib/stores/toast.svelte';
	import AppToast from './AppToast.svelte';

	let host = $state<HTMLElement | null>(null);
	// Ids mirrored into Sonner. Plain closure state, never read reactively.
	const shown = new Set<string>();

	$effect(() => {
		const live = [...toastStore.toasts];
		untrack(() => {
			const ids = new Set(live.map((t) => t.id));
			for (const t of live) {
				if (shown.has(t.id)) continue;
				shown.add(t.id);
				const id = t.id;
				sonner.custom(AppToast, {
					id,
					duration: Number.POSITIVE_INFINITY,
					important: t.type === 'error',
					componentProps: { toast: t },
					onDismiss: () => {
						shown.delete(id);
						toastStore.dismiss(id);
					}
				});
			}
			for (const id of [...shown]) {
				if (ids.has(id)) continue;
				shown.delete(id);
				sonner.dismiss(id);
			}
		});
	});

	onDestroy(() => {
		for (const id of shown) sonner.dismiss(id);
		shown.clear();
	});

	// A stable hook on Sonner's always-mounted region, for tests and e2e.
	onMount(() => {
		host?.querySelector('section[aria-live]')?.setAttribute('data-toast-region', 'polite');
	});
</script>

<div bind:this={host} class="contents">
	<Toaster
		class="toast-container"
		position="bottom-right"
		expand
		visibleToasts={5}
		gap={8}
		offset={20}
		mobileOffset={12}
		closeButton={false}
	/>
</div>
