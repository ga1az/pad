/**
 * TASK-31: the states of a property row beyond the happy path, in the item
 * page's `appearance="property"`: two quick multi-select toggles through the
 * picker (BUG-3047), a stored value of the wrong shape (BUG-3052), a stored
 * select value the options do not list, and the read-only person (a viewer, an
 * archived item, a guest without edit), who gets text and no control.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import FieldEditor from './FieldEditor.svelte';

afterEach(() => cleanup());

const ROW = '[data-slot="popover-content"] [role="option"]';
const rows = () => [...document.body.querySelectorAll<HTMLElement>(ROW)];
const label = (row: Element) => row.querySelector('[data-option-label]')?.textContent?.trim();

const MULTI = { key: 'surfaces', label: 'Surfaces', type: 'multi_select', options: ['a', 'b', 'c'] } as const;
const SELECT = { key: 'area', label: 'Area', type: 'select', options: ['web', 'api'] } as const;
const NUMBER = { key: 'points', label: 'Points', type: 'number' } as const;
const DATE = { key: 'due', label: 'Due', type: 'date' } as const;
const TEXT = { key: 'how', label: 'How to verify', type: 'text' } as const;
const URL_F = { key: 'ref', label: 'Reference', type: 'url' } as const;
const FLAG = { key: 'shipped', label: 'Shipped', type: 'checkbox' } as const;

function deferredOnchange() {
	const settles: Array<() => void> = [];
	const fn = vi.fn(() => new Promise<void>((resolve) => settles.push(resolve)));
	return { fn, settles };
}

describe('property appearance: two quick multi-select toggles (BUG-3047)', () => {
	it('are two changes, each built on the last one sent, and the trigger shows both at once', async () => {
		const { fn, settles } = deferredOnchange();
		const r = render(FieldEditor, { props: { field: MULTI, value: [], onchange: fn, itemId: 'i1', appearance: 'property' } });
		await fireEvent.click(r.container.querySelector('button.select-trigger')!);
		await tick();
		// No await between the clicks: the prop has not caught up with the first.
		rows()[0].click();
		rows()[1].click();
		await tick();
		expect(fn.mock.calls).toEqual([[['a']], [['a', 'b']]]);
		expect(r.container.querySelector('button.select-trigger')!.textContent?.trim()).toBe('A, B');
		expect(rows().filter((x) => x.getAttribute('aria-checked') === 'true').map(label)).toEqual(['A', 'B']);
		settles.forEach((s) => s());
	});
});

describe('property appearance: a stored value of the wrong shape (BUG-3052)', () => {
	it('a select holding a list is its raw text with a note and Replace, not a picker, and nothing is written', async () => {
		const onchange = vi.fn();
		const r = render(FieldEditor, { props: { field: SELECT, value: ['web'], onchange, itemId: 'i1', appearance: 'property' } });
		expect(r.container.querySelector('.field-mismatch .mismatch-raw')?.textContent).toBe('["web"]');
		expect(r.container.querySelector('.field-mismatch')?.textContent).toContain("Doesn't match the field type (select)");
		expect(r.container.querySelector('button.select-trigger')).toBeNull();
		expect(onchange).not.toHaveBeenCalled();
		// Replace is the explicit way out: it opens the picker, empty.
		await fireEvent.click(r.getByRole('button', { name: 'Replace' }));
		await tick();
		const trigger = r.container.querySelector('button.select-trigger')!;
		expect(trigger.textContent?.trim()).toBe('Set area');
		expect(onchange).not.toHaveBeenCalled();
	});

	it('a number holding text is not a stepper', () => {
		const r = render(FieldEditor, { props: { field: NUMBER, value: '5', onchange: vi.fn(), itemId: 'i1', appearance: 'property' } });
		expect(r.container.querySelector('.field-mismatch')).not.toBeNull();
		expect(r.container.querySelector('.number-input')).toBeNull();
	});
});

describe('property appearance: a stored select value the options do not list', () => {
	it('shows the stored value rather than an empty "Set area", keeps it checked, and writes nothing on open', async () => {
		const onchange = vi.fn();
		const r = render(FieldEditor, { props: { field: SELECT, value: 'legacy', onchange, itemId: 'i1', appearance: 'property' } });
		const trigger = r.container.querySelector<HTMLButtonElement>('button.select-trigger')!;
		expect(trigger.textContent?.trim().toLowerCase()).toBe('legacy');
		expect(r.container.querySelector('.prop-empty')).toBeNull();
		await fireEvent.click(trigger);
		await tick();
		expect(rows().map(label)).toContain('Legacy');
		expect(rows().filter((x) => x.getAttribute('aria-checked') === 'true').map(label)).toEqual(['Legacy']);
		expect(onchange).not.toHaveBeenCalled();
	});
});

describe('property appearance: read-only is text, never a control', () => {
	const CASES = [
		['select', SELECT, 'api', 'Api'],
		['multi_select', MULTI, ['a', 'c'], 'A, C'],
		['date', DATE, '2026-11-15', 'Nov 15, 2026'],
		['number', NUMBER, 7, '7'],
		['text', TEXT, 'the whole sentence', 'the whole sentence'],
		['url', URL_F, 'https://linear.app', 'https://linear.app'],
		['checkbox', FLAG, true, 'Yes']
	] as const;

	it.each(CASES)('%s: the value reads as text, with no button, input, switch or picker', (_name, field, value, text) => {
		const r = render(FieldEditor, { props: { field, value, onchange: vi.fn(), itemId: 'i1', appearance: 'property', readonly: true } });
		expect(r.container.textContent).toContain(text);
		expect(r.container.querySelector('button, input, textarea, select, [role="switch"], [role="combobox"]')).toBeNull();
	});

	it('an empty value reads as a dash', () => {
		const r = render(FieldEditor, { props: { field: SELECT, value: undefined, onchange: vi.fn(), itemId: 'i1', appearance: 'property', readonly: true } });
		expect(r.container.textContent?.trim()).toBe('—');
	});
});

describe('a text field grows to show all of its text', () => {
	it('sizes the textarea to its content plus its border, so the border does not scroll the text', () => {
		// jsdom has no layout: give the textarea the measures a browser reports.
		const proto = HTMLTextAreaElement.prototype;
		const saved = ['scrollHeight', 'offsetHeight', 'clientHeight'].map((k) => [k, Object.getOwnPropertyDescriptor(HTMLElement.prototype, k) ?? Object.getOwnPropertyDescriptor(Element.prototype, k)] as const);
		Object.defineProperty(proto, 'scrollHeight', { configurable: true, get: () => 120 });
		Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => 118 });
		Object.defineProperty(proto, 'clientHeight', { configurable: true, get: () => 116 });
		try {
			const r = render(FieldEditor, { props: { field: TEXT, value: LONG_TEXT, onchange: vi.fn(), itemId: 'i1', appearance: 'property' } });
			const area = r.container.querySelector<HTMLTextAreaElement>('textarea')!;
			// 120 of content and padding, plus the 2px border the box also has.
			expect(area.style.height).toBe('122px');
		} finally {
			for (const [k] of saved) delete (proto as unknown as Record<string, unknown>)[k];
		}
	});
});

const LONG_TEXT = 'a sentence long enough to wrap in a narrow column, '.repeat(6);
