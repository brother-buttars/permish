<script lang="ts">
	import { Label } from "$lib/components/ui/label";
	import type { Snippet } from "svelte";

	let {
		label,
		id,
		error,
		required = false,
		children,
	}: {
		label: string;
		id?: string;
		error?: string;
		required?: boolean;
		children: Snippet;
	} = $props();
</script>

<div class="space-y-2">
	{#if label}
		<Label for={id}>{label}{#if required} *{/if}</Label>
	{/if}
	{@render children()}
	{#if error}
		<p class="text-sm text-destructive">{error}</p>
	{/if}
</div>
