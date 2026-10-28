// Source guard: printing ignores the desktop frame (SPEC-24 / TASK-27).
//
// On desktop the page sits in `.content-panel` (rounded, bordered, clipped,
// with PanelHeader on top), inside `.app-shell`. Print must get the old
// unframed layout: the panel's box gone, its header hidden. The insights
// report also hides every `.app-shell` child that is not the content, and
// before the fix that rule took the panel, and the whole report with it, out
// of print. jsdom has no print media, so the guard is on the source: the
// rules that do it, and the markup they rely on.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** The text of every `@media print { ... }` block, braces balanced. */
function printBlocks(css: string): string {
	let out = '';
	for (let at = css.indexOf('@media print'); at >= 0; at = css.indexOf('@media print', at + 1)) {
		let depth = 0;
		for (let i = css.indexOf('{', at); i < css.length; i++) {
			if (css[i] === '{') depth++;
			else if (css[i] === '}' && --depth === 0) {
				out += css.slice(at, i + 1);
				break;
			}
		}
	}
	return out;
}

/** The declarations of the rule whose selector list includes `selector`. */
function ruleFor(css: string, selector: string): string {
	for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
		const selectors = m[1].split(',').map((s) => s.trim());
		if (selectors.includes(selector)) return m[2];
	}
	return '';
}

describe('printing the desktop frame (TASK-27)', () => {
	const appPrint = printBlocks(read('app.css'));

	it('app.css prints the content panel as no box at all', () => {
		expect(ruleFor(appPrint, '.content-panel.desktop')).toMatch(/display:\s*contents\s*!important/);
		expect(ruleFor(appPrint, '.content-panel')).toMatch(/display:\s*contents\s*!important/);
	});

	it('app.css hides the panel header with the rest of the chrome', () => {
		expect(ruleFor(appPrint, '.content-panel-header')).toMatch(/display:\s*none\s*!important/);
		expect(ruleFor(appPrint, '.sidebar')).toMatch(/display:\s*none\s*!important/);
	});

	it('app.css drops the frame colour behind the page', () => {
		expect(ruleFor(appPrint, '.app-layout.frame')).toMatch(/background:\s*none\s*!important/);
	});

	it('the insights report keeps the panel when it hides the shell around the content', () => {
		const report = printBlocks(read('routes/[username]/[workspace]/insights/print/+page.svelte'));
		// The bare form hid the panel, and the report inside it.
		expect(report).not.toMatch(/\.app-shell > :not\(\.main-content\)\)/);
		expect(report).toContain(':global(.app-shell > :not(.main-content, .content-panel))');
		expect(report).toContain(':global(.content-panel > :not(.main-content))');
	});

	it('the markup is what those rules name', () => {
		const layout = read('routes/+layout.svelte');
		const panel = layout.indexOf('class="content-panel"');
		expect(panel, 'no .content-panel in the root layout').toBeGreaterThan(-1);
		const main = layout.indexOf('<main class="main-content"', panel);
		expect(main, '.main-content is not inside .content-panel').toBeGreaterThan(panel);
		expect(read('lib/components/layout/PanelHeader.svelte')).toContain('<header class="content-panel-header ');
	});
});
