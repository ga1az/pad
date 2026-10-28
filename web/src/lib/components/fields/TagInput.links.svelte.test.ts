/**
 * TASK-31: the item page's Labels are links to the tag's page again (the
 * header tags were, before the properties column took them), and removing one
 * stays a separate, keyboard-reachable button.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import TagInput from './TagInput.svelte';

afterEach(() => cleanup());

const hrefFor = (t: string) => `/u/ws/tags/${encodeURIComponent(t)}`;

describe('TagInput chips as links', () => {
	it('each label links to its tag page, URL-encoded, and × is its own button', async () => {
		const onchange = vi.fn();
		const r = render(TagInput, { props: { tags: ['design', 'ux/ui'], onchange, hrefFor } });
		const links = [...r.container.querySelectorAll<HTMLAnchorElement>('a.tag-link')];
		expect(links.map((a) => a.getAttribute('href'))).toEqual(['/u/ws/tags/design', '/u/ws/tags/ux%2Fui']);
		expect(links.map((a) => a.textContent)).toEqual(['design', 'ux/ui']);
		const remove = r.getByRole('button', { name: 'Remove design' });
		expect(remove.tagName).toBe('BUTTON');
		expect(remove.closest('a')).toBeNull();
		await fireEvent.click(remove);
		expect(onchange).toHaveBeenCalledWith(['ux/ui']);
	});

	it('read-only labels link too; without hrefFor they are plain text', () => {
		const a = render(TagInput, { props: { tags: ['design'], onchange: vi.fn(), readonly: true, hrefFor } });
		expect(a.container.querySelector('a.tag-link')?.getAttribute('href')).toBe('/u/ws/tags/design');
		a.unmount();
		const b = render(TagInput, { props: { tags: ['design'], onchange: vi.fn(), readonly: true } });
		expect(b.container.querySelector('a')).toBeNull();
		expect(b.container.textContent).toContain('design');
	});
});
