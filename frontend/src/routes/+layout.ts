import { initRepository } from '$lib/data';
import { checkAuth } from '$lib/stores/auth';

// Disable SSR — this is a client-side app with cookie-based auth
export const ssr = false;

export async function load() {
	await initRepository();
	await checkAuth();
}
