<!-- Test harness for AnchoredPopover.svelte.test.ts: a trigger inside a
     clipping lane, a field and a chip outside it, and a one-row Command. -->
<script lang="ts">
	import AnchoredPopover from '../AnchoredPopover.svelte';
	import * as Command from '$lib/components/ui/command';

	let { onclose = () => {} }: { onclose?: () => void } = $props();
	let open = $state(true);
	let triggerEl = $state<HTMLButtonElement | null>(null);
</script>

<div id="lane" style="overflow: auto; height: 100px">
	<button type="button" id="anchor" bind:this={triggerEl} onclick={() => (open = !open)}>Status</button>
</div>
<input id="field" aria-label="Name" />
<AnchoredPopover
	{open}
	onclose={() => {
		open = false;
		onclose();
	}}
	trigger={triggerEl}
	ariaLabel="Pick"
>
	{#snippet children({ close })}
		<Command.Root>
			<Command.Input placeholder="Search" />
			<Command.List>
				<Command.Item value="a" onSelect={() => close(true)}>A</Command.Item>
			</Command.List>
		</Command.Root>
	{/snippet}
</AnchoredPopover>
