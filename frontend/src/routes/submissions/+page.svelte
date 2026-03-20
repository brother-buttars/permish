<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { formatDate } from "$lib/utils/formatDate";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";

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
					promises.push(api.getAllSubmissions());
				}
				promises.push(api.getMySubmissions());

				const results = await Promise.all(promises);

				if (isPlanner) {
					allSubmissions = results[0].submissions || [];
					mySubmissions = results[1].submissions || results[1] || [];

					// Extract unique events
					const eventMap = new Map<string, string>();
					allSubmissions.forEach(s => {
						if (s.event_id && s.event_name) {
							eventMap.set(s.event_id, s.event_name);
						}
					});
					uniqueEvents = Array.from(eventMap, ([id, name]) => ({ id, name }));
				} else {
					mySubmissions = results[0].submissions || results[0] || [];
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
			await api.deleteSubmission(deleteTargetId);
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
			const res = await fetch(api.getPdfUrl(submissionId), { credentials: 'include' });
			const blob = await res.blob();
			pdfModalUrl = URL.createObjectURL(blob);
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

	function printPdf() {
		const iframe = document.getElementById('pdf-preview-iframe') as HTMLIFrameElement;
		if (iframe?.contentWindow) {
			iframe.contentWindow.print();
		}
	}

	function downloadPdf() {
		if (!pdfModalUrl) return;
		const a = document.createElement('a');
		a.href = pdfModalUrl;
		a.download = `permission-form-${pdfModalName.replace(/\s+/g, '-').toLowerCase()}.pdf`;
		a.click();
	}
</script>

<svelte:head><title>Submissions</title></svelte:head>

<div class="container mx-auto max-w-5xl px-4 py-8">
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
					<select
						class="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
						bind:value={eventFilter}
					>
						<option value="">All Events</option>
						{#each uniqueEvents as ev}
							<option value={ev.id}>{ev.name}</option>
						{/each}
					</select>
				{/if}
			</div>
		</CardContent>
	</Card>

	<!-- Content -->
	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
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
			<Card>
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
										<td class="px-4 py-3">{sub.participant_name || "\u2014"}</td>
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
													variant="outline"
													size="sm"
													class="h-7 text-xs text-destructive hover:bg-destructive hover:text-destructive-foreground"
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
			<Card>
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
										<td class="px-4 py-3">{sub.participant_name || "\u2014"}</td>
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

{#if pdfModalOpen}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" onclick={closePdfModal}>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="mx-6 my-6 flex h-[calc(100vh-3rem)] w-full flex-col rounded-lg bg-card shadow-xl" role="document" onclick={(e) => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h3 class="font-semibold">{pdfModalName} — Permission Form</h3>
			<div class="flex gap-2">
				<Button variant="outline" size="sm" onclick={printPdf}>Print</Button>
				<Button variant="outline" size="sm" onclick={downloadPdf}>Download</Button>
				<Button variant="ghost" size="sm" onclick={closePdfModal}>Close</Button>
			</div>
		</div>
		<div class="flex-1 overflow-hidden">
			{#if pdfLoading}
				<div class="flex h-full items-center justify-center">
					<p class="text-muted-foreground">Loading PDF...</p>
				</div>
			{:else}
				<iframe
					id="pdf-preview-iframe"
					src={pdfModalUrl}
					class="h-full w-full"
					title="PDF Preview"
				></iframe>
			{/if}
		</div>
	</div>
</div>
{/if}

<ConfirmModal
	bind:open={deleteModalOpen}
	title="Delete Submission"
	message='Delete the submission for "{deleteTargetName}"? This cannot be undone.'
	confirmLabel="Delete"
	confirmVariant="destructive"
	onConfirm={confirmDeleteSubmission}
	loading={deleteLoading}
/>
