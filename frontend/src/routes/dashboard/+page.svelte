<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { formatDate } from "$lib/utils/formatDate";
	import { getYouthClass, profileMatchesEventOrgs, type YouthProgram } from "$lib/utils/youthClass";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import { isPastEvent, parseOrgs } from "$lib/utils/events";
	import { getOrgDisplayLabels } from "$lib/utils/organizations";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { PageHeader, PageContainer, SegmentedTabs, ListCard, EventStatusBadges } from "$lib/components/molecules";
	import { YouthClassBadge, OrgBadge } from "$lib/components/atoms";
	import { usePdfPreview, useAuthRequired } from "$lib/components/composables";

	let events: any[] = $state([]);
	let upcomingForMe: any[] = $state([]);
	let profiles: any[] = $state([]);
	let submissions: any[] = $state([]);
	let view = $state<'planner' | 'parent'>('planner');

	const pdf = usePdfPreview();
	const auth = useAuthRequired({
		onReady: async (currentUser) => {
			const isPlanner = currentUser.role === 'super';
			view = isPlanner ? 'planner' : 'parent';

			const repo = getRepository();
			const promises: Promise<any>[] = [
				repo.profiles.list(),
				repo.submissions.getMine(),
			];
			if (isPlanner) promises.push(repo.events.list());
			else promises.push(repo.events.listForMe().catch(() => []));

			const results = await Promise.all(promises);
			profiles = results[0];
			submissions = results[1];
			if (isPlanner && results[2]) events = results[2];
			else if (!isPlanner && results[2]) upcomingForMe = results[2];
		},
	});

	// For each upcoming event, compute the list of profiles that qualify so we
	// can show "for: Jordan, Riley" alongside the event.
	function matchingProfiles(event: any): any[] {
		const eventOrgs = parseOrgs(event);
		return profiles.filter((p) =>
			profileMatchesEventOrgs(
				p.participant_dob,
				(p.youth_program as YouthProgram | null) ?? null,
				eventOrgs,
			)
		);
	}

	const visibleUpcoming = $derived.by(() => {
		// Active and not-yet-past events, ordered by start date, where at least one
		// of the parent's profiles qualifies (or there are no profiles, in which
		// case we still surface everything since the matcher returns true).
		return upcomingForMe
			.filter((e) => e.is_active && !isPastEvent(e))
			.filter((e) => profiles.length === 0 || matchingProfiles(e).length > 0)
			.sort((a, b) => (a.event_start || '').localeCompare(b.event_start || ''))
			.slice(0, 6);
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
			{#if auth.user?.role === "super"}
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
		{#if view === 'planner' && auth.user?.role === 'super'}
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
				<CardHeader>
					<CardTitle class="text-xl">Upcoming Activities</CardTitle>
					<p class="text-sm text-muted-foreground">
						Activities in your wards and stake that match your youth profiles.
					</p>
				</CardHeader>
				<CardContent>
					{#if upcomingForMe.length === 0}
						<p class="py-4 text-center text-muted-foreground">
							No upcoming activities yet. Activities posted to your ward or stake will show up here.
						</p>
					{:else if visibleUpcoming.length === 0}
						<p class="py-4 text-center text-muted-foreground">
							No upcoming activities match your youth profiles.
						</p>
					{:else}
						<div class="space-y-3">
							{#each visibleUpcoming as event}
								{@const matches = matchingProfiles(event)}
								<button
									type="button"
									onclick={() => goto(`/form/${event.id}`)}
									class="w-full text-left rounded-lg border p-4 transition hover:drop-shadow-md"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="min-w-0 flex-1">
											<p class="font-medium truncate">{event.event_name}</p>
											<p class="text-sm text-muted-foreground">
												{event.event_dates}
												{#if event.group_name} · {event.group_name}{/if}
											</p>
										</div>
										<EventStatusBadges {event} />
									</div>
									<div class="mt-2 flex flex-wrap items-center gap-2">
										{#each getOrgDisplayLabels(parseOrgs(event)) as label}
											<OrgBadge {label} />
										{/each}
									</div>
									{#if matches.length > 0}
										<p class="mt-2 text-xs text-muted-foreground">
											For: {matches.map((p) => p.participant_name).join(', ')}
										</p>
									{/if}
								</button>
							{/each}
						</div>
					{/if}
				</CardContent>
			</Card>

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
