<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		...restProps
	}: CommandPrimitive.LinkItemProps = $props();
</script>


<CommandPrimitive.LinkItem
	bind:ref
	data-slot="command-item"
	class={cn(
		"data-selected:bg-foreground/5 data-selected:text-foreground relative flex min-h-8 cursor-default items-center gap-2 rounded-md px-2 py-1 text-[13px] outline-hidden select-none [&_svg:not([class*='size-'])]:size-3.5 group/command-item [&_svg]:pointer-events-none [&_svg]:shrink-0",
		"data-disabled:pointer-events-none data-disabled:opacity-50",
		className
	)}
	{...restProps}
/>
