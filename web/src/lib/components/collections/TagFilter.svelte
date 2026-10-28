<script lang="ts">
	/**
	 * Multi-select tag filter for the collection page. Renders one toggle
	 * chip per tag present in the *current collection*, each showing the
	 * tag's item count within that collection. Selection is OR semantics —
	 * the caller shows items carrying ANY selected tag.
	 *
	 * Counts are computed client-side from the local index (the collection
	 * page already holds every row's tags), so this is workspace-agnostic
	 * and needs no network round-trip. Chip styling mirrors
	 * `fields/TagInput.svelte` for visual consistency.
	 */
	interface Props {
		/** Collection-scoped tags with counts, ordered by count desc. */
		tags: { tag: string; count: number }[];
		/** Currently-selected tag values. */
		selected: string[];
		onchange: (selected: string[]) => void;
	}

	let { tags, selected, onchange }: Props = $props();

	let selectedSet = $derived(new Set(selected));

	function toggle(tag: string) {
		if (selectedSet.has(tag)) {
			onchange(selected.filter((t) => t !== tag));
		} else {
			onchange([...selected, tag]);
		}
	}

	function clearAll() {
		onchange([]);
	}
</script>

{#if tags.length > 0}
	<div class="tag-filter" role="group" aria-label="Filter by tag">
		{#each tags as { tag, count } (tag)}
			{@const active = selectedSet.has(tag)}
			<button
				type="button"
				class="tag-chip"
				class:active
				aria-pressed={active}
				onclick={() => toggle(tag)}
			>
				<span class="tag-name">{tag}</span>
				<span class="tag-count">{count}</span>
			</button>
		{/each}
		{#if selected.length > 0}
			<button type="button" class="tag-clear" onclick={clearAll}>Clear tags</button>
		{/if}
	</div>
{/if}

<style>
	.tag-filter {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1, 0.25rem);
		align-items: center;
	}
	/* Linear's filter chip (TASK-29), as FilterBar's: 24px, round, a faint
	   rim, 12px medium; the selected tags are tinted indigo. */
	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		height: 24px;
		padding: 0 9px;
		font: inherit;
		font-size: 12px;
		font-weight: 500;
		line-height: 1;
		background: none;
		border: 1px solid color-mix(in oklch, var(--ui-foreground) 12%, transparent);
		border-radius: 999px;
		color: var(--ui-muted-foreground);
		white-space: nowrap;
		cursor: pointer;
	}
	.tag-chip:hover:not(.active) {
		color: var(--ui-foreground);
		background: color-mix(in oklch, var(--ui-foreground) 4%, transparent);
	}
	.tag-chip.active {
		background: color-mix(in oklch, var(--ui-primary) 18%, transparent);
		border-color: color-mix(in oklch, var(--ui-primary) 45%, transparent);
		color: var(--ui-foreground);
	}
	.tag-count {
		font-variant-numeric: tabular-nums;
		color: var(--ui-subtle-foreground);
	}
	.tag-chip.active .tag-count {
		color: var(--ui-muted-foreground);
	}
	.tag-clear {
		background: none;
		border: none;
		padding: 0.1em 0.4em;
		font-size: 12px;
		color: var(--ui-muted-foreground);
		cursor: pointer;
	}
	.tag-clear:hover {
		color: var(--ui-foreground);
	}
	.tag-chip:focus-visible,
	.tag-clear:focus-visible {
		outline: 2px solid var(--ui-ring);
		outline-offset: 1px;
	}
</style>
