<script lang="ts" generics="T = never">
	import { Tooltip as TooltipPrimitive } from "bits-ui";

	let {
		open = $bindable(false),
		delayDuration = 400,
		...restProps
	}: TooltipPrimitive.RootProps<T> = $props();
</script>

<!-- Self-provided, as shadcn's React Tooltip is: a tooltip works wherever it
     is mounted (a page, a test) without a Provider higher up. -->
<TooltipPrimitive.Provider {delayDuration}>
	<TooltipPrimitive.Root bind:open {...restProps} />
</TooltipPrimitive.Provider>
