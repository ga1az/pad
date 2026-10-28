import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

/**
 * TASK-3461 (after TASK-2262): every keyboard-focusable field shows a visible
 * focus indicator. app.css gives every input, textarea and select a 2px
 * :focus-visible ring; a component rule `X:focus { outline: none }` on a field
 * beats that ring, because a scoped class selector outranks it. 40 such rules
 * were found and removed. This keeps a 41st from arriving unnoticed.
 *
 * A rule is a FIELD rule when its selector names input / textarea / select, or
 * names a class that the same file's markup puts on one of those elements. It
 * may set `outline: none` under :focus only if the same rule gives another
 * visible indicator (a box-shadow), which is the escape hatch for a borderless
 * field whose design wants something other than a ring.
 *
 * A borderless field may also leave its ROW to show the focus (the palette's
 * and the Command search's design): the file then holds a `:focus-within` rule
 * with a box-shadow, or, in Tailwind, a `focus-within:` utility. Tailwind-styled
 * fields (the shadcn components under ui/) are read too: a field element whose
 * classes remove the outline needs a focus indicator utility in its file.
 */

const SRC = fileURLToPath(new URL('../..', import.meta.url));

function svelteFiles(dir: string): string[] {
	const out: string[] = [];
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		const p = join(dir, e.name);
		if (e.isDirectory()) out.push(...svelteFiles(p));
		else if (e.name.endsWith('.svelte')) out.push(p);
	}
	return out;
}

interface Offender {
	file: string;
	line: number;
	selector: string;
}

// `box-shadow: none` is NOT an indicator: the lookahead has to skip `none` and
// still require a value, or the engine backtracks past the first character and
// `none` passes (it did).
const SHADOW = /box-shadow:\s*(?!none\b)\S/;

/** A `:focus-within` rule that draws something (the row around a bare field). */
function rowShowsFocus(style: string): boolean {
	return [...style.matchAll(/:focus-within\b[^{}]*\{([^}]*)\}/g)].some((m) => SHADOW.test(m[1]));
}

function fieldFocusSuppressions(file: string, text: string): Offender[] {
	const at = text.indexOf('<style');
	if (at < 0) return [];
	const markup = text.slice(0, at);
	const style = text.slice(at);
	const out: Offender[] = [];
	const rule = /([^{}]*?):focus\b(?!-)([^{}]*)\{([^}]*)\}/g;
	for (const m of style.matchAll(rule)) {
		const body = m[3];
		if (!/outline:\s*none/.test(body)) continue;
		if (SHADOW.test(body)) continue; // another indicator
		if (rowShowsFocus(style)) continue; // the row carries it
		const selector = (m[1] + ':focus' + m[2]).trim();
		const isField = selector.split(',').some((part) => {
			if (!part.includes(':focus') || part.includes(':focus-visible')) return false;
			const base = part.split(':focus')[0];
			if (/(?:^|\s)(input|textarea|select)\b/.test(base)) return true;
			return [...base.matchAll(/\.([A-Za-z0-9_-]+)/g)].some(([, cls]) =>
				new RegExp(`<(input|textarea|select)\\b[^>]*class(?:=|:)[^>]*\\b${cls}\\b`, 's').test(markup)
			);
		});
		if (isField) {
			const line = text.slice(0, at + (m.index ?? 0)).split('\n').length;
			out.push({ file: relative(SRC, file), line, selector });
		}
	}
	return out;
}

/**
 * Tailwind-styled fields (shadcn components, no <style> block). A field element
 * (input / textarea / select, or a component named *Input / Textarea / Select)
 * whose tag text removes the outline needs a focus indicator utility somewhere
 * in its file: a ring, a non-transparent border or a shadow under `focus:`,
 * `focus-visible:` or `focus-within:` (the row around a bare field).
 * `focus:border-transparent` is the opposite of an indicator.
 */
const TW_FIELD_TAG = /<(?:input|textarea|select|[A-Za-z.]*Input|Textarea|Select)\b[\s\S]*?\/>/g;
const TW_OUTLINE_OFF = /outline-(?:none|hidden)/;
const TW_INDICATOR =
	/\b(?:focus|focus-visible|focus-within):(?:ring|shadow|border-(?!transparent)|outline-(?!none|hidden)|underline)/;

