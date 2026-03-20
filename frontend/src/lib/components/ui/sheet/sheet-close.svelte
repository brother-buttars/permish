<script lang="ts">
	import type { Snippet } from "svelte";

	let {
		onclick,
		children,
		class: className = "",
	}: {
		onclick?: () => void;
		children?: Snippet;
		class?: string;
	} = $props();
</script>

<button class={className} onclick={onclick} type="button">
	{#if children}
		{@render children()}
	{/if}
</button>
