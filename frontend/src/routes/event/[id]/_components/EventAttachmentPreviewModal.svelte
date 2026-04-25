<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import PdfViewer from "$lib/components/PdfViewer.svelte";
	import { Modal } from "$lib/components/molecules";

	let {
		open = $bindable(false),
		name = "",
		url = "",
		mimeType = "",
		loading = false,
		onclose,
	}: {
		open?: boolean;
		name?: string;
		url?: string;
		mimeType?: string;
		loading?: boolean;
		onclose: () => void;
	} = $props();
</script>

<Modal bind:open size="fullscreen" {onclose}>
	{#snippet header({ close })}
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h3 class="font-semibold">{name}</h3>
			<div class="flex gap-2">
				<Button variant="ghost" size="sm" onclick={close}>Close</Button>
			</div>
		</div>
	{/snippet}
	<div class="flex-1 overflow-hidden">
		{#if loading}
			<div class="flex h-full items-center justify-center">
				<p class="text-muted-foreground">Loading...</p>
			</div>
		{:else if mimeType === "application/pdf"}
			<PdfViewer src={url} class="h-full" />
		{:else if mimeType?.startsWith("image/")}
			<div class="flex h-full items-center justify-center overflow-auto p-4">
				<img src={url} alt={name} class="max-h-full max-w-full object-contain" />
			</div>
		{/if}
	</div>
</Modal>
