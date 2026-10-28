<script lang="ts">
	import Icon from '$lib/icons/Icon.svelte';
	import { Link01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { authStore } from '$lib/stores/auth.svelte';

	/**
	 * The item toolbar's "Copy link" (SPEC-24 / TASK-31): the item's own URL on
	 * the clipboard. Its own component, with its own "Copied" flag, so the
	 * clipboard await settles into state this button owns. ItemDetail remounts it
	 * per item, and a write that answers after the switch lands on a button that
	 * is gone. The look is the toolbar's `.tool-btn`, styled by ItemDetail.
	 */
	interface Props {
		/** The path of the item's full page; the origin is the page's. */
		path: string;
	}
	let { path }: Props = $props();

	let copied = $state(false);

	async function copy() {
		const isSameIdentity = authStore.identityFence();
		const ok = await copyToClipboard(`${window.location.origin}${path}`);
		// A sign-out or an account switch during the clipboard write: say nothing.
		if (!isSameIdentity()) return;
		if (!ok) {
			toastStore.show('Could not copy the link', 'error');
			return;
		}
		copied = true;
		setTimeout(() => (copied = false), 1500);
	}
</script>

<button type="button" class="tool-btn" onclick={copy} title="Copy link" aria-label="Copy link">
	{#if copied}<Icon icon={Tick02Icon} /><span class="copied-tooltip">Copied!</span>{:else}<Icon icon={Link01Icon} />{/if}
</button>

<style>
	.copied-tooltip {
		position: absolute;
		top: 100%;
		left: 50%;
		transform: translateX(-50%);
		margin-top: 4px;
		padding: 2px 8px;
		font-size: 12px;
		line-height: 1.4;
		color: var(--text-on-accent);
		background: var(--accent-green, #22c55e);
		border-radius: var(--radius-sm);
		white-space: nowrap;
		pointer-events: none;
		z-index: 20;
	}
</style>
