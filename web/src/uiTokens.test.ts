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

// The declarations inside the first block that `selector {` opens.
function block(selector: string): Map<string, string> {
	const start = UI_CSS.indexOf(`${selector} {`);
	expect(start, `ui.css has no "${selector} {" block`).toBeGreaterThanOrEqual(0);
	const end = UI_CSS.indexOf('}', start);
	const decls = new Map<string, string>();
	for (const m of UI_CSS.slice(start, end).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
		decls.set(m[1], m[2].trim());
	}
	return decls;
}

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}

const dark = block(':root');
const light = block('[data-theme="light"]');
const osLight = block(':root:not([data-theme="dark"])');
const mapping = block('@theme inline');

describe('ui.css tokens', () => {
	it('defines its source variables only under the --ui- prefix', () => {
		for (const decls of [dark, light, osLight]) {
			for (const name of decls.keys()) expect(name).toMatch(/^--ui-/);
		}
	});

	it('keeps the explicit and the OS-preference light themes identical', () => {
		expect([...osLight]).toEqual([...light]);
	});

	it('gives every themed dark token a light value', () => {
		// Radius and the status colors are the same in both themes.
		const themed = [...dark.keys()].filter((n) => n !== '--ui-radius' && !n.startsWith('--ui-status-'));
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

	it('reads tokens only as --ui-* (or Tailwind --tw-*) variables', () => {
		expect(sources.length).toBeGreaterThan(0);
		for (const file of sources) {
			const text = readFileSync(file, 'utf8');
			// `var(--x)` and Tailwind's `bg-(--x)` shorthand.
			for (const m of text.matchAll(/(?:var\(|\()(--[\w-]+)/g)) {
				const name = m[1];
				if (name.startsWith('--tw-')) continue;
				expect(name, `${file} reads ${name}`).toMatch(/^--ui-/);
				expect(dark.has(name), `${file} reads ${name}, which ui.css does not define`).toBe(true);
			}
		}
	});
});
