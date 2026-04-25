<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Modal } from "$lib/components/molecules";

	let {
		open = $bindable(false),
		eventName = "",
		formUrl,
		qrDataUrl,
	}: {
		open?: boolean;
		eventName?: string;
		formUrl: string;
		qrDataUrl: string;
	} = $props();
</script>

<Modal bind:open size="sm">
	{#snippet header({ close })}
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-lg font-semibold">QR Code</h3>
			<Button variant="ghost" size="sm" onclick={close}>
				<svg
					xmlns="http://www.w3.org/2000/svg"
					class="h-4 w-4"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</Button>
		</div>
	{/snippet}
	<div class="flex flex-col items-center gap-4">
		<p class="text-sm text-muted-foreground">{eventName}</p>
		<div class="rounded-xl border border-border bg-white p-4">
			<img src={qrDataUrl} alt="QR Code" class="h-64 w-64 sm:h-72 sm:w-72" />
		</div>
		<p class="text-xs text-muted-foreground text-center break-all">{formUrl}</p>
		<p class="text-sm text-muted-foreground">Scan to open the form</p>
	</div>
</Modal>
