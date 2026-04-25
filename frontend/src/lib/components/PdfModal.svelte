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

	let dialogEl: HTMLDivElement | undefined = $state();
	let previouslyFocused: HTMLElement | null = null;

	const FOCUSABLE_SELECTOR =
		'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

	function getFocusable(): HTMLElement[] {
		if (!dialogEl) return [];
		return Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
	}

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
		if (!open) return;
		if (e.key === 'Escape') {
			close();
			return;
		}
		if (e.key === 'Tab' && dialogEl) {
			const focusable = getFocusable();
			if (focusable.length === 0) {
				e.preventDefault();
				dialogEl.focus();
				return;
			}
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			const active = document.activeElement as HTMLElement | null;
			if (e.shiftKey && (active === first || !dialogEl.contains(active))) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && (active === last || !dialogEl.contains(active))) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	$effect(() => {
		if (open) {
			previouslyFocused = document.activeElement as HTMLElement | null;
			queueMicrotask(() => {
				const focusable = getFocusable();
				(focusable[0] ?? dialogEl)?.focus();
			});
		} else if (previouslyFocused) {
			previouslyFocused.focus();
			previouslyFocused = null;
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
<div bind:this={dialogEl} tabindex="-1" class="fixed inset-0 z-50 flex items-center justify-center outline-none" role="dialog" aria-modal="true" aria-label="{name} — Permish Form">
	<button
		type="button"
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		aria-label="Close PDF preview"
		onclick={close}
	></button>
	<div class="relative mx-6 my-6 flex h-[calc(100vh-3rem)] w-full flex-col rounded-lg bg-card shadow-xl">
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
