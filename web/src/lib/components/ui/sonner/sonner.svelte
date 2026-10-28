<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from "svelte-sonner";
	import { HugeiconsIcon } from "@hugeicons/svelte"
	import { Loading03Icon } from '@hugeicons/core-free-icons';
	import { CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
	import { MultiplicationSignCircleIcon } from '@hugeicons/core-free-icons';
	import { InformationCircleIcon } from '@hugeicons/core-free-icons';
	import { Alert02Icon } from '@hugeicons/core-free-icons';

	// No mode-watcher: the app's theme is <html data-theme> (or the OS), which
	// the --ui-* tokens already follow, so the styled toasts read them directly.
	let { ...restProps }: SonnerProps = $props();
</script>

<Sonner
	class="toaster group"
	style="--normal-bg: var(--ui-popover); --normal-text: var(--ui-popover-foreground); --normal-border: var(--ui-border);"
	toastOptions={{
		classes: {
			toast: "cn-toast",
		},
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<HugeiconsIcon icon={Loading03Icon} strokeWidth={2} class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<HugeiconsIcon icon={MultiplicationSignCircleIcon} strokeWidth={2} class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<HugeiconsIcon icon={Alert02Icon} strokeWidth={2} class="size-4" />
	{/snippet}
</Sonner>
