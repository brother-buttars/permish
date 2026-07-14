<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";
	import { user as userStore, authLoading } from "$lib/stores/auth";
	import { getDataMode } from "$lib/data";
	import { PageContainer } from "$lib/components/molecules";
	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/utils";
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
					onclick={() => goto(tab.value)}
				>
					{tab.label}
				</Button>
			{/each}
		</div>

		{@render children()}
	{/if}
</PageContainer>
