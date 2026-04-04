<script lang="ts">
	import { Button } from "$lib/components/ui/button";

	let {
		open = $bindable(false),
		title,
		message,
		confirmLabel = "Confirm",
		confirmVariant = "destructive",
		onConfirm,
		onCancel,
		loading = false,
	}: {
		open: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		confirmVariant?: string;
		onConfirm: () => void;
		onCancel?: () => void;
		loading?: boolean;
	} = $props();

	let modalEl: HTMLDivElement | undefined = $state();

	function handleCancel() {
		open = false;
		onCancel?.();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') {
			handleCancel();
			return;
		}
		if (e.key === 'Tab' && modalEl) {
			const focusable = modalEl.querySelectorAll<HTMLElement>(
				'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
			);
			if (focusable.length === 0) return;
			const first = focusable[0];
			const last = focusable[focusable.length - 1];
			if (e.shiftKey && document.activeElement === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && document.activeElement === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}

	$effect(() => {
		if (open && modalEl) {
			const firstBtn = modalEl.querySelector<HTMLElement>('button');
			firstBtn?.focus();
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
<div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
	<!-- Backdrop with blur -->
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		onclick={handleCancel}
	></div>
	<!-- Modal content -->
	<div bind:this={modalEl} class="relative z-10 mx-4 w-full max-w-md rounded-lg bg-popover p-6 shadow-xl">
		<h3 id="confirm-title" class="text-lg font-semibold">{title}</h3>
		<p class="mt-2 text-sm text-muted-foreground">{message}</p>
		<div class="mt-6 flex justify-end gap-3">
			<Button variant="outline" onclick={handleCancel}>Cancel</Button>
			<Button variant={confirmVariant} onclick={onConfirm} disabled={loading}>
				{#if loading}Processing...{:else}{confirmLabel}{/if}
			</Button>
		</div>
	</div>
</div>
{/if}
