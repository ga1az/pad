<script lang="ts">
	import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/svelte';
	import { iconForEmoji } from './emojiIcons';

	interface Props {
		/** A Hugeicons icon, or a stored emoji (a collection's or role's
		 *  `icon`). An emoji with a Hugeicons equivalent renders as that SVG;
		 *  one without (a user's own pick) renders as itself. */
		icon: IconSvgElement | string | null | undefined;
		/** Rendered size in px. Defaults to the surrounding font size's 1em. */
		size?: number | string;
		strokeWidth?: number;
		class?: string;
	}

	let { icon, size = '1em', strokeWidth = 1.75, class: className = '' }: Props = $props();

	const svg = $derived(typeof icon === 'string' ? iconForEmoji(icon) : icon);
</script>

{#if svg}
	<HugeiconsIcon icon={svg} {size} {strokeWidth} color="currentColor" class="pad-icon {className}" />
{:else if typeof icon === 'string' && icon}
	<span class="pad-icon-text {className}">{icon}</span>
{/if}

<style>
	:global(.pad-icon) {
		display: inline-block;
		flex-shrink: 0;
		vertical-align: -0.125em;
	}
</style>
