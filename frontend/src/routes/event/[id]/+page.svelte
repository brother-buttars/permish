<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { formatDate } from "$lib/utils/formatDate";
	import JSZip from "jszip";
	import { saveAs } from "file-saver";

	let { data } = $props();

	let event: any = $state(null);
	let submissions: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);
	let copySuccess = $state(false);
	let downloading = $state(false);
	let toggling = $state(false);
	let deleting = $state<string | null>(null);

	// PDF preview modal state
	let pdfModalOpen = $state(false);
	let pdfModalUrl = $state('');
	let pdfModalName = $state('');
	let pdfLoading = $state(false);

	const unsubAuth = user.subscribe((u) => {
		currentUser = u;
	});

	async function loadData() {
		try {
			const [eventData, subData] = await Promise.all([
				api.getEvent(data.eventId),
				api.getSubmissions(data.eventId),
			]);
			event = eventData.event || eventData;
			submissions = subData.submissions || subData || [];
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
			await api.updateEvent(data.eventId, { is_active: !event.is_active });
			event = { ...event, is_active: !event.is_active };
		} catch (err) {
			console.error("Failed to toggle event:", err);
		} finally {
			toggling = false;
		}
	}

	async function copyUrl() {
		const url = getFormUrl();
		try {
			await navigator.clipboard.writeText(url);
			copySuccess = true;
			setTimeout(() => (copySuccess = false), 2000);
		} catch {
			// Fallback
		}
	}

	async function deleteSubmission(id: string, name: string) {
		if (!confirm(`Delete the submission for "${name}"? This cannot be undone.`)) return;
		deleting = id;
		try {
			await api.deleteSubmission(id);
			submissions = submissions.filter((s) => s.id !== id);
		} catch (err: any) {
			alert(err.message || "Failed to delete submission");
		} finally {
			deleting = null;
		}
	}

	async function downloadAllZip() {
		if (submissions.length === 0) return;
		downloading = true;
		try {
			const zip = new JSZip();

			await Promise.all(
				submissions.map(async (sub, i) => {
					const url = api.getPdfUrl(sub.id);
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
			const res = await fetch(api.getPdfUrl(submissionId), { credentials: 'include' });
			const blob = await res.blob();
			pdfModalUrl = URL.createObjectURL(blob);
		} catch {
			alert('Failed to load PDF');
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

<svelte:head>
	<title>{event?.event_name || "Event Dashboard"}</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
	{:else if !event}
		<p class="text-center text-destructive">Event not found.</p>
	{:else}
		<!-- Header -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<h1 class="text-3xl font-bold">{event.event_name}</h1>
				<p class="text-muted-foreground">{event.event_dates}</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => goto("/dashboard")}>Back</Button>
				<Button
					variant={event.is_active ? "destructive" : "default"}
					onclick={toggleActive}
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
					</div>
				</div>
			</CardContent>
		</Card>

		<!-- Submissions -->
		<Card>
			<CardHeader>
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle>Submissions ({submissions.length})</CardTitle>
					{#if submissions.length > 0}
						<Button variant="outline" onclick={downloadAllZip} disabled={downloading}>
							{downloading ? "Creating ZIP..." : "Download All as ZIP"}
						</Button>
					{/if}
				</div>
			</CardHeader>
			<CardContent>
				{#if submissions.length === 0}
					<div class="py-8 text-center">
						<p class="text-muted-foreground">No submissions yet. Share the form URL with parents to get started.</p>
					</div>
				{:else}
					<div class="overflow-x-auto">
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
										<td class="px-4 py-3">{sub.participant_name || "\u2014"}</td>
										<td class="px-4 py-3">{sub.emergency_contact || "\u2014"}</td>
										<td class="px-4 py-3">{formatDate(sub.submitted_at) || "\u2014"}</td>
										<td class="px-4 py-3">
											<div class="flex gap-2">
												<button
													onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
													class="text-primary underline hover:no-underline"
												>
													PDF
												</button>
												<button
													onclick={() => goto(`/form/${data.eventId}/edit/${sub.id}`)}
													class="text-primary underline hover:no-underline"
												>
													Edit
												</button>
												<button
													onclick={() => deleteSubmission(sub.id, sub.participant_name)}
													disabled={deleting === sub.id}
													class="text-destructive underline hover:no-underline disabled:opacity-50"
												>
													{deleting === sub.id ? "..." : "Delete"}
												</button>
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

{#if pdfModalOpen}
<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" onclick={closePdfModal}>
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div class="mx-4 flex h-[90vh] w-full max-w-4xl flex-col rounded-lg bg-white shadow-xl" role="document" onclick={(e) => e.stopPropagation()}>
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
