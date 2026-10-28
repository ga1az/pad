import { describe, expect, it } from 'vitest';
import { createdLabel } from './cardDate';

describe('createdLabel', () => {
	const now = new Date(2026, 9, 27, 12);

	it('omits the year within the current year', () => {
		expect(createdLabel(new Date(2026, 8, 16, 12).toISOString(), now)).toBe('Sep 16');
	});

	it('adds the year before it', () => {
		expect(createdLabel(new Date(2025, 7, 7, 12).toISOString(), now)).toBe('Aug 7, 2025');
	});

	it('answers empty for a missing or unparseable date', () => {
		expect(createdLabel('', now)).toBe('');
		expect(createdLabel(undefined, now)).toBe('');
		expect(createdLabel('not a date', now)).toBe('');
	});
});
