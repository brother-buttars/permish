<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import { setDataMode } from '$lib/data';
	import type { DataMode } from '$lib/data';

	let selectedMode = $state<DataMode>('hybrid');
	let isStandalone = $state(false);
	let isOffline = $state(false);

	onMount(() => {
		// Detect if running as installed PWA
		isStandalone =
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true;

		isOffline = !navigator.onLine;

		// Smart default: PWA → hybrid, browser → online, offline → local
		if (isOffline) {
			selectedMode = 'local';
		} else if (isStandalone) {
			selectedMode = 'hybrid';
		} else {
			selectedMode = 'online';
		}
	});

	function chooseMode(mode: DataMode) {
		selectedMode = mode;
	}

	function confirm() {
		setDataMode(selectedMode);
		// Reload to reinitialize repository with chosen mode
		window.location.href = '/login';
	}
</script>

<svelte:head>
	<title>Welcome to Permish</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<div class="w-full max-w-lg space-y-6">
		<div class="text-center space-y-2">
			<h1 class="text-3xl font-bold">Welcome to <span class="text-primary">Permish</span></h1>
			<p class="text-muted-foreground">
				Choose how you'd like your data to be stored.
				{#if isStandalone}
					Since you installed the app, we recommend <strong>Hybrid</strong> mode.
				{/if}
				{#if isOffline}
					You're currently offline. <strong>Local</strong> mode is selected.
				{/if}
			</p>
		</div>

		<div class="space-y-3">
			<!-- Online -->
			<button
				class="w-full text-left rounded-xl border-2 p-4 transition-all {selectedMode === 'online' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-muted-foreground/30'}"
				onclick={() => chooseMode('online')}
				disabled={isOffline}
			>
				<div class="flex items-start gap-3">
					<div class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center {selectedMode === 'online' ? 'border-primary' : 'border-muted-foreground/40'}">
						{#if selectedMode === 'online'}
							<div class="h-2.5 w-2.5 rounded-full bg-primary"></div>
						{/if}
					</div>
					<div>
						<div class="font-semibold">Online</div>
						<p class="text-sm text-muted-foreground mt-0.5">
							All data is stored on the server. Requires an internet connection.
						</p>
					</div>
				</div>
			</button>

			<!-- Hybrid (recommended for PWA) -->
			<button
				class="w-full text-left rounded-xl border-2 p-4 transition-all {selectedMode === 'hybrid' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-muted-foreground/30'}"
				onclick={() => chooseMode('hybrid')}
				disabled={isOffline}
			>
				<div class="flex items-start gap-3">
					<div class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center {selectedMode === 'hybrid' ? 'border-primary' : 'border-muted-foreground/40'}">
						{#if selectedMode === 'hybrid'}
							<div class="h-2.5 w-2.5 rounded-full bg-primary"></div>
						{/if}
					</div>
					<div>
						<div class="font-semibold flex items-center gap-2">
							Hybrid
							{#if isStandalone}
								<span class="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full">Recommended</span>
							{/if}
						</div>
						<p class="text-sm text-muted-foreground mt-0.5">
							Works offline. Data syncs automatically when you're connected.
							Best for installed apps.
						</p>
					</div>
				</div>
			</button>

			<!-- Local only -->
			<button
				class="w-full text-left rounded-xl border-2 p-4 transition-all {selectedMode === 'local' ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-muted-foreground/30'}"
				onclick={() => chooseMode('local')}
			>
				<div class="flex items-start gap-3">
					<div class="mt-0.5 h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center {selectedMode === 'local' ? 'border-primary' : 'border-muted-foreground/40'}">
						{#if selectedMode === 'local'}
							<div class="h-2.5 w-2.5 rounded-full bg-primary"></div>
						{/if}
					</div>
					<div>
						<div class="font-semibold">Local Only</div>
						<p class="text-sm text-muted-foreground mt-0.5">
							Data never leaves your device. Complete privacy, no sync.
							Works fully offline.
						</p>
					</div>
				</div>
			</button>
		</div>

		<Button class="w-full" size="lg" onclick={confirm}>
			Continue
		</Button>

		<p class="text-xs text-muted-foreground text-center">
			You can change this later in Account → Data Storage.
		</p>
	</div>
</div>
