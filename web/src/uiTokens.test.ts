// Guards for the shadcn-svelte token layer in ui.css (SPEC-24 / TASK-25).
//
// The tokens coexist with app.css's own variables, so the rules that keep
// them from colliding are easy to break by hand or by `shadcn-svelte add`:
// see src/lib/components/ui/README.md.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const UI_CSS = readFileSync(join(SRC, 'ui.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// The text of the block that `selector {` opens, braces balanced (a nested
// block, e.g. @keyframes inside @theme, does not end it early).
function blockText(selector: string, from = 0): string {
	const open = UI_CSS.indexOf(`${selector} {`, from);
	expect(open, `ui.css has no "${selector} {" block`).toBeGreaterThanOrEqual(0);
	let depth = 0;
	for (let i = UI_CSS.indexOf('{', open); i < UI_CSS.length; i++) {
		if (UI_CSS[i] === '{') depth++;
		else if (UI_CSS[i] === '}' && --depth === 0) return UI_CSS.slice(open, i + 1);
	}
	throw new Error(`ui.css: "${selector} {" is never closed`);
}

function decls(text: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) out.set(m[1], m[2].trim());
	return out;
}

const block = (selector: string, from = 0) => decls(blockText(selector, from));

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}

const dark = block(':root');
const light = block('[data-theme="light"]');
const osLight = block(':root:not([data-theme="dark"])');
const print = block(':root[data-theme="light"]', UI_CSS.indexOf('@media print'));
const mapping = block('@theme inline');

describe('ui.css tokens', () => {
	it('defines its source variables only under the --ui- prefix, in every block', () => {
		// Everything outside @theme inline (the Tailwind names) is a source
		// variable: a `shadcn-svelte add` that appends its own :root or .dark
		// block lands here, wherever it puts it.
		const mappingText = blockText('@theme inline');
		const rest = UI_CSS.replace(mappingText, '');
		const names = [...decls(rest).keys()];
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) expect(name).toMatch(/^--ui-/);
	});

	it('keeps the explicit, the OS-preference and the print light themes identical', () => {
		expect([...osLight]).toEqual([...light]);
		expect([...print]).toEqual([...light]);
	});

	it('gives every themed dark token a light value', () => {
		// Radius, the sidebar widths and the status colors are the same in both themes.
		const themed = [...dark.keys()].filter(
			(n) => n !== '--ui-radius' && !n.startsWith('--ui-sidebar-width') && !n.startsWith('--ui-status-')
		);
		expect([...light.keys()].sort()).toEqual(themed.sort());
	});

	it('sizes Tailwind in px, not in rem of app.css\'s 14px root', () => {
		const sized = [...mapping].filter(([n]) => /^--(spacing|text-[\w]+|container-[\w]+)$/.test(n));
		expect(sized.length).toBeGreaterThan(0);
		for (const [name, value] of sized) expect(value, name).toMatch(/^\d+px$/);
	});

	it('maps every Tailwind name onto a defined --ui- variable', () => {
		for (const [name, value] of mapping) {
			for (const ref of value.matchAll(/var\((--[\w-]+)/g)) {
				if (ref[1] === '--font-ui') continue; // app.css's font, the fallback
				expect(dark.has(ref[1]), `${name} reads ${ref[1]}`).toBe(true);
			}
		}
	});
});

describe('shadcn components', () => {
	const sources = files(join(SRC, 'lib/components/ui')).filter((f) => /\.(svelte|ts)$/.test(f));

	it('reads tokens only as --ui-* variables (or Tailwind --tw-*, bits-ui --bits-*)', () => {
		expect(sources.length).toBeGreaterThan(0);
		for (const file of sources) {
			const text = readFileSync(file, 'utf8');
			// `var(--x)`, `var( --x)`, Tailwind's `bg-(--x)` shorthand and its
			// typed form `w-(length:--x)`.
			for (const m of text.matchAll(/(?:var\(\s*|\((?:[\w-]+:)?)(--[\w-]+)/g)) {
				const name = m[1];
				// Tailwind's internals, and the runtime sizes bits-ui sets on its
				// own elements (e.g. --bits-accordion-content-height).
				if (name.startsWith('--tw-') || name.startsWith('--bits-')) continue;
				expect(name, `${file} reads ${name}`).toMatch(/^--ui-/);
				expect(dark.has(name), `${file} reads ${name}, which ui.css does not define`).toBe(true);
			}
		}
	});

	it('uses no rem arbitrary values (app.css sets a 14px root)', () => {
		for (const file of sources) {
			const text = readFileSync(file, 'utf8');
			const rem = text.match(/-\[[\d.]+rem\]/g) ?? [];
			expect(rem, `${file} sizes in rem; use px`).toEqual([]);
		}
	});
});
