import { writable } from 'svelte/store';
import { getRepository } from '$lib/data';

interface User {
	id: string;
	email: string;
	name: string;
	role: 'planner' | 'parent';
}

export const user = writable<User | null>(null);
export const authLoading = writable(true);

export async function checkAuth() {
	try {
		const repo = getRepository();
		const u = await repo.auth.getCurrentUser();
		user.set(u as User | null);
	} catch {
		user.set(null);
	} finally {
		authLoading.set(false);
	}
}

export async function login(email: string, password: string) {
	const repo = getRepository();
	const u = await repo.auth.login(email, password);
	user.set(u as User);
	return u;
}

export async function register(email: string, password: string, name: string, role: string) {
	const repo = getRepository();
	const u = await repo.auth.register(email, password, name, role);
	user.set(u as User);
	return u;
}

export async function logout() {
	const repo = getRepository();
	await repo.auth.logout();
	user.set(null);
}
