import { sveltekit } from '@sveltejs/kit/vite';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { svelteTesting } from '@testing-library/svelte/vite';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const lib = fileURLToPath(new URL('./src/lib', import.meta.url));

// Two Vitest projects so component tests don't fight SvelteKit's SSR resolution:
//  - unit:      plain .test.ts (logic) — uses the SvelteKit plugin (provides $app/$lib).
//  - component: *.svelte.test.ts — uses the bare svelte() plugin + a browser DOM,
//               which resolves Svelte's client build so components can mount.
export default defineConfig({
	test: {
		projects: [
			{
				plugins: [sveltekit()],
				test: {
					name: 'unit',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.svelte.test.ts', '**/node_modules/**'],
				},
			},
			{
				plugins: [svelte({ preprocess: vitePreprocess() }), svelteTesting()],
				resolve: { alias: { $lib: lib }, conditions: ['browser'] },
				test: {
					name: 'component',
					include: ['src/**/*.svelte.test.ts'],
					environment: 'happy-dom',
				},
			},
		],
	},
});
