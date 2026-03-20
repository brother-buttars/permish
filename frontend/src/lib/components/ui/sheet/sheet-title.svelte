<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";

	let { class: className = "", children }: { class?: string; children?: Snippet } = $props();
</script>

<h2 class={cn("text-lg font-semibold text-foreground", className)}>
	{#if children}
		{@render children()}
	{/if}
</h2>
