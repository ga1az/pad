/**
 * Portal a node to <body> (or the nearest open dialog, so portaled UI stays
 * inside its focus trap and outside-press rules). Extracted from the
 * hand-copied versions in ItemActionsMenu and EmojiPickerButton (PLAN-2290
 * Phase 2). "Dialog" is a native <dialog> or the content of a shadcn-svelte
 * Dialog / Alert Dialog (TASK-26), which carries no transform once open, so a
 * position:fixed node inside it still places against the viewport.
 *
 * Why portal at all: triggers that live under `content-visibility: auto`
 * containment (board/list cards) clip absolutely-positioned descendants —
 * a fixed-position panel portaled to the body escapes that.
 */
export const DIALOG_HOST_SELECTOR =
	'dialog, [data-slot="dialog-content"], [data-slot="alert-dialog-content"]';

export function portal(node: HTMLElement) {
	const dialog = node.closest(DIALOG_HOST_SELECTOR);
	(dialog ?? document.body).appendChild(node);
	return {
		destroy() {
			node.remove();
		}
	};
}
