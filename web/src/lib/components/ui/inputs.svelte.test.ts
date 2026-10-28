import { afterEach, describe, expect, it } from 'vitest';
import { createRawSnippet, mount, unmount, flushSync } from 'svelte';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Input } from './input';
import { Textarea } from './textarea';
import { NativeSelect } from './native-select';
import { Checkbox } from './checkbox';

// SPEC-24 / TASK-31: the form controls are shadcn's. What the call sites lean
// on: the element keeps its attributes and bindings, a select keeps real
// options, a checkbox is a role=checkbox button that reports aria-checked, and
// the legacy global field rules in app.css do not reach any of them.
let app: Record<string, unknown> | undefined;
let host: HTMLElement;
afterEach(() => {
	if (app) unmount(app);
	app = undefined;
	host?.remove();
});
function mountInto<P extends Record<string, unknown>>(c: unknown, props: P) {
	host = document.createElement('div');
	document.body.appendChild(host);
	app = mount(c as never, { target: host, props }) as Record<string, unknown>;
	flushSync();
}

describe('shadcn form controls', () => {
	it('Input renders one <input> that keeps its attributes and takes its value from the prop', () => {
		mountInto(Input, { 'aria-label': 'Name', placeholder: 'Collection name', value: 'abc', type: 'text' });
		const el = host.querySelector('input')!;
		expect(el.getAttribute('data-slot')).toBe('input');
		expect(el.getAttribute('aria-label')).toBe('Name');
		expect(el.placeholder).toBe('Collection name');
		expect(el.value).toBe('abc');
	});

	it('Textarea renders one <textarea> with its rows and value', () => {
		mountInto(Textarea, { 'aria-label': 'Note', rows: 4, value: 'hi' });
		const el = host.querySelector('textarea')!;
		expect(el.getAttribute('data-slot')).toBe('textarea');
		expect(el.rows).toBe(4);
		expect(el.value).toBe('hi');
	});

	it('NativeSelect keeps real <option>s, its name, and puts the layout style on the wrapper', () => {
		const children = createRawSnippet(() => ({
			render: () => '<optgroup label="g"><option value="a">A</option><option value="b">B</option></optgroup>'
		}));
		mountInto(NativeSelect, { 'aria-label': 'Pick', value: 'b', wrapperStyle: 'width: 100%', children });
		const select = host.querySelector('select')!;
		expect(select.options).toHaveLength(2);
		expect(select.getAttribute('aria-label')).toBe('Pick');
		expect(select.value).toBe('b');
		const wrapper = host.querySelector<HTMLElement>('[data-slot="native-select-wrapper"]')!;
		expect(wrapper.style.width).toBe('100%');
		expect(select.getAttribute('style')).toBeNull();
	});

	it('Checkbox is a role=checkbox button whose state is aria-checked, and it fires onCheckedChange', () => {
		const seen: boolean[] = [];
		mountInto(Checkbox, { 'aria-label': 'Required', checked: false, onCheckedChange: (v: boolean) => seen.push(v) });
		const box = host.querySelector<HTMLButtonElement>('[role="checkbox"]')!;
		expect(box.getAttribute('aria-checked')).toBe('false');
		box.click();
		flushSync();
		expect(seen).toEqual([true]);
	});
});

describe('a read-only field', () => {
	it.each([
		['input/input.svelte', Input],
		['textarea/textarea.svelte', Textarea]
	])('%s looks read-only: muted text and the default cursor', (file, Component) => {
		const src = readFileSync(resolve(__dirname, file), 'utf8');
		expect(src).toContain('[&[readonly]]:text-muted-foreground');
		expect(src).toContain('[&[readonly]]:cursor-default');
		// ...and it is the real attribute those selectors key on.
		mountInto(Component, { readonly: true, value: 'owner only' });
		const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-slot]')!;
		expect(field.hasAttribute('readonly')).toBe(true);
	});
});

describe('the legacy field rules leave shadcn fields alone', () => {
	const css = readFileSync(resolve(__dirname, '../../../app.css'), 'utf8');

	it('both focus rules exclude [data-slot] without raising specificity', () => {
		expect(css).toContain(':is(input, textarea, select):where(:not([data-slot])):focus {');
		expect(css).toContain(':is(input, textarea, select):where(:not([data-slot])):focus-visible:focus-visible {');
	});

	it('the shadcn fields draw their focus from --ui-ring, never the legacy violet', () => {
		for (const f of ['input/input.svelte', 'textarea/textarea.svelte', 'native-select/native-select.svelte']) {
			const src = readFileSync(resolve(__dirname, f), 'utf8');
			expect(src, f).toContain('focus-visible:border-ring');
			// A solid outline: the 40% one measured 1.6:1 on a dialog's raised surface.
			expect(src, f).toContain('focus-visible:outline-ring ');
			expect(src, f).not.toContain('outline-ring/');
			expect(src, f).not.toMatch(/accent-blue|accent-primary/);
		}
	});
});
