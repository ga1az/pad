<!-- Test harness for ResponsiveMenu.svelte.test.ts: a trigger the parent owns,
     a menu with button, radio, disabled and link rows, and a text field. -->
<script lang="ts">
	import ResponsiveMenu from '../ResponsiveMenu.svelte';
	import ResponsiveMenuItem from '../ResponsiveMenuItem.svelte';

	let { onpick = () => {}, initiallyOpen = true }: { onpick?: (what: string) => void; initiallyOpen?: boolean } = $props();
	// svelte-ignore state_referenced_locally
	let open = $state(initiallyOpen);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	export function isOpen() {
		return open;
	}
</script>

<button type="button" id="trigger" bind:this={triggerEl} onclick={() => (open = !open)}>Actions</button>
<button type="button" id="outside">Elsewhere</button>
<ResponsiveMenu {open} onclose={() => (open = false)} trigger={triggerEl} ariaLabel="Actions" mode="portal" width={240}>
	<ResponsiveMenuItem onclick={() => onpick('rename')}>Rename</ResponsiveMenuItem>
	<ResponsiveMenuItem checked={true} onclick={() => onpick('starred')}>Starred</ResponsiveMenuItem>
	<ResponsiveMenuItem disabled onclick={() => onpick('disabled')}>Unavailable</ResponsiveMenuItem>
	<ResponsiveMenuItem href="/somewhere" onclick={() => onpick('link')}>Open</ResponsiveMenuItem>
	<ResponsiveMenuItem danger onclick={() => onpick('delete')}>Delete</ResponsiveMenuItem>
	<input id="menu-input" aria-label="Name" />
</ResponsiveMenu>
