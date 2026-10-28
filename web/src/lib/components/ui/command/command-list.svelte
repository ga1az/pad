<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: CommandPrimitive.ListProps = $props();

	// bits-ui always gives the list role="listbox", and a listbox with no
	// option in it fails axe's aria-required-children. A search with no match
	// leaves exactly that (the "No results" line sits inside the list), so
	// while no row is rendered the list drops the listbox role and the name
	// and tab stop that went with it, and is a plain box around the message.
	let hasOptions = $state(true);
	$effect(() => {
		const list = ref;
		if (!list) return;
		const sync = () => (hasOptions = list.querySelector('[role="option"]') !== null);
		sync();
		const observer = new MutationObserver(sync);
		observer.observe(list, { childList: true, subtree: true });
		return () => observer.disconnect();
	});
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
	{#snippet child({ props })}
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			{...props}
			role={hasOptions ? props.role : undefined}
			aria-label={hasOptions ? props["aria-label"] : undefined}
			tabindex={hasOptions ? props.tabindex : undefined}
		>
			<!-- The viewport is what the search field's aria-controls names; without it
			     the combobox has nothing to point at (axe: aria-required-attr). -->
			<CommandPrimitive.Viewport>
				{@render children?.()}
			</CommandPrimitive.Viewport>
		</div>
	{/snippet}
</CommandPrimitive.List>
