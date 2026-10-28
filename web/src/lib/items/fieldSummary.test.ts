import { describe, expect, it } from 'vitest';
import type { FieldDef } from '$lib/types';
import { buildFieldSummary, fieldSummaryMarkdown } from './fieldSummary';

const fields: FieldDef[] = [
	{ key: 'status', label: 'Status', type: 'select', options: ['open', 'in-progress'] },
	{ key: 'problema', label: 'Problema', type: 'text' },
	{ key: 'verificacion', label: 'Cómo se verifica', type: 'text' },
	{ key: 'entregables', label: 'Entregables', type: 'multi_select', options: ['tests', 'capturas'] },
	{ key: 'effort', label: 'Effort', type: 'number', suffix: 'h' },
	{ key: 'progress', label: 'Progress', type: 'number', computed: true },
	{ key: 'parent', label: 'Parent', type: 'relation' },
	{ key: 'meta', label: 'Meta', type: 'json' },
	{ key: 'blocked', label: 'Blocked', type: 'checkbox' },
	{ key: 'empty', label: 'Empty', type: 'text' }
];

describe('buildFieldSummary (TASK-22)', () => {
	it('keeps every filled field in schema order, as full text', () => {
		const long = 'En staging por WhatsApp: audio «¿puedes escuchar audios?» → responde que sí; audio con pregunta del producto → sin audit_held.';
		const rows = buildFieldSummary(fields, {
			status: 'in-progress',
			problema: '  Los audios se transcriben bien.  ',
			verificacion: long,
			entregables: ['tests', 'capturas'],
			effort: 3,
			progress: 50,
			parent: 'item-id',
			meta: { a: 1 },
			blocked: false,
			empty: '   '
		});
		expect(rows.map((r) => r.label)).toEqual(['Status', 'Problema', 'Cómo se verifica', 'Entregables', 'Effort', 'Blocked']);
		expect(rows.find((r) => r.key === 'verificacion')?.text).toBe(long);
		expect(rows.find((r) => r.key === 'problema')?.text).toBe('Los audios se transcriben bien.');
		expect(rows.find((r) => r.key === 'status')?.text).toBe('In-Progress');
		expect(rows.find((r) => r.key === 'entregables')?.text).toBe('Tests, Capturas');
		expect(rows.find((r) => r.key === 'effort')?.text).toBe('3h');
		expect(rows.find((r) => r.key === 'blocked')?.text).toBe('No');
	});

	it('is empty for an item with nothing filled', () => {
		expect(buildFieldSummary(fields, {})).toEqual([]);
	});
});

describe('fieldSummaryMarkdown', () => {
	it('heads the Markdown with the item and keeps a multi-line value whole', () => {
		const md = fieldSummaryMarkdown('TASK-21 Audio', [
			{ key: 'tipo', label: 'Tipo', text: 'Backend' },
			{ key: 'verificacion', label: 'Cómo se verifica', text: 'paso 1\npaso 2' }
		]);
		expect(md).toBe('## TASK-21 Audio\n\n**Tipo:** Backend\n**Cómo se verifica:**\npaso 1\npaso 2\n');
	});
});
