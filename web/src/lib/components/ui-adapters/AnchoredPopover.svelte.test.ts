// AnchoredPopover (TASK-30 review): it closes when its anchor scrolls out of
// the container that clips it, and on resize, without moving focus; a scroll
// that leaves the anchor in sight keeps it open.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import { flushSync, tick } from 'svelte';
import PopoverHarness from './fixtures/PopoverHarness.svelte';

afterEach(() => {
	cleanup();
	document.body.innerHTML = '';
	vi.restoreAllMocks();
});

async function settle() {
	for (let i = 0; i < 3; i++) {
		await tick();
		flushSync();
	}
}

const panel = () => document.querySelector<HTMLElement>('[data-slot="popover-content"]');
const lane = () => document.getElementById('lane')!;
const anchor = () => document.getElementById('anchor') as HTMLButtonElement;

function box(left: number, top: number, right: number, bottom: number): DOMRect {
	return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON: () => ({}) } as DOMRect;
}

/** The lane is 100..400 tall; the anchor sits at `top` and is 20 tall. */
async function openInLane(onclose = vi.fn()) {
	let top = 150;
	render(PopoverHarness, { props: { onclose } });
	vi.spyOn(lane(), 'getBoundingClientRect').mockImplementation(() => box(0, 100, 300, 400));
	vi.spyOn(anchor(), 'getBoundingClientRect').mockImplementation(() => box(10, top, 40, top + 20));
	await settle();
	expect(panel(), 'precondition: the popover is open').not.toBeNull();
	return { onclose, scrollTo: (t: number) => (top = t) };
}

describe('AnchoredPopover: the anchor leaving its clipping container', () => {
	it('closes when a scroll takes the anchor wholly out of the lane, and does not refocus it', async () => {
		const { onclose, scrollTo } = await openInLane();
		scrollTo(40);
		lane().dispatchEvent(new Event('scroll'));
		await settle();
		expect(onclose).toHaveBeenCalledTimes(1);
		expect(panel()).toBeNull();
		expect(document.activeElement).not.toBe(anchor());
	});

	it('closes when the anchor leaves below the lane', async () => {
		const { onclose, scrollTo } = await openInLane();
		scrollTo(420);
		lane().dispatchEvent(new Event('scroll'));
		await settle();
		expect(onclose).toHaveBeenCalledTimes(1);
	});

	it('stays open while a scroll leaves the anchor partly or wholly in sight', async () => {
		const { onclose, scrollTo } = await openInLane();
		scrollTo(300);
		lane().dispatchEvent(new Event('scroll'));
		scrollTo(95);
		lane().dispatchEvent(new Event('scroll'));
		await settle();
		expect(onclose).not.toHaveBeenCalled();
		expect(panel()).not.toBeNull();
	});

	it('ignores a scroll of a container that does not hold the anchor', async () => {
		const { onclose, scrollTo } = await openInLane();
		scrollTo(40);
		document.getElementById('field')!.dispatchEvent(new Event('scroll'));
		await settle();
		expect(onclose).not.toHaveBeenCalled();
	});

	it('scrolling the panel itself never closes it', async () => {
		const { onclose, scrollTo } = await openInLane();
		scrollTo(40);
		document.querySelector('[data-slot="command-list"]')!.dispatchEvent(new Event('scroll'));
		await settle();
		expect(onclose).not.toHaveBeenCalled();
	});

	it('closes on a resize that leaves the anchor clipped', async () => {
		const { onclose, scrollTo } = await openInLane();
		scrollTo(40);
		window.dispatchEvent(new Event('resize'));
		await settle();
		expect(onclose).toHaveBeenCalledTimes(1);
	});
});
