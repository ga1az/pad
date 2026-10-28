// Guard: the Tailwind utilities ui.css emits must not share a name with a
// class that legacy markup uses (SPEC-24 / TASK-26).
//
// ui.css scans only its @source paths, but it scans EVERY word in them
// (comments and strings included), and the utilities it emits are global
// and unlayered. So a word like "table" in a scanned comment emits `.table
// { display: table }`, and every legacy element with class="table" (the
// admin pages) changes layout. This builds ui.css the way the app does,
// with Tailwind's own compiler and scanner, and compares the single-word
// class names it emits against the class names legacy .svelte markup uses.
// Fix a failure by rewording the scanned file or renaming the legacy class.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const SRC = fileURLToPath(new URL('.', import.meta.url));

// Utilities that legacy markup may use because they mean the same thing in
// both places.
const SAME_MEANING = new Set([
	'sr-only' // app.css's .sr-only is the same visually-hidden rule
]);

// The migrated surfaces use Tailwind on purpose: every path ui.css scans
// (its `@source "..."` lines), as a prefix up to the first glob character.
// Reading them from ui.css keeps this list from going stale as each task
// adds the files it migrates.
const MIGRATED = [
	...readFileSync(join(SRC, 'ui.css'), 'utf8').matchAll(/^@source\s+"\.\/([^"]+)"/gm)
].map((m) => m[1].split(/[*{]/)[0]);

function svelteFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return svelteFiles(path);
		return path.endsWith('.svelte') ? [path] : [];
	});
}

/** Class names legacy markup uses: static class="" tokens and class: directives. */
function legacyClassNames(): Map<string, string[]> {
	const used = new Map<string, string[]>();
	for (const file of svelteFiles(SRC)) {
		const rel = relative(SRC, file);
		if (MIGRATED.some((path) => rel.startsWith(path))) continue;
		const markup = readFileSync(file, 'utf8')
			.replace(/<style[\s\S]*?<\/style>/g, '')
			.replace(/<!--[\s\S]*?-->/g, '');
		const names = new Set<string>();
		for (const m of markup.matchAll(/\bclass="([^"]*)"/g)) {
			for (const token of m[1].replace(/\{[^}]*\}/g, ' ').split(/\s+/)) if (token) names.add(token);
		}
		for (const m of markup.matchAll(/\bclass:([\w-]+)/g)) names.add(m[1]);
		for (const name of names) used.set(name, [...(used.get(name) ?? []), rel]);
	}
	return used;
}

async function emittedClassNames(): Promise<Set<string>> {
	const css = readFileSync(join(SRC, 'ui.css'), 'utf8');
	const compiler = await compile(css, { base: SRC, onDependency: () => {} });
	const scanner = new Scanner({ sources: compiler.sources });
	const out = compiler.build(scanner.scan());
	const names = new Set<string>();
	// A plain class selector: `.name` followed by something that ends it (an
	// escaped `\:` or `\/` belongs to a variant or modifier, not this name).
	for (const m of out.matchAll(/\.([a-z][a-z0-9-]*)(?=[\s{,:.[>~+)])/g)) names.add(m[1]);
	return names;
}

describe('ui.css utilities vs legacy class names', () => {
	it('emits no utility whose name legacy markup uses as a class', async () => {
		const emitted = await emittedClassNames();
		// PRECONDITION: the build really ran and emitted utilities.
		expect(emitted.has('inline-flex'), 'ui.css built no utilities').toBe(true);
		expect(MIGRATED, 'read no @source lines from ui.css').toContain('lib/components/ui/');
		const legacy = legacyClassNames();
		expect(legacy.size, 'no legacy markup was read').toBeGreaterThan(100);
		const collisions = [...legacy]
			.filter(([name]) => emitted.has(name) && !SAME_MEANING.has(name))
			.map(([name, files]) => `${name}: ${files.join(', ')}`);
		expect(collisions).toEqual([]);
	}, 30_000);
});
