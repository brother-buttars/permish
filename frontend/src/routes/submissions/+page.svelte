<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { formatDate } from "$lib/utils/formatDate";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import { inferProgramFromOrgs } from "$lib/utils/organizations";
	import { Select } from "$lib/components/ui/select";
	import { getSubmissionPdfUrl } from "$lib/services/pdfHelper";
	import LoadingState from "$lib/components/LoadingState.svelte";

	function parseSubOrgs(sub: any): string[] {
		if (!sub.organizations) return [];
		try { return typeof sub.organizations === 'string' ? JSON.parse(sub.organizations) : sub.organizations; } catch { return []; }
	}

	let view = $state<'planner' | 'parent'>('planner');
	let allSubmissions: any[] = $state([]);
	let mySubmissions: any[] = $state([]);
	let search = $state('');
	let eventFilter = $state('');
	let loading = $state(true);

	let currentUser: any = $state(null);
	let isPlanner = $state(false);

	// Unique events for filter dropdown
	let uniqueEvents: { id: string; name: string }[] = $state([]);

	// Delete modal state
	let deleteModalOpen = $state(false);
	let deleteTargetId = $state('');
	let deleteTargetName = $state('');
	let deleteLoading = $state(false);
	let deleting = $state<string | null>(null);

	// PDF preview modal state
	let pdfModalOpen = $state(false);
	let pdfModalUrl = $state('');
	let pdfModalName = $state('');
	let pdfLoading = $state(false);

	const repo = getRepository();
	const unsub = user.subscribe(u => { currentUser = u; });

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser) {
				goto('/login');
				return;
			}
			isPlanner = currentUser.role === 'planner';
			view = isPlanner ? 'planner' : 'parent';

			try {
				const promises: Promise<any>[] = [];
				if (isPlanner) {
					promises.push(repo.events.getAllSubmissions());
				}
				promises.push(repo.submissions.getMine());

				const results = await Promise.all(promises);

				if (isPlanner) {
					allSubmissions = results[0];
					mySubmissions = results[1];

					// Extract unique events
					const eventMap = new Map<string, string>();
					allSubmissions.forEach(s => {
						if (s.event_id && s.event_name) {
							eventMap.set(s.event_id, s.event_name);
						}
					});
					uniqueEvents = Array.from(eventMap, ([id, name]) => ({ id, name }));
				} else {
					mySubmissions = results[0];
				}
			} catch (err) {
				console.error('Failed to load submissions:', err);
			} finally {
				loading = false;
			}
		});

		return () => { unsubLoading(); unsub(); };
	});

	let filteredPlannerSubmissions = $derived.by(() => {
		return allSubmissions.filter(sub => {
			if (eventFilter && sub.event_id !== eventFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				const nameMatch = sub.participant_name?.toLowerCase().includes(q);
				const contactMatch = sub.emergency_contact?.toLowerCase().includes(q);
				if (!nameMatch && !contactMatch) return false;
			}
			return true;
		});
	});

	let filteredParentSubmissions = $derived.by(() => {
		return mySubmissions.filter(sub => {
			if (search) {
				const q = search.toLowerCase();
				const nameMatch = sub.participant_name?.toLowerCase().includes(q);
				const eventMatch = sub.event_name?.toLowerCase().includes(q);
				if (!nameMatch && !eventMatch) return false;
			}
			return true;
		});
	});

	async function confirmDeleteSubmission() {
		deleteLoading = true;
		deleting = deleteTargetId;
		try {
			await repo.submissions.delete(deleteTargetId);
			allSubmissions = allSubmissions.filter(s => s.id !== deleteTargetId);
			mySubmissions = mySubmissions.filter(s => s.id !== deleteTargetId);
			deleteModalOpen = false;
			toastSuccess("Submission deleted.");
		} catch (err: any) {
			toastError(err.message || "Failed to delete submission");
		} finally {
			deleting = null;
			deleteLoading = false;
		}
	}

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

