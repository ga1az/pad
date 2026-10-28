<script lang="ts">
	import { HugeiconsIcon } from "@hugeicons/svelte"
	import { UnfoldMoreIcon } from '@hugeicons/core-free-icons';
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLSelectAttributes } from "svelte/elements";

	type NativeSelectProps = Omit<WithElementRef<HTMLSelectAttributes, HTMLSelectElement>, "size"> & {
		size?: "sm" | "default";
		/** Layout style for the wrapper (width, flex, margin): the select inside fills it. */
		wrapperStyle?: string;
	};

	let {
		ref = $bindable(),
		value = $bindable(),
		class: className,
		size = "default",
		wrapperStyle,
		children,
		...restProps
	}: NativeSelectProps = $props();
</script>

<div
	class={cn(
		"group/native-select relative w-fit has-[select:disabled]:opacity-50",
		className
	)}
	data-slot="native-select-wrapper"
	data-size={size}
	style={wrapperStyle}
>
	<select
		bind:value
		bind:this={ref}
		data-slot="native-select"
		data-size={size}
		class="border-input bg-input/20 dark:bg-input/30 dark:hover:bg-input/50 text-foreground focus-visible:border-ring focus-visible:outline-ring/40 aria-invalid:outline-destructive/40 aria-invalid:border-destructive h-8 w-full min-w-0 appearance-none rounded-md border py-1 pr-7 pl-2.5 text-[13px] max-md:text-[16px] transition-colors focus-visible:outline-2 aria-invalid:outline-2 data-[size=sm]:h-7 data-[size=sm]:text-xs outline-none disabled:pointer-events-none disabled:cursor-not-allowed"
		{...restProps}
	>
		{@render children?.()}
	</select>
	<HugeiconsIcon icon={UnfoldMoreIcon} strokeWidth={2} class="text-muted-foreground top-1/2 right-1.5 size-3.5 -translate-y-1/2 group-data-[size=sm]/native-select:size-3 pointer-events-none absolute select-none" aria-hidden data-slot="native-select-icon" />
</div>
