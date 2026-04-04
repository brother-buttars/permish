<script lang="ts">
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";

	let {
		message,
		actionLabel,
		onAction,
	}: {
		message: string;
		actionLabel?: string;
		onAction?: () => void;
	} = $props();
</script>

<Card>
	<CardContent class="py-12 text-center">
		<p class="text-muted-foreground">{message}</p>
		{#if actionLabel && onAction}
			<Button variant="link" class="mt-2" onclick={onAction}>{actionLabel}</Button>
		{/if}
	</CardContent>
</Card>
