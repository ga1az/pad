// What a status or priority VALUE looks like as an icon (SPEC-24 / TASK-28):
// the six Linear workflow shapes, and Linear's priority bars. Pure, so the
// card, the board's lane header and later the list rows (TASK-29) and the
// pickers (TASK-30) all draw the same icon for the same value.
import type { FieldDef } from '$lib/types';
import { isNegativeTerminal, isTerminalStatusDefault } from '$lib/types';

export type StatusCategory = 'backlog' | 'planned' | 'progress' | 'review' | 'done' | 'cancelled';

export type PriorityLevel = 'urgent' | 'high' | 'medium' | 'low' | 'none';

/** Lowercase, trimmed, `_` and spaces as `-`: `In_Progress` reads `in-progress`. */
function norm(value: unknown): string {
	return typeof value === 'string' ? value.trim().toLowerCase().replace(/[_\s]+/g, '-') : '';
}

/** A schema list, when it is one: stored JSON can hold anything (BUG-3041). */
function declared(list: unknown): string[] | null {
	if (!Array.isArray(list) || list.length === 0) return null;
	return list.filter((v): v is string => typeof v === 'string').map(norm);
}

// Open values by NAME. Terminal values never reach this map: the schema (or
// the default terminal list) decides those.
const OPEN_BY_NAME: Record<string, StatusCategory> = {
	approved: 'planned',
	planned: 'planned',
	ready: 'planned',
	'in-progress': 'progress',
	exploring: 'progress',
	doing: 'progress',
	active: 'progress',
	started: 'progress',
	review: 'review',
	'in-review': 'review',
	reviewing: 'review',
};

/**
 * The icon category of a status value.
 *
 * The field's schema decides first: a value in `terminal_options` is closed,
 * and closed is `cancelled` when it is in `abandoned_options` (or, for a
 * field that declares none, when its name is one of the negative terminals),
 * `done` otherwise. A field that declares no `terminal_options` uses the
 * app's default terminal list. An open value is matched by name, and an open
 * value nobody named (`open`, `new`, `blocked`, a custom word) is `backlog`.
 */
export function statusCategory(
	value: unknown,
	field?: Pick<FieldDef, 'terminal_options' | 'abandoned_options'> | null
): StatusCategory {
	const v = norm(value);
	if (!v) return 'backlog';
	const raw = typeof value === 'string' ? value.trim().toLowerCase() : '';

	const terminal = declared(field?.terminal_options);
	const closed = terminal ? terminal.includes(v) : isTerminalStatusDefault(raw) || isTerminalStatusDefault(v);
	if (closed) {
		const abandoned = declared(field?.abandoned_options);
		const isAbandoned = abandoned ? abandoned.includes(v) : isNegativeTerminal(raw) || isNegativeTerminal(v);
		return isAbandoned ? 'cancelled' : 'done';
	}
	return Object.hasOwn(OPEN_BY_NAME, v) ? OPEN_BY_NAME[v] : 'backlog';
}

/** The priority bars for a value; anything unrecognised (or empty) is `none`. */
export function priorityLevel(value: unknown): PriorityLevel {
	switch (norm(value)) {
		case 'critical':
		case 'urgent':
		case 'highest':
		case 'p0':
			return 'urgent';
		case 'high':
		case 'p1':
			return 'high';
		case 'medium':
		case 'normal':
		case 'p2':
			return 'medium';
		case 'low':
		case 'lowest':
		case 'p3':
			return 'low';
		default:
			return 'none';
	}
}