function tailwindFieldSuppressions(file: string, text: string): Offender[] {
	if (text.includes('<style')) return [];
	const out: Offender[] = [];
	for (const m of text.matchAll(TW_FIELD_TAG)) {
		if (!TW_OUTLINE_OFF.test(m[0]) || TW_INDICATOR.test(text)) continue;
		const line = text.slice(0, m.index ?? 0).split('\n').length;
		out.push({ file: relative(SRC, file), line, selector: m[0].split('\n')[0].trim() });
	}
	return out;
}

describe('every field keeps a visible focus indicator (TASK-3461)', () => {
	it('no component suppresses the focus ring on a field without another indicator', () => {
		const offenders = svelteFiles(SRC).flatMap((f) => fieldFocusSuppressions(f, readFileSync(f, 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('CONTROL: the detector finds a suppression it is shown', () => {
		const sample = `<input class="name-input" />\n<style>\n\t.name-input:focus { border-color: blue; outline: none; }\n</style>`;
		expect(fieldFocusSuppressions(join(SRC, 'x.svelte'), sample)).toHaveLength(1);
	});

	it('CONTROL: a non-field rule and a rule with a box-shadow indicator are not flagged', () => {
		const sample = `<button class="btn"></button><input class="t" />\n<style>\n\t.btn:focus { outline: none; }\n\t.t:focus { outline: none; box-shadow: 0 0 0 2px blue; }\n</style>`;
		expect(fieldFocusSuppressions(join(SRC, 'x.svelte'), sample)).toEqual([]);
	});

	it('no Tailwind field removes its outline without a focus indicator in its file', () => {
		const offenders = svelteFiles(SRC).flatMap((f) => tailwindFieldSuppressions(f, readFileSync(f, 'utf8')));
		expect(offenders).toEqual([]);
	});

	it('the Command search and the palette search both show focus on their row', () => {
		const command = readFileSync(join(SRC, 'lib/components/ui/command/command-input.svelte'), 'utf8');
		expect(command).toMatch(/focus-within:border-/);
		expect(command).toMatch(/focus-within:shadow-/);
		const palette = readFileSync(join(SRC, 'lib/components/search/CommandPalette.svelte'), 'utf8');
		expect(rowShowsFocus(palette.slice(palette.indexOf('<style')))).toBe(true);
		expect(palette).toMatch(/\.search-row:focus-within\s*\{[^}]*border-bottom-color:/);
	});

	it('CONTROL: `box-shadow: none` is not an indicator', () => {
		const sample = `<input class="t" />\n<style>\n\t.t:focus { outline: none; box-shadow: none; }\n</style>`;
		expect(fieldFocusSuppressions(join(SRC, 'x.svelte'), sample)).toHaveLength(1);
	});

	it('CONTROL: a bare field is excused only by a :focus-within rule that draws something', () => {
		const field = `<input class="t" />\n<style>\n\t.t:focus { outline: none; box-shadow: none; }\n`;
		expect(fieldFocusSuppressions(join(SRC, 'x.svelte'), field + `\t.row:focus-within { box-shadow: inset 0 -1px 0 blue; }\n</style>`)).toEqual([]);
		expect(fieldFocusSuppressions(join(SRC, 'x.svelte'), field + `\t.row:focus-within { box-shadow: none; }\n</style>`)).toHaveLength(1);
	});

	it('CONTROL: the Tailwind detector flags an outline-less field and passes one with an indicator', () => {
		const bare = `<CommandPrimitive.Input class={cn("border-0 outline-hidden focus:border-transparent!", c)} {...rest} />`;
		expect(tailwindFieldSuppressions(join(SRC, 'x.svelte'), bare)).toHaveLength(1);
		expect(tailwindFieldSuppressions(join(SRC, 'x.svelte'), `<div class="focus-within:border-blue-500"></div>\n` + bare)).toEqual([]);
		expect(tailwindFieldSuppressions(join(SRC, 'x.svelte'), `<input class="outline-none focus-visible:ring-2" />`)).toEqual([]);
		expect(tailwindFieldSuppressions(join(SRC, 'x.svelte'), `<button class="outline-none"></button>`)).toEqual([]);
	});
});
