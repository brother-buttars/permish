<script lang="ts">
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import AlertBox from '$lib/components/AlertBox.svelte';

	const DEFAULT_LABEL = 'Current origin';

	let serverUrl = $state('');
	let testing = $state(false);
	let testResult = $state<'success' | 'error' | null>(null);
	let testError = $state('');

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

		try {
			const res = await fetch(`${url.replace(/\/$/, '')}/api/auth/me`, {
				credentials: 'include',
			});
			// 401 is fine — it means the server is reachable, just not logged in
			if (res.ok || res.status === 401) {
				testResult = 'success';
			} else {
				testResult = 'error';
				testError = `Server responded with ${res.status}`;
			}
		} catch (err: any) {
			testResult = 'error';
			testError = err.message || 'Could not reach server';
		} finally {
			testing = false;
		}
	}

	function saveAndReturn() {
		const url = serverUrl.trim();
		if (url) {
			localStorage.setItem('permish_server_url', url.replace(/\/$/, ''));
		} else {
			localStorage.removeItem('permish_server_url');
		}

		// Reload the app to reinitialize the repository with the new URL
		toastSuccess(url ? `Server set to ${url}` : 'Using default server');
		setTimeout(() => {
			window.location.href = '/login';
		}, 500);
	}

	function resetToDefault() {
		serverUrl = '';
		localStorage.removeItem('permish_server_url');
		testResult = null;
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
					Server is reachable
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

			<div class="text-center">
				<a href="/login" class="text-sm text-muted-foreground hover:text-foreground transition-colors">
					Back to login
				</a>
			</div>
		</CardContent>
	</Card>
</div>
