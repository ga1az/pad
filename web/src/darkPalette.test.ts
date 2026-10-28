// Guards for the dark palette that app.css and ui.css each carry (SPEC-24 /
// TASK-31): the Linear surfaces exist twice, as hex in app.css (computed
// colours stay rgb(), which the e2e contrast measurements parse) and as oklch
// in ui.css (the shadcn components). And chip text, which is the chip's own
// colour over a tint of that colour, has to stay readable on every surface.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const APP_CSS = strip(readFileSync(join(SRC, 'app.css'), 'utf8'));
const UI_CSS = strip(readFileSync(join(SRC, 'ui.css'), 'utf8'));

// The declarations of the first `:root {` block (the dark default).
function rootVars(css: string): Map<string, string> {
	const open = css.indexOf(':root {');
	expect(open, 'no :root block').toBeGreaterThanOrEqual(0);
	const end = css.indexOf('\n}', open);
	const out = new Map<string, string>();
	for (const m of css.slice(open, end).matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)) out.set(m[1], m[2].trim());
	return out;
}

const app = rootVars(APP_CSS);
const ui = rootVars(UI_CSS);

type RGB = [number, number, number];

function hex(value: string): RGB {
	const m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(value.trim());
	expect(m, `not a hex colour: ${value}`).not.toBeNull();
	const n = parseInt(m![1].length === 3 ? [...m![1]].map((c) => c + c).join('') : m![1], 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// oklch(L C h) -> sRGB 0..255 (Björn Ottosson's matrices, no gamut mapping:
// the palette is in gamut).
function oklch(value: string): RGB {
	const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value.trim());
	expect(m, `not an oklch(): ${value}`).not.toBeNull();
	const [L, C, h] = [Number(m![1]), Number(m![2]), (Number(m![3]) * Math.PI) / 180];
	const a = C * Math.cos(h);
	const b = C * Math.sin(h);
	const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
	const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
	const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
	const lin = [
		4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s
	];
	const enc = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
	return lin.map((v) => Math.min(255, Math.max(0, enc(v)))) as RGB;
}

const lum = ([r, g, b]: RGB) => {
	const f = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
	return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (x: RGB, y: RGB) => {
	const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
	return (hi + 0.05) / (lo + 0.05);
};
// color-mix(in srgb, a pct%, b): the channels interpolate linearly.
const mix = (a: RGB, pct: number, b: RGB): RGB => a.map((v, i) => (v * pct) / 100 + (b[i] * (100 - pct)) / 100) as RGB;

describe('dark palette', () => {
	// [legacy variable in app.css, the --ui-* variable that mirrors it]
	const MIRRORED: [string, string][] = [
		['--bg-primary', '--ui-background'], // panel
		['--bg-tertiary', '--ui-card'], // card
		['--card-bg', '--ui-card'],
		['--bg-raised', '--ui-popover'], // raised
		['--border', '--ui-border'],
		['--card-border', '--ui-border'],
		['--text-primary', '--ui-foreground']
	];

	it.each(MIRRORED)('%s (hex, app.css) matches %s (oklch, ui.css)', (legacy, token) => {
		const want = hex(app.get(legacy)!);
		const got = oklch(ui.get(token)!);
		// The oklch literals are rounded to three places.
		got.forEach((v, i) => expect(Math.abs(v - want[i]), `${legacy} ${want} vs ${token} ${got.map(Math.round)}`).toBeLessThanOrEqual(1.5));
	});

	it('--ui-sidebar (the app frame) is the same #19191c the Linear measurement gives', () => {
		const got = oklch(ui.get('--ui-sidebar')!);
		const want = hex('#19191c');
		got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(1.5));
	});
});

describe('chip text contrast (dark)', () => {
	// Every colour a chip is drawn in: the accents, the categorical blue. Not
	// --status-draft, a deliberately dim #666 that is only ever an icon colour.
	const COLORS: [string, RGB][] = [
		...['primary', 'purple', 'gray', 'brown', 'red', 'orange', 'green', 'amber', 'cyan'].map(
			(n): [string, RGB] => [`--accent-${n}`, hex(app.get(`--accent-${n}`)!)]
		),
		['--status-blue', hex(app.get('--status-blue')!)]
	];
	const SURFACES: [string, RGB][] = [
		['panel', hex(app.get('--bg-primary')!)],
		['card', hex(app.get('--card-bg')!)],
		['raised', hex(app.get('--bg-raised')!)]
	];
	const alpha = parseFloat(app.get('--chip-alpha')!);
	const textMix = parseFloat(app.get('--chip-text-mix')!);
	const toward = hex(app.get('--chip-text-toward')!);

	it('reads the chip variables it measures', () => {
		expect(alpha).toBeGreaterThan(0);
		expect(textMix).toBeGreaterThan(0);
		expect(textMix).toBeLessThan(100);
	});

	for (const [surface, bg] of SURFACES) {
		it.each(COLORS)(`%s chip text holds 4.5:1 on its tint over the ${surface} surface`, (_name, color) => {
			const tint = mix(color, alpha, bg);
			const text = mix(color, textMix, toward);
			expect(contrast(text, tint)).toBeGreaterThanOrEqual(4.5);
		});
	}
});
