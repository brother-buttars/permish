<script lang="ts">
	import type { Snippet } from "svelte";
	import { cn } from "$lib/utils";

	type Size = "sm" | "md" | "default" | "lg" | "full";

	let {
		size = "default",
		children,
		class: className = "",
	}: {
		size?: Size;
		children: Snippet;
		class?: string;
	} = $props();

	const sizeClass: Record<Size, string> = {
		sm: "max-w-md",
		md: "max-w-2xl",
		default: "max-w-4xl",
		lg: "max-w-6xl",
		full: "",
	};
</script>

<div class={cn("container mx-auto px-4 py-8", sizeClass[size], className)}>
	{@render children()}
</div>
