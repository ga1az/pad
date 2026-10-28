<script lang="ts">
	import Icon from '$lib/icons/Icon.svelte';
	import { Copy01Icon } from '@hugeicons/core-free-icons';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { toastStore } from '$lib/stores/toast.svelte';
	import { fieldSummaryMarkdown, type FieldSummaryRow } from '$lib/items/fieldSummary';

	// The item's Summary (TASK-22): every filled field as full, wrapped text,
	// readable at once, with Copy for handing the task to an agent.
	interface Props {
		rows: FieldSummaryRow[];
		/** "TASK-12 Title", the copied Markdown's heading. */
		heading: string;
	}

	let { rows, heading }: Props = $props();

	async function copy() {
		const ok = await copyToClipboard(fieldSummaryMarkdown(heading, rows));
		toastStore.show(ok ? 'Summary copied' : 'Failed to copy the summary', ok ? 'success' : 'error');
	}
</script>

{#if rows.length > 0}
	<details class="field-summary" open>
		<summary class="field-summary-head">
			<span class="field-summary-title">Summary</span>
			<button
				type="button"
				class="field-summary-copy"
				onclick={(e) => { e.preventDefault(); copy(); }}
				title="Copy the summary as Markdown"
			>
				<Icon icon={Copy01Icon} /> Copy
			</button>
		</summary>
		<dl class="field-summary-list">
			{#each rows as row (row.key)}
				<div class="field-summary-row">
					<dt>{row.label}</dt>
					<dd>{row.text}</dd>
				</div>
			{/each}
		</dl>
	</details>
{/if}

<style>
	/* Quiet (SPEC-24 / TASK-31): no card, no box. A gray label, then each
	   field as a small gray name over its full text. */
	.field-summary {
		margin-bottom: var(--space-5);
	}
	.field-summary-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		list-style: none;
	}
	.field-summary-head::-webkit-details-marker {
		display: none;
	}
	.field-summary-title {
		font-size: 13px;
		font-weight: 500;
		color: var(--ui-muted-foreground);
	}
	.field-summary-copy {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		height: 24px;
		padding: 0 8px;
		font-size: 12px;
		color: var(--ui-muted-foreground);
		border-radius: 6px;
	}
	.field-summary-copy:hover {
		background: color-mix(in oklab, var(--ui-foreground) 4%, transparent);
		color: var(--ui-foreground);
	}
	.field-summary-list {
		margin: var(--space-2) 0 0;
	}
	.field-summary-row {
		padding: var(--space-1) 0;
	}
	dt {
		font-size: 12px;
		color: var(--ui-muted-foreground);
	}
	dd {
		margin: 2px 0 0;
		font-size: 14px;
		color: var(--text-primary);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
