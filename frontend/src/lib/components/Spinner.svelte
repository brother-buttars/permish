<script lang="ts">
	import { cn } from "$lib/utils";

	let {
		class: className = "",
		size = "md",
	}: {
		class?: string;
		size?: "sm" | "md" | "lg";
	} = $props();

	const sizeClasses = {
		sm: "h-4 w-4 border-2",
		md: "h-6 w-6 border-2",
		lg: "h-8 w-8 border-3",
	};
</script>

<div
	class={cn(
		"animate-spin rounded-full border-muted-foreground/20 border-t-primary",
		sizeClasses[size],
		className
	)}
	role="status"
	aria-label="Loading"
></div>
