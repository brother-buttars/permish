<script lang="ts">
	import Spinner from "./Spinner.svelte";

	let {
		message = "Loading...",
	}: {
		message?: string;
	} = $props();
</script>

<div class="flex flex-col items-center justify-center gap-3 py-12">
	<Spinner size="lg" />
	<p class="text-sm text-muted-foreground">{message}</p>
</div>
