<!--
  AppToast — one toast of the app's toastStore, rendered inside Sonner's list
  (SPEC-24 / TASK-26; see AppToaster). The store owns its life: timing, the
  hover/focus hold, grouping and dismissal. This is the body and its
  controls, as the old container had them.
-->
<script lang="ts">
	import {
		CheckmarkCircle02Icon,
		InformationCircleIcon,
		MultiplicationSignCircleIcon,
		Cancel01Icon
	} from '@hugeicons/core-free-icons';
	import { goto } from '$app/navigation';
	import Icon from '$lib/icons/Icon.svelte';
	import { toastStore, type Toast } from '$lib/stores/toast.svelte';
	import { cn } from '$lib/utils';

	// Sonner passes `closeToast` to a custom toast; the store dismisses
	// instead, which also closes it in Sonner (AppToaster).
	let { toast }: { toast: Toast; closeToast?: () => void } = $props();

	const icons = {
		success: { icon: CheckmarkCircle02Icon, tone: 'text-status-review' },
		error: { icon: MultiplicationSignCircleIcon, tone: 'text-destructive' },
		info: { icon: InformationCircleIcon, tone: 'text-primary' }
	} as const;
	const kind = $derived(icons[toast.type]);

	function handleClick() {
		if (toast.link) {
			const link = toast.link;
			toastStore.dismiss(toast.id);
			goto(link);
		}
	}

	// HOLD (TASK-2202): the toast stays while the pointer is over it or focus
	// is inside it. Two separate holds, so leaving with the mouse while a
	// button inside still has focus keeps it up.
	function holdOnFocusOut(e: FocusEvent) {
		const next = e.relatedTarget as Node | null;
		if (next && (e.currentTarget as HTMLElement).contains(next)) return;
		toastStore.resume(toast.id);
	}
	function holdOnFocusIn(e: FocusEvent) {
		const prev = e.relatedTarget as Node | null;
		if (prev && (e.currentTarget as HTMLElement).contains(prev)) return;
		toastStore.pause(toast.id);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
<div
	class={cn(
		`toast toast-${toast.type}`,
		'flex w-full items-center gap-3 rounded-lg border border-border bg-popover px-3.5 py-3 text-[13px] text-popover-foreground shadow-[0_4px_16px_rgb(0_0_0/0.24)]',
		toast.link && 'clickable cursor-pointer transition-colors duration-150 hover:bg-[color-mix(in_oklch,var(--ui-popover),white_4%)]'
	)}
	data-toast-id={toast.id}
	onclick={handleClick}
	onmouseenter={() => toastStore.pause(toast.id)}
	onmouseleave={() => toastStore.resume(toast.id)}
	onfocusin={holdOnFocusIn}
	onfocusout={holdOnFocusOut}
	role={toast.link ? 'button' : undefined}
	tabindex={toast.link ? 0 : -1}
	onkeydown={(e) => {
		if (!toast.link || e.target !== e.currentTarget) return;
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleClick();
		}
	}}
>
	<span class={cn('toast-icon flex shrink-0', kind.tone)}><Icon icon={kind.icon} size={16} /></span>
	<span class="toast-message min-w-0 flex-1 leading-[1.4] whitespace-pre-line"
		>{toast.message}{#if toast.link}<span class="toast-link-hint text-primary font-semibold"> →</span>{/if}</span
	>
	{#if toast.action}
		<button
			type="button"
			class="toast-action shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors duration-100 hover:bg-primary/10"
			onclick={(e) => {
				e.stopPropagation();
				toast.action?.onAction();
				toastStore.dismiss(toast.id);
			}}>{toast.action.label}</button
		>
	{/if}
	<button
		type="button"
		class="toast-dismiss flex size-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-100 hover:bg-foreground/6 hover:text-foreground"
		onclick={(e) => {
			e.stopPropagation();
			toastStore.dismiss(toast.id);
		}}
		aria-label="Dismiss notification"><Icon icon={Cancel01Icon} size={12} /></button
	>
</div>
