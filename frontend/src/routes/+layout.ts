import { browser } from '$app/environment';
import { checkAuth } from '$lib/stores/auth';

export async function load() {
	if (browser) {
		await checkAuth();
	}
}
