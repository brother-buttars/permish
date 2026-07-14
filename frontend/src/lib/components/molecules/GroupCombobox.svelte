<script lang="ts">
	import { Input } from "$lib/components/ui/input";
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

	const label = (g: Group) => `${g.name}${g.ward ? ` (${g.ward})` : ""}`;

	let query = $state("");
	let open = $state(false);
	let editing = $state(false);

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
		onSelect?.(group);
	}

	function onInput() {
		editing = true;
		open = true;
		const picked = groups.find((g) => g.id === selectedGroupId);
		if (!picked || label(picked) !== query) selectedGroupId = "";
	}
</script>

<div class="relative">
	<Input
		{id}
		bind:value={query}
		oninput={onInput}
		onfocus={() => (open = true)}
		onblur={() => setTimeout(() => { open = false; editing = false; }, 150)}
		autocomplete="off"
		{placeholder}
	/>
	{#if open && filtered.length > 0}
		<div class="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-input bg-popover shadow-md">
			{#each filtered as group (group.id)}
				<button
					type="button"
					class="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground"
					onmousedown={() => select(group)}
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
