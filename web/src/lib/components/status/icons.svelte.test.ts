// TASK-28: the StatusIcon and PriorityIcon components draw one shape per
// category / level, are silent unless labelled, and cut the check and X out
// with a mask whose id is unique per instance.
import { afterEach, describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import StatusIcon from './StatusIcon.svelte';
import PriorityIcon from './PriorityIcon.svelte';
import type { PriorityLevel, StatusCategory } from './statusCategory';

afterEach(() => cleanup());

describe('StatusIcon', () => {
	const categories: StatusCategory[] = ['backlog', 'planned', 'progress', 'review', 'done', 'cancelled'];

	it('draws a distinct shape for each category', () => {
		const shapes = categories.map((category) => {
			const { container } = render(StatusIcon, { props: { category } });
			const svg = container.querySelector('svg')!;
			expect(svg.getAttribute('data-status-category')).toBe(category);
			const html = svg.innerHTML.replace(/status-icon-[^"#)]+/g, 'ID');
			cleanup();
			return html;
		});
		expect(new Set(shapes).size).toBe(categories.length);
	});

	it('is aria-hidden without a label, and an img named by it with one', () => {
		let svg = render(StatusIcon, { props: { category: 'done' } }).container.querySelector('svg')!;
		expect(svg.getAttribute('aria-hidden')).toBe('true');
		expect(svg.getAttribute('role')).toBeNull();
		cleanup();
		svg = render(StatusIcon, { props: { category: 'done', label: 'Status: Done' } }).container.querySelector('svg')!;
		expect(svg.getAttribute('role')).toBe('img');
		expect(svg.getAttribute('aria-label')).toBe('Status: Done');
		expect(svg.getAttribute('aria-hidden')).toBeNull();
	});

	it('gives each instance its own mask id', () => {
		const a = render(StatusIcon, { props: { category: 'done' } }).container;
		const b = render(StatusIcon, { props: { category: 'cancelled' } }).container;
		const idA = a.querySelector('mask')!.id;
		const idB = b.querySelector('mask')!.id;
		expect(idA).not.toBe(idB);
		expect(a.querySelector('circle[mask]')!.getAttribute('mask')).toBe(`url(#${idA})`);
	});
});

describe('PriorityIcon', () => {
	it('lights as many bars as the level, and draws urgent and none apart', () => {
		const lit = (level: PriorityLevel) => {
			const { container } = render(PriorityIcon, { props: { level } });
			const svg = container.querySelector('svg')!;
			expect(svg.getAttribute('data-priority-level')).toBe(level);
			const rects = [...svg.querySelectorAll('rect')];
			const out = { bars: rects.length, dim: rects.filter((r) => r.classList.contains('dim')).length, mask: !!svg.querySelector('mask') };
			cleanup();
			return out;
		};
		expect(lit('high')).toEqual({ bars: 3, dim: 0, mask: false });
		expect(lit('medium')).toEqual({ bars: 3, dim: 1, mask: false });
		expect(lit('low')).toEqual({ bars: 3, dim: 2, mask: false });
		expect(lit('urgent').mask).toBe(true);
		expect(lit('none')).toEqual({ bars: 3, dim: 0, mask: false });
	});
});
