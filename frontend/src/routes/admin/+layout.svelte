<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { user as userStore, authLoading } from "$lib/stores/auth";
	import { hydrateFromUrl, adminFilter } from "$lib/stores/adminFilter";
	import { PageContainer, AdminFilterBar, SegmentedTabs } from "$lib/components/molecules";
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

	// Admin is user management + all-profiles oversight. Activities and Submissions
	// are folded into the top-level pages (super users get a group filter there).
	const tabs = [
		{ value: "/admin/users", label: "Users" },
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

		<SegmentedTabs
			class="mb-6"
			label="Admin sections"
			value={currentTab}
			{tabs}
			onSelect={navTo}
		/>

		{@render children()}
	{/if}
</PageContainer>
