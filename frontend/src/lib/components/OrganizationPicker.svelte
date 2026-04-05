<script lang="ts">
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
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

	function toggleGroup(groupKey: string, checked: boolean) {
		const group = orgGroups.find(g => g.key === groupKey);
		if (!group) return;
		const childKeys = group.children.map(c => c.key);
		if (checked) {
			selectedOrgs = [...new Set([...selectedOrgs, ...childKeys])];
		} else {
			selectedOrgs = selectedOrgs.filter(o => !childKeys.includes(o));
		}
	}
</script>

<Card>
	<CardHeader>
		<CardTitle>Organizations</CardTitle>
		<p class="text-sm text-muted-foreground">Select which groups are included in this activity</p>
	</CardHeader>
	<CardContent class="space-y-4">
		{#each orgGroups as group}
			<div class="space-y-2">
				<label class="flex items-center gap-2">
					<input
						type="checkbox"
						checked={group.children.every(c => selectedOrgs.includes(c.key))}
						onchange={(e) => toggleGroup(group.key, e.currentTarget.checked)}
						class="h-4 w-4 rounded border-input"
					/>
					<span class="text-sm font-semibold">{group.label}</span>
				</label>
				<div class="ml-6 flex flex-wrap gap-4">
					{#each group.children as child}
						<label class="flex items-center gap-2">
							<input
								type="checkbox"
								checked={selectedOrgs.includes(child.key)}
								onchange={() => toggleOrg(child.key)}
								class="h-4 w-4 rounded border-input"
							/>
							<span class="text-sm">{child.label}</span>
						</label>
					{/each}
				</div>
			</div>
		{/each}
	</CardContent>
</Card>
