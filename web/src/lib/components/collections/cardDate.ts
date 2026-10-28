/**
 * The card's "Created <date>" label (SPEC-24 / TASK-28), Linear's short form:
 * `Sep 16` within the current year, `Sep 16, 2025` before it. Local time,
 * like the tooltip's full timestamp. '' for a missing or unparseable date.
 */
export function createdLabel(dateStr: string | null | undefined, now: Date = new Date()): string {
	if (!dateStr) return '';
	const date = new Date(dateStr);
	if (Number.isNaN(date.getTime())) return '';
	const sameYear = date.getFullYear() === now.getFullYear();
	return date.toLocaleDateString('en-US', sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' });
}
