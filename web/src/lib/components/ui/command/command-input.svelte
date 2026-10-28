<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { HugeiconsIcon } from "@hugeicons/svelte"
	import { SearchIcon } from '@hugeicons/core-free-icons';
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		wrapperClass,
		showIcon = false,
		value = $bindable(""),
		...restProps
	}: CommandPrimitive.InputProps & {
		/** Classes for the row around the field (height, padding). */
		wrapperClass?: string;
		/** The search glyph before the field; the pickers go without. */
		showIcon?: boolean;
	} = $props();
</script>

<!--
	Linear's search row: no box, no ring, a hairline under it. The field is a
	bare input in the row, so the row carries the height and padding. The `!`
	utilities beat app.css's `input:focus` border and its keyboard-focus outline.
	Because the field shows none, the ROW shows focus: while the field has it,
	the hairline turns --command-focus and doubles (an inset 1px line above
	the 1px border), 5:1 on the popover (fieldFocusIndicator.test.ts reads
	this). Neutral without it: no ring around a row Linear draws open.
-->
<div
	data-slot="command-input-wrapper"
	class={cn(
		"border-foreground/10 flex h-9 shrink-0 items-center gap-2 border-b px-3 focus-within:border-(color:--command-focus) focus-within:shadow-[inset_0_-1px_0_0_var(--command-focus)]",
		wrapperClass
	)}
>
	{#if showIcon}
		<HugeiconsIcon icon={SearchIcon} strokeWidth={2} class="text-(color:--command-muted) size-4 shrink-0" />
	{/if}
	<CommandPrimitive.Input
		bind:ref
		bind:value
		data-slot="command-input"
		class={cn(
			"text-foreground placeholder:text-(color:--command-muted) h-full min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] shadow-none outline-hidden focus:outline-hidden focus-visible:outline-hidden focus:border-transparent! focus-visible:outline-none! disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{...restProps}
	/>
</div>
