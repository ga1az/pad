<!--
	StatusIcon: a status as one of Linear's six workflow shapes (SPEC-24 /
	TASK-28). Drawn here, not copied: a dashed ring (backlog), an empty ring
	(planned), a ring half and three-quarters filled (in progress, in review),
	a filled disc with a check (done) or an X (abandoned).

	Decorative unless `label` is set: next to a visible status name it should
	stay silent, and alone it needs the name.
-->
<script lang="ts">
	import type { StatusCategory } from './statusCategory';

	interface Props {
		category: StatusCategory;
		size?: number;
		/** The accessible name. Without one the icon is aria-hidden. */
		label?: string;
	}

	let { category, size = 14, label }: Props = $props();
	// The check and the X are cut out of the disc, so they show whatever is
	// behind the icon (the card, the column) in either theme.
	const uid = $props.id();
	const maskId = `status-icon-${uid}`;
</script>

<svg
	class="status-icon"
	data-status-category={category}
	width={size}
	height={size}
	viewBox="0 0 14 14"
	fill="none"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{#if category === 'backlog'}
		<circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2.36 2.35" />
	{:else if category === 'planned'}
		<circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5" />
	{:else if category === 'progress'}
		<circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5" />
		<path d="M7 7V3.5A3.5 3.5 0 0 1 7 10.5Z" fill="currentColor" />
	{:else if category === 'review'}
		<circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.5" />
		<path d="M7 7V3.5A3.5 3.5 0 1 1 3.5 7Z" fill="currentColor" />
	{:else}
		<mask id={maskId}>
			<rect width="14" height="14" fill="white" />
			{#if category === 'done'}
				<path d="M4.4 7.2 6.2 9 9.7 5.3" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			{:else}
				<path d="M5 5 9 9M9 5 5 9" stroke="black" stroke-width="1.5" stroke-linecap="round" />
			{/if}
		</mask>
		<circle cx="7" cy="7" r="6.75" fill="currentColor" mask="url(#{maskId})" />
	{/if}
</svg>

<style>
	.status-icon {
		display: block;
		flex: none;
	}
	[data-status-category='backlog'],
	[data-status-category='planned'] {
		color: var(--ui-status-backlog);
	}
	[data-status-category='progress'] {
		color: var(--ui-status-progress);
	}
	[data-status-category='review'] {
		color: var(--ui-status-review);
	}
	[data-status-category='done'] {
		color: var(--ui-status-done);
	}
	[data-status-category='cancelled'] {
		color: var(--ui-status-cancelled);
	}
</style>
