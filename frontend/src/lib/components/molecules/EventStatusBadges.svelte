<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { isPastEvent } from "$lib/utils/events";

	let { event }: { event: { is_active?: boolean; event_dates?: string } } = $props();

	const past = $derived(isPastEvent(event));
</script>

<span class="flex gap-1">
	{#if event.is_active}
		<Badge variant="active">Active</Badge>
	{:else}
		<Badge variant="inactive">Inactive</Badge>
	{/if}
	{#if past}
		<Badge variant="past">Past</Badge>
	{/if}
</span>
