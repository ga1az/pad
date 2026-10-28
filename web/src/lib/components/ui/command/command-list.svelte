<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ListProps = $props();
</script>

<!-- tabindex 0: the list scrolls (max-h) and axe wants a scrollable region to be
     keyboard-focusable (scrollable-region-focusable); -1 does not satisfy it. The
     keyboard works from the search field, which scrolls the highlighted row into
     view, and AnchoredPopover turns a Tab inside the panel into a close, so the
     list is never a stop in practice. -->
<CommandPrimitive.List
	bind:ref
	data-slot="command-list"
	tabindex={0}
	class={cn("max-h-72 scroll-py-1 outline-none overflow-x-hidden overflow-y-auto p-1", className)}
	{...restProps}
>
	<!-- The viewport is what the search field's aria-controls names; without it
	     the combobox has nothing to point at (axe: aria-required-attr). -->
	<CommandPrimitive.Viewport>
		{@render children?.()}
	</CommandPrimitive.Viewport>
</CommandPrimitive.List>
