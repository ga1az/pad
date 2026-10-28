// The icons the collection / role icon picker offers, and the words the
// desktop picker's search matches them by. The stored value is the emoji
// itself; nothing here changes what is saved (TASK-14 maps a stored emoji to
// its Hugeicon only when it is displayed). Shared by the mobile grid
// (EmojiPicker) and the desktop popover (EmojiPickerPanel).

export interface EmojiEntry {
	emoji: string;
	/** Words the search matches, besides the group label. */
	name: string;
}

export interface EmojiGroup {
	label: string;
	emojis: EmojiEntry[];
}

export const EMOJI_GROUPS: EmojiGroup[] = [
	{
		label: 'Objects',
		emojis: [
			{ emoji: '📋', name: 'clipboard list' },
			{ emoji: '📝', name: 'memo note write' },
			{ emoji: '📄', name: 'page document' },
			{ emoji: '📁', name: 'folder' },
			{ emoji: '📂', name: 'open folder' },
			{ emoji: '📌', name: 'pin pushpin' },
			{ emoji: '📎', name: 'paperclip attachment' },
			{ emoji: '🔖', name: 'bookmark' },
			{ emoji: '📊', name: 'bar chart stats' },
			{ emoji: '📈', name: 'chart up increase growth' },
			{ emoji: '📉', name: 'chart down decrease' },
			{ emoji: '📦', name: 'package box' },
		],
	},
	{
		label: 'Symbols',
		emojis: [
			{ emoji: '✓', name: 'check done tick' },
			{ emoji: '✗', name: 'cross x close' },
			{ emoji: '⚡', name: 'lightning bolt zap' },
			{ emoji: '🔥', name: 'fire hot' },
			{ emoji: '⭐', name: 'star' },
			{ emoji: '💡', name: 'idea light bulb' },
			{ emoji: '🎯', name: 'target goal' },
			{ emoji: '🏷️', name: 'label tag' },
			{ emoji: '🔔', name: 'bell notification' },
			{ emoji: '💬', name: 'comment chat speech' },
			{ emoji: '🔗', name: 'link chain' },
			{ emoji: '🔒', name: 'lock secure' },
		],
	},
	{
		label: 'People',
		emojis: [
			{ emoji: '👤', name: 'person user' },
			{ emoji: '👥', name: 'people team users' },
			{ emoji: '🧑‍💻', name: 'developer technologist coder' },
			{ emoji: '🤝', name: 'handshake deal' },
			{ emoji: '💪', name: 'strong muscle' },
			{ emoji: '🎉', name: 'party celebrate tada' },
			{ emoji: '👀', name: 'eyes look review' },
			{ emoji: '🙌', name: 'raised hands celebrate' },
			{ emoji: '🧠', name: 'brain think' },
			{ emoji: '❤️', name: 'heart love' },
			{ emoji: '👍', name: 'thumbs up approve' },
			{ emoji: '🚀', name: 'rocket launch ship' },
		],
	},
	{
		label: 'Nature',
		emojis: [
			{ emoji: '🌱', name: 'seedling sprout' },
			{ emoji: '🌿', name: 'herb plant leaf' },
			{ emoji: '🌍', name: 'globe earth world' },
			{ emoji: '☀️', name: 'sun' },
			{ emoji: '🌙', name: 'moon night' },
			{ emoji: '⚙️', name: 'gear settings' },
			{ emoji: '🔧', name: 'wrench tool' },
			{ emoji: '🛠️', name: 'hammer wrench tools build' },
			{ emoji: '🧪', name: 'test tube experiment' },
			{ emoji: '🔬', name: 'microscope research' },
			{ emoji: '💎', name: 'gem diamond' },
			{ emoji: '🏗️', name: 'construction building' },
		],
	},
];

/** The groups with only the entries a search matches (all of them when empty). */
export function filterEmojiGroups(query: string): EmojiGroup[] {
	const q = query.trim().toLowerCase();
	if (!q) return EMOJI_GROUPS;
	return EMOJI_GROUPS.map((g) => ({
		...g,
		emojis: g.emojis.filter(
			(e) => e.emoji === q || e.name.includes(q) || g.label.toLowerCase().includes(q)
		),
	})).filter((g) => g.emojis.length > 0);
}
