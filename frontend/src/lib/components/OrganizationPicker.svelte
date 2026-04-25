<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import { orgGroups } from "$lib/utils/organizations";

	let {
		selectedOrgs = $bindable([]),
	}: {
		selectedOrgs: string[];
	} = $props();

	function toggleOrg(key: string) {
		if (selectedOrgs.includes(key)) {
			selectedOrgs = selectedOrgs.filter(o => o !== key);
		} else {
			selectedOrgs = [...selectedOrgs, key];
		}
	}

	function isGroupFullySelected(groupKey: string): boolean {
		const group = orgGroups.find(g => g.key === groupKey);
		if (!group) return false;
		return group.children.every(c => selectedOrgs.includes(c.key));
	}

	function toggleGroup(groupKey: string) {
		const group = orgGroups.find(g => g.key === groupKey);
		if (!group) return;
		const childKeys = group.children.map(c => c.key);
		if (isGroupFullySelected(groupKey)) {
			selectedOrgs = selectedOrgs.filter(o => !childKeys.includes(o));
		} else {
			selectedOrgs = [...new Set([...selectedOrgs, ...childKeys])];
		}
	}

	const groupColors: Record<string, { active: string; inactive: string }> = {
		young_men: {
			active: 'bg-blue-500 hover:bg-blue-400 text-white border-blue-500',
			inactive: 'border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20',
		},
		young_women: {
			active: 'bg-pink-500 hover:bg-pink-400 text-white border-pink-500',
			inactive: 'border-pink-300 text-pink-600 hover:bg-pink-50 dark:border-pink-700 dark:text-pink-400 dark:hover:bg-pink-900/20',
		},
	};
</script>

<Card>
	<CardHeader>
		<CardTitle>Organizations</CardTitle>
		<p class="text-sm text-muted-foreground">Select which groups are included in this activity</p>
	</CardHeader>
	<CardContent class="space-y-5">
		{#each orgGroups as group}
			{@const colors = groupColors[group.key] ?? { active: '', inactive: '' }}
			{@const allSelected = isGroupFullySelected(group.key)}
			<div class="space-y-2">
				<div class="flex flex-wrap items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						class="rounded-full text-xs h-7 font-semibold {allSelected ? colors.active : colors.inactive}"
						onclick={() => toggleGroup(group.key)}
					>
						{allSelected ? '✓' : '+'} All {group.label}
					</Button>
					{#each group.children as child}
						{@const selected = selectedOrgs.includes(child.key)}
						<Button
							type="button"
							size="sm"
							variant="outline"
							class="rounded-full text-xs h-7 {selected ? colors.active : colors.inactive}"
							onclick={() => toggleOrg(child.key)}
						>
							{child.label}
						</Button>
					{/each}
				</div>
			</div>
		{/each}
	</CardContent>
</Card>
