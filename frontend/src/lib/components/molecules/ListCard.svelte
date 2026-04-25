<script lang="ts">
	import type { Snippet } from "svelte";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { cn } from "$lib/utils";

	let {
		title,
		description,
		onclick,
		trailing,
		footer,
		class: className = "",
	}: {
		title: string;
		description?: string;
		onclick?: (e: MouseEvent) => void;
		trailing?: Snippet;
		footer?: Snippet;
		class?: string;
	} = $props();

	const interactive = $derived(typeof onclick === "function");
</script>

<Card
	class={cn(
		interactive && "cursor-pointer transition-shadow hover:shadow-md",
		className,
	)}
	{onclick}
>
	<CardContent class="space-y-3 py-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0 flex-1">
				<p class="font-medium">{title}</p>
				{#if description}
					<p class="text-sm text-muted-foreground">{description}</p>
				{/if}
			</div>
			{#if trailing}
				<div class="flex shrink-0 items-center gap-2">
					{@render trailing()}
				</div>
			{/if}
		</div>
		{#if footer}
			<div class="pt-1">
				{@render footer()}
			</div>
		{/if}
	</CardContent>
</Card>
