// The Svelte compile options every .svelte file in this app is built with,
// shared by the two configs that compile Svelte (TASK-3423):
//
//   - vite.config.ts passes them to `sveltekit({...})`, which forwards them to
//     vite-plugin-svelte for the app build and the dev server;
//   - vitest.config.ts passes them to the jsdom project's own `svelte()`.
//
// They used to live in svelte.config.js, which vite-plugin-svelte loads by
// itself, and that is how the jsdom project got them without naming them.
// SvelteKit 3 refuses that file, and deleting it would have dropped runes mode
// from component tests silently. Both consumers now import them from here, and
// runesMode.svelte.test.ts / svelteCompileOptions.test.ts fail if either stops.

/**
 * Every file of ours compiles in runes mode; dependencies decide for
 * themselves, except the Svelte-5-only UI libraries below.
 *
 * bits-ui and svelte-sonner (shadcn-svelte, SPEC-24) ship a few .svelte
 * files that use no rune at all (bits-ui's hidden form inputs, sonner's
 * icons). Left to decide, Svelte compiles those in LEGACY mode, and a single
 * legacy component imports `svelte/internal/flags/legacy`, which switches the
 * whole runtime into legacy mode the moment the library loads: effects that
 * write state they read stop re-running, among other things (TASK-26, caught
 * by itemDetailLoadsOnce's precondition). Both libraries are written for
 * runes and contain no legacy syntax, so they compile in runes mode too.
 */
const RUNES_DEPENDENCIES = ['/node_modules/bits-ui/', '/node_modules/svelte-sonner/'];

export function dynamicCompileOptions({ filename }: { filename: string }): { runes: true } | undefined {
	if (!filename.includes('node_modules')) return { runes: true };
	const path = filename.replaceAll('\\', '/');
	return RUNES_DEPENDENCIES.some((dir) => path.includes(dir)) ? { runes: true } : undefined;
}
