<script lang="ts">
	import { goto } from '$app/navigation';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { getGroupContext } from './_context.svelte';

	const ctx = getGroupContext();
	const group = $derived(ctx.group!);
</script>

<div class="space-y-6">
	<Card>
		<CardHeader>
			<CardTitle>Group Details</CardTitle>
		</CardHeader>
		<CardContent class="space-y-3">
			{#if group.leader_name}
				<div class="grid gap-1 sm:grid-cols-3">
					<span class="text-sm text-muted-foreground">Leader</span>
					<span class="sm:col-span-2">{group.leader_name}</span>
				</div>
			{/if}
			{#if group.leader_phone}
				<div class="grid gap-1 sm:grid-cols-3">
					<span class="text-sm text-muted-foreground">Phone</span>
					<span class="sm:col-span-2">{group.leader_phone}</span>
				</div>
			{/if}
			{#if group.leader_email}
				<div class="grid gap-1 sm:grid-cols-3">
					<span class="text-sm text-muted-foreground">Email</span>
					<span class="sm:col-span-2">{group.leader_email}</span>
				</div>
			{/if}
			{#if group.parent}
				<div class="grid gap-1 sm:grid-cols-3">
					<span class="text-sm text-muted-foreground">Parent Group</span>
					<span class="sm:col-span-2">
						<a href="/groups/{group.parent.id}" class="text-primary underline hover:no-underline">{group.parent.name}</a>
					</span>
				</div>
			{/if}
		</CardContent>
	</Card>

	{#if group.subgroups && group.subgroups.length > 0}
		<Card>
			<CardHeader>
				<CardTitle>Subgroups</CardTitle>
			</CardHeader>
			<CardContent>
				<div class="grid gap-3">
					{#each group.subgroups as sub}
						<div
							class="flex items-center justify-between rounded-md border border-border px-4 py-3 cursor-pointer hover:bg-muted transition-colors"
							onclick={() => goto(`/groups/${sub.id}`)}
							onkeydown={(e) => { if (e.key === 'Enter') goto(`/groups/${sub.id}`); }}
							role="button"
							tabindex="0"
						>
							<div>
								<span class="font-medium">{sub.name}</span>
								{#if sub.ward}
									<span class="text-sm text-muted-foreground ml-2">{sub.ward}</span>
								{/if}
							</div>
							<Badge variant="secondary" class="text-xs capitalize">{sub.type}</Badge>
						</div>
					{/each}
				</div>
			</CardContent>
		</Card>
	{/if}
</div>
