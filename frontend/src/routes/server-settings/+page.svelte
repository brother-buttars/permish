<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import AlertBox from '$lib/components/AlertBox.svelte';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';

	// This app's version (from package.json at build time)
	const APP_VERSION = __APP_VERSION__;

	let serverUrl = $state('');
	let testing = $state(false);
	let testResult = $state<'success' | 'error' | null>(null);
	let testError = $state('');
	let serverVersion = $state('');
	let versionMismatch = $state(false);
	let showVersionWarning = $state(false);

	const currentUrl = typeof window !== 'undefined'
		? localStorage.getItem('permish_server_url') || ''
		: '';

	serverUrl = currentUrl;

	const defaultOrigin = typeof window !== 'undefined' ? window.location.origin : '';

	async function testConnection() {
		const url = serverUrl.trim() || defaultOrigin;
		testing = true;
		testResult = null;
		testError = '';
		serverVersion = '';
		versionMismatch = false;

		try {
			// Check health endpoint for version info
			const healthRes = await fetch(`${url.replace(/\/$/, '')}/api/health`);
			if (!healthRes.ok) {
				// Fall back to auth endpoint
				const authRes = await fetch(`${url.replace(/\/$/, '')}/api/auth/me`, {
					credentials: 'include',
				});
				if (authRes.ok || authRes.status === 401) {
					testResult = 'success';
					serverVersion = 'unknown';
				} else {
					testResult = 'error';
					testError = `Server responded with ${authRes.status}`;
				}
				return;
			}

			const health = await healthRes.json();
			testResult = 'success';
			serverVersion = health.version || 'unknown';

			// Check version compatibility
			if (serverVersion !== 'unknown' && serverVersion !== APP_VERSION) {
				versionMismatch = true;
			}
		} catch (err: any) {
			testResult = 'error';
			testError = err.message || 'Could not reach server';
		} finally {
			testing = false;
		}
	}

	function saveAndReturn() {
		if (versionMismatch) {
			showVersionWarning = true;
			return;
		}
		doSave(false);
	}

	function doSave(clearCache: boolean) {
		const url = serverUrl.trim();
		if (url) {
			localStorage.setItem('permish_server_url', url.replace(/\/$/, ''));
		} else {
			localStorage.removeItem('permish_server_url');
		}

		if (clearCache) {
			// Clear service worker cache so the app reloads fresh from the new server
			toastSuccess('Clearing cache and switching server...');
			if ('serviceWorker' in navigator) {
				navigator.serviceWorker.getRegistrations().then(registrations => {
					for (const reg of registrations) {
						reg.unregister();
					}
				});
				caches.keys().then(names => {
					for (const name of names) {
						caches.delete(name);
					}
				});
			}
			setTimeout(() => {
				window.location.href = '/login';
			}, 1000);
		} else {
			toastSuccess(url ? `Server set to ${url}` : 'Using default server');
			setTimeout(() => {
				window.location.href = '/login';
			}, 500);
		}
	}

	function resetToDefault() {
		serverUrl = '';
		localStorage.removeItem('permish_server_url');
		testResult = null;
		serverVersion = '';
		versionMismatch = false;
		toastSuccess('Reset to default server');
	}
</script>

<svelte:head>
	<title>Server Settings</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Server Settings</CardTitle>
			<CardDescription>
				Connect to a different Permish server. Leave blank to use the default ({defaultOrigin}).
			</CardDescription>
		</CardHeader>
		<CardContent class="space-y-4">
			<div class="space-y-2">
				<Label for="serverUrl">Server URL</Label>
				<Input
					id="serverUrl"
					type="url"
					placeholder={defaultOrigin || 'https://permish.example.com'}
					bind:value={serverUrl}
				/>
				<p class="text-xs text-muted-foreground">
					{#if serverUrl.trim()}
						API calls will go to: <span class="font-mono">{serverUrl.replace(/\/$/, '')}/api/</span>
					{:else}
						Using default: <span class="font-mono">{defaultOrigin}/api/</span>
					{/if}
				</p>
			</div>

			{#if testResult === 'success'}
				<div class="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 text-sm text-green-800 dark:text-green-200">
					<div class="flex items-center justify-between">
						<span>Server is reachable</span>
						{#if serverVersion && serverVersion !== 'unknown'}
							<span class="font-mono text-xs">v{serverVersion}</span>
						{/if}
					</div>
				</div>
			{/if}

			{#if versionMismatch}
				<div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm">
					<div class="font-medium text-amber-800 dark:text-amber-200">Version mismatch</div>
					<p class="text-amber-700 dark:text-amber-300 mt-1">
						This app is <span class="font-mono">v{APP_VERSION}</span> but the server is
						<span class="font-mono">v{serverVersion}</span>.
						Switching will clear the cached app and reload from the server.
					</p>
				</div>
			{/if}

			{#if testResult === 'error'}
				<AlertBox message={testError || 'Could not connect to server'} />
			{/if}

			<div class="flex gap-2">
				<Button variant="outline" class="flex-1" onclick={testConnection} disabled={testing}>
					{testing ? 'Testing...' : 'Test Connection'}
				</Button>
				<Button variant="outline" onclick={resetToDefault}>
					Reset
				</Button>
			</div>

			<Button class="w-full" onclick={saveAndReturn}>
				Save & Continue to Login
			</Button>

			<div class="flex items-center justify-between text-xs text-muted-foreground">
				<a href="/login" class="hover:text-foreground transition-colors">
					Back to login
				</a>
				<span>App v{APP_VERSION}</span>
			</div>
		</CardContent>
	</Card>
</div>

<ConfirmModal
	open={showVersionWarning}
	title="Version Mismatch"
	message="The server is running a different version (v{serverVersion}) than this app (v{APP_VERSION}). The app cache will be cleared and reloaded. Continue?"
	confirmText="Switch & Reload"
	onconfirm={() => { showVersionWarning = false; doSave(true); }}
	oncancel={() => { showVersionWarning = false; }}
/>
