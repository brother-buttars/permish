<script lang="ts">
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";

	let {
		message,
		description,
		actionLabel,
		onAction,
	}: {
		message: string;
		description?: string;
		actionLabel?: string;
		onAction?: () => void;
	} = $props();
</script>

<Card>
	<CardContent class="py-12 text-center">
		<p class="text-muted-foreground">{message}</p>
		{#if description}
			<p class="mt-2 text-sm text-muted-foreground">{description}</p>
		{/if}
		{#if actionLabel && onAction}
			<Button variant="link" class="mt-2" onclick={onAction}>{actionLabel}</Button>
		{/if}
	</CardContent>
</Card>
