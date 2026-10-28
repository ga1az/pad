/**
 * TASK-31: the value of a property row is a borderless text action that opens a
 * Popover + Command. These legs pin its own contract; ItemDetail's and
 * FieldEditor's tests pin that the page uses it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';
import PropertyPicker from './PropertyPicker.svelte';

afterEach(() => cleanup());

const OPTIONS = [
	{ value: 'web', label: 'Web' },
	{ value: 'api', label: 'Api' },
	{ value: 'cli', label: 'Cli' }
];
const ROW = '[data-slot="popover-content"] [role="option"]';
const rows = () => [...document.body.querySelectorAll<HTMLElement>(ROW)];
const label = (row: Element) => row.querySelector('[data-option-label]')?.textContent?.trim() ?? row.textContent?.trim();

async function open(container: HTMLElement) {
	await fireEvent.click(container.querySelector('button.prop-trigger')!);
	await tick();
}

describe('PropertyPicker (single)', () => {
	it('shows the chosen name, or the gray placeholder while nothing is chosen', () => {
		const a = render(PropertyPicker, { props: { options: OPTIONS, value: 'api', placeholder: 'Set area', label: 'Area', onselect: vi.fn() } });
		const trigger = a.container.querySelector('button.prop-trigger')!;
		expect(trigger.textContent?.trim()).toBe('Api');
		expect(trigger.getAttribute('aria-label')).toBe('Area: Api');
		expect(trigger.querySelector('.prop-empty')).toBeNull();
		a.unmount();
		const b = render(PropertyPicker, { props: { options: OPTIONS, value: '', placeholder: 'Set area', label: 'Area', onselect: vi.fn() } });
		expect(b.container.querySelector('button.prop-trigger')!.textContent?.trim()).toBe('Set area');
		expect(b.container.querySelector('.prop-empty')).not.toBeNull();
		expect(b.container.querySelector('button.prop-trigger')!.getAttribute('aria-label')).toBe('Area: not set');
	});

	it('a click opens the rows and writes nothing; choosing one writes it once and closes', async () => {
		const onselect = vi.fn();
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Set area', label: 'Area', onselect } });
		await open(r.container);
		expect(onselect).not.toHaveBeenCalled();
		expect(rows().map(label)).toEqual(['Web', 'Api', 'Cli']);
		expect(rows().filter((x) => x.getAttribute('aria-checked') === 'true').map(label)).toEqual(['Web']);
		await fireEvent.click(rows()[2]);
		await tick();
		expect(onselect).toHaveBeenCalledTimes(1);
		expect(onselect).toHaveBeenCalledWith('cli');
		expect(rows()).toHaveLength(0);
	});

	it('choosing the current value writes nothing', async () => {
		const onselect = vi.fn();
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Set area', label: 'Area', onselect } });
		await open(r.container);
		await fireEvent.click(rows()[0]);
		await tick();
		expect(onselect).not.toHaveBeenCalled();
	});

	it('the none row leads the list and writes the empty value', async () => {
		const onselect = vi.fn();
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Assign', noneLabel: 'Unassigned', label: 'Assigned to', onselect } });
		await open(r.container);
		expect(rows().map(label)).toEqual(['Unassigned', 'Web', 'Api', 'Cli']);
		await fireEvent.click(rows()[0]);
		await tick();
		expect(onselect).toHaveBeenCalledWith('');
	});

	it('rows with a group sit under their heading', async () => {
		const grouped = [
			{ value: 'u1', label: 'Dave', group: 'People' },
			{ value: 'b1', label: 'Builder (agent)', group: 'Agents' }
		];
		const r = render(PropertyPicker, { props: { options: grouped, value: '', placeholder: 'Assign', label: 'Assigned to', onselect: vi.fn() } });
		await open(r.container);
		const groups = [...document.body.querySelectorAll('[data-slot="popover-content"] [data-slot="command-group"]')];
		expect(groups.map((g) => g.querySelector('[data-command-group-heading]')?.textContent?.trim())).toEqual(['People', 'Agents']);
	});

	it('a repeated value shows once and a heading that recurs does not break the list', async () => {
		const dup = [
			{ value: 'a', label: 'A', group: 'People' },
			{ value: 'a', label: 'A again', group: 'People' },
			{ value: 'b', label: 'B', group: 'Agents' },
			{ value: 'c', label: 'C', group: 'People' }
		];
		const r = render(PropertyPicker, { props: { options: dup, value: '', placeholder: 'Assign', label: 'Assigned to', onselect: vi.fn() } });
		await open(r.container);
		expect(rows().map(label)).toEqual(['A', 'B', 'C']);
	});

	it('a second click on the trigger closes it without writing', async () => {
		const onselect = vi.fn();
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Set area', label: 'Area', onselect } });
		await open(r.container);
		await fireEvent.click(r.container.querySelector('button.prop-trigger')!);
		await tick();
		expect(rows()).toHaveLength(0);
		expect(onselect).not.toHaveBeenCalled();
	});

	it('read-only is text, not a trigger', () => {
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'api', placeholder: 'Set area', label: 'Area', readonly: true } });
		expect(r.container.querySelector('button')).toBeNull();
		expect(r.container.textContent?.trim()).toBe('Api');
	});
});

describe('PropertyPicker (multi)', () => {
	it('a row toggles, the popover stays open, and the trigger lists the chosen names', async () => {
		const ontoggle = vi.fn();
		const r = render(PropertyPicker, { props: { multi: true, options: OPTIONS, values: ['web', 'cli'], placeholder: 'Set surfaces', label: 'Surfaces', ontoggle } });
		expect(r.container.querySelector('button.prop-trigger')!.textContent?.trim()).toBe('Web, Cli');
		await open(r.container);
		expect(rows().filter((x) => x.getAttribute('aria-checked') === 'true').map(label)).toEqual(['Web', 'Cli']);
		await fireEvent.click(rows()[1]);
		await tick();
		expect(ontoggle).toHaveBeenCalledWith('api');
		// Several can be set in one visit.
		expect(rows()).toHaveLength(3);
	});
});
