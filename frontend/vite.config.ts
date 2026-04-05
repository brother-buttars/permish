import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	server: {
		// Allow connections from LAN devices (mobile testing)
		host: '0.0.0.0',
		port: 5173,
		strictPort: true,
		// When behind Caddy HTTPS proxy, configure HMR to use the proxy host
		hmr: process.env.VITE_DEV_HTTPS
			? {
					protocol: 'wss',
					host: process.env.VITE_HMR_HOST || 'dev.permish.app',
					port: 443,
					clientPort: 443,
				}
			: undefined,
	},
});
