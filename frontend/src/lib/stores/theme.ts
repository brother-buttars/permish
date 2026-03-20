import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export type Theme = 'light' | 'dark' | 'system';

function getStoredTheme(): Theme {
	if (!browser) return 'system';
	return (localStorage.getItem('theme') as Theme) || 'system';
}

function getSystemPreference(): 'light' | 'dark' {
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
	if (!browser) return;
	const resolved = theme === 'system' ? getSystemPreference() : theme;
	document.documentElement.classList.toggle('dark', resolved === 'dark');
	localStorage.setItem('theme', theme);
}

export const theme = writable<Theme>(getStoredTheme());

// Apply whenever theme changes
if (browser) {
	theme.subscribe(applyTheme);

	// Listen for system preference changes
	window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
		const current = getStoredTheme();
		if (current === 'system') {
			applyTheme('system');
		}
	});
}

export function setTheme(t: Theme) {
	theme.set(t);
}