<svelte:head><title>Submissions</title></svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<div class="mb-6">
		<h1 class="text-3xl font-bold">Submissions</h1>
	</div>

	<!-- View Toggle (planner only) -->
	{#if isPlanner}
		<div class="mb-6 flex gap-1 rounded-lg border border-input bg-muted p-1 max-w-xs">
			<Button
				variant={view === 'planner' ? 'default' : 'outline'}
				size="sm"
				class="flex-1 {view !== 'planner' ? 'bg-transparent text-foreground/50 border-transparent shadow-none hover:bg-background hover:text-foreground hover:border-border hover:shadow-sm' : ''}"
				onclick={() => view = 'planner'}
			>
				Event Manager
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

	<!-- Filters -->
	<Card class="mb-6">
		<CardContent class="space-y-4 pt-6">
			<div class="flex flex-col gap-4 sm:flex-row">
				<div class="flex-1">
					<Input type="text" placeholder="Search by participant or contact..." bind:value={search} />
				</div>
				{#if view === 'planner' && uniqueEvents.length > 0}
					<Select bind:value={eventFilter}>
						<option value="">All Events</option>
						{#each uniqueEvents as ev}
							<option value={ev.id}>{ev.name}</option>
						{/each}
					</Select>
				{/if}
			</div>
		</CardContent>
	</Card>

	<!-- Content -->
	{#if loading}
		<LoadingState />
	{:else if view === 'planner'}
		<!-- Planner View -->
		{#if filteredPlannerSubmissions.length === 0}
			<Card>
				<CardContent class="py-12 text-center">
					<p class="text-muted-foreground">No submissions found.</p>
				</CardContent>
			</Card>
		{:else}
			<p class="mb-3 text-sm text-muted-foreground">{filteredPlannerSubmissions.length} submission{filteredPlannerSubmissions.length === 1 ? '' : 's'}</p>
			<!-- Mobile card view -->
			<div class="space-y-3 sm:hidden">
				{#each filteredPlannerSubmissions as sub}
					<Card>
						<CardContent class="py-3 px-4">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<YouthIcon size="sm" program={inferProgramFromOrgs(parseSubOrgs(sub))} />
										<p class="font-medium">{sub.participant_name || "\u2014"}</p>
									</div>
									<p class="text-sm text-muted-foreground">{sub.event_name || "\u2014"}</p>
									<p class="text-xs text-muted-foreground">{sub.emergency_contact ? `${sub.emergency_contact} \u00b7 ` : ""}{formatDate(sub.submitted_at) || "\u2014"}</p>
								</div>
								<div class="flex gap-1">
									<Button
										variant="outline"
										size="sm"
										class="h-7 text-xs"
										onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
									>
										PDF
									</Button>
									<Button
										variant="outline"
										size="sm"
										class="h-7 text-xs"
										onclick={() => goto(`/form/${sub.event_id}/edit/${sub.id}`)}
									>
										Edit
									</Button>
									<Button
										variant="destructive"
										size="sm"
										class="h-7 text-xs"
										onclick={() => { deleteModalOpen = true; deleteTargetId = sub.id; deleteTargetName = sub.participant_name; }}
										disabled={deleting === sub.id}
									>
										{deleting === sub.id ? "..." : "Delete"}
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
			<!-- Desktop table view -->
			<Card class="hidden sm:block">
				<CardContent class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b">
									<th class="px-4 py-3 text-left font-medium">Participant</th>
									<th class="px-4 py-3 text-left font-medium">Event</th>
									<th class="px-4 py-3 text-left font-medium">Emergency Contact</th>
									<th class="px-4 py-3 text-left font-medium">Submitted</th>
									<th class="px-4 py-3 text-left font-medium">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredPlannerSubmissions as sub}
									<tr class="border-b">
										<td class="px-4 py-3">
											<div class="flex items-center gap-2">
												<YouthIcon size="sm" program={inferProgramFromOrgs(parseSubOrgs(sub))} />
												{sub.participant_name || "\u2014"}
											</div>
										</td>
										<td class="px-4 py-3">{sub.event_name || "\u2014"}</td>
										<td class="px-4 py-3">{sub.emergency_contact || "\u2014"}</td>
										<td class="px-4 py-3">{formatDate(sub.submitted_at) || "\u2014"}</td>
										<td class="px-4 py-3">
											<div class="flex gap-1">
												<Button
													variant="outline"
													size="sm"
													class="h-7 text-xs"
													onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
												>
													PDF
												</Button>
												<Button
													variant="outline"
													size="sm"
													class="h-7 text-xs"
													onclick={() => goto(`/form/${sub.event_id}/edit/${sub.id}`)}
												>
													Edit
												</Button>
												<Button
													variant="destructive"
													size="sm"
													class="h-7 text-xs"
													onclick={() => { deleteModalOpen = true; deleteTargetId = sub.id; deleteTargetName = sub.participant_name; }}
													disabled={deleting === sub.id}
												>
													{deleting === sub.id ? "..." : "Delete"}
												</Button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		{/if}
	{:else}
		<!-- Parent View -->
		{#if filteredParentSubmissions.length === 0}
			<Card>
				<CardContent class="py-12 text-center">
					<p class="text-muted-foreground">No submissions found.</p>
				</CardContent>
			</Card>
		{:else}
			<p class="mb-3 text-sm text-muted-foreground">{filteredParentSubmissions.length} submission{filteredParentSubmissions.length === 1 ? '' : 's'}</p>
			<!-- Mobile card view -->
			<div class="space-y-3 sm:hidden">
				{#each filteredParentSubmissions as sub}
					<Card>
						<CardContent class="py-3 px-4">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<YouthIcon size="sm" program={inferProgramFromOrgs(parseSubOrgs(sub))} />
										<p class="font-medium">{sub.participant_name || "\u2014"}</p>
									</div>
									<p class="text-sm text-muted-foreground">{sub.event_name || "\u2014"}</p>
									<p class="text-xs text-muted-foreground">{formatDate(sub.submitted_at) || "\u2014"}</p>
								</div>
								<div class="flex gap-1">
									<Button
										variant="outline"
										size="sm"
										class="h-7 text-xs"
										onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
									>
										PDF
									</Button>
									<Button
										variant="outline"
										size="sm"
										class="h-7 text-xs"
										onclick={() => goto(`/form/${sub.event_id}/edit/${sub.id}`)}
									>
										Edit
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				{/each}
			</div>
			<!-- Desktop table view -->
			<Card class="hidden sm:block">
				<CardContent class="p-0">
					<div class="overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b">
									<th class="px-4 py-3 text-left font-medium">Event</th>
									<th class="px-4 py-3 text-left font-medium">Participant</th>
									<th class="px-4 py-3 text-left font-medium">Submitted</th>
									<th class="px-4 py-3 text-left font-medium">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each filteredParentSubmissions as sub}
									<tr class="border-b">
										<td class="px-4 py-3">{sub.event_name || "\u2014"}</td>
										<td class="px-4 py-3">
											<div class="flex items-center gap-2">
												<YouthIcon size="sm" program={inferProgramFromOrgs(parseSubOrgs(sub))} />
												{sub.participant_name || "\u2014"}
											</div>
										</td>
										<td class="px-4 py-3">{formatDate(sub.submitted_at) || "\u2014"}</td>
										<td class="px-4 py-3">
											<div class="flex gap-1">
												<Button
													variant="outline"
													size="sm"
													class="h-7 text-xs"
													onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
												>
													PDF
												</Button>
												<Button
													variant="outline"
													size="sm"
													class="h-7 text-xs"
													onclick={() => goto(`/form/${sub.event_id}/edit/${sub.id}`)}
												>
													Edit
												</Button>
											</div>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>

<PdfModal bind:open={pdfModalOpen} url={pdfModalUrl} name={pdfModalName} loading={pdfLoading} onclose={closePdfModal} />

<ConfirmModal
	bind:open={deleteModalOpen}
	title="Delete Submission"
	message='Delete the submission for "{deleteTargetName}"? This cannot be undone.'
	confirmLabel="Delete"
	confirmVariant="destructive"
	onConfirm={confirmDeleteSubmission}
	loading={deleteLoading}
/>
