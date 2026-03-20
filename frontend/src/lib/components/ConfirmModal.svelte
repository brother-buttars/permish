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

	function handleCancel() {
		open = false;
		onCancel?.();
	}
</script>

{#if open}
<div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
	<!-- Backdrop with blur -->
	<div
		class="absolute inset-0 bg-black/50 backdrop-blur-sm"
		onclick={handleCancel}
		onkeydown={() => {}}
		role="button"
		tabindex="-1"
	></div>
	<!-- Modal content -->
	<div class="relative z-10 mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
		<h3 class="text-lg font-semibold">{title}</h3>
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
