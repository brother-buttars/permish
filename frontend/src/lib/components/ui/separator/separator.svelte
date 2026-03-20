<script lang="ts">
	import { cn } from "$lib/utils";

	let {
		class: className = "",
		orientation = "horizontal",
		decorative = true,
	}: {
		class?: string;
		orientation?: "horizontal" | "vertical";
		decorative?: boolean;
	} = $props();
</script>

<div
	role={decorative ? "none" : "separator"}
	aria-orientation={orientation}
	class={cn(
		"shrink-0 bg-border",
		orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
		className
	)}
></div>
