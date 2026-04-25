<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { user, authLoading } from "$lib/stores/auth";
	import { Button } from "$lib/components/ui/button/index.js";
	import {
		SheetContent,
		SheetHeader,
		SheetTitle,
	} from "$lib/components/ui/sheet/index.js";
	import UserMenu from "$lib/components/UserMenu.svelte";
	import SyncStatusIndicator from "$lib/components/SyncStatusIndicator.svelte";

	let mobileMenuOpen = $state(false);
	let currentUser: any = $state(null);
	let loading = $state(true);
	let pathname = $state("/");
	let scrolled = $state(false);

	onMount(() => {
		const unsubUser = user.subscribe((v) => {
			currentUser = v;
		});
		const unsubLoading = authLoading.subscribe((v) => {
			loading = v;
		});
		const unsubPage = page.subscribe((p) => {
			pathname = p.url?.pathname || "/";
		});

		function onScroll() {
			scrolled = window.scrollY > 0;
		}
		window.addEventListener("scroll", onScroll, { passive: true });
		onScroll();

		return () => {
			unsubUser();
			unsubLoading();
			unsubPage();
			window.removeEventListener("scroll", onScroll);
		};
	});

	function isActive(href: string): boolean {
		if (href === "/dashboard") return pathname === "/dashboard";
		if (href === "/events")
			return pathname === "/events" || pathname.startsWith("/event/");
		if (href === "/submissions") return pathname === "/submissions";
		if (href === "/groups")
			return pathname === "/groups" || pathname.startsWith("/groups/");
		if (href === "/profiles") return pathname === "/profiles";
		if (href === "/create") return pathname === "/create";
		if (href === "/account") return pathname === "/account";
		if (href === "/admin") return pathname.startsWith("/admin");
		return false;
	}

	function navClass(href: string): string {
		const base = "text-sm font-medium rounded-md px-3 py-1.5 transition-colors";
		return isActive(href)
			? `${base} bg-primary text-primary-foreground`
			: `${base} text-muted-foreground hover:bg-muted hover:text-foreground`;
	}

	function mobileNavClass(href: string): string {
		const base = "text-sm font-medium rounded-md px-3 py-2 transition-colors";
		return isActive(href)
			? `${base} bg-primary text-primary-foreground`
			: `${base} text-muted-foreground hover:bg-muted hover:text-foreground`;
	}

	function closeMobile() {
		mobileMenuOpen = false;
	}
</script>

<header
	class="sticky top-0 z-40 border-t-3 border-t-primary border-b bg-card backdrop-blur-lg transition-shadow duration-200 {scrolled
		? 'shadow-md'
		: ''}"
>
	<div class="container mx-auto flex h-16 items-center justify-between px-4">
		<a href="/" class="flex items-center gap-2 text-xl font-bold">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-6 w-6 text-primary"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
				/>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M9 14l2 2 4-4"
				/>
			</svg>
			<span>per<span class="text-primary">mish</span></span>
		</a>

		<!-- Desktop nav -->
		<nav class="hidden md:flex items-center gap-1">
			{#if !loading}
				{#if currentUser}
					<a href="/dashboard" class={navClass("/dashboard")}>Dashboard</a>
					{#if currentUser.role === "super"}
						<a href="/events" class={navClass("/events")}>Activities</a>
					{/if}
					<a href="/submissions" class={navClass("/submissions")}>Submissions</a>
					<a href="/groups" class={navClass("/groups")}>Groups</a>
					<a href="/profiles" class={navClass("/profiles")}>Profiles</a>

					<div class="ml-2">
						<UserMenu user={currentUser} {pathname} />
					</div>
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

		<!-- Mobile controls -->
		<div class="md:hidden flex items-center gap-2">
			{#if !loading && currentUser}
				<UserMenu user={currentUser} onnavigate={closeMobile} />
			{/if}
			<button
				class="inline-flex items-center justify-center rounded-md p-2 hover:bg-accent"
				onclick={() => (mobileMenuOpen = true)}
				aria-label="Open menu"
			>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="24"
					height="24"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					stroke-linejoin="round"
				>
					<line x1="4" x2="20" y1="12" y2="12" />
					<line x1="4" x2="20" y1="6" y2="6" />
					<line x1="4" x2="20" y1="18" y2="18" />
				</svg>
			</button>
		</div>
	</div>
</header>

<!-- Mobile Sheet -->
<SheetContent open={mobileMenuOpen} side="right" onclose={closeMobile}>
	<SheetHeader>
		<SheetTitle>Menu</SheetTitle>
	</SheetHeader>
	<nav class="flex flex-col gap-1 mt-6">
		<SyncStatusIndicator />
		{#if !loading}
			{#if currentUser}
				<a
					href="/dashboard"
					class={mobileNavClass("/dashboard")}
					onclick={closeMobile}>Dashboard</a
				>
				{#if currentUser.role === "super"}
					<a
						href="/events"
						class={mobileNavClass("/events")}
						onclick={closeMobile}>Activities</a
					>
				{/if}
				<a
					href="/submissions"
					class={mobileNavClass("/submissions")}
					onclick={closeMobile}>Submissions</a
				>
				<a
					href="/groups"
					class={mobileNavClass("/groups")}
					onclick={closeMobile}>Groups</a
				>
				<a
					href="/profiles"
					class={mobileNavClass("/profiles")}
					onclick={closeMobile}>Profiles</a
				>
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
