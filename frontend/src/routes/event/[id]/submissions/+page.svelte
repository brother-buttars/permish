<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { useAuthRequired, useDeleteConfirm, usePdfPreview } from "$lib/components/composables";
	import { Button } from "$lib/components/ui/button";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import JSZip from "jszip";
	import { saveAs } from "file-saver";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import { inferProgramFromOrgs } from "$lib/utils/organizations";
	import { parseOrgs } from "$lib/utils/events";
	import { Select } from "$lib/components/ui/select";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { generatePdfForSubmission } from "$lib/services/pdfHelper";
	import { PageContainer, PageHeader, FilterPanel } from "$lib/components/molecules";
	import { SubmissionListView } from "$lib/components/organisms";

	let { data } = $props();

	let event: any = $state(null);
	let submissions: any[] = $state([]);
	let downloading = $state(false);
	let deleting = $state<string | null>(null);

	// Search and sort
	let searchQuery = $state('');
	let sortOption = $state('date-newest');

	const del = useDeleteConfirm<string>();
	const pdf = usePdfPreview();

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async () => {
			await loadData();
		},
	});

	const eventProgram = $derived(inferProgramFromOrgs(parseOrgs(event)));

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
		await del.run(async (id) => {
			deleting = id;
			try {
				await repo.submissions.delete(id);
				submissions = submissions.filter((s) => s.id !== id);
				toastSuccess("Submission deleted.");
			} catch (err: any) {
				toastError(err.message || "Failed to delete submission");
			} finally {
				deleting = null;
			}
		});
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

</script>

<svelte:head>
	<title>Submissions — {event?.event_name || "Activity"}</title>
</svelte:head>

{#snippet headerActions()}
	<Button variant="outline" onclick={() => goto(`/event/${data.eventId}`)}>Back to Activity</Button>
	{#if submissions.length > 0}
		<Button variant="outline" onclick={downloadAllZip} disabled={downloading}>
			{downloading ? "Creating ZIP..." : "Download All as ZIP"}
		</Button>
	{/if}
{/snippet}

<PageContainer>
	{#if !auth.ready}
		<LoadingState />
	{:else if auth.error}
		<EmptyState message="Something went wrong loading submissions." description={auth.error} actionLabel="Retry" onAction={auth.retry} />
	{:else if !event}
		<EmptyState message="Activity not found." />
	{:else}
		<PageHeader
			title={event.event_name}
			subtitle="{submissions.length} submission{submissions.length === 1 ? '' : 's'}"
			actions={headerActions}
		/>

		<FilterPanel bind:search={searchQuery} searchPlaceholder="Search by participant or emergency contact...">
			<Select bind:value={sortOption} class="sm:max-w-xs">
				<option value="date-newest">Date (newest)</option>
				<option value="date-oldest">Date (oldest)</option>
				<option value="name-az">Name (A-Z)</option>
				<option value="name-za">Name (Z-A)</option>
			</Select>
		</FilterPanel>

		{#if searchQuery.trim() && filteredSubmissions.length !== submissions.length}
			<p class="mb-4 text-sm text-muted-foreground">
				Showing {filteredSubmissions.length} of {submissions.length} submissions
			</p>
		{/if}

		<SubmissionListView
			submissions={filteredSubmissions}
			showAge={true}
			showEmergencyPhone={true}
			getProgram={() => eventProgram}
			getEditUrl={(sub) => `/form/${data.eventId}/edit/${sub.id}`}
			onPdfPreview={(sub) => pdf.open(sub.id, sub.participant_name || 'submission')}
			onDeleteAsk={(sub) => del.ask(sub.id, sub.participant_name ?? '')}
			{deleting}
			emptyMessage={submissions.length === 0 ? "No submissions yet." : "No submissions match your search."}
		/>
	{/if}
</PageContainer>

<PdfModal bind:open={pdf.isOpen} url={pdf.url} name={pdf.name} loading={pdf.loading} onclose={pdf.close} />

<ConfirmModal
	bind:open={del.open}
	title="Delete Submission"
	message="Delete the submission for &quot;{del.targetName}&quot;? This cannot be undone."
	confirmLabel="Delete"
	confirmVariant="destructive"
	onConfirm={confirmDeleteSubmission}
	loading={del.loading}
/>
