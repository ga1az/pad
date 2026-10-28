/**
 * TASK-31: the collection's "Item layout" setting only shapes the stacked item
 * page (the docked pane and narrow windows); the wide page is Linear's two
 * columns. The setting says so, and the select points at that text.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import DisplaySettingsEditor from './DisplaySettingsEditor.svelte';

afterEach(() => cleanup());

describe('DisplaySettingsEditor: Item layout hint', () => {
	it('says where the setting applies, and describes the select by it', () => {
		const r = render(DisplaySettingsEditor, {
			props: { defaultView: 'list', layout: 'balanced', boardGroupBy: '', listGroupBy: '', listSortBy: '', selectFieldKeys: [], sortableFieldKeys: [] }
		});
		const hint = r.container.querySelector('#ds-layout-hint')!;
		expect(hint.textContent?.trim()).toBe("Applies to the docked pane and narrow windows; wide pages use Linear's two-column layout.");
		expect(r.container.querySelector('#ds-layout')!.getAttribute('aria-describedby')).toBe('ds-layout-hint');
		// Storage is untouched: the same three values.
		expect([...r.container.querySelectorAll('#ds-layout option')].map((o) => (o as HTMLOptionElement).value)).toEqual(['balanced', 'fields-primary', 'content-primary']);
	});
});
