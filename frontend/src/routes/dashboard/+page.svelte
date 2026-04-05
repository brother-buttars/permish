<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { formatDate } from "$lib/utils/formatDate";
	import { toastError } from "$lib/stores/toast";
	import { getYouthClass, youthClassBadgeClass, type YouthProgram } from "$lib/utils/youthClass";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import { isPastEvent } from "$lib/utils/events";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { getSubmissionPdfUrl } from "$lib/services/pdfHelper";
	import { Badge } from "$lib/components/ui/badge";

	let events: any[] = $state([]);
	let profiles: any[] = $state([]);
	let submissions: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);
	let view = $state<'planner' | 'parent'>('planner');

	// PDF preview modal state
	let pdfModalOpen = $state(false);
	let pdfModalUrl = $state('');
	let pdfModalName = $state('');
	let pdfLoading = $state(false);

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

			// Default view based on role
			const isPlanner = currentUser.role === 'planner' || currentUser.role === 'super';
			view = isPlanner ? 'planner' : 'parent';

			try {
				const repo = getRepository();
				const promises: Promise<any>[] = [
					repo.profiles.list(),
					repo.submissions.getMine(),
				];

				if (isPlanner) {
					promises.push(repo.events.list());
				}

				const results = await Promise.all(promises);
				profiles = results[0];
				submissions = results[1];

				if (isPlanner && results[2]) {
					events = results[2];
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

	async function openPdfPreview(submissionId: string, participantName: string) {
		pdfModalName = participantName;
		pdfLoading = true;
		pdfModalOpen = true;
		try {
			pdfModalUrl = await getSubmissionPdfUrl(submissionId);
		} catch {
			toastError('Failed to load PDF');
			pdfModalOpen = false;
		} finally {
			pdfLoading = false;
		}
	}

	function closePdfModal() {
		pdfModalOpen = false;
		if (pdfModalUrl) {
			URL.revokeObjectURL(pdfModalUrl);
			pdfModalUrl = '';
		}
	}


</script>

<svelte:head>
	<title>Dashboard</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<LoadingState />
	{:else}
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<h1 class="text-3xl font-bold">Dashboard</h1>

			<!-- View toggle (only for planners who can see both) -->
			{#if currentUser?.role === "planner" || currentUser?.role === "super"}
				<div class="flex gap-1 rounded-lg border border-input bg-muted p-1">
					<Button
						variant={view === 'planner' ? 'default' : 'outline'}
						size="sm"
						class="flex-1 {view !== 'planner' ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
						onclick={() => view = 'planner'}
					>
						Activity Manager
					</Button>
					<Button
						variant={view === 'parent' ? 'default' : 'outline'}
						size="sm"
						class="flex-1 {view !== 'parent' ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
						onclick={() => view = 'parent'}
					>
						Parent
					</Button>
				</div>
			{/if}
		</div>

		<!-- ═══════ Activity Manager View ═══════ -->
		{#if view === 'planner' && (currentUser?.role === 'planner' || currentUser?.role === 'super')}
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
					<Card>
						<CardContent class="py-8 text-center">
							<p class="text-muted-foreground">You haven't created any activities yet.</p>
							<Button variant="link" onclick={() => goto("/create")}>Create your first activity</Button>
						</CardContent>
					</Card>
				{:else}
					<div class="grid gap-4">
						{#each events.slice(0, 5) as event}
							<Card class="cursor-pointer transition-shadow hover:shadow-md" onclick={() => goto(`/event/${event.id}`)}>
								<CardContent class="flex items-center justify-between py-4">
									<div class="min-w-0 flex-1">
										<p class="font-medium">{event.event_name}</p>
										<p class="text-sm text-muted-foreground">{event.event_dates}</p>
									</div>
									<div class="flex items-center gap-3">
										<span class="text-sm text-muted-foreground">
											{event.submission_count ?? 0} submission{(event.submission_count ?? 0) === 1 ? "" : "s"}
										</span>
										<span class="flex gap-1">
											{#if event.is_active}
												<Badge variant="active">Active</Badge>
											{:else}
												<Badge variant="inactive">Inactive</Badge>
											{/if}
											{#if isPastEvent(event)}
												<Badge variant="past">Past</Badge>
											{/if}
										</span>
									</div>
								</CardContent>
							</Card>
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
			<section class="mb-10">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<h2 class="text-xl font-semibold">Child Profiles</h2>
					<Button variant="outline" onclick={() => goto("/profiles")}>Manage Profiles</Button>
				</div>

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
									<div class="flex items-center gap-3">
										<YouthIcon program={profile.youth_program} />
										<div>
											<div class="flex items-center gap-2">
												<p class="font-medium">{profile.participant_name}</p>
												{#if profile.youth_program && profile.participant_dob}
													{@const yc = getYouthClass(profile.participant_dob, profile.youth_program as YouthProgram)}
													{#if yc}
														<span class="rounded-full border px-2 py-0.5 text-xs font-medium {youthClassBadgeClass(yc.program)}">{yc.label}</span>
													{/if}
												{/if}
											</div>
											{#if profile.participant_dob}
												<p class="text-sm text-muted-foreground">DOB: {formatDate(profile.participant_dob)}</p>
											{/if}
										</div>
									</div>
									<Button variant="outline" size="sm" onclick={() => goto(`/profiles?edit=${profile.id}`)}>Edit</Button>
								</CardContent>
							</Card>
						{/each}
					</div>
				{/if}
			</section>

			<Separator class="my-8" />

			<section>
				<h2 class="mb-4 text-xl font-semibold">My Submissions</h2>
				{#if submissions.length === 0}
					<Card>
						<CardContent class="py-8 text-center">
							<p class="text-muted-foreground">No form submissions yet.</p>
						</CardContent>
					</Card>
				{:else}
					<!-- Mobile card view -->
					<div class="space-y-3 sm:hidden">
						{#each submissions as sub}
							<Card>
								<CardContent class="py-3 px-4">
									<div class="flex items-center justify-between">
										<div class="min-w-0 flex-1">
											<p class="font-medium">{sub.participant_name || "—"}</p>
											<p class="text-sm text-muted-foreground">{sub.event_name || "—"}</p>
											<p class="text-xs text-muted-foreground">{formatDate(sub.submitted_at)}</p>
										</div>
										<Button
											variant="outline"
											size="sm"
											class="h-7 text-xs"
											onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
										>
											PDF
										</Button>
									</div>
								</CardContent>
							</Card>
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
									<tr class="border-b">
										<td class="px-4 py-3">{sub.event_name || "—"}</td>
										<td class="px-4 py-3">{sub.participant_name || "—"}</td>
										<td class="px-4 py-3">{formatDate(sub.submitted_at)}</td>
										<td class="px-4 py-3">
											<Button
												variant="outline"
												size="sm"
												class="h-7 text-xs"
												onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
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
			</section>
		{/if}
	{/if}
</div>

<PdfModal bind:open={pdfModalOpen} url={pdfModalUrl} name={pdfModalName} loading={pdfLoading} onclose={closePdfModal} />
