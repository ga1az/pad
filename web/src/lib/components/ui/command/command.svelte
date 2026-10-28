<script lang="ts">
	import { Command as CommandPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";

	export type CommandRootApi = CommandPrimitive.Root;

	let {
		api = $bindable(null),
		ref = $bindable(null),
		value = $bindable(""),
		class: className,
		...restProps
	}: CommandPrimitive.RootProps & {
		api?: CommandRootApi | null;
	} = $props();
</script>

<CommandPrimitive.Root
	bind:this={api}
	bind:value
	bind:ref
	data-slot="command"
	class={cn(
		// The secondary text of a Command (headings, shortcuts, the empty line,
		// the placeholder) clears 4.5:1 on the popover AND on the highlighted
		// row. --ui-muted-foreground, measured from Linear, is 4.4:1 on the
		// popover and 3.9:1 on the row, so this mixes a gray from the text, as
		// the palette does (--cp-muted). --command-focus is the search row's
		// focus indicator: --ui-ring itself is 2.8:1 on the popover.
		"bg-popover text-popover-foreground [--command-muted:color-mix(in_srgb,var(--ui-popover-foreground)_66%,var(--ui-popover))] [--command-focus:color-mix(in_srgb,var(--ui-ring)_60%,var(--ui-popover-foreground))] flex size-full flex-col overflow-hidden rounded-lg",
		className
	)}
	{...restProps}
/>
