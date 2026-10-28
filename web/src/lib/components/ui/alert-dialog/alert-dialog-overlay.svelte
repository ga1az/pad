<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import { cn } from "$lib/utils.js";
	import { backdropDismiss } from "$lib/utils/backdropDismiss";

	let {
		ref = $bindable(null),
		class: className,
		onBackdropDismiss,
		...restProps
	}: AlertDialogPrimitive.OverlayProps & {
		/** Opt-in: dismiss on a press that goes down AND up on the overlay
		 *  (BUG-3229). An alert dialog ignores outside presses by default. */
		onBackdropDismiss?: () => void;
	} = $props();

	const classes = $derived(
		cn("data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/50 duration-150 fixed inset-0 z-[300]", className)
	);
</script>

{#if onBackdropDismiss}
	<AlertDialogPrimitive.Overlay bind:ref data-slot="alert-dialog-overlay" {...restProps}>
		{#snippet child({ props })}
			<div {...props} class={classes} use:backdropDismiss={{ onDismiss: () => onBackdropDismiss?.() }}></div>
		{/snippet}
	</AlertDialogPrimitive.Overlay>
{:else}
	<AlertDialogPrimitive.Overlay bind:ref data-slot="alert-dialog-overlay" class={classes} {...restProps} />
{/if}
