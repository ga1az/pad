/**
 * "Choosing the value it already has writes nothing", for a picker whose writes
 * are not optimistic. Comparing against the `value` prop alone is wrong while a
 * write is in flight: A to B (not shown yet), then back to A, compares A with the
 * still-shown A, writes nothing, and the item ends as B. So the last value sent
 * is remembered, and is the one a choice is compared against until the parent
 * shows it or the write settles (a failure leaves the prop where it was, and the
 * old value is the truth again).
 *
 * Call it during component init: it registers an effect.
 */
export function sentChoice(shown: () => string) {
	let sent = $state<string | undefined>(undefined);
	// The shown value caught up with what was sent: the prop is the truth again.
	$effect.pre(() => {
		if (sent !== undefined && shown() === sent) sent = undefined;
	});
	return {
		/** Calls `send(v)` unless `v` is already the value, shown or in flight. */
		choose(v: string, send: (v: string) => unknown): void {
			if (v === (sent ?? shown())) return;
			sent = v;
			const settled = () => {
				if (sent === v) sent = undefined;
			};
			const result = send(v);
			if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
				// Rethrow, so a rejection still reaches whoever listens for one.
				(result as PromiseLike<unknown>).then(settled, (e) => {
					settled();
					throw e;
				});
			}
		}
	};
}
