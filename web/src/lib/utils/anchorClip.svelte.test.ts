import { afterEach, describe, expect, it } from 'vitest';
import { isAnchorClipped } from './anchorClip';

afterEach(() => {
	document.body.innerHTML = '';
});

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
	return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** An element at `box`, optionally inside parents with their own boxes. */
function el(style: string, box: DOMRect, parent: Element = document.body) {
	const e = document.createElement('div');
	e.setAttribute('style', style);
	e.getBoundingClientRect = () => box;
	parent.appendChild(e);
	return e;
}

describe('isAnchorClipped', () => {
	it('is false for an anchor inside the lane that clips it', () => {
		const lane = el('overflow: auto', rect(0, 100, 300, 400));
		expect(isAnchorClipped(el('', rect(10, 150, 40, 170), lane))).toBe(false);
	});

	it('is true once the anchor is scrolled wholly above or below the lane', () => {
		const lane = el('overflow: auto', rect(0, 100, 300, 400));
		expect(isAnchorClipped(el('', rect(10, 60, 40, 100), lane))).toBe(true);
		expect(isAnchorClipped(el('', rect(10, 400, 40, 430), lane))).toBe(true);
	});

	it('stays false while one pixel of the anchor is still in the lane', () => {
		const lane = el('overflow: auto', rect(0, 100, 300, 400));
		expect(isAnchorClipped(el('', rect(10, 85, 40, 101), lane))).toBe(false);
	});

	it('clips sideways too, and by any non-visible overflow value', () => {
		const lane = el('overflow-x: hidden', rect(0, 100, 300, 400));
		expect(isAnchorClipped(el('', rect(320, 150, 350, 170), lane))).toBe(true);
	});

	it('ignores an ancestor that does not clip', () => {
		const wrap = el('overflow: visible', rect(0, 100, 300, 400));
		expect(isAnchorClipped(el('', rect(10, 600, 40, 620), wrap))).toBe(false);
	});

	it('is true for an anchor outside the viewport', () => {
		expect(isAnchorClipped(el('', rect(10, 5000, 40, 5020)))).toBe(true);
		expect(isAnchorClipped(el('', rect(10, 10, 40, 30)))).toBe(false);
	});

	it('is true for an anchor that left the document', () => {
		const anchor = el('', rect(10, 10, 40, 30));
		anchor.remove();
		expect(isAnchorClipped(anchor)).toBe(true);
	});

	it('does not clip a fixed anchor by a scroller above it', () => {
		const lane = el('overflow: auto', rect(0, 100, 300, 400));
		expect(isAnchorClipped(el('position: fixed', rect(10, 600, 40, 620), lane))).toBe(false);
	});

	it('does not clip an absolute anchor by a static scroller above its containing block', () => {
		const lane = el('overflow: auto', rect(0, 100, 300, 400));
		const block = el('position: relative', rect(0, 500, 300, 700), lane);
		const middle = el('', rect(0, 500, 300, 700), block);
		// Contained by `block` (relative, not clipping) and not by `lane`:
		// `block` is the containing block, so `lane` beyond it still clips it.
		expect(isAnchorClipped(el('position: absolute', rect(10, 520, 40, 540), middle))).toBe(true);
		// Whereas the lane is skipped when it sits between the anchor and a
		// containing block that is outside it.
		const outer = el('position: relative', rect(0, 0, 400, 800));
		const scroller = el('overflow: auto', rect(0, 100, 300, 400), outer);
		expect(isAnchorClipped(el('position: absolute', rect(10, 600, 40, 620), scroller))).toBe(false);
	});
});
