<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import PdfViewer from "$lib/components/PdfViewer.svelte";

	let {
		open = $bindable(false),
		url = '',
		name = '',
		loading = false,
		onclose,
	}: {
		open: boolean;
		url: string;
		name: string;
		loading?: boolean;
		onclose?: () => void;
	} = $props();

	function close() {
		open = false;
		onclose?.();
	}

	function download() {
		if (!url) return;
		const a = document.createElement('a');
		a.href = url;
		a.download = `permish-${name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
		a.click();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (open && e.key === 'Escape') close();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" onclick={close}>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="mx-6 my-6 flex h-[calc(100vh-3rem)] w-full flex-col rounded-lg bg-card shadow-xl" role="document" onclick={(e) => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h3 class="font-semibold">{name} — Permish Form</h3>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={download}>Download</Button>
				<Button variant="ghost" size="sm" onclick={close}>Close</Button>
			</div>
		</div>
		<div class="flex-1 overflow-hidden">
			{#if loading}
				<div class="flex h-full items-center justify-center">
					<p class="text-muted-foreground">Loading PDF...</p>
				</div>
			{:else}
				<PdfViewer src={url} class="h-full" />
			{/if}
		</div>
	</div>
</div>
{/if}
