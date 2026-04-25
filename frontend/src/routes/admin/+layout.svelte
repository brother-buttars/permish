<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { user as userStore, authLoading } from "$lib/stores/auth";
	import { hydrateFromUrl, adminFilter } from "$lib/stores/adminFilter";
	import { PageContainer, AdminFilterBar } from "$lib/components/molecules";
	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/utils";
	import LoadingState from "$lib/components/LoadingState.svelte";

	let { children } = $props();

	let ready = $state(false);

	onMount(() => {
		const unsub = authLoading.subscribe((loading) => {
			if (loading) return;
			const u = $userStore;
			if (!u) {
				goto("/login");
				return;
			}
			if (u.role !== "super") {
				goto("/dashboard");
				return;
			}
			// Hydrate AFTER auth resolves so the user-scoped sessionStorage check
			// has the right user context.
			hydrateFromUrl($page.url.searchParams);
			ready = true;
		});
		return unsub;
	});

	const tabs = [
		{ value: "/admin", label: "Overview" },
		{ value: "/admin/users", label: "Users" },
		{ value: "/admin/activities", label: "Activities" },
		{ value: "/admin/submissions", label: "Submissions" },
		{ value: "/admin/profiles", label: "Profiles" },
	];

	const currentTab = $derived($page.url.pathname);

	function navTo(path: string) {
		const params = new URLSearchParams();
		if ($adminFilter.groupId) params.set("group", $adminFilter.groupId);
		if ($adminFilter.activityId) params.set("activity", $adminFilter.activityId);
		const qs = params.toString();
		goto(qs ? `${path}?${qs}` : path);
	}
</script>

<svelte:head>
	<title>Admin — Permish</title>
</svelte:head>

<PageContainer size="lg">
	{#if !ready}
		<LoadingState />
	{:else}
		<h1 class="mb-4 text-3xl font-bold">Admin</h1>

		<AdminFilterBar />

		<div class="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-input bg-muted p-1">
			{#each tabs as tab (tab.value)}
				{@const active = currentTab === tab.value}
				<Button
					variant={active ? "default" : "outline"}
					size="sm"
					class={cn(
						"flex-1 whitespace-nowrap",
						!active &&
							"bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:drop-shadow-sm"
					)}
					onclick={() => navTo(tab.value)}
				>
					{tab.label}
				</Button>
			{/each}
		</div>

		{@render children()}
	{/if}
</PageContainer>
