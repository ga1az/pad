<script lang="ts">
	import { NativeSelect } from '$lib/components/ui/native-select';
	import { uniqueBy } from '$lib/utils/unique';
	/**
	 * Display settings block shared by CreateCollectionModal (inside its
	 * "Advanced" reveal) and EditCollectionModal (as its Display tab
	 * content). Pure presentation — all state is bindable and owned by
	 * the parent modal.
	 *
	 * Select-field-dependent controls (board / list group-by) are only
	 * rendered when the parent passes in at least one select-type field;
	 * otherwise there's nothing sensible to group by.
	 */

	export interface DisplayFieldOption {
		key: string;
		label: string;
	}

	type DefaultView = 'list' | 'board' | 'table';
	type Layout = 'fields-primary' | 'content-primary' | 'balanced';

	interface Props {
		defaultView: DefaultView;
		layout: Layout;
		boardGroupBy: string;
		listGroupBy: string;
		listSortBy: string;
		/** Keys of select / multi_select fields — used to populate group-by options. */
		selectFieldKeys: DisplayFieldOption[];
		/** Keys available for sorting — typically all fields + created/updated/manual. */
		sortableFieldKeys: DisplayFieldOption[];
	}

	let {
		defaultView = $bindable(),
		layout = $bindable(),
		boardGroupBy = $bindable(),
		listGroupBy = $bindable(),
		listSortBy = $bindable(),
		selectFieldKeys,
		sortableFieldKeys
	}: Props = $props();
</script>

<div class="settings-grid">
	<div class="setting-item">
		<label class="setting-label" for="ds-default-view">Default view</label>
		<NativeSelect id="ds-default-view" bind:value={defaultView}>
			<option value="list">List</option>
			<option value="board">Board</option>
			<option value="table">Table</option>
		</NativeSelect>
	</div>

	<div class="setting-item">
		<label class="setting-label" for="ds-layout">Item layout</label>
		<NativeSelect id="ds-layout" bind:value={layout} aria-describedby="ds-layout-hint">
			<option value="balanced">Balanced</option>
			<option value="fields-primary">Fields primary</option>
			<option value="content-primary">Content primary</option>
		</NativeSelect>
		<p class="setting-hint" id="ds-layout-hint">
			Applies to the docked pane and narrow windows; wide pages use Linear's two-column layout.
		</p>
	</div>

	{#if selectFieldKeys.length > 0}
		<div class="setting-item">
			<label class="setting-label" for="ds-board-group">Board group by</label>
			<NativeSelect id="ds-board-group" bind:value={boardGroupBy}>
				{#each uniqueBy(selectFieldKeys, (x) => x.key) as f (f.key)}
					<option value={f.key}>{f.label}</option>
				{/each}
			</NativeSelect>
			<p class="setting-hint">
				Also determines which field's terminal options drive "done" in
				dashboards, progress bars, and changelog.
			</p>
		</div>

		<div class="setting-item">
			<label class="setting-label" for="ds-list-group">List group by</label>
			<NativeSelect id="ds-list-group" bind:value={listGroupBy}>
				<option value="">None</option>
				{#each uniqueBy(selectFieldKeys, (x) => x.key) as f (f.key)}
					<option value={f.key}>{f.label}</option>
				{/each}
			</NativeSelect>
		</div>
	{/if}

	<div class="setting-item">
		<label class="setting-label" for="ds-list-sort">List sort by</label>
		<NativeSelect id="ds-list-sort" bind:value={listSortBy}>
			<option value="">Default</option>
			{#each uniqueBy(sortableFieldKeys, (x) => x.key) as f (f.key)}
				<option value={f.key}>{f.label}</option>
			{/each}
		</NativeSelect>
	</div>
</div>

<style>
	.settings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: var(--space-4);
	}

	.setting-item {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.setting-label {
		font-size: 0.75em;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
	}

	.setting-hint {
		margin: var(--space-1) 0 0;
		font-size: 0.72em;
		line-height: 1.4;
		color: var(--text-muted);
	}

	@media (max-width: 640px) {
		.settings-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
