<script lang="ts">
	import { cn } from "$lib/utils";
	import type { HTMLSelectAttributes } from "svelte/elements";
	import type { Snippet } from "svelte";

	interface SelectProps extends HTMLSelectAttributes {
		class?: string;
		children?: Snippet;
	}

	let { class: className = "", children, ...restProps }: SelectProps = $props();
</script>

<select
	class={cn(
		"flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</select>
