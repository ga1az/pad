// Runs in the jsdom vitest project (filename ends `.svelte.test.ts`).
//
// BUG-3115 — the sidebar quick-add dialog must not lose a title the user
// typed. The e2e spec (bug-3115-refused-title-keeps-text.spec.ts) covers the
// refusal paths against the real server; this pins the interleaving codex
// round 1 found: dismiss the dialog and reopen it on the SAME collection while
// the first create is still in flight. The old response used to recognise
// "its" dialog by collection, so it closed the new one and cleared the new
// text.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/svelte';
import { tick } from 'svelte';

const pending = vi.hoisted(() => ({
	resolve: null as null | ((v: unknown) => void),
	reject: null as null | ((e: unknown) => void),
}));

vi.mock('$lib/api/client', () => ({
	api: {
		health: vi.fn(async () => ({ version: 'dev', commit: 'abcdef0' })),
		collections: { list: vi.fn(async () => []), update: vi.fn() },
		items: {
			create: vi.fn(
				() =>
					new Promise((resolve, reject) => {
						pending.resolve = resolve;
						pending.reject = reject;
					}),
			),
		},
	},
	isPlanLimitError: () => false,
	planLimitMessage: () => '',
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(), afterNavigate: vi.fn(), beforeNavigate: vi.fn() }));
vi.mock('$lib/stores/workspace.svelte', () => ({
	workspaceStore: {
		current: { slug: 'ws', owner_username: 'u', is_guest: false },
		// Every collection is creatable here; the gate itself is walked in
		// e2e/permission-walk-collections.spec.ts (BUG-3258).
		canEditCollection: () => true,
		membershipKnown: true
	},
}));
// A $state-backed double: see the fixture for why a plain array is not one.
vi.mock('$lib/stores/collections.svelte', async () => await import('./sidebarQuickAdd.fixture.svelte'));

import Sidebar from './Sidebar.svelte';
import { uiStore } from '$lib/stores/ui.svelte';
import { collectionStore } from '$lib/stores/collections.svelte';

function input(): HTMLTextAreaElement {
	const el = document.querySelector<HTMLTextAreaElement>('.quick-add-modal textarea.quick-add-input');
	if (!el) throw new Error('quick-add dialog is not open');
	return el;
}

async function open() {
	uiStore.requestQuickAdd('tasks');
	await tick();
	await tick();
}

async function type(text: string) {
	await fireEvent.input(input(), { target: { value: text } });
}

beforeEach(() => {
	cleanup();
	pending.resolve = pending.reject = null;
});

describe('Sidebar quick-add — an in-flight create belongs to ONE opening of the dialog (BUG-3115)', () => {
	for (const outcome of ['succeeds', 'is refused'] as const) {
		it(`dismissed and reopened on the same collection, the old create ${outcome} without touching the new text`, async () => {
			render(Sidebar);
			await open();
			await type('first title');
			await fireEvent.keyDown(input(), { key: 'Enter' });
			// PREMISE: the create is in flight.
			expect(pending.resolve, 'no create was sent').not.toBeNull();

			await fireEvent.keyDown(input(), { key: 'Escape' });
			await tick();
			expect(document.querySelector('.quick-add-modal'), 'Escape did not dismiss').toBeNull();
			await open();
			await type('second title');

			if (outcome === 'succeeds') pending.resolve!({ id: 'i1', slug: 'first-title', item_number: 1 });
			else pending.reject!(new Error('Title is too long: 300 characters, maximum 255'));
			await tick();
			await tick();

			expect(document.querySelector('.quick-add-modal'), 'the new dialog was closed by the old create').not.toBeNull();
			expect(input().value, 'the new text was cleared by the old create').toBe('second title');
			expect(document.querySelector('#quick-add-error'), 'the old refusal was shown on the new dialog').toBeNull();
		});
	}

	it('the reopened dialog is usable while the old create is still in flight (codex round 2)', async () => {
		render(Sidebar);
		await open();
		await type('first title');
		await fireEvent.keyDown(input(), { key: 'Enter' });
		expect(pending.resolve, 'no create was sent').not.toBeNull();
		// While ITS create is in flight the opening is read-only: what was sent
		// is what the result lands on.
		expect(input().readOnly, 'typing is possible while the create is in flight').toBe(true);

		await fireEvent.keyDown(input(), { key: 'Escape' });
		await tick();
		await open();
		await type('second title');
		await tick();
		expect(input().readOnly, 'the new opening inherited the old one\'s busy state').toBe(false);
		const create = document.querySelector<HTMLButtonElement>('.quick-add-submit');
		expect(create?.disabled, 'Create is disabled until an unrelated request settles').toBe(false);
	});
});

describe('Sidebar quick-add — an Escape meant for the collection picker (TASK-2235)', () => {
	it('closes the picker only, even before focus has moved into it', async () => {
		const extra = { id: 'c2', slug: 'ideas', name: 'Ideas', icon: '💡', prefix: 'IDEA', schema: '{"fields":[]}', settings: '{}', sort_order: 1 };
		(collectionStore.collections as unknown[]).push(extra);
		try {
			render(Sidebar);
			await open();
			const pill = document.querySelector<HTMLButtonElement>('.quick-add-pill')!;
			await fireEvent.click(pill);
			await tick();
			expect(document.querySelector('.quick-add-picker'), 'the picker opened').not.toBeNull();
			// The picker takes focus a frame later; this press lands on the pill. The
			// dialog's own Escape listener is on the document, so it only stays
			// open if the press is stopped here.
			await fireEvent.keyDown(pill, { key: 'Escape' });
			await tick();
			expect(document.querySelector('.quick-add-picker'), 'the picker closed').toBeNull();
			expect(document.querySelector('.quick-add-modal'), 'the dialog stayed open').not.toBeNull();
		} finally {
			(collectionStore.collections as unknown[]).splice(1);
		}
	});
});
