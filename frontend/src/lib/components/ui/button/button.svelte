<script lang="ts">
	import { cn } from "$lib/utils";
	import type { ButtonProps } from "./index.js";

	let {
		variant = "default",
		size = "default",
		class: className = "",
		children,
		...restProps
	}: ButtonProps = $props();

	const variantClasses: Record<string, string> = {
		default: "bg-primary text-primary-foreground hover:bg-primary/90",
		destructive: "bg-destructive text-white hover:bg-destructive/90",
		outline: "border border-border bg-secondary text-secondary-foreground hover:bg-primary/25",
		secondary: "bg-secondary text-secondary-foreground hover:bg-primary/25",
		ghost: "hover:bg-primary/25",
		link: "text-primary underline-offset-4 hover:underline",
	};

	const sizeClasses: Record<string, string> = {
		default: "h-10 px-4 py-2",
		sm: "h-9 rounded-md px-3",
		lg: "h-11 rounded-md px-8",
		icon: "h-10 w-10",
	};
</script>

<button
	class={cn(
		"inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
		variantClasses[variant ?? "default"],
		sizeClasses[size ?? "default"],
		className
	)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{/if}
</button>
