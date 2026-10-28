// svelte-sonner's Toaster.svelte ships `z-index: 999999999` in its own style
// block. The attachment viewer is the top layer of the app's own z-index scale
// (100000, DR-4c in attachment-viewer-modal.spec.ts), and that spec reads
// every stylesheet rule and fails if any selector but `.lightbox-backdrop`
// declares a z-index at or above it. An override rule would not satisfy it
// (the library's declaration would still be in the sheet), so the value is
// rewritten where it is compiled. 100 is what common/ToastContainer used
// before SPEC-24 (TASK-32): above the page, below menus (400), dialogs (300)
// and the viewer.
import type { Plugin } from 'vite';

export const SONNER_TOASTER_Z_INDEX = 100;

const LIBRARY_Z_INDEX = /z-index:\s*999999999\s*;/g;

/** Rewrite the library's z-index. Throws when it is not there, so an upgrade that moves it cannot pass silently. */
export function capSonnerZIndex(source: string): string {
	if (!LIBRARY_Z_INDEX.test(source)) {
		throw new Error(
			'svelte-sonner Toaster.svelte no longer declares `z-index: 999999999`; ' +
				'update web/sonnerZIndex.ts (the attachment viewer spec needs every z-index below 100000).'
		);
	}
	LIBRARY_Z_INDEX.lastIndex = 0;
	return source.replace(LIBRARY_Z_INDEX, `z-index: ${SONNER_TOASTER_Z_INDEX};`);
}

export function sonnerZIndex(): Plugin {
	return {
		name: 'pad-sonner-z-index',
		enforce: 'pre',
		transform(code, id) {
			// Not `Toaster.svelte?svelte&type=style`: that module is cut from the
			// already-rewritten file.
			if (!id.replaceAll('\\', '/').endsWith('/node_modules/svelte-sonner/dist/Toaster.svelte')) return;
			return { code: capSonnerZIndex(code), map: null };
		}
	};
}
