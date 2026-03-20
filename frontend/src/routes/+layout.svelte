<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { user, authLoading, logout } from '$lib/stores/auth';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SheetContent, SheetHeader, SheetTitle } from '$lib/components/ui/sheet/index.js';

	let { children } = $props();

	let mobileMenuOpen = $state(false);

	let currentUser = $derived.by(() => {
		let val: typeof $user = null;
		const unsub = user.subscribe((v) => (val = v));
		unsub();
		return val;
	});

	let loading = $derived.by(() => {
		let val = true;
		const unsub = authLoading.subscribe((v) => (val = v));
		unsub();
		return val;
	});

	async function handleLogout() {
		await logout();
		mobileMenuOpen = false;
		goto('/');
	}

	function closeMobile() {
		mobileMenuOpen = false;
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="min-h-screen flex flex-col">
	<!-- Header -->
	<header class="border-b bg-background">
		<div class="container mx-auto flex h-16 items-center justify-between px-4">
			<a href="/" class="text-xl font-bold">Permission Forms</a>

			<!-- Desktop nav -->
			<nav class="hidden md:flex items-center gap-4">
				{#if !loading}
					{#if currentUser}
						<a href="/dashboard" class="text-sm font-medium hover:underline">Dashboard</a>
						{#if currentUser.role === 'parent'}
							<a href="/profiles" class="text-sm font-medium hover:underline">Profiles</a>
						{/if}
						{#if currentUser.role === 'planner'}
							<a href="/events/new" class="text-sm font-medium hover:underline">Create Event</a>
						{/if}
						<Button variant="outline" size="sm" onclick={handleLogout}>Logout</Button>
					{:else}
						<a href="/login">
							<Button variant="ghost" size="sm">Login</Button>
						</a>
						<a href="/register">
							<Button size="sm">Register</Button>
						</a>
					{/if}
				{/if}
			</nav>

			<!-- Mobile hamburger -->
			<button
				class="md:hidden inline-flex items-center justify-center rounded-md p-2 hover:bg-accent"
				onclick={() => (mobileMenuOpen = true)}
				aria-label="Open menu"
			>
				<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
					<line x1="4" x2="20" y1="12" y2="12" />
					<line x1="4" x2="20" y1="6" y2="6" />
					<line x1="4" x2="20" y1="18" y2="18" />
				</svg>
			</button>
		</div>
	</header>

	<!-- Mobile Sheet -->
	<SheetContent open={mobileMenuOpen} side="right" onclose={closeMobile}>
		<SheetHeader>
			<SheetTitle>Menu</SheetTitle>
		</SheetHeader>
		<nav class="flex flex-col gap-4 mt-6">
			{#if !loading}
				{#if currentUser}
					<a href="/dashboard" class="text-sm font-medium hover:underline" onclick={closeMobile}>Dashboard</a>
					{#if currentUser.role === 'parent'}
						<a href="/profiles" class="text-sm font-medium hover:underline" onclick={closeMobile}>Profiles</a>
					{/if}
					{#if currentUser.role === 'planner'}
						<a href="/events/new" class="text-sm font-medium hover:underline" onclick={closeMobile}>Create Event</a>
					{/if}
					<Button variant="outline" size="sm" onclick={handleLogout}>Logout</Button>
				{:else}
					<a href="/login" onclick={closeMobile}>
						<Button variant="ghost" size="sm" class="w-full">Login</Button>
					</a>
					<a href="/register" onclick={closeMobile}>
						<Button size="sm" class="w-full">Register</Button>
					</a>
				{/if}
			{/if}
		</nav>
	</SheetContent>

	<!-- Page content -->
	<main class="flex-1">
		{@render children()}
	</main>
</div>
