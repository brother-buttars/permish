<script lang="ts">
	import { cn } from "$lib/utils";
	import type { Snippet } from "svelte";

	type BadgeVariant = "active" | "inactive" | "past" | "default";

	let {
		variant = "default",
		class: className = "",
		children,
	}: {
		variant?: BadgeVariant;
		class?: string;
		children?: Snippet;
	} = $props();

	const variantClasses: Record<BadgeVariant, string> = {
		active: "border-primary/20 bg-primary/10 text-primary",
		inactive: "border-border bg-muted text-muted-foreground",
		past: "border-muted-foreground/20 bg-muted text-muted-foreground",
		default: "border-border bg-muted text-muted-foreground",
	};
</script>

<span
	class={cn(
		"inline-flex items-center rounded-full border px-2 py-1 text-xs font-medium",
		variantClasses[variant],
		className
	)}
>
	{@render children?.()}
</span>
