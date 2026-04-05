import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// When behind Caddy HTTPS proxy (./dev.sh), tell the browser to connect HMR via wss://
		// Vite server stays on its port; Caddy proxies wss:443 → ws:5173
		hmr: process.env.VITE_DEV_HTTPS
			? {
					protocol: 'wss',
					host: process.env.VITE_HMR_HOST || 'dev.permish.app',
					clientPort: 443,
				}
			: undefined,
	},
});
