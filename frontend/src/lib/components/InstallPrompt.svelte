<script lang="ts">
	import { onMount } from 'svelte';
	import { Button } from '$lib/components/ui/button/index.js';

	// GitHub releases URL — only show native download links if releases exist
	const RELEASES_URL = 'https://github.com/brother-buttars/permish/releases/latest';

	type DevicePlatform = 'ios' | 'android' | 'macos' | 'windows' | 'linux' | 'unknown';

	let platform = $state<DevicePlatform>('unknown');
	let isStandalone = $state(false);
	let canInstallPwa = $state(false);
	let deferredPrompt = $state<any>(null);
	let hasNativeRelease = $state(false);
	let installing = $state(false);

	function detectPlatform(): DevicePlatform {
		if (typeof navigator === 'undefined') return 'unknown';
		const ua = navigator.userAgent.toLowerCase();
		const platform = (navigator as any).userAgentData?.platform?.toLowerCase() || '';

		if (/iphone|ipad|ipod/.test(ua) || platform === 'ios') return 'ios';
		if (/android/.test(ua)) return 'android';
		if (/macintosh|macintel|mac os/.test(ua) || platform === 'macos') return 'macos';
		if (/win/.test(ua) || platform === 'windows') return 'windows';
		if (/linux/.test(ua) || platform === 'linux') return 'linux';
		return 'unknown';
	}

	function isRunningStandalone(): boolean {
		if (typeof window === 'undefined') return false;
		return (
			window.matchMedia('(display-mode: standalone)').matches ||
			(window.navigator as any).standalone === true
		);
	}

	onMount(() => {
		platform = detectPlatform();
		isStandalone = isRunningStandalone();

		// Listen for the PWA install prompt (Chrome/Edge)
		window.addEventListener('beforeinstallprompt', (e: Event) => {
			e.preventDefault();
			deferredPrompt = e;
			canInstallPwa = true;
		});

		// Check if native releases exist (non-blocking)
		checkNativeRelease();
	});

	async function checkNativeRelease() {
		try {
			const res = await fetch(RELEASES_URL, { method: 'HEAD', redirect: 'follow' });
			hasNativeRelease = res.ok;
		} catch {
			hasNativeRelease = false;
		}
	}

	async function installPwa() {
		if (!deferredPrompt) return;
		installing = true;
		deferredPrompt.prompt();
		const result = await deferredPrompt.userChoice;
		if (result.outcome === 'accepted') {
			canInstallPwa = false;
			deferredPrompt = null;
		}
		installing = false;
	}

	// Platform-specific download URLs
	function getNativeDownloadUrl(): string {
		switch (platform) {
			case 'macos': return `${RELEASES_URL}/download/Permish.dmg`;
			case 'windows': return `${RELEASES_URL}/download/Permish.exe`;
			case 'linux': return `${RELEASES_URL}/download/Permish.AppImage`;
			default: return RELEASES_URL;
		}
	}

	function getNativeLabel(): string {
		switch (platform) {
			case 'macos': return 'Download for Mac';
			case 'windows': return 'Download for Windows';
			case 'linux': return 'Download for Linux';
			case 'ios': return 'Download for iPhone';
			case 'android': return 'Download for Android';
			default: return 'Download App';
		}
	}

	function getPwaInstructions(): string {
		switch (platform) {
			case 'ios': return 'Tap Share ⬆️ then "Add to Home Screen"';
			case 'android': return 'Tap ⋮ menu then "Install app"';
			case 'macos': return 'Click the install icon in the address bar';
			default: return 'Click the install icon in your browser';
		}
	}

	// Don't show anything if already running as installed app
	let showPrompt = $derived(!isStandalone && (canInstallPwa || platform === 'ios' || platform === 'android'));
	let showNativeDownload = $derived(hasNativeRelease && (platform === 'macos' || platform === 'windows' || platform === 'linux'));
</script>

{#if showPrompt || showNativeDownload}
	<div class="w-full space-y-3 pt-2 border-t border-border">
		<p class="text-xs text-muted-foreground text-center">Get the app</p>

		{#if canInstallPwa}
			<!-- Chrome/Edge: native install prompt available -->
			<Button variant="outline" class="w-full gap-2" onclick={installPwa} disabled={installing}>
				<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
				{installing ? 'Installing...' : 'Install Permish'}
			</Button>
		{:else if platform === 'ios'}
			<!-- iOS: Safari Add to Home Screen instructions -->
			<div class="rounded-lg border border-border p-3 text-center">
				<div class="flex items-center justify-center gap-2 text-sm font-medium mb-1">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" x2="12" y1="2" y2="15"/></svg>
					Install Permish
				</div>
				<p class="text-xs text-muted-foreground">{getPwaInstructions()}</p>
			</div>
		{:else if platform === 'android'}
			<!-- Android: Chrome menu instructions -->
			<div class="rounded-lg border border-border p-3 text-center">
				<div class="flex items-center justify-center gap-2 text-sm font-medium mb-1">
					<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg>
					Install Permish
				</div>
				<p class="text-xs text-muted-foreground">{getPwaInstructions()}</p>
			</div>
		{/if}

		{#if showNativeDownload}
			<a href={getNativeDownloadUrl()} class="block">
				<Button variant="ghost" class="w-full gap-2 text-muted-foreground">
					<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>
					{getNativeLabel()}
				</Button>
			</a>
		{/if}
	</div>
{/if}
