<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';
	import '../app.css';
	import { user, authLoading, logout } from '$lib/stores/auth';
	import '$lib/stores/theme';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { Button } from '$lib/components/ui/button/index.js';
	import { SheetContent, SheetHeader, SheetTitle } from '$lib/components/ui/sheet/index.js';
	import ToastContainer from '$lib/components/ToastContainer.svelte';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';

	import { onMount } from 'svelte';

	let { children } = $props();

	let mobileMenuOpen = $state(false);
	let currentUser: any = $state(null);
	let loading = $state(true);
	let pathname = $state('/');

	onMount(() => {
		const unsubUser = user.subscribe((v) => { currentUser = v; });
		const unsubLoading = authLoading.subscribe((v) => { loading = v; });
		const unsubPage = page.subscribe((p) => { pathname = p.url?.pathname || '/'; });

		return () => {
			unsubUser();
			unsubLoading();
			unsubPage();
		};
	});

	function isActive(href: string): boolean {
		if (href === '/dashboard') return pathname === '/dashboard';
		if (href === '/events') return pathname === '/events' || pathname.startsWith('/event/');
		if (href === '/profiles') return pathname === '/profiles';
		if (href === '/create') return pathname === '/create';
		if (href === '/account') return pathname === '/account';
		return false;
	}

	function navClass(href: string): string {
		const base = 'text-sm font-medium transition-colors';
		return isActive(href)
			? `${base} text-primary border-b-2 border-primary pb-0.5`
			: `${base} text-muted-foreground hover:text-foreground`;
	}

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
						<a href="/dashboard" class={navClass('/dashboard')}>Dashboard</a>
						{#if currentUser.role === 'planner'}
							<a href="/events" class={navClass('/events')}>Events</a>
						{/if}
						<a href="/profiles" class={navClass('/profiles')}>Profiles</a>
						<a href="/account" class={navClass('/account')}>Account</a>
						<ThemeToggle />
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
					<a href="/dashboard" class="{navClass('/dashboard')} py-2" onclick={closeMobile}>Dashboard</a>
					{#if currentUser.role === 'planner'}
						<a href="/events" class="{navClass('/events')} py-2" onclick={closeMobile}>Events</a>
					{/if}
					<a href="/profiles" class="{navClass('/profiles')} py-2" onclick={closeMobile}>Profiles</a>
					<a href="/account" class="{navClass('/account')} py-2" onclick={closeMobile}>Account</a>
					<Button variant="outline" size="sm" onclick={handleLogout}>Logout</Button>
				{:else}
					<a href="/login" onclick={closeMobile}>
						<Button variant="ghost" size="sm" class="w-full">Login</Button>
					</a>
					<a href="/register" onclick={closeMobile}>
						<Button size="sm" class="w-full">Register</Button>
					</a>
				{/if}
				<div class="pt-2 border-t border-border">
					<ThemeToggle />
				</div>
			{/if}
		</nav>
	</SheetContent>

	<!-- Page content -->
	<main class="flex-1">
		{@render children()}
	</main>
</div>

<ToastContainer />
