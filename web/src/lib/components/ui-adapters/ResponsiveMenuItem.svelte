<!--
  ResponsiveMenuItem — a row of a ResponsiveMenu (SPEC-24 / TASK-26). It
  replaces common/MenuItem with the same props.

  In the desktop dropdown it is a shadcn-svelte Dropdown Menu item (bits-ui
  highlighting, the Linear row: 28px, 13px), rendered as a real <button> or
  <a> through bits-ui's `child` snippet so `disabled`, `download`, middle-click
  and the role queries tests and call sites rely on stay native. In the mobile
  BottomSheet, or outside any menu, it is the plain row it always was.

  A row never closes its menu: selection is the consumer's onclick, which
  decides (a drill-down view or an in-place confirmation keeps it open).
-->
<script lang="ts">
	import { Tick02Icon } from '@hugeicons/core-free-icons';
	import { getContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { IconSvgElement } from '@hugeicons/svelte';
	import Icon from '$lib/icons/Icon.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { cn } from '$lib/utils';
	import { RESPONSIVE_MENU_CONTEXT, type ResponsiveMenuContext } from './ResponsiveMenu.svelte';

	interface Props {
		/** Leading icon as an emoji (rendered through `Icon`: its Hugeicons
		 *  equivalent, or the emoji itself as text) or a Hugeicons icon. */
		icon?: string | IconSvgElement;
		/** Leading icon as markup (an SVG icon component). Wins over `icon`. */
		iconSnippet?: Snippet;
		/** Right-aligned hint (shortcut, count). */
		hint?: string;
		/** Red row for destructive actions. */
		danger?: boolean;
		/** When defined the row is a menuitemradio with a trailing check. */
		checked?: boolean;
		disabled?: boolean;
		/** id of an element describing this row (e.g. the prompt above a
		 *  destructive confirmation; PLAN-2326). */
		describedBy?: string;
		/** Native tooltip. Explanation, never the only place a fact is stated. */
		title?: string;
		/** Renders the row as an anchor (PLAN-2392 DR-5). Ignored while
		 *  `disabled`: a disabled link is not a thing. */
		href?: string;
		download?: string;
		target?: string;
		rel?: string;
		onclick?: (e: MouseEvent) => void;
		children: Snippet;
	}

	let {
		icon,
		iconSnippet,
		hint,
		danger = false,
		checked,
		disabled = false,
		describedBy,
		title,
		href,
		download,
		target,
		rel,
		onclick,
		children
	}: Props = $props();

	const menu = getContext<ResponsiveMenuContext | undefined>(RESPONSIVE_MENU_CONTEXT);
	const inDropdown = $derived(menu?.mode === 'dropdown');

	const role = $derived(checked !== undefined ? 'menuitemradio' : 'menuitem');
	// A disabled anchor falls back to a disabled <button>: `<a>` ignores
	// `disabled`, stays focusable and still navigates, and the menus' keyboard
	// navigation skips rows with `:disabled`, which no anchor can match.
	const asAnchor = $derived(href !== undefined && !disabled);

	const dropdownRow = 'mi w-full text-left text-foreground';

	/**
	 * A native anchor activates on Enter but NOT on Space, while every button
	 * row activates on both (the plain-row branch; in the dropdown, bits-ui's
	 * item handles both keys).
	 */
	function anchorKeydown(e: KeyboardEvent) {
		if (e.key !== ' ' && e.key !== 'Spacebar') return;
		e.preventDefault();
		(e.currentTarget as HTMLAnchorElement).click();
	}
</script>

{#snippet body()}
	{#if iconSnippet}
		<span class="mi-icon" aria-hidden="true">{@render iconSnippet()}</span>
	{:else if icon}
		<span class="mi-icon" aria-hidden="true"><Icon {icon} /></span>
	{/if}
	<span class="mi-label">{@render children()}</span>
	{#if hint}<span class="mi-hint">{hint}</span>{/if}
	{#if checked}<span class="mi-check" aria-hidden="true"><Icon icon={Tick02Icon} /></span>{/if}
{/snippet}

{#if inDropdown}
	<DropdownMenu.Item
		{disabled}
		variant={danger ? 'destructive' : 'default'}
		closeOnSelect={false}
		onSelect={(e) => e.preventDefault()}
		{onclick}
		class={cn(dropdownRow, danger && 'danger')}
	>
		{#snippet child({ props })}
			{#if asAnchor}
				<a {...props} {href} {download} {target} {rel} {role} {title} aria-checked={checked} aria-describedby={describedBy}>
					{@render body()}
				</a>
			{:else}
				<button
					{...props}
					type="button"
					{role}
					{title}
					aria-checked={checked}
					aria-describedby={describedBy}
					{disabled}
				>
					{@render body()}
				</button>
			{/if}
		{/snippet}
	</DropdownMenu.Item>
{:else if asAnchor}
	<a
		class="mi plain"
		class:danger
		{href}
		{download}
		{target}
		{rel}
		{role}
		{title}
		aria-checked={checked}
		aria-describedby={describedBy}
		{onclick}
		onkeydown={anchorKeydown}
	>
		{@render body()}
	</a>
{:else}
	<button
		type="button"
		class="mi plain"
		class:danger
		{role}
		{title}
		aria-checked={checked}
		aria-describedby={describedBy}
		{disabled}
		{onclick}
	>
		{@render body()}
	</button>
{/if}

<style>
	/* The parts, in both branches. */
	.mi-icon {
		width: 18px;
		display: grid;
		place-items: center;
		flex: 0 0 18px;
		opacity: 0.85;
	}

	.mi-label {
		flex: 1;
		min-width: 0;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.mi-hint {
		color: var(--ui-muted-foreground);
		font-size: 12px;
		flex: 0 0 auto;
	}

	.mi-check {
		color: var(--ui-primary);
		flex: 0 0 auto;
	}

	/* The plain row (mobile sheet, or outside a menu): unchanged from
	   common/MenuItem. */
	.mi.plain {
		display: flex;
		align-items: center;
		gap: 9px;
		width: 100%;
		box-sizing: border-box;
		text-decoration: none;
		padding: 7px 9px;
		border: none;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-primary);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
	}

	.mi.plain:hover:not(:disabled),
	.mi.plain:focus-visible {
		background: var(--bg-hover);
	}

	.mi.plain:focus-visible {
		outline: none;
	}

	.mi.plain:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.mi.plain .mi-check {
		color: var(--accent-primary-soft, var(--accent-blue));
	}

	.mi.plain .mi-hint {
		color: var(--text-muted);
		font-size: 11.5px;
	}

	.mi.plain.danger {
		color: var(--accent-red);
	}

	.mi.plain.danger:hover:not(:disabled) {
		background: color-mix(in srgb, var(--accent-red) 12%, transparent);
	}

	@media (pointer: coarse) {
		.mi.plain {
			padding: 11px 10px;
		}
	}
</style>
