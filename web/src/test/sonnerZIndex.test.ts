import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { resolveConfig } from 'vite';
import { SONNER_TOASTER_Z_INDEX, capSonnerZIndex, sonnerZIndex } from '../../sonnerZIndex';

const TOASTER = fileURLToPath(new URL('../../node_modules/svelte-sonner/dist/Toaster.svelte', import.meta.url));
const zIndexes = (css: string) => [...css.matchAll(/z-index:\s*(\d+)/g)].map((m) => Number(m[1]));

describe('the toaster stays below the attachment viewer', () => {
	it('the installed Toaster.svelte declares a z-index at or above the viewer, so the rewrite is needed', () => {
		expect(Math.max(...zIndexes(readFileSync(TOASTER, 'utf8')))).toBeGreaterThanOrEqual(100000);
	});

	it('the rewritten Toaster.svelte declares none at or above 100000', () => {
		const out = capSonnerZIndex(readFileSync(TOASTER, 'utf8'));
		expect(Math.max(...zIndexes(out))).toBeLessThan(100000);
		expect(zIndexes(out)).toContain(SONNER_TOASTER_Z_INDEX);
	});

	it('refuses a library version that no longer has the declaration', () => {
		expect(() => capSonnerZIndex('<style>.x { z-index: 5; }</style>')).toThrow(/no longer declares/);
	});

	it('the plugin rewrites only svelte-sonner\'s Toaster.svelte', () => {
		const plugin = sonnerZIndex();
		const transform = plugin.transform as (code: string, id: string) => { code: string } | undefined;
		const src = readFileSync(TOASTER, 'utf8');
		expect(transform.call({}, src, TOASTER)?.code).toContain(`z-index: ${SONNER_TOASTER_Z_INDEX};`);
		expect(transform.call({}, 'z-index: 999999999;', '/x/src/lib/Other.svelte')).toBeUndefined();
	});

	it('vite.config.ts registers it, ahead of the Svelte compile', async () => {
		const root = fileURLToPath(new URL('../../', import.meta.url));
		const config = await resolveConfig({ root, configFile: root + 'vite.config.ts', logLevel: 'silent' }, 'build', 'production');
		const names = config.plugins.map((p) => p.name);
		expect(names).toContain('pad-sonner-z-index');
		expect(names.indexOf('pad-sonner-z-index')).toBeLessThan(names.indexOf('vite-plugin-svelte:compile'));
	}, 60_000);
});
