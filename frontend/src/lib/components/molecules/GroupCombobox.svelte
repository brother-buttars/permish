<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { cn } from "$lib/utils";
	import type { Group } from "$lib/data/types";

	let {
		groups,
		selectedGroupId = $bindable(""),
		onSelect,
		id = "group-combo",
		placeholder = "Search your groups…",
	}: {
		/** Groups the user may pick from. */
		groups: Group[];
		/** Currently selected group id ('' = none). Bindable. */
		selectedGroupId?: string;
		/** Called when a group is chosen (e.g. to auto-fill ward/stake/leader). */
		onSelect?: (group: Group) => void;
		id?: string;
		placeholder?: string;
	} = $props();

	// Show the ward in parens only for ward-type groups (and only when it adds
	// info) — for stake/custom groups the name already says it all.
	const label = (g: Group) =>
		g.type === "ward" && g.ward && g.ward !== g.name ? `${g.name} (${g.ward})` : g.name;

	let query = $state("");
	let open = $state(false);
	let editing = $state(false);
	let activeIndex = $state(-1);

	let filtered = $derived(
		query.trim() === ""
			? groups
			: groups.filter((g) => label(g).toLowerCase().includes(query.trim().toLowerCase())),
	);

	// Mirror an externally-set selection (e.g. the edit form preloading the
	// activity's current group) into the input text — but never mid-typing.
	$effect(() => {
		if (editing) return;
		const picked = groups.find((g) => g.id === selectedGroupId);
		query = picked ? label(picked) : "";
	});

	function select(group: Group) {
		selectedGroupId = group.id;
		editing = false;
		open = false;
		activeIndex = -1;
		onSelect?.(group);
	}

	function onInput() {
		editing = true;
		open = true;
		activeIndex = -1;
		const picked = groups.find((g) => g.id === selectedGroupId);
		if (!picked || label(picked) !== query) selectedGroupId = "";
	}

	// Keyboard operation: arrows move the highlight, Enter picks, Escape closes.
	// (Selection used to fire on mousedown only, so keyboard users could never
	// choose a group — Enter fired click after blur had already closed the list.)
	function onKeydown(e: KeyboardEvent) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			open = true;
			activeIndex = Math.min(activeIndex + 1, filtered.length - 1);
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			activeIndex = Math.max(activeIndex - 1, 0);
		} else if (e.key === "Enter") {
			if (open && activeIndex >= 0 && filtered[activeIndex]) {
				e.preventDefault();
				select(filtered[activeIndex]);
			}
		} else if (e.key === "Escape") {
			open = false;
			activeIndex = -1;
		}
	}
</script>

<div class="relative">
	<Input
		{id}
		bind:value={query}
		oninput={onInput}
		onkeydown={onKeydown}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => { open = false; editing = false; activeIndex = -1; }, 150)}
		autocomplete="off"
		role="combobox"
		aria-expanded={open && filtered.length > 0}
		aria-controls="{id}-listbox"
		aria-activedescendant={activeIndex >= 0 && filtered[activeIndex] ? `${id}-opt-${filtered[activeIndex].id}` : undefined}
		aria-autocomplete="list"
		{placeholder}
	/>
	{#if open && filtered.length > 0}
		<div
			id="{id}-listbox"
			role="listbox"
			class="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-input bg-popover shadow-md"
		>
			{#each filtered as group, i (group.id)}
				<button
					type="button"
					id="{id}-opt-{group.id}"
					role="option"
					aria-selected={selectedGroupId === group.id}
					tabindex="-1"
					class={cn(
						"flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground",
						i === activeIndex && "bg-accent text-accent-foreground",
					)}
					onmousedown={(e) => e.preventDefault()}
					onclick={() => select(group)}
				>
					<span>{label(group)}</span>
					{#if selectedGroupId === group.id}
						<span class="text-xs text-muted-foreground">Selected</span>
					{/if}
				</button>
			{/each}
		</div>
	{/if}
</div>
