<script lang="ts">
	import { Dialog as DialogPrimitive } from "bits-ui";
	import { HugeiconsIcon } from "@hugeicons/svelte"
	import { Cancel01Icon } from '@hugeicons/core-free-icons';
	import { Button } from "$lib/components/ui/button/index.js";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";
	import * as Dialog from "./index.js";
	import DialogPortal from "./dialog-portal.svelte";
	import type { Snippet } from "svelte";
	import type { ComponentProps } from "svelte";

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		showCloseButton = true,
		onBackdropDismiss,
		interactOutsideBehavior,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
		showCloseButton?: boolean;
		/** Close on a full press on the overlay only (BUG-3229). When set, the
		 *  content ignores bits-ui's pointerdown-outside dismissal, which would
		 *  close on a press that ends in the content. */
		onBackdropDismiss?: () => void;
	} = $props();
</script>

<!--
	Placed with inset-0 + margin:auto (as a native <dialog> is), not with a
	translate: a transform would make this the containing box of every
	position:fixed popover portaled inside it (portalAction, EmojiPickerButton).
	z-[300] sits above the legacy popovers (menus 200) the old top-layer
	<dialog> covered. Linear surface: one step above the panel, a hairline
	border, a soft shadow.
-->
<DialogPortal {...portalProps}>
	<Dialog.Overlay {onBackdropDismiss} />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		interactOutsideBehavior={interactOutsideBehavior ?? (onBackdropDismiss ? "ignore" : "close")}
		class={cn(
			"bg-popover text-popover-foreground border-border data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 fixed inset-0 z-[300] m-auto grid h-fit max-h-[85vh] w-full max-w-[calc(100%-32px)] gap-4 overflow-y-auto rounded-xl border p-4 shadow-[0_8px_24px_rgb(0_0_0/0.24)] duration-150 outline-none sm:max-w-sm max-sm:max-h-[calc(100vh-24px)]",
			className
		)}
		{...restProps}
	>
		{@render children?.()}
		{#if showCloseButton}
			<DialogPrimitive.Close data-slot="dialog-close">
				{#snippet child({ props })}
					<Button variant="ghost" class="absolute top-2 right-2" size="icon-sm" {...props}>
						<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2}  />
						<span class="sr-only">Close</span>
					</Button>
				{/snippet}
			</DialogPrimitive.Close>
		{/if}
	</DialogPrimitive.Content>
</DialogPortal>
