<!--
  ResponsiveMenu — the app's popover menu (SPEC-24 / TASK-26). It replaces
  common/Menu: on desktop it renders shadcn-svelte's Dropdown Menu (bits-ui);
  at the mobile breakpoint, with `sheetOnMobile`, the existing BottomSheet,
  unchanged. Rows are ResponsiveMenuItem, which renders a Dropdown Menu item
  in the dropdown and a plain row in the sheet (it reads the mode from the
  context set here).

  Why an adapter: the menus' behaviour is the app's, not the library's, and
  the call sites and their tests depend on it. What bits-ui provides is the
  floating placement (flips when cramped, clamps to the viewport, follows the
  anchor), the portal, the outside-press dismissal, the surface and the
  item highlighting. What stays as it was:
  - Controlled: the parent owns `open` and `onclose`; bits-ui never holds an
    open state of its own (function binding).
  - No Trigger component: the consumer passes its own `trigger` element,
    which anchors the panel, is exempt from outside presses (so its own
    click can toggle the menu shut) and gets focus back on Escape. Outside
    presses and selections close without moving focus, as before.
  - Keyboard: the first row takes focus on open (and again when `focusKey`
    changes, for drill-down views); ArrowUp/Down wrap, Home/End jump, over
    every `[role^="menuitem"]` row, including plain links a consumer marks up
    itself; Escape closes and refocuses the trigger. The panel owns those
    keys outright (no typeahead), so a text field inside a menu keeps its
    keystrokes. Escape is also registered on the escape stack while open, so
    one press closes the menu and not the pane under it.
  - Items never close the menu by themselves; the consumer's onclick decides
    (drill-down views and in-place confirmations depend on that).
  - Portal mode closes on a scroll that can move the anchor and on resize
    (BUG-2610, BUG-3278), exactly as before.
  - `exempt` / `suppressOutside` / `bodyScroll` / `width` / `align` keep their
    meaning. `mode="anchored"` used to sit in the trigger's wrapper; every
    menu now floats in a portal, anchored to the trigger.
-->
<script lang="ts" module>
	export const RESPONSIVE_MENU_CONTEXT = Symbol('responsive-menu');
	export interface ResponsiveMenuContext {
		/** 'dropdown' on desktop, 'sheet' inside the mobile BottomSheet. */
		readonly mode: 'dropdown' | 'sheet';
	}
</script>

