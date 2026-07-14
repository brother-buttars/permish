/**
 * Post-authentication destination handling. Deep links (emailed event URLs,
 * group invites) pass `?next=` to /login and /register; older flows
 * (import-event) stash `permish_return_url` in localStorage. Both funnel
 * through here so login and register cannot drift.
 */

/** Only same-origin relative paths — rejects absolute URLs and `//host` tricks. */
function isSafePath(path: string | null): path is string {
	return !!path && path.startsWith('/') && !path.startsWith('//');
}

/** The validated `?next=` param on the current page, if any. */
export function safeNextParam(): string | null {
	if (typeof window === 'undefined') return null;
	const next = new URLSearchParams(window.location.search).get('next');
	return isSafePath(next) ? next : null;
}

/** Suffix to forward `next` across the login ↔ register links. */
export function nextSuffix(): string {
	const next = safeNextParam();
	return next ? `?next=${encodeURIComponent(next)}` : '';
}

/** Where to send the user after a successful login/registration. */
export function postAuthDestination(): string {
	const next = safeNextParam();
	if (next) return next;
	if (typeof window !== 'undefined') {
		const stored = localStorage.getItem('permish_return_url');
		if (stored) {
			localStorage.removeItem('permish_return_url');
			if (isSafePath(stored)) return stored;
		}
	}
	return '/dashboard';
}
