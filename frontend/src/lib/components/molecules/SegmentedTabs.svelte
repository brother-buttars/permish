<script lang="ts" generics="T extends string">
	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/utils";

	let {
		value = $bindable(),
		tabs,
		class: className = "",
	}: {
		value: T;
		tabs: { value: T; label: string }[];
		class?: string;
	} = $props();

	const inactiveClass =
		"bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm";
</script>

<div
	class={cn(
		"flex gap-1 rounded-lg border border-input bg-muted p-1",
		className,
	)}
>
	{#each tabs as tab (tab.value)}
		<Button
			variant={value === tab.value ? "default" : "outline"}
			size="sm"
			class={cn("flex-1", value !== tab.value && inactiveClass)}
			onclick={() => (value = tab.value)}
		>
			{tab.label}
		</Button>
	{/each}
</div>
