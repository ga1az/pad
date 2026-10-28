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
    toggle the popover shut. Focus is not trapped (as ResponsiveMenu), so a
    press on another field or chip leaves focus THERE: an outside press closes
    without moving focus. Focus returns to the trigger only on Escape, Tab, a
    choice (`close(true)` from the consumer's snippet) and a press on the
    trigger itself.
  - The first field in the panel takes focus on open, which is the search
    input of the Command inside it.
  - Escape, two ways in, one popover closed:
    - focus in the panel: the panel's own keydown;
    - focus elsewhere: bits-ui's escape layer. The popover is the topmost
      layer, so a dialog under it does not close.
    There is NO escape-stack entry, unlike ResponsiveMenu's: the panel is a
    `role="dialog"`, so the route Escape drivers stand down while it is open
    (hasForeignEscapeOwner; a focused search field is a text-entry target
    they skip anyway) and never call runTopEscape, so an entry could not run.
    The layer is the only path that sees the key, and the item pane under the
    popover stays open (e2e: task-30-r2-picker-focus).
  - The popover closes when its anchor scrolls out of the container that
    clips it (a card out of its lane), as the menus did on a scroll
    (BUG-2610), and on resize. An anchor still partly in sight keeps it.
  - Inside an app dialog the panel portals into the dialog's content, so the
    dialog's focus trap and outside-press rule treat it as part of the dialog;
    the dialog's own clipping is lifted while the panel is open.
  - A plain key stops at the panel, so no single-key page hotkey on
    <svelte:window> fires from inside the portaled panel (BUG-2610). Modifier
    chords (Cmd+K) pass; Tab closes and continues from the trigger.
-->
<script lang="ts">
	import { tick, type Snippet } from 'svelte';
	import * as Popover from '$lib/components/ui/popover';
	import { cn } from '$lib/utils';
	import { DIALOG_HOST_SELECTOR } from '$lib/utils/portalAction';
	import { isAnchorClipped } from '$lib/utils/anchorClip';

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

	// Focus goes back once the panel is gone, and only when the close was the
	// keyboard's or a choice: an outside press must leave focus where it landed.
	function close(refocus = false) {
		onclose();
		if (refocus) tick().then(() => trigger?.focus());
	}

	// Focus elsewhere: bits-ui's escape layer calls this. There is deliberately
	// no escape-stack entry (see the header): it could never run.
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

	// The anchor scrolling out of its clipping container, or a resize. The
	// capture listener sees every scroller; only one that holds the trigger
	// (or the document) can have moved it. onclose() and not close(true):
	// refocusing the trigger would scroll it back and fight the user.
	$effect(() => {
		if (!open || !trigger) return;
		const anchor = trigger;
		const check = (e?: Event) => {
			if (e?.type === 'scroll' && e.target instanceof Node && e.target !== document && !e.target.contains(anchor)) return;
			if (isAnchorClipped(anchor)) onclose();
		};
		window.addEventListener('scroll', check, { capture: true, passive: true });
		window.addEventListener('resize', check, { passive: true });
		return () => {
			window.removeEventListener('scroll', check, { capture: true });
			window.removeEventListener('resize', check);
		};
	});

	// The trigger's own press toggles the popover (its onclick); it is exempt
	// so the dismissal does not close it first. Focus goes to it explicitly:
	// Safari does not focus a button on click.
	function onInteractOutside(e: PointerEvent) {
		if (e.target instanceof Node && trigger?.contains(e.target)) {
			e.preventDefault();
			trigger.focus();
		}
	}

	// Focus leaving the panel (a Tab, a click on a field) is not a dismissal;
	// an outside PRESS is, and leaves focus where it went.
	function onFocusOutside(e: FocusEvent) {
		e.preventDefault();
	}

	function onPanelKeydown(e: KeyboardEvent) {
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		// Nothing is trapped, so Tab would walk out of a panel that sits at the
		// end of <body> and leave it open: close and continue from the trigger.
		if (e.key === 'Tab') {
			e.preventDefault();
			close(true);
			return;
		}
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
			trapFocus={false}
			preventScroll={false}
			escapeKeydownBehavior="close"
			{onEscapeKeydown}
			portalProps={{ to: portalTarget }}
			onOpenAutoFocus={focusField}
			onCloseAutoFocus={(e) => e.preventDefault()}
			{onInteractOutside}
			{onFocusOutside}
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
