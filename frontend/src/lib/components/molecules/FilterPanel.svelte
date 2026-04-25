<script lang="ts">
	import type { Snippet } from "svelte";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import { cn } from "$lib/utils";

	let {
		search = $bindable(""),
		searchPlaceholder = "Search...",
		showSearch = true,
		children,
		class: className = "",
	}: {
		search?: string;
		searchPlaceholder?: string;
		showSearch?: boolean;
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<Card class={cn("mb-6", className)}>
	<CardContent class="space-y-4 pt-6">
		{#if showSearch}
			<Input type="text" placeholder={searchPlaceholder} bind:value={search} />
		{/if}
		{#if children}
			{@render children()}
		{/if}
	</CardContent>
</Card>
