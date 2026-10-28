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
// the default terminal list) decides those. The names are the templates'
// open workflow values (internal/collections/templates*.go), grouped as
// fieldColors.ts groups them where it names them: its "underway" values
// (exploring, fixing, drafting, confirmed, in review) are in progress or
// in review here, its "not started" values backlog or planned.
const OPEN_BY_NAME: Record<string, StatusCategory> = {
	// Decided or triaged, not started: the next thing to pick up.
	approved: 'planned',
	planned: 'planned',
	planning: 'planned', // plans: planning, active, completed
	ready: 'planned', // scrum backlog: new, ready, in_sprint
	triaged: 'planned', // bugs: new, triaged, fixing
	reviewed: 'planned', // feedback: new, reviewed, planned (triage, not a review stage)
	applied: 'planned', // hiring and interviewing: in the funnel, nothing scheduled yet
	// Being worked on.
	'in-progress': 'progress',
	exploring: 'progress',
	doing: 'progress',
	active: 'progress',
	started: 'progress',
	fixing: 'progress',
	building: 'progress',
	researching: 'progress',
	drafting: 'progress',
	confirmed: 'progress',
	'in-sprint': 'progress',
	// Content that is live but not archived is ongoing, as `active` is
	// (fieldColors puts both with the finished greens; it is not terminal).
	published: 'progress',
	screen: 'progress',
	interviewing: 'progress',
	onsite: 'progress',
	// Waiting on a decision about finished work.
	review: 'review',
	'in-review': 'review',
	reviewing: 'review',
	offer: 'review', // the last step before accepted/hired
};

// Negative terminal names the icon also treats as abandoned when a field
// declares no abandoned_options. NOT added to NEGATIVE_TERMINALS in
// types/index.ts: that list is pinned to Go's NegativeTerminals by
// TestNegativeTerminalsMatchTheWebCopy, and the server's counts follow it.
// The hiring template's loop `result` declares `reject` terminal with no
// abandoned_options, so without this it drew as done (TASK-28 review).
const ICON_NEGATIVE = new Set(['reject', 'cancel', 'decline', 'withdraw', 'withdrawn', 'abandon', 'dropped', 'lost']);

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
		const isAbandoned = abandoned
			? abandoned.includes(v)
			: isNegativeTerminal(raw) || isNegativeTerminal(v) || ICON_NEGATIVE.has(v);
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
		// The conventions collection's must / should / nice-to-have. Three
		// levels onto the three bars; `must` is a hard rule, not an emergency,
		// so it is not urgent's exclamation.
		case 'must':
			return 'high';
		case 'should':
			return 'medium';
		case 'nice-to-have':
			return 'low';
		default:
			return 'none';
	}
}
