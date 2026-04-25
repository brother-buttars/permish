<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { formatDate } from "$lib/utils/formatDate";
	import { getYouthClass, type YouthProgram } from "$lib/utils/youthClass";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import { isPastEvent } from "$lib/utils/events";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { PageHeader, PageContainer, SegmentedTabs, ListCard, EventStatusBadges } from "$lib/components/molecules";
	import { YouthClassBadge } from "$lib/components/atoms";
	import { usePdfPreview, useAuthRequired } from "$lib/components/composables";

	let events: any[] = $state([]);
	let profiles: any[] = $state([]);
	let submissions: any[] = $state([]);
	let view = $state<'planner' | 'parent'>('planner');

	const pdf = usePdfPreview();
	const auth = useAuthRequired({
		onReady: async (currentUser) => {
			const isPlanner = currentUser.role === 'planner' || currentUser.role === 'super';
			view = isPlanner ? 'planner' : 'parent';

			const repo = getRepository();
			const promises: Promise<any>[] = [
				repo.profiles.list(),
				repo.submissions.getMine(),
			];
			if (isPlanner) promises.push(repo.events.list());

			const results = await Promise.all(promises);
			profiles = results[0];
			submissions = results[1];
			if (isPlanner && results[2]) events = results[2];
		},
	});
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<PageContainer>
	{#if !auth.ready}
		<LoadingState />
	{:else}
		{#snippet dashboardActions()}
			{#if auth.user?.role === "planner" || auth.user?.role === "super"}
				<SegmentedTabs
					bind:value={view}
					tabs={[
						{ value: 'planner', label: 'Activity Manager' },
						{ value: 'parent', label: 'Parent' },
					]}
				/>
			{/if}
		{/snippet}
		<PageHeader title="Dashboard" actions={dashboardActions} />

		<!-- ═══════ Activity Manager View ═══════ -->
		{#if view === 'planner' && (auth.user?.role === 'planner' || auth.user?.role === 'super')}
			<!-- Summary stats -->
			<div class="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
				<Card>
					<CardContent class="pt-6 text-center">
						<p class="text-3xl font-bold">{events.length}</p>
						<p class="text-sm text-muted-foreground">Total Activities</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent class="pt-6 text-center">
						<p class="text-3xl font-bold">{events.filter(e => e.is_active && !isPastEvent(e)).length}</p>
						<p class="text-sm text-muted-foreground">Active</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent class="pt-6 text-center">
						<p class="text-3xl font-bold">{events.filter(e => isPastEvent(e)).length}</p>
						<p class="text-sm text-muted-foreground">Past</p>
					</CardContent>
				</Card>
				<Card>
					<CardContent class="pt-6 text-center">
						<p class="text-3xl font-bold">{events.reduce((sum, e) => sum + (e.submission_count ?? 0), 0)}</p>
						<p class="text-sm text-muted-foreground">Submissions</p>
					</CardContent>
				</Card>
			</div>

			<section class="mb-10">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<h2 class="text-xl font-semibold">Recent Activities</h2>
					<div class="flex gap-2">
						<Button variant="outline" onclick={() => goto("/events")}>View All Activities</Button>
						<Button onclick={() => goto("/create")}>Create New Activity</Button>
					</div>
				</div>

				{#if events.length === 0}
					<EmptyState
						message="You haven't created any activities yet."
						actionLabel="Create your first activity"
						onAction={() => goto('/create')}
					/>
				{:else}
					<div class="grid gap-4">
						{#each events.slice(0, 5) as event}
							{#snippet eventTrailing()}
								<span class="text-sm text-muted-foreground">
									{event.submission_count ?? 0} submission{(event.submission_count ?? 0) === 1 ? "" : "s"}
								</span>
								<EventStatusBadges {event} />
							{/snippet}
							<ListCard
								title={event.event_name}
								description={event.event_dates}
								onclick={() => goto(`/event/${event.id}`)}
								trailing={eventTrailing}
							/>
						{/each}
					</div>
					{#if events.length > 5}
						<div class="mt-3 text-center">
							<Button variant="link" onclick={() => goto("/events")}>View all {events.length} activities</Button>
						</div>
					{/if}
				{/if}
			</section>

		<!-- ═══════ Parent View ═══════ -->
		{:else}
			<Card class="mb-6">
				<CardHeader class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle class="text-xl">Youth Profiles</CardTitle>
					<Button variant="outline" onclick={() => goto("/profiles")}>Manage Profiles</Button>
				</CardHeader>
				<CardContent>
					{#if profiles.length === 0}
						<div class="py-4 text-center">
							<p class="text-muted-foreground">No youth profiles yet.</p>
							<Button variant="link" onclick={() => goto("/profiles")}>Add a youth profile</Button>
						</div>
					{:else}
						<div class="grid gap-3">
							{#each profiles as profile}
								<div class="flex items-center justify-between rounded-lg border p-4">
									<div class="flex items-center gap-3">
										<YouthIcon program={profile.youth_program} />
										<div>
											<div class="flex items-center gap-2">
												<p class="font-medium">{profile.participant_name}</p>
												{#if profile.youth_program && profile.participant_dob}
													{@const yc = getYouthClass(profile.participant_dob, profile.youth_program as YouthProgram)}
													{#if yc}
														<YouthClassBadge label={yc.label} program={yc.program} />
													{/if}
												{/if}
											</div>
											{#if profile.participant_dob}
												<p class="text-sm text-muted-foreground">DOB: {formatDate(profile.participant_dob)}</p>
											{/if}
										</div>
									</div>
									<Button variant="outline" size="sm" onclick={() => goto(`/profiles?edit=${profile.id}`)}>Edit</Button>
								</div>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle class="text-xl">My Submissions</CardTitle>
				</CardHeader>
				<CardContent>
					{#if submissions.length === 0}
						<div class="py-4 text-center">
							<p class="text-muted-foreground">No form submissions yet.</p>
						</div>
					{:else}
						<!-- Mobile card view -->
						<div class="space-y-3 sm:hidden">
							{#each submissions as sub}
								<div class="flex items-center justify-between rounded-lg border p-4">
									<div class="min-w-0 flex-1">
										<p class="font-medium">{sub.participant_name || "—"}</p>
										<p class="text-sm text-muted-foreground">{sub.event_name || "—"}</p>
										<p class="text-xs text-muted-foreground">{formatDate(sub.submitted_at)}</p>
									</div>
									<Button
										variant="outline"
										size="sm"
										class="h-7 text-xs"
										onclick={() => pdf.open(sub.id, sub.participant_name || 'submission')}
									>
										PDF
									</Button>
								</div>
							{/each}
						</div>
						<!-- Desktop table view -->
						<div class="hidden sm:block overflow-x-auto">
							<table class="w-full text-sm">
								<thead>
									<tr class="border-b">
										<th class="px-4 py-3 text-left font-medium">Activity</th>
										<th class="px-4 py-3 text-left font-medium">Participant</th>
										<th class="px-4 py-3 text-left font-medium">Submitted</th>
										<th class="px-4 py-3 text-left font-medium">Actions</th>
									</tr>
								</thead>
								<tbody>
									{#each submissions as sub}
										<tr class="border-b last:border-b-0">
											<td class="px-4 py-3">{sub.event_name || "—"}</td>
											<td class="px-4 py-3">{sub.participant_name || "—"}</td>
											<td class="px-4 py-3">{formatDate(sub.submitted_at)}</td>
											<td class="px-4 py-3">
												<Button
													variant="outline"
													size="sm"
													class="h-7 text-xs"
													onclick={() => pdf.open(sub.id, sub.participant_name || 'submission')}
												>
													PDF
												</Button>
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</CardContent>
			</Card>
		{/if}
	{/if}
</PageContainer>

<PdfModal bind:open={pdf.isOpen} url={pdf.url} name={pdf.name} loading={pdf.loading} onclose={pdf.close} />
