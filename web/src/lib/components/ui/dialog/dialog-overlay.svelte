<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import { backdropDismiss } from "$lib/utils/backdropDismiss";

	let {
		ref = $bindable(null),
		class: className,
		onBackdropDismiss,
		...restProps
	}: DialogPrimitive.OverlayProps & {
		/** Dismiss on a press that goes down AND up on the overlay (BUG-3229),
		 *  so a text selection dragged out of the content never closes it. */
		onBackdropDismiss?: () => void;
	} = $props();

	const classes = $derived(
		cn("data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/50 duration-150 fixed inset-0 isolate z-[300]", className)
	);
</script>

{#if onBackdropDismiss}
	<DialogPrimitive.Overlay bind:ref data-slot="dialog-overlay" {...restProps}>
		{#snippet child({ props })}
			<div {...props} class={classes} use:backdropDismiss={{ onDismiss: () => onBackdropDismiss?.() }}></div>
		{/snippet}
	</DialogPrimitive.Overlay>
{:else}
	<DialogPrimitive.Overlay bind:ref data-slot="dialog-overlay" class={classes} {...restProps} />
{/if}
