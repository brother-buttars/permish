<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from "$lib/components/composables";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { formatDate } from "$lib/utils/formatDate";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import JSZip from "jszip";
	import { saveAs } from "file-saver";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import { inferProgramFromOrgs } from "$lib/utils/organizations";
	import { Select } from "$lib/components/ui/select";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { getSubmissionPdfUrl, generatePdfForSubmission } from "$lib/services/pdfHelper";
	import { PageContainer } from "$lib/components/molecules";

	let { data } = $props();

	let event: any = $state(null);
	let submissions: any[] = $state([]);
	let downloading = $state(false);
	let deleting = $state<string | null>(null);

	// Search and sort
	let searchQuery = $state('');
	let sortOption = $state('date-newest');

	// Delete submission modal state
	let deleteModalOpen = $state(false);
	let deleteTargetId = $state('');
	let deleteTargetName = $state('');
	let deleteLoading = $state(false);

	// PDF preview modal state
	let pdfModalOpen = $state(false);
	let pdfModalUrl = $state('');
	let pdfModalName = $state('');
	let pdfLoading = $state(false);

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async () => {
			await loadData();
		},
	});

	let filteredSubmissions = $derived.by(() => {
		let result = submissions;

		// Filter by search query
		if (searchQuery.trim()) {
			const q = searchQuery.trim().toLowerCase();
			result = result.filter(
				(s) =>
					(s.participant_name || '').toLowerCase().includes(q) ||
					(s.emergency_contact || '').toLowerCase().includes(q)
			);
		}

		// Sort
		result = [...result].sort((a, b) => {
			switch (sortOption) {
				case 'name-az':
					return (a.participant_name || '').localeCompare(b.participant_name || '');
				case 'name-za':
					return (b.participant_name || '').localeCompare(a.participant_name || '');
				case 'date-oldest':
					return new Date(a.submitted_at).getTime() - new Date(b.submitted_at).getTime();
				case 'date-newest':
				default:
					return new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime();
			}
		});

		return result;
	});

	async function loadData() {
		try {
			const [eventData, subData] = await Promise.all([
				repo.events.getById(data.eventId),
				repo.events.getSubmissions(data.eventId),
			]);
			event = eventData;
			submissions = subData;
		} catch (err: any) {
			console.error("Failed to load event:", err);
			toastError(err?.message || "Failed to load event");
		}
	}

	async function confirmDeleteSubmission() {
		deleteLoading = true;
		deleting = deleteTargetId;
		try {
			await repo.submissions.delete(deleteTargetId);
			submissions = submissions.filter((s) => s.id !== deleteTargetId);
			deleteModalOpen = false;
			toastSuccess("Submission deleted.");
		} catch (err: any) {
			toastError(err.message || "Failed to delete submission");
		} finally {
			deleting = null;
			deleteLoading = false;
		}
	}

	async function downloadAllZip() {
		if (submissions.length === 0) return;
		downloading = true;
		try {
			const zip = new JSZip();

			await Promise.all(
				submissions.map(async (sub, i) => {
					const pdfUrl = await generatePdfForSubmission(sub.id);
					const res = await fetch(pdfUrl);
					const blob = await res.blob();
					URL.revokeObjectURL(pdfUrl);
					const name = sub.participant_name
						? `${sub.participant_name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
						: `submission_${i + 1}.pdf`;
					zip.file(name, blob);
				})
			);

			const content = await zip.generateAsync({ type: "blob" });
			const eventName = (event?.event_name || "event").replace(/[^a-zA-Z0-9]/g, "_");
			saveAs(content, `${eventName}_submissions.zip`);
		} catch (err: any) {
			console.error("Failed to create ZIP:", err);
			toastError(err?.message || "Failed to create ZIP download");
		} finally {
			downloading = false;
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

<svelte:head>
	<title>Submissions — {event?.event_name || "Activity"}</title>
</svelte:head>

<PageContainer>
	{#if !auth.ready}
		<LoadingState />
	{:else if !event}
		<p class="text-center text-destructive">Activity not found.</p>
	{:else}
		<!-- Header -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="text-3xl font-bold">{event.event_name}</h1>
				<p class="text-muted-foreground">
					{submissions.length} submission{submissions.length === 1 ? '' : 's'}
				</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => goto(`/event/${data.eventId}`)}>Back to Activity</Button>
				{#if submissions.length > 0}
					<Button variant="outline" onclick={downloadAllZip} disabled={downloading}>
						{downloading ? "Creating ZIP..." : "Download All as ZIP"}
					</Button>
				{/if}
			</div>
		</div>

		<!-- Filters Bar -->
		<Card class="mb-6">
			<CardContent class="flex flex-col gap-4 py-4 sm:flex-row sm:items-center">
				<div class="flex-1">
					<input
						type="text"
						placeholder="Search by participant or emergency contact..."
						bind:value={searchQuery}
						class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					/>
				</div>
				<div>
					<Select bind:value={sortOption}>
						<option value="date-newest">Date (newest)</option>
						<option value="date-oldest">Date (oldest)</option>
						<option value="name-az">Name (A-Z)</option>
						<option value="name-za">Name (Z-A)</option>
					</Select>
				</div>
			</CardContent>
		</Card>

		<!-- Results info -->
		{#if searchQuery.trim() && filteredSubmissions.length !== submissions.length}
			<p class="mb-4 text-sm text-muted-foreground">
				Showing {filteredSubmissions.length} of {submissions.length} submissions
			</p>
		{/if}

		<!-- Table -->
		{#if filteredSubmissions.length === 0}
			<Card>
				<CardContent class="py-8 text-center">
					{#if submissions.length === 0}
						<p class="text-muted-foreground">No submissions yet.</p>
					{:else}
						<p class="text-muted-foreground">No submissions match your search.</p>
					{/if}
				</CardContent>
			</Card>
		{:else}
			<!-- Mobile card view -->
			<div class="space-y-3 sm:hidden">
				{#each filteredSubmissions as sub}
					<Card>
						<CardContent class="py-3 px-4">
							<div class="flex items-center justify-between gap-2">
								<div class="min-w-0 flex-1">
									<div class="flex items-center gap-2">
										<YouthIcon size="sm" program={inferProgramFromOrgs((() => { try { const o = event?.organizations; return typeof o === 'string' ? JSON.parse(o) : (o || []); } catch { return []; } })())} />
										<p class="font-medium">{sub.participant_name || "\u2014"}</p>
									</div>
									<p class="text-sm text-muted-foreground">{sub.emergency_contact || "\u2014"} {sub.emergency_phone_primary ? `\u00b7 ${sub.emergency_phone_primary}` : ""}</p>
									<p class="text-xs text-muted-foreground">{sub.participant_age ? `Age ${sub.participant_age} \u00b7 ` : ""}{formatDate(sub.submitted_at) || "\u2014"}</p>
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
										onclick={() => goto(`/form/${data.eventId}/edit/${sub.id}`)}
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
			<div class="hidden sm:block overflow-x-auto rounded-lg border">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b bg-muted/50">
							<th class="px-4 py-3 text-left font-medium">Participant Name</th>
							<th class="px-4 py-3 text-left font-medium">Age</th>
							<th class="px-4 py-3 text-left font-medium">Emergency Contact</th>
							<th class="px-4 py-3 text-left font-medium">Emergency Phone</th>
							<th class="px-4 py-3 text-left font-medium">Submitted</th>
							<th class="px-4 py-3 text-left font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredSubmissions as sub}
							<tr class="border-b">
								<td class="px-4 py-3">
									<div class="flex items-center gap-2">
										<YouthIcon size="sm" program={inferProgramFromOrgs((() => { try { const o = event?.organizations; return typeof o === 'string' ? JSON.parse(o) : (o || []); } catch { return []; } })())} />
										{sub.participant_name || "\u2014"}
									</div>
								</td>
								<td class="px-4 py-3">{sub.participant_age || "\u2014"}</td>
								<td class="px-4 py-3">{sub.emergency_contact || "\u2014"}</td>
								<td class="px-4 py-3">{sub.emergency_phone_primary || "\u2014"}</td>
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
											onclick={() => goto(`/form/${data.eventId}/edit/${sub.id}`)}
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
		{/if}
	{/if}
</PageContainer>

<PdfModal bind:open={pdfModalOpen} url={pdfModalUrl} name={pdfModalName} loading={pdfLoading} onclose={closePdfModal} />

<ConfirmModal
	bind:open={deleteModalOpen}
	title="Delete Submission"
	message="Delete the submission for &quot;{deleteTargetName}&quot;? This cannot be undone."
	confirmLabel="Delete"
	confirmVariant="destructive"
	onConfirm={confirmDeleteSubmission}
	loading={deleteLoading}
/>
