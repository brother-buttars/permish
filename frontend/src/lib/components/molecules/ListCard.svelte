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
		onclick?: (e: MouseEvent | KeyboardEvent) => void;
		trailing?: Snippet;
		footer?: Snippet;
		class?: string;
	} = $props();

	const interactive = $derived(typeof onclick === "function");

	// Cards are the primary navigation on dashboard/events/groups — they must
	// be operable by keyboard and announced as buttons, not silent divs.
	function handleKeydown(e: KeyboardEvent) {
		if (!interactive) return;
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			onclick?.(e);
		}
	}
</script>

<Card
	class={cn(
		interactive &&
			"cursor-pointer transition hover:drop-shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
		className,
	)}
	{onclick}
	onkeydown={interactive ? handleKeydown : undefined}
	role={interactive ? "button" : undefined}
	tabindex={interactive ? 0 : undefined}
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
