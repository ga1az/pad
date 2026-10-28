<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from "bits-ui";
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from "$lib/utils.js";
	import AlertDialogOverlay from "./alert-dialog-overlay.svelte";
	import AlertDialogPortal from "./alert-dialog-portal.svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		size = "default",
		portalProps,
		onBackdropDismiss,
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		size?: "default" | "sm";
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
		/** See AlertDialogOverlay: opt-in full-press backdrop dismissal. */
		onBackdropDismiss?: () => void;
	} = $props();
</script>

<!-- Placed like ui/dialog's content (inset-0 + margin:auto, no translate). -->
<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay {onBackdropDismiss} />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		data-size={size}
		class={cn(
			"data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 bg-popover text-popover-foreground border-border gap-4 rounded-xl border p-5 shadow-[0_8px_24px_rgb(0_0_0/0.24)] duration-150 w-[calc(100%-32px)] data-[size=default]:max-w-[440px] data-[size=sm]:max-w-64 group/alert-dialog-content fixed inset-0 z-[300] m-auto grid h-fit outline-none",
			className
		)}
		{...restProps}
	/>
</AlertDialogPortal>
