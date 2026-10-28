<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLSpanElement>> = $props();
</script>

<!-- The secondary gray clears 4.5:1 on the popover AND on the highlighted row
     (command-item's 5% fill): a mix of the popover's text, as the palette's
     --cp-muted. --ui-muted-foreground, measured from Linear, is 4.4:1 and 3.9:1.
     Written out in each Command piece because uiTokens.test.ts lets a
     component read only --ui-* names. -->
<span
	bind:this={ref}
	data-slot="command-shortcut"
	class={cn("text-[color-mix(in_srgb,var(--ui-popover-foreground)_66%,var(--ui-popover))] ml-auto text-xs", className)}
	{...restProps}
>
	{@render children?.()}
</span>
