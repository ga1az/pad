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

	it('A to B (still in flight) and back to A writes both: `value` is stale while a write is pending', async () => {
		// The page's writes are not optimistic: `value` holds A until B lands. Comparing
		// the second choice with that A wrote nothing, and the item ended as B.
		const onselect = vi.fn(() => new Promise<void>(() => {}));
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Set area', label: 'Area', onselect } });
		await open(r.container);
		await fireEvent.click(rows()[1]);
		await tick();
		expect(onselect).toHaveBeenLastCalledWith('api');
		await open(r.container);
		await fireEvent.click(rows()[0]);
		await tick();
		expect(onselect).toHaveBeenCalledTimes(2);
		expect(onselect).toHaveBeenLastCalledWith('web');
		// B twice in a row is still one write: the second is the value in flight.
		await open(r.container);
		await fireEvent.click(rows()[0]);
		await tick();
		expect(onselect).toHaveBeenCalledTimes(2);
	});

	it('once a write settles without the value moving (it failed), choosing that value again writes it again', async () => {
		const onselect = vi.fn(async () => {});
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Set area', label: 'Area', onselect } });
		await open(r.container);
		await fireEvent.click(rows()[1]);
		await tick();
		await new Promise((res) => setTimeout(res, 0));
		await open(r.container);
		await fireEvent.click(rows()[1]);
		await tick();
		expect(onselect).toHaveBeenCalledTimes(2);
	});

	it('the shown value catching up clears what was sent: B lands, then choosing A again writes', async () => {
		const onselect = vi.fn(() => new Promise<void>(() => {}));
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Set area', label: 'Area', onselect } });
		await open(r.container);
		await fireEvent.click(rows()[1]);
		await tick();
		await r.rerender({ options: OPTIONS, value: 'api', placeholder: 'Set area', label: 'Area', onselect });
		await tick();
		await open(r.container);
		await fireEvent.click(rows()[0]);
		await tick();
		expect(onselect).toHaveBeenCalledTimes(2);
		expect(onselect).toHaveBeenLastCalledWith('web');
	});

	it('the search matches the NAME only, never the opaque id behind a row', async () => {
		const people = [
			{ value: 'u-7f3a9c', label: 'Dave' },
			{ value: 'u-1b2c3d', label: 'Maria' }
		];
		const r = render(PropertyPicker, { props: { options: people, value: '', placeholder: 'Assign', noneLabel: 'Unassigned', label: 'Assigned to', onselect: vi.fn() } });
		await open(r.container);
		const input = document.body.querySelector<HTMLInputElement>('[data-slot="popover-content"] input')!;
		await fireEvent.input(input, { target: { value: '7f3' } });
		await tick();
		expect(rows()).toHaveLength(0);
		expect(document.body.querySelector('[data-slot="popover-content"]')!.textContent).toContain('No results');
		await fireEvent.input(input, { target: { value: 'u-1b' } });
		await tick();
		expect(rows()).toHaveLength(0);
		await fireEvent.input(input, { target: { value: 'MAR' } });
		await tick();
		expect(rows().map(label)).toEqual(['Maria']);
		// The none row is searched by its own label.
		await fireEvent.input(input, { target: { value: 'unas' } });
		await tick();
		expect(rows().map(label)).toEqual(['Unassigned']);
		await fireEvent.input(input, { target: { value: '' } });
		await tick();
		expect(rows().map(label)).toEqual(['Unassigned', 'Dave', 'Maria']);
	});

	it('a fresh search each time it opens', async () => {
		const r = render(PropertyPicker, { props: { options: OPTIONS, value: 'web', placeholder: 'Set area', label: 'Area', onselect: vi.fn() } });
		await open(r.container);
		const input = document.body.querySelector<HTMLInputElement>('[data-slot="popover-content"] input')!;
		await fireEvent.input(input, { target: { value: 'ap' } });
		await tick();
		expect(rows().map(label)).toEqual(['Api']);
		await fireEvent.click(r.container.querySelector('button.prop-trigger')!);
		await tick();
		await open(r.container);
		expect(rows().map(label)).toEqual(['Web', 'Api', 'Cli']);
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
