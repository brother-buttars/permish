<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";

	let events: any[] = $state([]);
	let profiles: any[] = $state([]);
	let submissions: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);

	const unsubAuth = user.subscribe((u) => {
		currentUser = u;
	});

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;

			if (!currentUser) {
				goto("/login");
				return;
			}

			try {
				if (currentUser.role === "planner") {
					const data = await api.listEvents();
					events = data.events || data || [];
				} else {
					const [profileData, submissionData] = await Promise.all([
						api.listProfiles(),
						api.getMySubmissions(),
					]);
					profiles = profileData.profiles || profileData || [];
					submissions = submissionData.submissions || submissionData || [];
				}
			} catch (err) {
				console.error("Failed to load dashboard data:", err);
			} finally {
				loading = false;
			}
		});

		return () => {
			unsubLoading();
			unsubAuth();
		};
	});
</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
	{:else if currentUser?.role === "planner"}
		<!-- Planner View -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<h1 class="text-3xl font-bold">My Events</h1>
			<Button onclick={() => goto("/create")}>Create New Event</Button>
		</div>

		{#if events.length === 0}
			<Card>
				<CardContent class="py-12 text-center">
					<p class="text-muted-foreground">You haven't created any events yet.</p>
					<Button variant="link" onclick={() => goto("/create")}>Create your first event</Button>
				</CardContent>
			</Card>
		{:else}
			<div class="grid gap-4">
				{#each events as event}
					<Card class="cursor-pointer transition-shadow hover:shadow-md" onclick={() => goto(`/event/${event.id}`)}>
						<CardHeader>
							<CardTitle>{event.event_name || event.name}</CardTitle>
							<CardDescription>{event.event_dates || event.dates}</CardDescription>
						</CardHeader>
						<CardContent>
							<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
								<span class="text-sm text-muted-foreground">
									{event.submission_count ?? 0} submission{(event.submission_count ?? 0) === 1 ? "" : "s"}
								</span>
								<span class="text-sm">
									{#if event.is_active}
										<span class="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">Active</span>
									{:else}
										<span class="rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-600">Inactive</span>
									{/if}
								</span>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
		{/if}
	{:else}
		<!-- Parent View -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<h1 class="text-3xl font-bold">Dashboard</h1>
			<Button onclick={() => goto("/profiles")}>Manage Profiles</Button>
		</div>

		<!-- Child Profiles -->
		<section class="mb-8">
			<h2 class="mb-4 text-xl font-semibold">Child Profiles</h2>
			{#if profiles.length === 0}
				<Card>
					<CardContent class="py-8 text-center">
						<p class="text-muted-foreground">No child profiles yet.</p>
						<Button variant="link" onclick={() => goto("/profiles")}>Add a child profile</Button>
					</CardContent>
				</Card>
			{:else}
				<div class="grid gap-3">
					{#each profiles as profile}
						<Card>
							<CardContent class="flex items-center justify-between py-4">
								<div>
									<p class="font-medium">{profile.first_name} {profile.last_name}</p>
									<p class="text-sm text-muted-foreground">DOB: {profile.date_of_birth}</p>
								</div>
							</CardContent>
						</Card>
					{/each}
				</div>
			{/if}
		</section>

		<Separator class="my-6" />

		<!-- Past Submissions -->
		<section>
			<h2 class="mb-4 text-xl font-semibold">Past Submissions</h2>
			{#if submissions.length === 0}
				<Card>
					<CardContent class="py-8 text-center">
						<p class="text-muted-foreground">No submissions yet.</p>
					</CardContent>
				</Card>
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b">
								<th class="px-4 py-3 text-left font-medium">Event</th>
								<th class="px-4 py-3 text-left font-medium">Participant</th>
								<th class="px-4 py-3 text-left font-medium">Date</th>
								<th class="px-4 py-3 text-left font-medium">PDF</th>
							</tr>
						</thead>
						<tbody>
							{#each submissions as sub}
								<tr class="border-b">
									<td class="px-4 py-3">{sub.event_name || "—"}</td>
									<td class="px-4 py-3">{sub.participant_name || "—"}</td>
									<td class="px-4 py-3">{sub.created_at ? new Date(sub.created_at).toLocaleDateString() : "—"}</td>
									<td class="px-4 py-3">
										<a
											href={api.getPdfUrl(sub.id)}
											target="_blank"
											rel="noopener noreferrer"
											class="text-primary underline hover:no-underline"
										>
											Download
										</a>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/if}
</div>
