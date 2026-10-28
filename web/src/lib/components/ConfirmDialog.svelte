<script lang="ts">
	// The general confirmation dialog (TASK-2221, audit C39), driven by the
	// confirmDialog store and mounted once in the root layout, beside
	// OpenChildrenDialog and PendingEditsDialog. It replaces native confirm():
	// the native dialog blocks the page, cannot be styled, and is a different
	// pattern from every other confirmation in the app.
	//
	// shadcn-svelte's Alert Dialog since TASK-26. The store stays the single
	// source of truth: Escape and a full press on the backdrop both answer
	// "no" (as the Modal it replaced did), and the dialog closes when the
	// store clears `active`. Cancel takes the initial focus (bits-ui would
	// focus the dialog itself), so Enter-on-arrival never confirms.
	import { confirmDialog } from '$lib/stores/confirmDialog.svelte';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';

	let active = $derived(confirmDialog.active);
	let cancelEl = $state<HTMLElement | null>(null);
</script>

<!-- Mounted only while a question is open: see the same gate in AppDialog. -->
{#if active}
<AlertDialog.Root
	bind:open={
		() => !!active,
		(next) => {
			if (!next) confirmDialog.cancel();
		}
	}
>
	<AlertDialog.Content
		onBackdropDismiss={() => confirmDialog.cancel()}
		onOpenAutoFocus={(e) => {
			e.preventDefault();
			cancelEl?.focus();
		}}
	>
		<AlertDialog.Header>
			<AlertDialog.Title>{active.title}</AlertDialog.Title>
			<AlertDialog.Description>{active.message}</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel variant="ghost" bind:ref={cancelEl}>{active.cancelLabel ?? 'Cancel'}</AlertDialog.Cancel>
			<AlertDialog.Action
				variant={active.danger ? 'destructive-solid' : 'default'}
				onclick={() => confirmDialog.confirm()}
			>
				{active.confirmLabel}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
{/if}
