<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from "svelte/elements";

	type InputType = Exclude<HTMLInputTypeAttribute, "file">;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, "type"> &
			({ type: "file"; files?: FileList } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		"data-slot": dataSlot = "input",
		...restProps
	}: Props = $props();
</script>

{#if type === "file"}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:outline-ring aria-invalid:outline-destructive/40 aria-invalid:border-destructive h-8 rounded-md border px-2.5 py-1 text-[13px] max-md:text-[16px] text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-solid aria-invalid:outline-2 aria-invalid:outline-solid w-full min-w-0 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground [&[readonly]]:text-muted-foreground [&[readonly]]:cursor-default disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			"bg-input/20 dark:bg-input/30 border-input focus-visible:border-ring focus-visible:outline-ring aria-invalid:outline-destructive/40 aria-invalid:border-destructive h-8 rounded-md border px-2.5 py-1 text-[13px] max-md:text-[16px] text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-solid aria-invalid:outline-2 aria-invalid:outline-solid w-full min-w-0 outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-xs file:font-medium file:text-foreground placeholder:text-muted-foreground [&[readonly]]:text-muted-foreground [&[readonly]]:cursor-default disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
