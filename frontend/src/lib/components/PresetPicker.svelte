<script lang="ts">
	import { Input } from "$lib/components/ui/input";

	let {
		items,
		selected = $bindable([]),
		customText = $bindable(""),
		placeholder = "Other (specify)",
	}: {
		items: string[];
		selected: string[];
		customText: string;
		placeholder?: string;
	} = $props();

	function toggle(item: string) {
		if (selected.includes(item)) {
			selected = selected.filter((s) => s !== item);
		} else {
			selected = [...selected, item];
		}
	}
</script>

<div class="flex flex-wrap gap-2 mb-3">
	{#each items as item}
		<button
			type="button"
			class="rounded-full min-h-[44px] px-3 py-2 text-sm transition-colors cursor-pointer border {selected.includes(item)
				? 'border-primary/30 bg-primary/10 text-primary font-semibold'
				: 'border-border bg-muted text-muted-foreground hover:bg-muted/80'}"
			onclick={() => toggle(item)}
		>
			{item}
		</button>
	{/each}
</div>
<Input bind:value={customText} {placeholder} />
