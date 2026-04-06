import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));

export default defineConfig({
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},
	plugins: [
		tailwindcss(),
		sveltekit(),
		SvelteKitPWA({
			srcDir: 'src',
			strategies: 'generateSW',
			registerType: 'autoUpdate',
			manifest: {
				name: 'Permish',
				short_name: 'Permish',
				description: 'LDS Church permission form app — create, sign, and submit forms digitally.',
				theme_color: '#f97316',
				background_color: '#0f172a',
				display: 'standalone',
				scope: '/',
				start_url: '/',
				categories: ['utilities', 'productivity'],
				icons: [
					{
						src: '/icons/icon-192.png',
						sizes: '192x192',
						type: 'image/png',
					},
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
					},
					{
						src: '/icons/icon-512.png',
						sizes: '512x512',
						type: 'image/png',
						purpose: 'maskable',
					},
				],
			},
			workbox: {
				// Cache app shell and static assets
				globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
				// Runtime caching for API calls
				runtimeCaching: [
					{
						// Cache API responses for offline use (network-first)
						urlPattern: /^https:\/\/.*\/api\//,
						handler: 'NetworkFirst',
						options: {
							cacheName: 'api-cache',
							expiration: {
								maxEntries: 100,
								maxAgeSeconds: 60 * 60 * 24, // 24 hours
							},
							networkTimeoutSeconds: 5,
						},
					},
				],
			},
			devOptions: {
				enabled: true,
				type: 'module',
				navigateFallback: '/',
			},
		}),
	],
	server: {
		allowedHosts: ['dev.permish.app'],
		hmr: process.env.VITE_DEV_HTTPS
			? {
					protocol: 'wss',
					host: process.env.VITE_HMR_HOST || 'dev.permish.app',
					clientPort: 443,
				}
			: undefined,
	},
});
