import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';

const copyMock = vi.fn(async (_t: string) => true);
const toastMock = vi.fn();
vi.mock('$lib/utils/clipboard', () => ({ copyToClipboard: (t: string) => copyMock(t) }));
vi.mock('$lib/stores/toast.svelte', () => ({ toastStore: { show: (...a: unknown[]) => toastMock(...a) } }));

const { default: ItemFieldSummary } = await import('./ItemFieldSummary.svelte');

const long = 'En staging por WhatsApp: audio «¿puedes escuchar audios?» → responde que sí; sin audit_held.';

describe('ItemFieldSummary (TASK-22)', () => {
	beforeEach(() => {
		copyMock.mockClear();
		toastMock.mockClear();
	});

	it('shows every row in full and copies them as Markdown', async () => {
		const { container } = render(ItemFieldSummary, {
			props: {
				heading: 'TASK-21 Audio',
				rows: [
					{ key: 'tipo', label: 'Tipo', text: 'Backend' },
					{ key: 'verificacion', label: 'Cómo se verifica', text: long }
				]
			}
		});
		// Closed by default (SPEC-24 / TASK-31): it sits below the body, and the
		// properties above already show the fields.
		expect(container.querySelector('details')?.hasAttribute('open')).toBe(false);
		expect(screen.getByText(long)).toBeTruthy();
		expect(screen.getByText('Cómo se verifica')).toBeTruthy();

		await fireEvent.click(screen.getByRole('button', { name: /copy/i }));
		await waitFor(() => expect(copyMock).toHaveBeenCalledTimes(1));
		expect(copyMock.mock.calls[0][0]).toBe(`## TASK-21 Audio\n\n**Tipo:** Backend\n**Cómo se verifica:** ${long}\n`);
		expect(toastMock).toHaveBeenCalledWith('Summary copied', 'success');
		// Copy must not also open (or fold) the section it sits in.
		expect(container.querySelector('details')?.hasAttribute('open')).toBe(false);
		await fireEvent.click(container.querySelector('summary')!);
		expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
		await fireEvent.click(screen.getByRole('button', { name: /copy/i }));
		expect(container.querySelector('details')?.hasAttribute('open')).toBe(true);
	});

	it('renders nothing for an item with no filled field', () => {
		const { container } = render(ItemFieldSummary, { props: { heading: 'TASK-1', rows: [] } });
		expect(container.querySelector('details')).toBeNull();
	});
});
