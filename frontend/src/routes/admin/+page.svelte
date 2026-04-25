<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { toastError } from "$lib/stores/toast";
	import { adminFilter, buildAdminUrl } from "$lib/stores/adminFilter";
	import { formatDate } from "$lib/utils/formatDate";
	import type { SystemStats, AdminActivity, AdminSubmission } from "$lib/data/types";

	let stats: SystemStats | null = $state(null);
	let recentActivities: AdminActivity[] = $state([]);
	let recentSubmissions: AdminSubmission[] = $state([]);
	let loading = $state(true);

	const repo = getRepository();

	async function loadData() {
		loading = true;
		try {
			const filter = {
				groupId: $adminFilter.groupId,
				activityId: $adminFilter.activityId,
			};
			const [s, acts, subs] = await Promise.all([
				repo.admin.getStats(filter),
				repo.admin.listActivities(filter),
				repo.admin.listSubmissions(filter),
			]);
			stats = s;
			recentActivities = acts.slice(0, 5);
			recentSubmissions = subs.slice(0, 5);
		} catch (err: any) {
			toastError(err.message || "Failed to load admin overview");
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void $adminFilter.groupId;
		void $adminFilter.activityId;
		loadData();
	});
</script>

{#if loading && !stats}
	<LoadingState />
{:else}
	<!-- Stats -->
	{#if stats}
		<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
			<Card>
				<CardContent class="py-4 text-center">
					<p class="text-2xl font-bold">{stats.userCount}</p>
					<p class="text-xs text-muted-foreground">Users</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="py-4 text-center">
					<p class="text-2xl font-bold">{stats.activeEventCount}</p>
					<p class="text-xs text-muted-foreground">Active Activities</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="py-4 text-center">
					<p class="text-2xl font-bold">{stats.submissionCount}</p>
					<p class="text-xs text-muted-foreground">Submissions</p>
				</CardContent>
			</Card>
			<Card>
				<CardContent class="py-4 text-center">
					<p class="text-2xl font-bold">{stats.profileCount}</p>
					<p class="text-xs text-muted-foreground">Profiles</p>
				</CardContent>
			</Card>
		</div>
	{/if}

	<div class="grid gap-6 md:grid-cols-2">
		<Card>
			<CardHeader>
				<CardTitle class="text-base">Recent Activities</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if recentActivities.length === 0}
					<p class="text-sm text-muted-foreground">No activities in this scope.</p>
				{:else}
					{#each recentActivities as a (a.id)}
						<button
							type="button"
							class="block w-full rounded-md border border-border bg-card/40 p-3 text-left transition hover:drop-shadow-sm"
							onclick={() => goto(`/event/${a.id}`)}
						>
							<div class="flex items-center justify-between gap-2">
								<p class="font-medium truncate">{a.event_name}</p>
								<Badge variant={a.is_active ? "active" : "inactive"} class="text-xs">
									{a.is_active ? "Active" : "Inactive"}
								</Badge>
							</div>
							<p class="text-xs text-muted-foreground mt-0.5">
								{a.event_dates}
								{#if a.group_name} · {a.group_name}{/if}
								· {a.submission_count} submission{a.submission_count === 1 ? '' : 's'}
							</p>
						</button>
					{/each}
					<a href={buildAdminUrl('/admin/activities')} class="block text-sm text-primary hover:underline">
						See all activities →
					</a>
				{/if}
			</CardContent>
		</Card>

		<Card>
			<CardHeader>
				<CardTitle class="text-base">Recent Submissions</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if recentSubmissions.length === 0}
					<p class="text-sm text-muted-foreground">No submissions in this scope.</p>
				{:else}
					{#each recentSubmissions as s (s.id)}
						<div class="rounded-md border border-border bg-card/40 p-3">
							<div class="flex items-center justify-between gap-2">
								<p class="font-medium truncate">{s.participant_name}</p>
								<span class="text-xs text-muted-foreground">{formatDate(s.submitted_at, true)}</span>
							</div>
							<p class="text-xs text-muted-foreground mt-0.5">
								{s.event_name}
								{#if s.group_name} · {s.group_name}{/if}
							</p>
						</div>
					{/each}
					<a href={buildAdminUrl('/admin/submissions')} class="block text-sm text-primary hover:underline">
						See all submissions →
					</a>
				{/if}
			</CardContent>
		</Card>
	</div>
{/if}
