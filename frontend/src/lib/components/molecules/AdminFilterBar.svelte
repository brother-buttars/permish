<script lang="ts">
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Select } from "$lib/components/ui/select";
	import { Button } from "$lib/components/ui/button";
	import { Label } from "$lib/components/ui/label";
	import { adminFilter, setFilter, clearFilter } from "$lib/stores/adminFilter";
	import { getRepository } from "$lib/data";
	import { toastError } from "$lib/stores/toast";
	import type { AdminGroupNode, AdminActivity } from "$lib/data/types";

	let groups: AdminGroupNode[] = $state([]);
	let activities: AdminActivity[] = $state([]);
	let loading = $state(true);

	const repo = getRepository();

	async function loadGroups() {
		try {
			groups = await repo.admin.listGroupsTree();
		} catch (err: any) {
			toastError(err.message || "Failed to load groups");
		}
	}

	async function loadActivities(groupId: string | null | undefined) {
		try {
			activities = await repo.admin.listActivities(groupId ? { groupId } : undefined);
		} catch (err: any) {
			toastError(err.message || "Failed to load activities");
		}
	}

	$effect(() => {
		(async () => {
			loading = true;
			await Promise.all([loadGroups(), loadActivities($adminFilter.groupId)]);
			loading = false;
		})();
	});

	$effect(() => {
		// when the filter changes group, reload activity options server-side
		loadActivities($adminFilter.groupId);
	});

	function onGroupChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		// if the currently-selected activity is not in the new group's scope, clear it
		setFilter({
			groupId: value || null,
			activityId: null,
		});
	}

	function onActivityChange(e: Event) {
		const value = (e.currentTarget as HTMLSelectElement).value;
		setFilter({ activityId: value || null });
	}

	function indent(depth: number): string {
		return depth > 0 ? "  ".repeat(depth) + "└ " : "";
	}

	const hasFilter = $derived(!!$adminFilter.groupId || !!$adminFilter.activityId);
</script>

<Card class="mb-4">
	<CardContent class="py-4">
		<div class="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
			<div class="space-y-1">
				<Label for="adminFilterGroup" class="text-xs uppercase tracking-wide text-muted-foreground">
					Stake / Ward
				</Label>
				<Select
					id="adminFilterGroup"
					value={$adminFilter.groupId || ""}
					onchange={onGroupChange}
					disabled={loading}
				>
					<option value="">All groups</option>
					{#each groups as g (g.id)}
						<option value={g.id}>{indent(g.depth)}{g.name}</option>
					{/each}
				</Select>
			</div>
			<div class="space-y-1">
				<Label for="adminFilterActivity" class="text-xs uppercase tracking-wide text-muted-foreground">
					Activity
				</Label>
				<Select
					id="adminFilterActivity"
					value={$adminFilter.activityId || ""}
					onchange={onActivityChange}
					disabled={loading || activities.length === 0}
				>
					<option value="">All activities</option>
					{#each activities as a (a.id)}
						<option value={a.id}>{a.event_name}{a.group_name ? ` — ${a.group_name}` : ""}</option>
					{/each}
				</Select>
			</div>
			<div>
				<Button
					variant="outline"
					onclick={clearFilter}
					disabled={!hasFilter}
					class="w-full sm:w-auto"
				>
					Clear
				</Button>
			</div>
		</div>
	</CardContent>
</Card>
