<!--
	PropertyPicker — the value of a property row, as Linear draws it
	(SPEC-24 / TASK-31): a borderless text action ("High", "Set due date"
	in gray when empty) that opens a Popover holding a Command, a search over
	the rows. A select field, a multi_select, the assignee and the role all use
	it, so the item page has one picker look beyond the status and priority
	StatusPicker.

	Single: choosing a row writes it and closes. Multi: a row toggles and the
	popover stays open, so several can be set in one visit. `noneLabel` adds a
	first row for "no value" ("Unassigned"), which writes ''. The mobile
	breakpoint opens the BottomSheet menu instead, as StatusPicker does, and
	both portal out of the properties column.

	It holds no value of its own: `value` / `values` come from the parent, and
	every choice goes out through `onselect` / `ontoggle`. The parent decides
	what a write means (and fences it).
-->
<script lang="ts" module>
	export interface PickerOption {
		value: string;
		label: string;
		/** Rows with the same group sit under one heading ("People", "Agents"). */
		group?: string;
	}
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import AnchoredPopover from '$lib/components/ui-adapters/AnchoredPopover.svelte';
	import ResponsiveMenu from '$lib/components/ui-adapters/ResponsiveMenu.svelte';
	import ResponsiveMenuItem from '$lib/components/ui-adapters/ResponsiveMenuItem.svelte';
	import * as Command from '$lib/components/ui/command';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Tick02Icon } from '@hugeicons/core-free-icons';
	import { viewport } from '$lib/stores/breakpoint.svelte';

	interface Props {
		options: PickerOption[];
		/** Single: the chosen value, '' for none. */
		value?: string;
		/** Multi: the chosen values. */
		values?: string[];
		multi?: boolean;
		/** Gray text on the trigger while nothing is chosen ("Set priority"). */
		placeholder: string;
		/** The control's name; the trigger's accessible name adds the value. */
		label: string;
		/** First row, writing '' ("Unassigned"). Single only. */
		noneLabel?: string;
		searchPlaceholder?: string;
		onselect?: (value: string) => void;
		ontoggle?: (value: string) => void;
		/** A leading visual for a value ('' is none): a color dot, an avatar. */
		lead?: Snippet<[string]>;
		/** Extra class names for the trigger (hooks that tests and specs select by). */
		triggerClass?: string;
		/** Read-only text instead of a trigger. */
		readonly?: boolean;
	}

	let {
		options: allOptions,
		value = '',
		values = [],
		multi = false,
		placeholder,
		label,
		noneLabel,
		searchPlaceholder,
		onselect,
		ontoggle,
		lead,
		triggerClass = '',
		readonly = false
	}: Props = $props();

	// Each value once: the rows are keyed by it, and a keyed each throws on a
	// repeat (TASK-3539). A caller's list is not trusted to have none.
	const options = $derived(allOptions.filter((o, i) => allOptions.findIndex((x) => x.value === o.value) === i));

	let open = $state(false);
	let triggerEl = $state<HTMLElement | null>(null);
	let highlighted = $state('');

	const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
	const chosen = $derived(multi ? values : value ? [value] : []);
	const shown = $derived(chosen.map(labelOf).join(', '));
	const NONE = '\u0000none';
	/** The rows by group, in order. An option without a group is not headed. */
	const grouped = $derived.by(() => {
		const out: { heading: string | undefined; rows: PickerOption[] }[] = [];
		for (const o of options) {
			const last = out[out.length - 1];
			if (last && last.heading === o.group) last.rows.push(o);
			else out.push({ heading: o.group, rows: [o] });
		}
		return out;
	});

	function toggle() {
		if (!open) highlighted = (multi ? values[0] : value) || options[0]?.value || '';
		open = !open;
	}

	function choose(v: string, close?: (refocus?: boolean) => void) {
		if (multi) {
			ontoggle?.(v);
			return;
		}
		close ? close(true) : (open = false);
		if (v !== value) onselect?.(v);
	}
</script>

