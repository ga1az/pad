import { describe, expect, it } from 'vitest';
import { priorityLevel, statusCategory } from './statusCategory';

describe('statusCategory', () => {
	it('maps the open names to backlog, planned, in progress and in review', () => {
		for (const v of ['open', 'new', 'draft', 'todo', 'backlog']) expect(statusCategory(v), v).toBe('backlog');
		for (const v of ['approved', 'planned', 'ready']) expect(statusCategory(v), v).toBe('planned');
		for (const v of ['in-progress', 'in_progress', 'In Progress', 'exploring', 'doing', 'active']) {
			expect(statusCategory(v), v).toBe('progress');
		}
		for (const v of ['review', 'in-review', 'in_review']) expect(statusCategory(v), v).toBe('review');
	});

	it('reads an unknown open value, an empty one or a non-string as backlog', () => {
		expect(statusCategory('blocked')).toBe('backlog');
		expect(statusCategory('')).toBe('backlog');
		expect(statusCategory(undefined)).toBe('backlog');
		expect(statusCategory(['done'])).toBe('backlog');
		// Not the prototype chain (BUG-3041's lesson).
		expect(statusCategory('constructor')).toBe('backlog');
		expect(statusCategory('__proto__')).toBe('backlog');
	});

	it('uses the default terminal list when the field declares none', () => {
		expect(statusCategory('done')).toBe('done');
		expect(statusCategory('implemented')).toBe('done');
		expect(statusCategory('cancelled')).toBe('cancelled');
		expect(statusCategory('rejected')).toBe('cancelled');
		expect(statusCategory('wont-fix')).toBe('cancelled');
		expect(statusCategory('wontfix', {})).toBe('cancelled');
	});

	it('lets the schema decide what is closed and what is abandoned', () => {
		const field = { terminal_options: ['shipped', 'overturned'], abandoned_options: ['overturned'] };
		expect(statusCategory('shipped', field)).toBe('done');
		expect(statusCategory('overturned', field)).toBe('cancelled');
		// Declared terminal options replace the defaults: `done` is open here.
		expect(statusCategory('done', field)).toBe('backlog');
		// An open value is still matched by name.
		expect(statusCategory('in-progress', field)).toBe('progress');
	});

	it('falls back to the negative names for a field with terminal but no abandoned options', () => {
		const field = { terminal_options: ['done', 'cancelled', 'archived'] };
		expect(statusCategory('done', field)).toBe('done');
		expect(statusCategory('cancelled', field)).toBe('cancelled');
		// `archived` is deliberately not a negative terminal (BUG-2347).
		expect(statusCategory('archived', field)).toBe('done');
	});

	it('ignores a mistyped schema list', () => {
		const field = { terminal_options: 'done' as unknown as string[] };
		expect(statusCategory('done', field)).toBe('done');
		expect(statusCategory('open', field)).toBe('backlog');
	});
});

describe('priorityLevel', () => {
	it('maps the priority names to Linear bars', () => {
		expect(priorityLevel('critical')).toBe('urgent');
		expect(priorityLevel('urgent')).toBe('urgent');
		expect(priorityLevel('high')).toBe('high');
		expect(priorityLevel('Medium')).toBe('medium');
		expect(priorityLevel('low')).toBe('low');
	});

	it('reads empty, unknown and non-string values as no priority', () => {
		expect(priorityLevel('')).toBe('none');
		expect(priorityLevel('none')).toBe('none');
		expect(priorityLevel('whenever')).toBe('none');
		expect(priorityLevel(3)).toBe('none');
	});
});
