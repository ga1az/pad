<!--
  EmojiPickerPanel — the desktop icon picker's body (SPEC-24 / TASK-30): a
  Command with a search field over a six-column grid, shown in an
  AnchoredPopover by EmojiPickerButton. The mobile picker is still the
  EmojiPicker grid in a BottomSheet.

  The current icon is told apart by an inset ring (the highlight is a fill, and
  at open the current icon IS the highlighted one, so a fill alone, which the
  highlight outranks, would not show it).

  Keys: typing filters (by the icon's name or its group), the four arrows move
  through the grid (bits-ui's `columns` mode), Enter picks, Esc closes and
  refocuses the button. The stored value is the emoji itself, as before.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import * as Command from '$lib/components/ui/command';
	import { EMOJI_GROUPS, filterEmojiGroups } from './emojiGroups';

	interface Props {
		selected?: string;
		onselect: (emoji: string) => void;
	}

	let { selected, onselect }: Props = $props();

	let query = $state('');
	// Opens on the current icon when it is one of these, else on the first. Read
	// once: the highlight is the user's from then on.
	const initial = untrack(() => selected);
	let highlighted = $state(
		EMOJI_GROUPS.some((g) => g.emojis.some((e) => e.emoji === initial))
			? (initial as string)
			: EMOJI_GROUPS[0].emojis[0].emoji
	);
	const groups = $derived(filterEmojiGroups(query));
</script>

<Command.Root shouldFilter={false} loop columns={6} label="Pick an icon" bind:value={highlighted}>
	<Command.Input bind:value={query} showIcon placeholder="Search icons…" aria-label="Search icons" />
	<Command.List class="max-h-64">
		<Command.Empty>No icons found</Command.Empty>
		{#each groups as group (group.label)}
			<Command.Group heading={group.label}>
				<div class="grid grid-cols-6 gap-0.5 pb-1">
					{#each group.emojis as { emoji, name } (emoji)}
						<Command.Item
							value={emoji}
							aria-label={name}
							aria-checked={emoji === selected}
							title={name}
							class="aria-checked:bg-foreground/10 aria-checked:ring-1 aria-checked:ring-inset aria-checked:ring-(color:--command-focus) data-selected:aria-checked:bg-foreground/15 size-9 min-h-0 justify-center p-0 text-lg"
							onSelect={() => onselect(emoji)}
						>
							{emoji}
						</Command.Item>
					{/each}
				</div>
			</Command.Group>
		{/each}
	</Command.List>
</Command.Root>
