<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";

	let { class: className = "", children }: { class?: string; children?: Snippet } = $props();
</script>

<div class={cn("flex flex-col space-y-2 text-center sm:text-left", className)}>
	{#if children}
		{@render children()}
	{/if}
</div>
