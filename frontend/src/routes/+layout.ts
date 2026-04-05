import { initRepository, hasCompletedSetup } from '$lib/data';
import { checkAuth } from '$lib/stores/auth';
import { redirect } from '@sveltejs/kit';

// Disable SSR — this is a client-side app with cookie-based auth
export const ssr = false;

export async function load({ url }) {
	// First visit: redirect to setup page to choose data mode
	// Skip redirect if already on the setup page
	if (typeof window !== 'undefined' && !hasCompletedSetup() && url.pathname !== '/setup') {
		redirect(302, '/setup');
	}

	// Setup page doesn't need repository initialization
	if (url.pathname === '/setup') return;

	await initRepository();
	await checkAuth();
}
