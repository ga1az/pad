<!--
	EmojiPickerButton — the icon button of the collection and role editors. On
	desktop it opens a Popover with a searchable grid (TASK-30,
	EmojiPickerPanel); at the mobile breakpoint it opens the EmojiPicker grid
	in a BottomSheet, as before. The popover portals into the nearest dialog
	(or <body>) and dismisses on a press that starts outside (BUG-3231: bits-ui
	tracks where the press began). QuickActionsMenu exempts `.epb-dropdown`
	from its own outside presses.
-->
<script lang="ts">
	import EmojiPicker from '$lib/components/common/EmojiPicker.svelte';
	import EmojiPickerPanel from '$lib/components/common/EmojiPickerPanel.svelte';
	import BottomSheet from '$lib/components/common/BottomSheet.svelte';
	import AnchoredPopover from '$lib/components/ui-adapters/AnchoredPopover.svelte';
	import { viewport } from '$lib/stores/breakpoint.svelte';

	interface Props {
		value: string;
		placeholder?: string;
		size?: 'sm' | 'md';
	}

	let { value = $bindable(), placeholder = '⚡', size = 'sm' }: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement>();

	function handleSelect(emoji: string) {
		value = emoji;
		open = false;
	}
</script>


<div class="emoji-picker-button" class:size-md={size === 'md'}>
	<button
		bind:this={triggerEl}
		type="button"
		class="trigger"
		class:open
		class:empty={!value}
		aria-haspopup="dialog"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		{value || placeholder}
	</button>

	{#if viewport.isMobile}
		<BottomSheet {open} onclose={() => (open = false)} title="Pick an emoji">
			<div class="epb-sheet-body">
				<EmojiPicker selected={value} onselect={handleSelect} />
			</div>
		</BottomSheet>
	{:else}
		<AnchoredPopover
			{open}
			onclose={() => (open = false)}
			trigger={triggerEl}
			width={264}
			ariaLabel="Pick an icon"
			class="epb-dropdown"
		>
			{#snippet children({ close })}
				<EmojiPickerPanel
					selected={value}
					onselect={(emoji) => {
						handleSelect(emoji);
						close(true);
					}}
				/>
			{/snippet}
		</AnchoredPopover>
	{/if}
</div>

<style>
	.emoji-picker-button {
		position: relative;
		display: inline-flex;
	}

	.trigger {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 1.1em;
		line-height: 1;
		padding: 0;
	}

	.size-md .trigger {
		width: 42px;
		height: 42px;
	}

	.trigger:hover {
		border-color: var(--text-muted);
	}

	.trigger.open {
		border-color: var(--accent-blue);
	}

	.trigger.empty {
		color: var(--text-muted);
	}

	/* Center the picker grid inside the mobile sheet so the default
	   300-ish-px grid reads cleanly on full-width viewports. */
	.epb-sheet-body {
		display: flex;
		justify-content: center;
		padding: 0 var(--space-3);
	}
</style>