{#if readonly}
	<span class="prop-readonly">
		{#if lead}{@render lead(value)}{/if}
		<span class="prop-text" class:prop-empty={!shown}>{shown || '—'}</span>
	</span>
{:else}
	<button
		type="button"
		class="prop-trigger {triggerClass}"
		bind:this={triggerEl}
		onclick={toggle}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label="{label}: {shown || 'not set'}"
		title={label}
	>
		{#if lead}{@render lead(multi ? '' : value)}{/if}
		<span class="prop-text" class:prop-empty={!shown}>{shown || placeholder}</span>
	</button>

	{#if open}
		{#if viewport.isMobile}
			<!-- In place, not portaled: the sheet is fixed to the viewport either
			     way (e2e/task-2209 measures that), and a property row has no
			     link or drag zone around it to escape. -->
			<ResponsiveMenu
					{open}
					onclose={() => (open = false)}
					trigger={triggerEl ?? undefined}
					mode="portal"
					align="left"
					width={220}
					sheetOnMobile
					sheetMenu
					sheetTitle={label}
					ariaLabel={label}
				>
					{#if noneLabel && !multi}
						<ResponsiveMenuItem checked={!value} onclick={() => choose('')}>{noneLabel}</ResponsiveMenuItem>
					{/if}
					{#each options as option (option.value)}
						<ResponsiveMenuItem checked={chosen.includes(option.value)} onclick={() => choose(option.value)}>
							{option.label}
						</ResponsiveMenuItem>
					{/each}
			</ResponsiveMenu>
		{:else}
			<AnchoredPopover {open} onclose={() => (open = false)} trigger={triggerEl} width={240} ariaLabel={label}>
				{#snippet children({ close })}
					<Command.Root loop label={label} bind:value={highlighted}>
						<Command.Input placeholder={searchPlaceholder ?? `${label}…`} aria-label={label} />
						<Command.List class="max-h-64">
							<Command.Empty>No results</Command.Empty>
							{#if noneLabel && !multi}
								<Command.Item
									value={NONE}
									keywords={[noneLabel]}
									aria-checked={!value}
									onSelect={() => choose('', close)}
								>
									{#if lead}{@render lead('')}{/if}
									<span class="row-text">{noneLabel}</span>
									{#if !value}<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />{/if}
								</Command.Item>
							{/if}
							{#each grouped as g, gi (gi)}
								{#snippet rows()}
									{#each g.rows as option (option.value)}
										<Command.Item
											value={option.value}
											keywords={[option.label]}
											aria-checked={chosen.includes(option.value)}
											onSelect={() => choose(option.value, close)}
										>
											{#if lead}{@render lead(option.value)}{/if}
											<span class="row-text" data-option-label>{option.label}</span>
											{#if chosen.includes(option.value)}<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} />{/if}
										</Command.Item>
									{/each}
								{/snippet}
								{#if g.heading}
									<Command.Group heading={g.heading}>{@render rows()}</Command.Group>
								{:else}
									{@render rows()}
								{/if}
							{/each}
						</Command.List>
					</Command.Root>
				{/snippet}
			</AnchoredPopover>
		{/if}
	{/if}
{/if}

<style>
	/* The value is a text action: no box until it is pointed at or open. */
	.prop-trigger {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		max-width: 100%;
		min-height: 28px;
		padding: 0 6px;
		margin-left: -6px;
		border: none;
		border-radius: 6px;
		background: transparent;
		color: var(--ui-foreground);
		font: inherit;
		font-size: 13px;
		text-align: left;
		cursor: pointer;
		transition: background 0.12s;
	}
	.prop-trigger:hover,
	.prop-trigger[aria-expanded='true'] {
		background: color-mix(in oklab, var(--ui-foreground) 4%, transparent);
	}
	.prop-trigger:focus-visible {
		outline: 2px solid var(--ui-ring);
		outline-offset: 1px;
	}
	.prop-readonly {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		min-height: 28px;
		font-size: 13px;
		color: var(--ui-foreground);
	}
	.prop-text,
	.row-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.row-text {
		flex: 1;
	}
	.prop-empty {
		color: var(--ui-muted-foreground);
	}
</style>
