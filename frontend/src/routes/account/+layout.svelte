<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { user as userStore, authLoading } from "$lib/stores/auth";
	import { getDataMode } from "$lib/data";
	import { PageContainer, SegmentedTabs } from "$lib/components/molecules";
	import LoadingState from "$lib/components/LoadingState.svelte";

	let { children } = $props();

	let ready = $state(false);
	let dataMode = $state(getDataMode());

	onMount(() => {
		const unsub = authLoading.subscribe((loading) => {
			if (loading) return;
			if (!$userStore) {
				goto("/login");
				return;
			}
			ready = true;
		});
		return unsub;
	});

	const tabs = $derived.by(() => {
		const base = [
			{ value: "/account", label: "Profile" },
			{ value: "/account/security", label: "Security" },
			{ value: "/account/data", label: "Data" },
		];
		if (dataMode === "hybrid") {
			base.push({ value: "/account/sync", label: "Sync" });
		}
		return base;
	});

	const currentTab = $derived($page.url.pathname);
</script>

<svelte:head>
	<title>My Account</title>
</svelte:head>

<PageContainer>
	{#if !ready}
		<LoadingState />
	{:else}
		<h1 class="mb-4 text-3xl font-bold">My Account</h1>

		<SegmentedTabs
			class="mb-6"
			label="Account sections"
			value={currentTab}
			{tabs}
			onSelect={(path) => goto(path)}
		/>

		{@render children()}
	{/if}
</PageContainer>
