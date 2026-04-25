<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { inferProgramFromOrgs } from "$lib/utils/organizations";
	import { parseOrgs, isPastEvent } from "$lib/utils/events";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import JSZip from "jszip";
	import { saveAs } from "file-saver";
	import QRCode from "qrcode";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import { createShareLink } from "$lib/utils/eventShare";
	import { generatePdfForSubmission } from "$lib/services/pdfHelper";
	import { PageHeader, PageContainer } from "$lib/components/molecules";
	import { SubmissionListView } from "$lib/components/organisms";
	import { useDeleteConfirm, usePdfPreview, useAttachmentPreview, useAuthRequired } from "$lib/components/composables";
	import EventDetailsCard from "./_components/EventDetailsCard.svelte";
	import EventQrModal from "./_components/EventQrModal.svelte";
	import EventAttachmentPreviewModal from "./_components/EventAttachmentPreviewModal.svelte";

	let { data } = $props();

	let event: any = $state(null);
	let submissions: any[] = $state([]);
	let attachments: any[] = $state([]);
	let copySuccess = $state(false);
	let downloading = $state(false);
	let toggling = $state(false);
	let deleting = $state<string | null>(null);

	const del = useDeleteConfirm<string>();
	const pdf = usePdfPreview();
	const repo = getRepository();
	const attachPreview = useAttachmentPreview({
		getUrl: (att) => repo.attachments.getUrl(data.eventId, att.id),
	});
	const auth = useAuthRequired({
		onReady: async () => {
			const [eventData, subData, attData] = await Promise.all([
				repo.events.getById(data.eventId),
				repo.events.getSubmissions(data.eventId),
				repo.attachments.list(data.eventId),
			]);
			event = eventData;
			submissions = subData;
			attachments = attData;
		},
	});

	// Toggle active modal state
	let toggleModalOpen = $state(false);

	// QR code modal state
	let qrModalOpen = $state(false);
	let qrDataUrl = $state('');

	async function showQrCode() {
		const url = getFormUrl();
		try {
			qrDataUrl = await QRCode.toDataURL(url, {
				width: 600,
				margin: 2,
				color: { dark: '#000000', light: '#ffffff' },
			});
			qrModalOpen = true;
		} catch {
			toastError('Failed to generate QR code');
		}
	}

	async function toggleActive() {
		if (!event) return;
		toggling = true;
		try {
			await repo.events.update(data.eventId, { is_active: !event.is_active });
			event = { ...event, is_active: !event.is_active };
			toastSuccess(event.is_active ? "Activity activated." : "Activity deactivated.");
		} catch (err: any) {
			console.error("Failed to toggle event:", err);
			toastError(err?.message || "Failed to update activity status");
		} finally {
			toggling = false;
			toggleModalOpen = false;
		}
	}

	async function copyUrl() {
		const url = getFormUrl();
		try {
			await navigator.clipboard.writeText(url);
			copySuccess = true;
			setTimeout(() => (copySuccess = false), 2000);
			toastSuccess("URL copied to clipboard.");
		} catch {
			// Fallback
		}
	}

	function confirmDeleteSubmission() {
		const id = del.targetId;
		if (!id) return;
		deleting = id;
		return del.run(async (targetId) => {
			try {
				await repo.submissions.delete(targetId);
				submissions = submissions.filter((s) => s.id !== targetId);
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

	function getFormUrl() {
		return `${typeof window !== 'undefined' ? window.location.origin : ''}/form/${data.eventId}`;
	}

	async function shareEvent() {
		if (!event) return;
		const shareUrl = createShareLink(event);

		// Use Web Share API on mobile if available
		if (navigator.share) {
			try {
				await navigator.share({
					title: event.event_name,
					text: `${event.event_name} — ${event.event_dates}`,
					url: shareUrl,
				});
				return;
			} catch {
				// User cancelled or API not available — fall through to clipboard
			}
		}

		// Fallback: copy to clipboard
		try {
			await navigator.clipboard.writeText(shareUrl);
			toastSuccess('Share link copied to clipboard.');
		} catch {
			toastError('Failed to copy share link.');
		}
	}


	function downloadAttachment(att: any) {
		const a = document.createElement('a');
		a.href = repo.attachments.getUrl(data.eventId, att.id);
		a.download = att.original_name;
		a.click();
	}

</script>

<svelte:head>
	<title>{event?.event_name || "Activity Dashboard"}</title>
</svelte:head>

<PageContainer>
	{#if !auth.ready}
		<LoadingState />
	{:else if !event}
		<p class="text-center text-destructive">Activity not found.</p>
	{:else}
		{#snippet eventTitleSuffix()}
			{#if isPastEvent(event)}
				<Badge variant="past">Past</Badge>
			{/if}
		{/snippet}
		{#snippet eventActions()}
			<Button variant="outline" onclick={() => goto("/dashboard")}>Back</Button>
			<Button variant="outline" onclick={() => goto(`/event/${data.eventId}/edit`)}>Edit</Button>
			<Button
				variant={event.is_active ? "destructive" : "default"}
				onclick={() => toggleModalOpen = true}
				disabled={toggling}
			>
				{toggling ? "..." : event.is_active ? "Deactivate" : "Activate"}
			</Button>
		{/snippet}
		<PageHeader
			title={event.event_name}
			subtitle={event.event_dates}
			titleSuffix={eventTitleSuffix}
			actions={eventActions}
		/>

		<EventDetailsCard
			{event}
			{attachments}
			formUrl={getFormUrl()}
			{copySuccess}
			onCopyUrl={copyUrl}
			onShowQr={showQrCode}
			onShareEvent={shareEvent}
			onAttachmentPreview={attachPreview.open}
			onAttachmentDownload={downloadAttachment}
		/>

		<!-- Submissions -->
		<Card>
			<CardHeader>
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle>Submissions ({submissions.length})</CardTitle>
					<div class="flex gap-2">
						<Button variant="outline" onclick={() => goto(`/event/${data.eventId}/submissions`)}>
							View All Submissions
						</Button>
						{#if submissions.length > 0}
							<Button variant="outline" onclick={downloadAllZip} disabled={downloading}>
								{downloading ? "Creating ZIP..." : "Download All as ZIP"}
							</Button>
						{/if}
					</div>
				</div>
			</CardHeader>
			<CardContent>
				<SubmissionListView
					{submissions}
					getProgram={() => inferProgramFromOrgs(parseOrgs(event))}
					getEditUrl={(sub) => `/form/${data.eventId}/edit/${sub.id}`}
					onPdfPreview={(sub) => pdf.open(sub.id, sub.participant_name || 'submission')}
					onDeleteAsk={(sub) => del.ask(sub.id, sub.participant_name ?? '')}
					{deleting}
					emptyMessage="No submissions yet."
					emptyDescription="Share the form URL with parents to get started."
				/>
			</CardContent>
		</Card>
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

{#if event}
<ConfirmModal
	bind:open={toggleModalOpen}
	title={event.is_active ? "Deactivate Activity" : "Activate Activity"}
	message={event.is_active ? "Are you sure you want to deactivate this activity? The form will no longer accept new submissions." : "Are you sure you want to activate this activity? The form will start accepting submissions."}
	confirmLabel={event.is_active ? "Deactivate" : "Activate"}
	confirmVariant={event.is_active ? "destructive" : "default"}
	onConfirm={toggleActive}
	loading={toggling}
/>
{/if}

<EventQrModal
	bind:open={qrModalOpen}
	eventName={event?.event_name ?? ""}
	formUrl={getFormUrl()}
	{qrDataUrl}
/>

<EventAttachmentPreviewModal
	bind:open={attachPreview.isOpen}
	name={attachPreview.name}
	url={attachPreview.url}
	mimeType={attachPreview.mimeType}
	loading={attachPreview.loading}
	onclose={attachPreview.close}
/>