<script lang="ts">
	import { setContext, tick } from 'svelte';
	import type { Snippet } from 'svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import BottomSheet from '$lib/components/common/BottomSheet.svelte';
	import { pushEscapeHandler, ESCAPE_PRIORITY } from '$lib/stores/escapeStack';
	import { viewport } from '$lib/stores/breakpoint.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		/** Controlled by the parent (the trigger owns the state). */
		open: boolean;
		onclose: () => void;
		/** The trigger element: the panel's anchor, exempt from outside
		 *  presses, and where focus returns on Escape. */
		trigger?: HTMLElement | null;
		/** 'portal' adds the scroll/resize dismissal (fixed-position menus in
		 *  scrolling panes). Both modes float in a portal. */
		mode?: 'anchored' | 'portal';
		align?: 'right' | 'left';
		/** Portal mode: the panel width in px. */
		width?: number;
		/** Swap to BottomSheet at the mobile breakpoint. */
		sheetOnMobile?: boolean;
		sheetTitle?: string;
		/** Sheet mode only: the content IS a menu, so wrap it in role="menu"
		 *  with arrow-key navigation. Opt-in because several sheetOnMobile
		 *  consumers put non-menu content there (BUG-3157). */
		sheetMenu?: boolean;
		ariaLabel?: string;
		/** Extra containers that count as "inside" for outside presses (e.g. a
		 *  nested portaled emoji picker). */
		exempt?: () => (Element | null | undefined)[];
		/** Changes re-run the first-row focus handoff while the menu STAYS open
		 *  (drill-down views; PLAN-2326 DR-8). Forwarded to BottomSheet. */
		focusKey?: string | number;
		/** The consumer lays out its own scrolling body (BUG-2985): the panel
		 *  keeps its 340px cap but clips instead of scrolling. */
		bodyScroll?: boolean;
		/** Return true to ignore an outside press (e.g. mid-drag). */
		suppressOutside?: () => boolean;
		children: Snippet;
	}

	let {
		open,
		onclose,
		trigger,
		mode = 'anchored',
		align = 'right',
		width = 220,
		sheetOnMobile = false,
		sheetTitle,
		sheetMenu = false,
		ariaLabel,
		exempt,
		suppressOutside,
		focusKey,
		bodyScroll = false,
		children
	}: Props = $props();

	let panelEl = $state<HTMLElement | null>(null);
	let sheetMenuEl = $state<HTMLElement | null>(null);

	const useSheet = $derived(sheetOnMobile && viewport.isMobile);

	setContext<ResponsiveMenuContext>(RESPONSIVE_MENU_CONTEXT, {
		get mode() {
			return useSheet ? 'sheet' : 'dropdown';
		}
	});

	function items(root: HTMLElement | null): HTMLElement[] {
		if (!root) return [];
		return Array.from(root.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled):not([data-disabled])'));
	}

	// Focus the first row on open, and again when `focusKey` swaps a view in
	// place. Reads `open`/`focusKey`, writes no reactive state (CONVE-1688).
	$effect(() => {
		focusKey;
		if (!open || useSheet) return;
		tick().then(() => items(panelEl)[0]?.focus());
	});

	// ESC chain registration while open (desktop only: BottomSheet owns ESC on
	// mobile). Fires when focus is outside the panel; inside it, the panel's
	// own keydown handles Escape first.
	$effect(() => {
		if (!open || useSheet) return;
		return pushEscapeHandler(() => {
			close();
			return true;
		}, ESCAPE_PRIORITY.menu);
	});

	// Portal mode: a scroll that can MOVE THE ANCHOR closes the menu, and so
	// does a resize. Scoped to containers that contain the trigger (BUG-2610);
	// the panel's own scroll and exempt surfaces never count. A scroll event
	// already pending when the menu opened is ignored until the first frame
	// after opening, unless the trigger moved (BUG-3278). Deliberately
	// onclose() and not close(): refocusing the trigger would scroll it back
	// into view and fight the user's scroll.
	$effect(() => {
		if (!open || useSheet || mode !== 'portal') return;
		let settled = false;
		const openedAt = trigger?.getBoundingClientRect();
		const frame = requestAnimationFrame(() => (settled = true));
		const dismiss = (e?: Event) => {
			if (e && e.target instanceof Node) {
				const t = e.target;
				if (panelEl?.contains(t)) return;
				if (exempt?.().some((el) => el && (el === t || el.contains(t)))) return;
				if (trigger && t !== document && !t.contains(trigger)) return;
			}
			if (e?.type === 'scroll' && !settled && trigger && openedAt) {
				const now = trigger.getBoundingClientRect();
				const edges = ['left', 'top', 'right', 'bottom'] as const;
				if (edges.every((k) => Math.abs(now[k] - openedAt[k]) < 1)) return;
			}
			onclose();
		};
		window.addEventListener('scroll', dismiss, { capture: true, passive: true });
		window.addEventListener('resize', dismiss, { passive: true });
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', dismiss, { capture: true });
			window.removeEventListener('resize', dismiss);
		};
	});

	function close() {
		onclose();
		trigger?.focus();
	}

	function isInside(target: EventTarget | null): boolean {
		if (!(target instanceof Node)) return false;
		if (trigger?.contains(target)) return true;
		return !!exempt?.().some((el) => el && (el === target || el.contains(target)));
	}

	function onInteractOutside(e: PointerEvent) {
		if (isInside(e.target) || suppressOutside?.()) e.preventDefault();
	}

	// The old menu never closed on focus leaving it (a nested picker takes
	// focus); outside PRESSES close it.
	function onFocusOutside(e: FocusEvent) {
		e.preventDefault();
	}

	const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

	function navigate(e: KeyboardEvent, root: HTMLElement | null) {
		const list = items(root);
		if (list.length === 0) return;
		const idx = list.indexOf(document.activeElement as HTMLElement);
		let next = -1;
		if (e.key === 'ArrowDown') next = idx < list.length - 1 ? idx + 1 : 0;
		else if (e.key === 'ArrowUp') next = idx > 0 ? idx - 1 : list.length - 1;
		else if (e.key === 'Home') next = 0;
		else if (e.key === 'End') next = list.length - 1;
		if (next >= 0) {
			e.preventDefault();
			list[next].focus();
		}
	}

	// The panel owns its keys. A plain key stops here, so bits-ui's own roving
	// focus and typeahead never run (a text field inside the menu keeps its
	// keystrokes) and no single-key page hotkey on <svelte:window> fires from
	// inside the portaled panel (BUG-2610). Tab and modifier chords (Cmd+K)
	// pass, as they did.
	function onPanelKeydown(e: KeyboardEvent) {
		if (e.key === 'Tab' || e.metaKey || e.ctrlKey || e.altKey) return;
		e.stopPropagation();
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}
		navigate(e, panelEl);
	}

	// A menu owes arrow/Home/End navigation in the sheet too (BUG-3157). Escape
	// stays with BottomSheet, which owns it there along with focus return.
	function onSheetKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') return;
		if (NAV_KEYS.has(e.key)) e.stopPropagation();
		navigate(e, sheetMenuEl);
	}
</script>

{#if useSheet}
	{#if open}
		<BottomSheet {open} {onclose} title={sheetTitle} {focusKey}>
			{#if sheetMenu}
				<!-- The rows are menuitem / menuitemradio, which must be owned by a
				     menu; the sheet itself is a dialog (BUG-3157). -->
				<div
					class="menu-sheet-body"
					role="menu"
					aria-label={ariaLabel ?? sheetTitle}
					tabindex="-1"
					bind:this={sheetMenuEl}
					onkeydown={onSheetKeydown}
				>
					{@render children()}
				</div>
			{:else}
				{@render children()}
			{/if}
		</BottomSheet>
	{/if}
{:else if open}
	<!-- Mounted only while open: bits-ui's Presence ignores the first change of
	     `open` after it is constructed (see AppDialog). -->
	<DropdownMenu.Root
		bind:open={
			() => open,
			(next) => {
				if (!next) onclose();
			}
		}
	>
		<DropdownMenu.Content
			bind:ref={panelEl}
			customAnchor={trigger ?? null}
			side="bottom"
			align={align === 'left' ? 'start' : 'end'}
			sideOffset={6}
			trapFocus={false}
			preventScroll={false}
			escapeKeydownBehavior="ignore"
			onOpenAutoFocus={(e) => e.preventDefault()}
			onCloseAutoFocus={(e) => e.preventDefault()}
			{onInteractOutside}
			{onFocusOutside}
			aria-label={ariaLabel}
			style={mode === 'portal' ? `width: ${width}px` : undefined}
			class={cn(
				'menu-panel max-h-[min(340px,var(--bits-dropdown-menu-content-available-height))]',
				bodyScroll && 'body-scroll flex flex-col overflow-hidden'
			)}
		>
			<!-- display:contents, so a bodyScroll consumer's flex column fills the panel. -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="contents" onkeydown={onPanelKeydown}>
				{@render children()}
			</div>
		</DropdownMenu.Content>
	</DropdownMenu.Root>
{/if}
