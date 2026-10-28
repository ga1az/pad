<!-- Test harness for AnchoredPopover.inDialog.svelte.test.ts: the TASK-30
     pickers with their triggers inside a real AppDialog. -->
<script lang="ts">
	import AppDialog from '../AppDialog.svelte';
	import StatusPicker from '$lib/components/collections/StatusPicker.svelte';
	import EmojiPickerButton from '$lib/components/common/EmojiPickerButton.svelte';

	let { kind = 'status' }: { kind?: 'status' | 'emoji' } = $props();
	let dialogOpen = $state(true);
	let status = $state('open');
	let icon = $state('📋');
</script>

<AppDialog open={dialogOpen} onclose={() => (dialogOpen = false)} ariaLabel="Settings">
	<div>
		<input id="dialog-field" aria-label="Name" />
		{#if kind === 'status'}
			<StatusPicker value={status} options={['open', 'in_progress', 'done']} onselect={(v) => (status = v)} />
		{:else}
			<EmojiPickerButton bind:value={icon} />
		{/if}
	</div>
</AppDialog>
