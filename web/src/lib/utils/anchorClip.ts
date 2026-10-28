/**
 * Is an anchor scrolled out of sight? (SPEC-24 / TASK-30.)
 *
 * A floating panel follows its anchor, so when the anchor scrolls out of the
 * lane, list or dialog body that clips it the panel would float over whatever
 * is next to that container. AnchoredPopover closes instead, as the menus it
 * replaced did on any scroll that could move their trigger (BUG-2610).
 *
 * "Out of sight" is floating-ui's `referenceHidden`: the anchor's box shares
 * no area with the visible rect, which is the viewport narrowed by every
 * ancestor that clips (any `overflow` other than `visible`). An absolutely
 * positioned anchor is not clipped by the ancestors between it and its
 * containing block; a fixed one only by the viewport. A partly visible anchor
 * is still in sight, so a card sliding under the lane's edge keeps its panel
 * until the last pixel is gone.
 */
export function isAnchorClipped(anchor: Element): boolean {
	if (!anchor.isConnected) return true;
	const box = anchor.getBoundingClientRect();
	let left = 0;
	let top = 0;
	let right = document.documentElement.clientWidth || window.innerWidth;
	let bottom = document.documentElement.clientHeight || window.innerHeight;

	let positioned = getComputedStyle(anchor).position;
	for (let el = anchor.parentElement; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
		if (positioned === 'fixed') break;
		const style = getComputedStyle(el);
		const escapes = positioned === 'absolute' && style.position === 'static';
		if (!escapes) {
			positioned = style.position;
			if ([style.overflow, style.overflowX, style.overflowY].some((v) => v && v !== 'visible')) {
				const r = el.getBoundingClientRect();
				left = Math.max(left, r.left);
				top = Math.max(top, r.top);
				right = Math.min(right, r.right);
				bottom = Math.min(bottom, r.bottom);
			}
		}
	}
	return box.right <= left || box.left >= right || box.bottom <= top || box.top >= bottom;
}
