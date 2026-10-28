<!--
  AppDialog — the app's modal dialog, rendered by shadcn-svelte's Dialog
  (bits-ui) (SPEC-24 / TASK-26). It replaces common/Modal, which drove a
  native <dialog> through showModal().

  Why an adapter rather than <Dialog.Root>/<Dialog.Content> at every call
  site: the app's dialogs share a contract the stock component does not
  carry, and it belongs in one place.

  - `open` is the single source of truth, owned by the parent. A request to
    close (Escape, a backdrop press) calls `onclose()`; the dialog closes only
    when the parent flips `open`. A parent that refuses (an unsaved-draft
    guard asking first) keeps it open. Done with a function binding, so
    bits-ui never holds an open state of its own.
  - The backdrop dismisses only on a press that goes down AND up on it
    (BUG-3229), never on bits-ui's pointerdown-outside, so a selection
    dragged out of the content does not close it. `closeOnBackdrop={false}`
    turns it off (a dialog mid-submit).
  - Everything mounts only while open, so consumers keep their fresh-on-open
    reset. Focus is trapped while open and returns, on close, to what had it
    when the dialog opened (bits-ui's FocusScope).
  - Consumers own their header/body/footer markup; the surface (padding 0,
    a flex column that clips, 85vh cap) is theirs to fill. `labelledby` names
    the heading inside it, or `ariaLabel` when there is none.

  The content carries role="dialog", which is what the route Escape drivers
  (hasForeignEscapeOwner) and pane focus guards already look for. Popovers
  that must stay inside it portal into [data-slot="dialog-content"]
  (portalAction, EmojiPickerButton).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { cn } from '$lib/utils';

	interface Props {
		/** Whether the dialog is shown. Drive it from parent state. */
		open: boolean;
		/** Escape or a backdrop press asks to close; the parent flips `open`. */
		onclose: () => void;
		/** id of the heading inside `children`, for aria-labelledby. */
		labelledby?: string;
		/** Accessible name when there is no visible heading. */
		ariaLabel?: string;
		/** Dismiss on a backdrop press. Default true. */
		closeOnBackdrop?: boolean;
		/** Max width of the box (any CSS length). Default 480px. */
		maxWidth?: string;
		/** 'top' sits ~10vh from the top (most of the app's dialogs); 'center' centers it. */
		placement?: 'top' | 'center';
		/** Extra class(es) on the content element. */
		class?: string;
		children: Snippet;
	}

	let {
		open,
		onclose,
		labelledby,
		ariaLabel,
		closeOnBackdrop = true,
		maxWidth = '480px',
		placement = 'top',
		class: klass = '',
		children
	}: Props = $props();
</script>

<!--
	Mounted only while open. bits-ui's Presence reads `open` when it is
	constructed and ignores the first change after that, so a dialog whose
	`open` turned true in the same flush as its mount (a store request right
	after mount, a modal opened from a URL on load) would never show. Gating
	the root also closes instantly, as the native <dialog> did.
-->
{#if open}
<Dialog.Root
	bind:open={
		() => open,
		(next) => {
			if (!next) onclose();
		}
	}
>
	<Dialog.Content
		showCloseButton={false}
		interactOutsideBehavior="ignore"
		onBackdropDismiss={closeOnBackdrop ? onclose : undefined}
		aria-labelledby={labelledby}
		aria-label={ariaLabel}
		data-placement={placement}
		style="width: min({maxWidth}, calc(100vw - 32px)); max-width: {maxWidth};"
		class={cn(
			'app-dialog flex flex-col gap-0 overflow-hidden p-0 sm:max-w-none',
			placement === 'top' && 'mt-[10vh] mb-auto max-sm:mt-4',
			klass
		)}
	>
		{@render children()}
	</Dialog.Content>
</Dialog.Root>
{/if}
