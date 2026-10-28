<!--
	StatusPicker — the status chip on a card or table row, as a MENU trigger
	(BUG-3157).

	It used to be a one-tap CYCLE control: a click advanced the status to the
	next option immediately. On a board grouped by status the next option is the
	next lane, so a tap meant to open the card moved it one lane instead, and on
	touch there was no hover tooltip to say the chip was a control at all. Dave's
	ruling: on every device the chip opens a picker, and nothing changes until an
	option is chosen.

	The picker is the shared Menu — a portaled popover on desktop, a BottomSheet
	at the mobile breakpoint — mounted from a host portaled to <body>. The chip
	lives inside the card's <a> and inside the board's dnd zone; rendering the
	sheet there would put its rows inside a link and under svelte-dnd-action,
	which rewrites the ARIA roles of what it contains.

	Choosing the current value writes nothing. A stored value the options do not
	declare is shown as-is with no row checked; choosing any option is then an
	explicit decision, which is exactly what the old cycle could not offer
	(BUG-3068 had to refuse the click instead).

	`appearance="icon"` (TASK-28) draws the trigger as the value's icon, the
	Linear card's status shape or priority bars, instead of a text chip. Same
	menu, same title and ARIA; the value's name moves into the button's label.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import ResponsiveMenu from '$lib/components/ui-adapters/ResponsiveMenu.svelte';
	import ResponsiveMenuItem from '$lib/components/ui-adapters/ResponsiveMenuItem.svelte';
	import { portal } from '$lib/utils/portalAction';
	import { statusColor, priorityColor, formatFieldLabel as formatLabel } from '$lib/utils/fieldColors';
	import { viewport } from '$lib/stores/breakpoint.svelte';
	import { uniqueStrings } from '$lib/utils/unique';
	import type { FieldDef } from '$lib/types';
	import StatusIcon from '$lib/components/status/StatusIcon.svelte';
	import PriorityIcon from '$lib/components/status/PriorityIcon.svelte';
	import { priorityLevel, statusCategory } from '$lib/components/status/statusCategory';

	interface Props {
		/** The stored status; '' when the item has none. */
		value: string;
		options: string[];
		onselect: (status: string) => void;
		/** Which field the chip is: the priority chip is the same picker (TASK-2214). */
		kind?: 'status' | 'priority';
		/** A text chip (the default), or the value's icon (TASK-28). */
		appearance?: 'chip' | 'icon';
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
		// The chip sits inside the card's <a> and the table row's click target;
		// Chip already preventDefault()s, this keeps the card from opening.
		e.stopPropagation();
		open = !open;
	}

	function choose(status: string) {
		open = false;
		if (status !== value) onselect(status);
	}
</script>

{#if appearance === 'icon'}
	<button
		type="button"
		class="picker-icon"
		data-kind={kind}
		onclick={(e) => { e.preventDefault(); toggle(e); }}
		bind:this={triggerEl}
		aria-haspopup={viewport.isMobile ? 'dialog' : 'menu'}
		aria-expanded={open}
		title="Change {noun.toLowerCase()}"
	>
		{#if kind === 'priority'}
			<PriorityIcon level={priorityLevel(value)} />
		{:else}
			<StatusIcon category={statusCategory(value, field)} />
		{/if}
		<span class="picker-icon-name">{noun}: {formatLabel(value)}</span>
	</button>
{:else}
	<Badge
		size="sm"
		color={color}
		onclick={toggle}
		bind:ref={triggerEl}
		aria-haspopup={viewport.isMobile ? 'dialog' : 'menu'}
		aria-expanded={open}
		title="Change {noun.toLowerCase()}"
	>
		{formatLabel(value)}
	</Badge>
{/if}

{#if open}
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
