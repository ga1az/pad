<!--
	StatusPicker — the status chip on a card or a list row, as a MENU trigger
	(BUG-3157).

	It used to be a one-tap CYCLE control: a click advanced the status to the
	next option immediately. On a board grouped by status the next option is the
	next lane, so a tap meant to open the card moved it one lane instead, and on
	touch there was no hover tooltip to say the chip was a control at all. Dave's
	ruling: on every device the chip opens a picker, and nothing changes until an
	option is chosen.

	The picker is a Popover holding a Command on desktop (TASK-30: a search
	field over the rows, Linear's), a BottomSheet menu at the mobile breakpoint
	(unchanged). Both portal out of the chip's container: it lives inside the
	card's <a> and inside the board's dnd zone, and rows rendered there would
	sit inside a link and under svelte-dnd-action, which rewrites the ARIA
	roles of what it contains.

	The popover's keys: typing filters the rows, ↑/↓ move the highlight, Enter
	picks, Esc closes and refocuses the chip. While the search is empty a digit
	picks that row (the gray number on its right; the numbers are hidden once
	there is text, because a digit then types, and a digit past the last row types
	too). The search is ours
	(`shouldFilter={false}`), because the digits and the numbering follow the
	rows that are showing.

	Choosing the current value writes nothing. A stored value the options do not
	declare is shown as-is with no row checked; choosing any option is then an
	explicit decision, which is exactly what the old cycle could not offer
	(BUG-3068 had to refuse the click instead).

	`appearance="icon"` (TASK-28) draws the trigger as the value's icon, the
	Linear card's status shape or priority bars, instead of a text chip. Same
	menu, same title and ARIA; the value's name moves into the button's label.

	`appearance="row"` (TASK-31) is the item page's property value: the icon
	and the name side by side as a borderless text action, "Set priority" in
	gray when nothing is chosen.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import ResponsiveMenu from '$lib/components/ui-adapters/ResponsiveMenu.svelte';
	import ResponsiveMenuItem from '$lib/components/ui-adapters/ResponsiveMenuItem.svelte';
	import AnchoredPopover from '$lib/components/ui-adapters/AnchoredPopover.svelte';
	import * as Command from '$lib/components/ui/command';
	import { HugeiconsIcon } from '@hugeicons/svelte';
	import { Tick02Icon } from '@hugeicons/core-free-icons';
	import { portal } from '$lib/utils/portalAction';
	import { statusColor, priorityColor, formatFieldLabel as formatLabel } from '$lib/utils/fieldColors';
	import { viewport } from '$lib/stores/breakpoint.svelte';
	import { uniqueStrings } from '$lib/utils/unique';
	import type { FieldDef } from '$lib/types';
	import StatusIcon from '$lib/components/status/StatusIcon.svelte';
	import PriorityIcon from '$lib/components/status/PriorityIcon.svelte';
	import { priorityLevel, statusCategory } from '$lib/components/status/statusCategory';
	import { sentChoice } from '$lib/components/fields/sentChoice.svelte';

	interface Props {
		/** The stored status; '' when the item has none. */
		value: string;
		options: string[];
		/** May return the write's promise: a choice is not compared with `value`
		 *  while that is pending (fields/sentChoice). */
		onselect: (status: string) => unknown;
		/** Which field the chip is: the priority chip is the same picker (TASK-2214). */
		kind?: 'status' | 'priority';
		/** A text chip (the default), the value's icon (TASK-28), or a property
		 *  row's value (TASK-31): the icon, then the name, a text action. */
		appearance?: 'chip' | 'icon' | 'row';
		/** The field, for the status icon's terminal and abandoned options. */
		field?: FieldDef;
	}

	let { value, options, onselect, kind = 'status', appearance = 'chip', field }: Props = $props();
	// Each once: the menu is keyed by the option, and a repeat throws (TASK-3539).
	let optionList = $derived(uniqueStrings(options));
	const noun = $derived(kind === 'priority' ? 'Priority' : 'Status');
	const color = $derived(kind === 'priority' ? priorityColor(value) : statusColor(value));

	let open = $state(false);
	let triggerEl = $state<HTMLElement | null>(null);

	function toggle(e: MouseEvent) {
		// The chip sits inside the card's <a> and the list row's click target;
		// Chip already preventDefault()s, this keeps the card from opening.
		e.stopPropagation();
		// A fresh search each time the popover opens, on the current value.
		if (!open) {
			query = '';
			highlighted = optionList.includes(value) ? value : (optionList[0] ?? '');
		}
		open = !open;
		// A mouse press on a card's chip does not focus it (the board's drag
		// layer swallows the mousedown), so closing by the chip puts focus back
		// on it here. AnchoredPopover does the same when the press outlasts
		// bits-ui's 10ms judgement.
		if (!open) triggerEl?.focus();
	}

	const sent = sentChoice(() => value);

	function choose(status: string) {
		open = false;
		sent.choose(status, onselect);
	}

	// The desktop popover's search. Our own filter, so the digit shortcuts and
	// the numbers shown follow the rows that are showing.
	let query = $state('');
	let highlighted = $state('');
	const visible = $derived(
		optionList.filter((o) => {
			const q = query.trim().toLowerCase();
			return !q || formatLabel(o).toLowerCase().includes(q) || o.toLowerCase().includes(q);
		})
	);

	function onSearchKeydown(e: KeyboardEvent, close: (refocus?: boolean) => void) {
		if (query !== '' || e.metaKey || e.ctrlKey || e.altKey || !/^[1-9]$/.test(e.key)) return;
		const option = visible[Number(e.key) - 1];
		// A digit past the last row is not a shortcut: it types.
		if (!option) return;
		e.preventDefault();
		close(true);
		choose(option);
	}
</script>

{#if appearance === 'icon'}
	<button
		type="button"
		class="picker-icon"
		data-kind={kind}
		onclick={(e) => { e.preventDefault(); toggle(e); }}
		bind:this={triggerEl}
		aria-haspopup="dialog"
		aria-expanded={open}
		title="Change {noun.toLowerCase()}"
	>
		{#if kind === 'priority'}
			<PriorityIcon level={priorityLevel(value)} />
		{:else}
			<StatusIcon category={statusCategory(value, field)} />
		{/if}
		<span class="picker-icon-name">{value ? `${noun}: ${formatLabel(value)}` : `No ${noun.toLowerCase()}`}</span>
	</button>
{:else if appearance === 'row'}
	<button
		type="button"
		class="picker-row"
		data-kind={kind}
		onclick={(e) => { e.preventDefault(); toggle(e); }}
		bind:this={triggerEl}
		aria-haspopup="dialog"
		aria-expanded={open}
		aria-label="{noun}: {value ? formatLabel(value) : 'not set'}"
		title="Change {noun.toLowerCase()}"
	>
		{#if kind === 'priority'}
			<PriorityIcon level={priorityLevel(value)} />
		{:else}
			<StatusIcon category={statusCategory(value, field)} />
		{/if}
		<span class="picker-row-text" class:picker-row-empty={!value}>{value ? formatLabel(value) : `Set ${noun.toLowerCase()}`}</span>
	</button>
{:else}
	<Badge
		size="sm"
		color={color}
		onclick={toggle}
		bind:ref={triggerEl}
		aria-haspopup="dialog"
		aria-expanded={open}
		title="Change {noun.toLowerCase()}"
	>
		{formatLabel(value)}
	</Badge>
{/if}

{#if open}
	{#if viewport.isMobile}
		<div class="status-picker-host" use:portal>
			<ResponsiveMenu
				{open}
				onclose={() => (open = false)}
				trigger={triggerEl ?? undefined}
				mode="portal"
				align="left"
				width={200}
				sheetOnMobile
				sheetMenu
				sheetTitle={noun}
				ariaLabel={noun}
			>
				{#each optionList as option (option)}
					<ResponsiveMenuItem checked={option === value} onclick={() => choose(option)}>
						{formatLabel(option)}
					</ResponsiveMenuItem>
				{/each}
			</ResponsiveMenu>
		</div>
	{:else}
		<AnchoredPopover {open} onclose={() => (open = false)} trigger={triggerEl} width={240} ariaLabel={noun}>
			{#snippet children({ close })}
				<Command.Root shouldFilter={false} loop label={noun} bind:value={highlighted}>
					<Command.Input
						bind:value={query}
						placeholder={kind === 'priority' ? 'Set priority…' : 'Change status…'}
						aria-label={noun}
						onkeydown={(e) => onSearchKeydown(e, close)}
					/>
					<Command.List class="max-h-64">
						<Command.Empty>No results</Command.Empty>
						{#each visible as option, i (option)}
							<Command.Item
								value={option}
								aria-checked={option === value}
								onSelect={() => {
									close(true);
									choose(option);
								}}
							>
								{#if kind === 'priority'}
									<PriorityIcon level={priorityLevel(option)} />
								{:else}
									<StatusIcon category={statusCategory(option, field)} />
								{/if}
								<span data-option-label class="min-w-0 flex-1 truncate">{formatLabel(option)}</span>
								{#if option === value}
									<HugeiconsIcon icon={Tick02Icon} strokeWidth={2} class="text-muted-foreground" />
								{/if}
								<!-- The numbers are the digit shortcuts, which only work while the
								     search is empty: with text in it a digit types. -->
								{#if i < 9 && query === ''}
									<Command.Shortcut class="ml-1 w-3 text-center">{i + 1}</Command.Shortcut>
								{/if}
							</Command.Item>
						{/each}
					</Command.List>
				</Command.Root>
			{/snippet}
		</AnchoredPopover>
	{/if}
{/if}

<style>
	/* The icon trigger is unstyled here: the host sizes it (a bare icon beside
	   the card title, a round box in the card's property row). */
	.picker-icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
	}
	/* app.css strips button outlines; put a ring back for the keyboard. */
	.picker-icon:focus-visible {
		outline: 2px solid var(--ui-ring);
		outline-offset: 1px;
	}
	/* The property row's value: a text action, no box until it is pointed at. */
	.picker-row {
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
		cursor: pointer;
		transition: background 0.12s;
	}
	.picker-row:hover,
	.picker-row[aria-expanded='true'] {
		background: color-mix(in oklab, var(--ui-foreground) 4%, transparent);
	}
	.picker-row:focus-visible {
		outline: 2px solid var(--ui-ring);
		outline-offset: 1px;
	}
	.picker-row-text {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.picker-row-empty {
		color: var(--ui-muted-foreground);
	}
	/* The value's name, for assistive tech (and any reader of the text). */
	.picker-icon-name {
		position: absolute;
		width: 1px;
		height: 1px;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
	}
</style>
