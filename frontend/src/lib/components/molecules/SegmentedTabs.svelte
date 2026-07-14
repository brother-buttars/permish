<script lang="ts" generics="T extends string">
	import { Button } from "$lib/components/ui/button";
	import { cn } from "$lib/utils";

	let {
		value = $bindable(),
		tabs,
		onSelect,
		label,
		class: className = "",
	}: {
		value: T;
		tabs: { value: T; label: string }[];
		/** Called after a tab is chosen — use for navigation-style tabs (goto). */
		onSelect?: (value: T) => void;
		/** Accessible name for the tab group. */
		label?: string;
		class?: string;
	} = $props();

	const inactiveClass =
		"bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:drop-shadow-sm";

	function select(tab: T) {
		value = tab;
		onSelect?.(tab);
	}
</script>

<div
	class={cn(
		"flex gap-1 overflow-x-auto rounded-lg border border-input bg-muted p-1",
		className,
	)}
	role="group"
	aria-label={label}
>
	{#each tabs as tab (tab.value)}
		<Button
			type="button"
			variant={value === tab.value ? "default" : "outline"}
			size="sm"
			class={cn("flex-1 whitespace-nowrap", value !== tab.value && inactiveClass)}
			aria-pressed={value === tab.value}
			onclick={() => select(tab.value)}
		>
			{tab.label}
		</Button>
	{/each}
</div>
