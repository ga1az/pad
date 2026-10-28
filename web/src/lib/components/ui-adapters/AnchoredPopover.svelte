<!--
  AnchoredPopover — a popover the consumer's own element opens (SPEC-24 /
  TASK-30). It is shadcn-svelte's Popover (bits-ui) with the app behaviour the
  pickers (StatusPicker, EmojiPicker) share and the stock component does not
  carry. The mobile pickers are BottomSheets and do not come through here.

  - Controlled: the parent owns `open` and `onclose`; bits-ui never holds an
    open state of its own (function binding). Mounted only while open, because
    bits-ui's Presence ignores the first change of `open` after it is
    constructed (see AppDialog).
  - No Trigger component: the consumer passes its own `trigger` element. It
    anchors the panel and is exempt from outside presses, so its own click can
    toggle the popover shut. Outside presses close without moving focus;
    Escape and a choice (`close(true)` from the consumer's snippet) return
    focus to the trigger.
  - The first field in the panel takes focus on open, which is the search
    input of the Command inside it.
  - Escape: with focus in the panel, the panel's own keydown; with focus
    elsewhere, bits-ui's escape layer and the escape stack, so one press
    closes the popover and not the dialog or pane under it (as
    ResponsiveMenu does).
  - Inside an app dialog the panel portals into the dialog's content, so the
    dialog's focus trap and outside-press rule treat it as part of the dialog;
    the dialog's own clipping is lifted while the panel is open.
  - A plain key stops at the panel, so no single-key page hotkey on
    <svelte:window> fires from inside the portaled panel (BUG-2610). Tab and
    modifier chords (Cmd+K) pass.
-->
<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { pushEscapeHandler, ESCAPE_PRIORITY } from '$lib/stores/escapeStack';
	import { cn } from '$lib/utils';
	import { DIALOG_HOST_SELECTOR } from '$lib/utils/portalAction';

	interface Props {
		open: boolean;
		onclose: () => void;
		/** The element that opens the popover: the anchor, and where focus returns. */
		trigger?: HTMLElement | null;
		/** The panel width in px. */
		width?: number;
		ariaLabel?: string;
		class?: string;
		/** `close(true)` closes and returns focus to the trigger. */
		children: Snippet<[{ close: (refocus?: boolean) => void }]>;
	}

	let { open, onclose, trigger, width = 240, ariaLabel, class: className, children }: Props = $props();

	// Focus goes back once the panel is gone: while it is mounted, its focus
	// trap takes focus straight back from the trigger.
	function close(refocus = false) {
		onclose();
		if (refocus) tick().then(() => trigger?.focus());
	}

	// Focus elsewhere: bits-ui's escape layer and the escape stack. The stack
	// handler consumes the key even when the layer already closed the popover
	// in this dispatch (`open` is false by then; its entry goes on the next flush).
	$effect(() => {
		if (!open) return;
		return pushEscapeHandler(() => {
			if (open) close(true);
			return true;
		}, ESCAPE_PRIORITY.menu);
	});

	function onEscapeKeydown(e: KeyboardEvent) {
		e.preventDefault();
		close(true);
	}

	// Inside an app dialog the panel portals into the dialog's content.
	const portalTarget = $derived(trigger?.closest<HTMLElement>(DIALOG_HOST_SELECTOR) ?? undefined);

	// A dialog's content scrolls (overflow: auto), which would clip the panel
	// at the dialog's edge: let it overflow while the popover is open (as
	// EmojiPickerButton's old dropdown did).
	$effect(() => {
		const host = open ? portalTarget : undefined;
		if (!host) return;
		const prev = host.style.overflow;
		host.style.overflow = 'visible';
		return () => {
			host.style.overflow = prev;
		};
	});

	function onInteractOutside(e: PointerEvent) {
		if (e.target instanceof Node && trigger?.contains(e.target)) e.preventDefault();
	}

	function onPanelKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			close(true);
		}
	}

	let panelEl = $state<HTMLElement | null>(null);

	function focusField(e: Event) {
		e.preventDefault();
		// The ref is bound after the focus scope mounts.
		tick().then(() => (panelEl?.querySelector<HTMLElement>('input') ?? panelEl)?.focus());
	}
</script>

{#if open}
	<Popover.Root
		bind:open={
			() => open,
			(next) => {
				if (!next) onclose();
			}
		}
	>
		<Popover.Content
			bind:ref={panelEl}
			customAnchor={trigger ?? null}
			side="bottom"
			align="start"
			sideOffset={6}
			preventScroll={false}
			escapeKeydownBehavior="close"
			{onEscapeKeydown}
			portalProps={{ to: portalTarget }}
			onOpenAutoFocus={focusField}
			onCloseAutoFocus={(e) => e.preventDefault()}
			{onInteractOutside}
			role="dialog"
			aria-label={ariaLabel}
			style="width: {width}px"
			class={cn('max-h-[min(340px,var(--bits-popover-content-available-height))]', className)}
		>
			<!-- display:contents, so the consumer's flex column fills the panel. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="contents" onkeydown={onPanelKeydown}>
				{@render children({ close })}
			</div>
		</Popover.Content>
	</Popover.Root>
{/if}
