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
	.field-summary {
		margin-bottom: var(--space-4);
		padding: var(--space-3);
		background: var(--bg-secondary);
		border: 1px solid var(--border);
		border-radius: var(--radius);
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
		font-size: 0.75em;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-muted);
	}
	.field-summary-copy {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 2px var(--space-2);
		font-size: 0.8em;
		color: var(--text-secondary);
		border-radius: var(--radius-sm);
	}
	.field-summary-copy:hover {
		background: var(--bg-hover);
		color: var(--text-primary);
	}
	.field-summary-list {
		margin: var(--space-2) 0 0;
	}
	.field-summary-row {
		padding: var(--space-1) 0;
	}
	.field-summary-row + .field-summary-row {
		border-top: 1px solid var(--border-subtle, var(--border));
	}
	dt {
		font-size: 0.78em;
		color: var(--text-muted);
	}
	dd {
		margin: 2px 0 0;
		font-size: 0.9em;
		color: var(--text-primary);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
</style>
