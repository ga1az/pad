import type { FieldDef } from '$lib/types';
import { formatFieldLabel } from '$lib/utils/fieldColors';

/**
 * The item's Summary (TASK-22): every field that holds something, in schema
 * order, as full text a person can read at once and copy for an agent. The
 * Properties editors stay where they are; this is the read view of them.
 *
 * Left out: computed fields (they are derived, and shown above), relations and
 * JSON (their stored value is ids and structure, not prose), and empty values.
 */
export interface FieldSummaryRow {
	key: string;
	label: string;
	text: string;
}

const SKIPPED_TYPES = new Set<FieldDef['type']>(['relation', 'multi_relation', 'json']);

function textOf(field: FieldDef, value: unknown): string {
	if (value === null || value === undefined) return '';
	if (Array.isArray(value)) {
		return value
			.filter((v) => typeof v === 'string' || typeof v === 'number')
			.map((v) => (field.type === 'multi_select' ? formatFieldLabel(String(v)) : String(v)))
			.join(', ');
	}
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (typeof value === 'number') return String(value) + (field.suffix ?? '');
	if (typeof value !== 'string') return '';
	const s = value.trim();
	return field.type === 'select' ? formatFieldLabel(s) : s;
}

export function buildFieldSummary(fields: FieldDef[], values: Record<string, unknown>): FieldSummaryRow[] {
	const rows: FieldSummaryRow[] = [];
	for (const field of fields) {
		if (field.computed || SKIPPED_TYPES.has(field.type)) continue;
		const text = textOf(field, values[field.key]);
		if (text !== '') rows.push({ key: field.key, label: field.label || field.key, text });
	}
	return rows;
}

/** The Summary as Markdown, headed by the item's ref and title. A multi-line
 *  value goes on the lines after its label, so its own breaks survive. */
export function fieldSummaryMarkdown(heading: string, rows: FieldSummaryRow[]): string {
	const lines = [`## ${heading}`, ''];
	for (const row of rows) {
		if (row.text.includes('\n')) {
			lines.push(`**${row.label}:**`, row.text, '');
		} else {
			lines.push(`**${row.label}:** ${row.text}`);
		}
	}
	return lines.join('\n').trimEnd() + '\n';
}
