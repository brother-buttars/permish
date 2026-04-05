// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

const SITE_URL = 'https://brother-buttars.github.io';
const BASE_PATH = '/permish';

export default defineConfig({
	site: SITE_URL,
	base: BASE_PATH,
	integrations: [
		starlight({
			title: 'Permish',
			description: 'Open-source permission form app for LDS Church activities. Web, desktop, and mobile.',
			logo: {
				dark: './src/assets/logo-dark.svg',
				light: './src/assets/logo-light.svg',
				replacesTitle: false,
			},
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/brother-buttars/permish' },
			],
			customCss: ['./src/styles/custom.css'],
			head: [
				{
					tag: 'meta',
					attrs: { name: 'theme-color', content: '#7c3aed' },
				},
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'getting-started/introduction' },
						{ label: 'Quick Start', slug: 'getting-started/quick-start' },
					],
				},
				{
					label: 'Self-Hosting',
					items: [
						{ label: 'Docker Compose', slug: 'self-hosting/docker-compose' },
						{ label: 'HTTPS & SSL', slug: 'self-hosting/https-ssl' },
						{ label: 'Environment Variables', slug: 'self-hosting/environment-variables' },
						{ label: 'Data Backup', slug: 'self-hosting/data-backup' },
						{ label: 'Updating', slug: 'self-hosting/updating' },
					],
				},
				{
					label: 'Downloads',
					items: [
						{ label: 'Desktop App', slug: 'downloads/desktop' },
						{ label: 'Mobile App', slug: 'downloads/mobile' },
					],
				},
				{
					label: 'Development',
					items: [
						{ label: 'Local Setup', slug: 'development/local-setup' },
						{ label: 'HTTPS Development', slug: 'development/https-dev' },
						{ label: 'Mobile Testing', slug: 'development/mobile-testing' },
						{ label: 'Architecture', slug: 'development/architecture' },
						{ label: 'Testing', slug: 'development/testing' },
					],
				},
				{
					label: 'Contributing',
					items: [
						{ label: 'Fork & Build', slug: 'contributing/fork-and-build' },
						{ label: 'Code Style', slug: 'contributing/code-style' },
					],
				},
			],
		}),
	],
});
