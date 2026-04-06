import { initRepository, hasCompletedSetup } from '$lib/data';
import { checkAuth } from '$lib/stores/auth';
import { redirect } from '@sveltejs/kit';

// Disable SSR — this is a client-side app with cookie-based auth
export const ssr = false;

// Only run init + auth check once, not on every navigation
let initialized = false;

export async function load({ url }) {
	// First visit: redirect to setup page to choose data mode
	if (typeof window !== 'undefined' && !hasCompletedSetup() && url.pathname !== '/setup') {
		redirect(302, '/setup');
	}

	// These pages don't need auth check
	const skipAuthPaths = ['/setup', '/server-settings'];
	if (skipAuthPaths.includes(url.pathname)) return;

	// Initialize repository + auth only once
	if (!initialized) {
		await initRepository();
		await checkAuth();
		initialized = true;
	}
}
