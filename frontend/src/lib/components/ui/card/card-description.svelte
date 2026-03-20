<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";

	let { class: className = "", children }: { class?: string; children?: Snippet } = $props();
</script>

<p class={cn("text-sm text-muted-foreground", className)}>
	{#if children}
		{@render children()}
	{/if}
</p>
