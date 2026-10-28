<!-- Test harness for ResponsiveMenu.inDialog.svelte.test.ts: a menu whose
     trigger lives inside an AppDialog. -->
<script lang="ts">
	import AppDialog from '../AppDialog.svelte';
	import ResponsiveMenu from '../ResponsiveMenu.svelte';
	import ResponsiveMenuItem from '../ResponsiveMenuItem.svelte';

	let dialogOpen = $state(true);
	let menuOpen = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
</script>

<AppDialog open={dialogOpen} onclose={() => (dialogOpen = false)} ariaLabel="Settings">
	<div>
		<button type="button" id="menu-trigger" bind:this={triggerEl} onclick={() => (menuOpen = !menuOpen)}>Options</button>
		<ResponsiveMenu open={menuOpen} onclose={() => (menuOpen = false)} trigger={triggerEl} ariaLabel="Options" mode="portal">
			<ResponsiveMenuItem onclick={() => {}}>Rename</ResponsiveMenuItem>
			<ResponsiveMenuItem onclick={() => {}}>Duplicate</ResponsiveMenuItem>
		</ResponsiveMenu>
	</div>
</AppDialog>
