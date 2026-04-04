<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { formatDate } from "$lib/utils/formatDate";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { getOrgDisplayLabels, orgBadgeClass, inferProgramFromOrgs } from "$lib/utils/organizations";
	import { parseOrgs, isPastEvent } from "$lib/utils/events";
	import { formatFileSize } from "$lib/utils/format";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import JSZip from "jszip";
	import { saveAs } from "file-saver";
	import QRCode from "qrcode";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import { linkify } from "$lib/utils/linkify";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { Badge } from "$lib/components/ui/badge";

	let { data } = $props();

	let event: any = $state(null);
	let submissions: any[] = $state([]);
	let attachments: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);
	let copySuccess = $state(false);
	let downloading = $state(false);
	let toggling = $state(false);
	let deleting = $state<string | null>(null);

	// Delete submission modal state
	let deleteModalOpen = $state(false);
	let deleteTargetId = $state('');
	let deleteTargetName = $state('');
	let deleteLoading = $state(false);

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

	// PDF preview modal state
	let pdfModalOpen = $state(false);
	let pdfModalUrl = $state('');
	let pdfModalName = $state('');
	let pdfLoading = $state(false);

	// Attachment preview modal state
	let attachPreviewOpen = $state(false);
	let attachPreviewUrl = $state('');
	let attachPreviewName = $state('');
	let attachPreviewType = $state('');
	let attachPreviewLoading = $state(false);

	const unsubAuth = user.subscribe((u) => {
		currentUser = u;
	});

	const repo = getRepository();

	async function loadData() {
		try {
			const [eventData, subData, attData] = await Promise.all([
				repo.events.getById(data.eventId),
				repo.events.getSubmissions(data.eventId),
				repo.attachments.list(data.eventId),
			]);
			event = eventData;
			submissions = subData;
			attachments = attData;
		} catch (err) {
			console.error("Failed to load event:", err);
		} finally {
			loading = false;
		}
	}

	onMount(() => {
		const unsubLoading = authLoading.subscribe((isLoading) => {
			if (isLoading) return;
			if (!currentUser) {
				goto("/login");
				return;
			}
			loadData();
		});

		return () => {
			unsubLoading();
			unsubAuth();
		};
	});

	async function toggleActive() {
		if (!event) return;
		toggling = true;
		try {
			await repo.events.update(data.eventId, { is_active: !event.is_active });
			event = { ...event, is_active: !event.is_active };
			toastSuccess(event.is_active ? "Event activated." : "Event deactivated.");
		} catch (err) {
			console.error("Failed to toggle event:", err);
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
					const url = repo.submissions.getPdfUrl(sub.id);
					const res = await fetch(url, { credentials: "include" });
					const blob = await res.blob();
					const name = sub.participant_name
						? `${sub.participant_name.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`
						: `submission_${i + 1}.pdf`;
					zip.file(name, blob);
				})
			);

			const content = await zip.generateAsync({ type: "blob" });
			const eventName = (event?.event_name || "event").replace(/[^a-zA-Z0-9]/g, "_");
			saveAs(content, `${eventName}_submissions.zip`);
		} catch (err) {
			console.error("Failed to create ZIP:", err);
		} finally {
			downloading = false;
		}
	}

	function getFormUrl() {
		return `${typeof window !== 'undefined' ? window.location.origin : ''}/form/${data.eventId}`;
	}

	async function openPdfPreview(submissionId: string, participantName: string) {
		pdfModalName = participantName;
		pdfLoading = true;
		pdfModalOpen = true;
		try {
			const res = await fetch(repo.submissions.getPdfUrl(submissionId), { credentials: 'include' });
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

	function isPreviewable(mimeType: string): boolean {
		return mimeType === 'application/pdf' || mimeType.startsWith('image/');
	}

	async function openAttachmentPreview(att: any) {
		attachPreviewName = att.original_name;
		attachPreviewType = att.mime_type;
		attachPreviewLoading = true;
		attachPreviewOpen = true;
		try {
			const url = repo.attachments.getUrl(data.eventId, att.id);
			const res = await fetch(url, { credentials: 'include' });
			const blob = await res.blob();
			attachPreviewUrl = URL.createObjectURL(blob);
		} catch {
			toastError('Failed to load attachment');
			attachPreviewOpen = false;
		} finally {
			attachPreviewLoading = false;
		}
	}

	function closeAttachmentPreview() {
		attachPreviewOpen = false;
		if (attachPreviewUrl) {
			URL.revokeObjectURL(attachPreviewUrl);
			attachPreviewUrl = '';
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
	<title>{event?.event_name || "Event Dashboard"}</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<LoadingState />
	{:else if !event}
		<p class="text-center text-destructive">Event not found.</p>
	{:else}
		<!-- Header -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="flex items-center gap-2">
					<h1 class="text-3xl font-bold">{event.event_name}</h1>
					{#if isPastEvent(event)}
						<Badge variant="past">Past</Badge>
					{/if}
				</div>
				<p class="text-muted-foreground">{event.event_dates}</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => goto("/dashboard")}>Back</Button>
				<Button variant="outline" onclick={() => goto(`/event/${data.eventId}/edit`)}>Edit</Button>
				<Button
					variant={event.is_active ? "destructive" : "default"}
					onclick={() => toggleModalOpen = true}
					disabled={toggling}
				>
					{toggling ? "..." : event.is_active ? "Deactivate" : "Activate"}
				</Button>
			</div>
		</div>

		<!-- Event Details Card -->
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>Event Details</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if event.event_description}
					<p class="text-sm">{event.event_description}</p>
				{/if}
				<div class="grid gap-2 text-sm sm:grid-cols-2">
					{#if event.ward}
						<div><span class="font-medium">Ward:</span> {event.ward}</div>
					{/if}
					{#if event.stake}
						<div><span class="font-medium">Stake:</span> {event.stake}</div>
					{/if}
					{#if event.leader_name}
						<div><span class="font-medium">Leader:</span> {event.leader_name}</div>
					{/if}
					{#if event.leader_phone}
						<div><span class="font-medium">Phone:</span> {event.leader_phone}</div>
					{/if}
					{#if event.leader_email}
						<div><span class="font-medium">Email:</span> {event.leader_email}</div>
					{/if}
				</div>

				<!-- Organization badges -->
				{#if parseOrgs(event).length > 0}
					<div>
						<p class="mb-2 text-sm font-medium">Organizations</p>
						<div class="flex flex-wrap gap-1">
							{#each getOrgDisplayLabels(parseOrgs(event)) as label}
								<span class="rounded-full border px-2 py-0.5 text-xs font-medium {orgBadgeClass(label)}">{label}</span>
							{/each}
						</div>
					</div>
				{/if}

				{#if event.additional_details}
				<Separator />
				<div>
					<p class="mb-2 text-sm font-medium">Additional Details</p>
					<div class="text-sm leading-relaxed">{@html linkify(event.additional_details)}</div>
				</div>
			{/if}

			{#if attachments.length > 0}
				<Separator />
				<div>
					<p class="mb-2 text-sm font-medium">Attachments</p>
					<ul class="space-y-1">
						{#each attachments as att}
							<li class="flex items-center gap-2 text-sm">
								{#if att.mime_type === 'application/pdf'}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
								{:else if att.mime_type?.startsWith('image/')}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
								{:else}
									<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
								{/if}
								{#if isPreviewable(att.mime_type)}
									<button class="text-primary underline hover:no-underline" onclick={() => openAttachmentPreview(att)}>
										{att.original_name}
									</button>
								{:else}
									<button class="text-primary underline hover:no-underline" onclick={() => downloadAttachment(att)}>
										{att.original_name}
									</button>
								{/if}
								<span class="text-muted-foreground">({formatFileSize(att.size)})</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<Separator />

				<div>
					<p class="mb-2 text-sm font-medium">Shareable Form URL</p>
					<div class="flex flex-col gap-2 sm:flex-row">
						<input
							type="text"
							readonly
							value={getFormUrl()}
							class="flex h-10 flex-1 rounded-md border border-input bg-muted px-3 py-2 text-sm"
						/>
						<Button variant="outline" onclick={copyUrl}>
							{copySuccess ? "Copied!" : "Copy URL"}
						</Button>
						<a href={getFormUrl()} target="_blank" rel="noopener noreferrer">
							<Button variant="outline">Open Form</Button>
						</a>
						<Button variant="outline" onclick={showQrCode}>
							<svg xmlns="http://www.w3.org/2000/svg" class="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
								<rect x="3" y="3" width="7" height="7" />
								<rect x="14" y="3" width="7" height="7" />
								<rect x="3" y="14" width="7" height="7" />
								<rect x="14" y="14" width="3" height="3" />
								<rect x="18" y="14" width="3" height="3" />
								<rect x="14" y="18" width="3" height="3" />
								<rect x="18" y="18" width="3" height="3" />
							</svg>
							QR Code
						</Button>
					</div>
				</div>
			</CardContent>
		</Card>

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
				{#if submissions.length === 0}
					<div class="py-8 text-center">
						<p class="text-muted-foreground">No submissions yet. Share the form URL with parents to get started.</p>
					</div>
				{:else}
					<!-- Mobile card view -->
					<div class="space-y-3 sm:hidden">
						{#each submissions as sub}
							<Card>
								<CardContent class="py-3 px-4">
									<div class="flex items-center justify-between gap-2">
										<div class="min-w-0 flex-1">
											<div class="flex items-center gap-2">
												<YouthIcon size="sm" program={inferProgramFromOrgs(parseOrgs(event))} />
												<p class="font-medium">{sub.participant_name || "\u2014"}</p>
											</div>
											<p class="text-sm text-muted-foreground">{sub.emergency_contact || "\u2014"}</p>
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
					<div class="hidden sm:block overflow-x-auto">
						<table class="w-full text-sm">
							<thead>
								<tr class="border-b">
									<th class="px-4 py-3 text-left font-medium">Participant</th>
									<th class="px-4 py-3 text-left font-medium">Emergency Contact</th>
									<th class="px-4 py-3 text-left font-medium">Submitted</th>
									<th class="px-4 py-3 text-left font-medium">Actions</th>
								</tr>
							</thead>
							<tbody>
								{#each submissions as sub}
									<tr class="border-b">
										<td class="px-4 py-3">
											<div class="flex items-center gap-2">
												<YouthIcon size="sm" program={inferProgramFromOrgs(parseOrgs(event))} />
												{sub.participant_name || "\u2014"}
											</div>
										</td>
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
			</CardContent>
		</Card>
	{/if}
</div>

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

{#if event}
<ConfirmModal
	bind:open={toggleModalOpen}
	title={event.is_active ? "Deactivate Event" : "Activate Event"}
	message={event.is_active ? "Are you sure you want to deactivate this event? The form will no longer accept new submissions." : "Are you sure you want to activate this event? The form will start accepting submissions."}
	confirmLabel={event.is_active ? "Deactivate" : "Activate"}
	confirmVariant={event.is_active ? "destructive" : "default"}
	onConfirm={toggleActive}
	loading={toggling}
/>
{/if}

{#if qrModalOpen}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
	<div class="absolute inset-0 bg-black/50 backdrop-blur-sm" onclick={() => qrModalOpen = false}></div>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="relative z-10 mx-4 w-full max-w-md rounded-lg bg-popover p-6 shadow-xl" onclick={(e) => e.stopPropagation()}>
		<div class="flex items-center justify-between mb-4">
			<h3 class="text-lg font-semibold">QR Code</h3>
			<Button variant="ghost" size="sm" onclick={() => qrModalOpen = false}>
				<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
					<path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</Button>
		</div>
		<div class="flex flex-col items-center gap-4">
			<p class="text-sm text-muted-foreground">{event?.event_name}</p>
			<div class="rounded-xl border border-border bg-white p-4">
				<img src={qrDataUrl} alt="QR Code" class="h-64 w-64 sm:h-72 sm:w-72" />
			</div>
			<p class="text-xs text-muted-foreground text-center break-all">{getFormUrl()}</p>
			<p class="text-sm text-muted-foreground">Scan to open the form</p>
		</div>
	</div>
</div>
{/if}

{#if attachPreviewOpen}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" onclick={closeAttachmentPreview}>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="mx-6 my-6 flex h-[calc(100vh-3rem)] w-full flex-col rounded-lg bg-card shadow-xl" role="document" onclick={(e) => e.stopPropagation()}>
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h3 class="font-semibold">{attachPreviewName}</h3>
			<div class="flex gap-2">
				<Button variant="ghost" size="sm" onclick={closeAttachmentPreview}>Close</Button>
			</div>
		</div>
		<div class="flex-1 overflow-hidden">
			{#if attachPreviewLoading}
				<div class="flex h-full items-center justify-center">
					<p class="text-muted-foreground">Loading...</p>
				</div>
			{:else if attachPreviewType === 'application/pdf'}
				<PdfViewer src={attachPreviewUrl} class="h-full" />
			{:else if attachPreviewType?.startsWith('image/')}
				<div class="flex h-full items-center justify-center overflow-auto p-4">
					<img src={attachPreviewUrl} alt={attachPreviewName} class="max-h-full max-w-full object-contain" />
				</div>
			{/if}
		</div>
	</div>
</div>
{/if}
