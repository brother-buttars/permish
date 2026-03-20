import { writable } from 'svelte/store';
import { api } from '$lib/api';

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
		const data = await api.me();
		user.set(data.user);
	} catch {
		user.set(null);
	} finally {
		authLoading.set(false);
	}
}

export async function login(email: string, password: string) {
	const data = await api.login({ email, password });
	user.set(data.user);
	return data.user;
}

export async function register(email: string, password: string, name: string, role: string) {
	const data = await api.register({ email, password, name, role });
	user.set(data.user);
	return data.user;
}

export async function logout() {
	await api.logout();
	user.set(null);
}
