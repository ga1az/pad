<script lang="ts">
	import { cn, type WithElementRef, type WithoutChildren } from "$lib/utils.js";
	import type { HTMLTextareaAttributes } from "svelte/elements";

	let {
		ref = $bindable(),
		value = $bindable(),
		class: className,
		"data-slot": dataSlot = "textarea",
		...restProps
	}: WithoutChildren<WithElementRef<HTMLTextareaAttributes>> = $props();
</script>

<textarea
	bind:this={ref}
	data-slot={dataSlot}
	class={cn(
		"border-input bg-input/20 dark:bg-input/30 focus-visible:border-ring focus-visible:outline-ring/40 aria-invalid:outline-destructive/40 aria-invalid:border-destructive resize-none rounded-md border px-2.5 py-2 text-[13px] max-md:text-[16px] text-foreground leading-normal transition-colors focus-visible:outline-2 focus-visible:outline-solid aria-invalid:outline-2 aria-invalid:outline-solid flex field-sizing-content min-h-16 w-full outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	bind:value
	{...restProps}></textarea>
