/**
 * TASK-31: `appearance="property"` is the item page's properties column. A
 * select and a multi_select open a Popover + Command (PropertyPicker), an empty
 * date says "Set due date", and the default `form` appearance, which the copy
 * dialog still uses, is the boxed control it always was.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import FieldEditor from './FieldEditor.svelte';

afterEach(() => cleanup());

const ROW = '[data-slot="popover-content"] [role="option"]';
const rows = () => [...document.body.querySelectorAll<HTMLElement>(ROW)];
const label = (row: Element) => row.querySelector('[data-option-label]')?.textContent?.trim();

const SELECT = { key: 'area', label: 'Area', type: 'select', options: ['web', 'api'] } as const;
const MULTI = { key: 'surfaces', label: 'Surfaces', type: 'multi_select', options: ['desktop', 'mobile'] } as const;
const DATE = { key: 'due_date', label: 'Due date', type: 'date' } as const;

describe('FieldEditor appearance="property"', () => {
	it('a select is a PropertyPicker: the select-trigger hook, a Command, one write per choice', async () => {
		const onchange = vi.fn();
		const r = render(FieldEditor, { props: { field: SELECT, value: 'web', onchange, appearance: 'property' } });
		const trigger = r.container.querySelector<HTMLButtonElement>('button.select-trigger')!;
		expect(trigger.textContent?.trim()).toBe('Web');
		expect(r.container.querySelector('[role="combobox"]')).toBeNull();
		await fireEvent.click(trigger);
		await tick();
		expect(rows().map(label)).toEqual(['Web', 'Api']);
		await fireEvent.click(rows()[1]);
		await tick();
		expect(onchange).toHaveBeenCalledTimes(1);
		expect(onchange).toHaveBeenCalledWith('api');
	});

	it('an empty select says what to do, in gray', () => {
		const r = render(FieldEditor, { props: { field: SELECT, value: undefined, onchange: vi.fn(), appearance: 'property' } });
		expect(r.container.querySelector('button.select-trigger')!.textContent?.trim()).toBe('Set area');
		expect(r.container.querySelector('.prop-empty')).not.toBeNull();
	});

	it('a multi_select toggles each option and keeps the picker open', async () => {
		const onchange = vi.fn();
		const r = render(FieldEditor, { props: { field: MULTI, value: ['desktop'], onchange, appearance: 'property' } });
		const trigger = r.container.querySelector<HTMLButtonElement>('button.select-trigger')!;
		expect(trigger.textContent?.trim()).toBe('Desktop');
		await fireEvent.click(trigger);
		await tick();
		await fireEvent.click(rows()[1]);
		await tick();
		expect(onchange).toHaveBeenCalledWith(['desktop', 'mobile']);
		expect(rows()).toHaveLength(2);
	});

	it('an empty date says "Set due date"', () => {
		const r = render(FieldEditor, { props: { field: DATE, value: null, onchange: vi.fn(), appearance: 'property' } });
		expect(r.container.querySelector('.date-placeholder')?.textContent?.trim()).toBe('Set due date');
	});

	it('the default appearance keeps the boxed control and its own dropdown', async () => {
		const r = render(FieldEditor, { props: { field: SELECT, value: 'web', onchange: vi.fn() } });
		const trigger = r.container.querySelector<HTMLButtonElement>('button.select-trigger')!;
		expect(trigger.getAttribute('role')).toBe('combobox');
		await fireEvent.click(trigger);
		expect(r.container.querySelector('[role="listbox"]')).not.toBeNull();
		const d = render(FieldEditor, { props: { field: DATE, value: null, onchange: vi.fn() } });
		expect(d.container.querySelector('.date-placeholder')?.textContent?.trim()).toBe('Pick a date...');
	});
});
