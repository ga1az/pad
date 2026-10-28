<!--
	PriorityIcon: a priority as Linear's bars (SPEC-24 / TASK-28). Three bars
	rising left to right, as many lit as the level (low 1, medium 2, high 3);
	urgent is an exclamation cut out of a filled rounded square; no priority
	is three dashes.

	Decorative unless `label` is set.
-->
<script lang="ts">
	import type { PriorityLevel } from './statusCategory';

	interface Props {
		level: PriorityLevel;
		size?: number;
		/** The accessible name. Without one the icon is aria-hidden. */
		label?: string;
	}

	let { level, size = 14, label }: Props = $props();
	const uid = $props.id();
	const maskId = `priority-icon-${uid}`;
	const lit = $derived(level === 'high' ? 3 : level === 'medium' ? 2 : level === 'low' ? 1 : 0);
	// x and height of each bar, bottom-aligned at y 12.5.
	const BARS = [
		{ x: 1.5, h: 5 },
		{ x: 5.75, h: 8 },
		{ x: 10, h: 11 },
	];
</script>

<svg
	class="priority-icon"
	data-priority-level={level}
	width={size}
	height={size}
	viewBox="0 0 14 14"
	fill="none"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if level === 'urgent'}
		<mask id={maskId}>
			<rect width="14" height="14" fill="white" />
			<rect x="6.25" y="3.25" width="1.5" height="4.75" rx="0.75" fill="black" />
			<circle cx="7" cy="10.1" r="0.9" fill="black" />
		</mask>
		<rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" mask="url(#{maskId})" />
	{:else if level === 'none'}
		<rect x="1.5" y="6.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
		<rect x="5.75" y="6.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
		<rect x="10" y="6.25" width="2.5" height="1.5" rx="0.5" fill="currentColor" />
	{:else}
		{#each BARS as bar, i (bar.x)}
			<rect
				class:dim={i >= lit}
				x={bar.x}
				y={12.5 - bar.h}
				width="2.5"
				height={bar.h}
				rx="0.75"
				fill="currentColor"
			/>
		{/each}
	{/if}
</svg>

<style>
	.priority-icon {
		display: block;
		flex: none;
		color: var(--ui-muted-foreground);
	}
	.dim {
		opacity: 0.35;
	}
</style>
