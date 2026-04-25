<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils";

	let {
		title,
		subtitle,
		titleSuffix,
		actions,
		class: className = "",
	}: {
		title: string;
		subtitle?: string;
		titleSuffix?: Snippet;
		actions?: Snippet;
		class?: string;
	} = $props();
</script>

<div
	class={cn(
		"mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
		className,
	)}
>
	<div class="min-w-0">
		<div class="flex items-center gap-2">
			<h1 class="text-3xl font-bold">{title}</h1>
			{#if titleSuffix}
				{@render titleSuffix()}
			{/if}
		</div>
		{#if subtitle}
			<p class="mt-1 text-sm text-muted-foreground">{subtitle}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-2">
			{@render actions()}
		</div>
	{/if}
</div>
