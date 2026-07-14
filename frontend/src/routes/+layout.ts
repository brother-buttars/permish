import { initRepository } from '$lib/data';
import { checkAuth } from '$lib/stores/auth';

// Disable SSR — this is a client-side app with cookie-based auth
export const ssr = false;

// Only run init + auth check once, not on every navigation
let initialized = false;

export async function load({ url }) {
	// Storage mode defaults to 'online' silently; advanced users switch it in
	// Account → Data. No forced onboarding gate.
	if (url.pathname === '/server-settings') return; // self-hosting escape hatch — no auth needed

	// Initialize repository + auth only once
	if (!initialized) {
		await initRepository();
		await checkAuth();
		initialized = true;
	}
}
