<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import { user } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card";

	let { data } = $props();

	let currentUser: any = $state(null);
	let pdfUrl = $state('');
	let pdfLoading = $state(true);
	let submissionId = $state('');

	const unsub = user.subscribe((u) => {
		currentUser = u;
	});

	onMount(() => {
		const params = new URL(window.location.href).searchParams;
		submissionId = params.get('sid') || '';

		if (submissionId) {
			loadPdf();
		} else {
			pdfLoading = false;
		}

		return () => unsub();
	});

	async function loadPdf() {
		try {
			const res = await fetch(api.getPdfUrl(submissionId), { credentials: 'include' });
			if (res.ok) {
				const blob = await res.blob();
				pdfUrl = URL.createObjectURL(blob);
			}
		} catch {
			// PDF preview is optional
		} finally {
			pdfLoading = false;
		}
	}

	function printPdf() {
		const iframe = document.getElementById('success-pdf-preview') as HTMLIFrameElement;
		if (iframe?.contentWindow) {
			iframe.contentWindow.print();
		}
	}

	function downloadPdf() {
		if (!pdfUrl) return;
		const a = document.createElement('a');
		a.href = pdfUrl;
		a.download = `permission-form.pdf`;
		a.click();
	}

	function fillAnother() {
		goto(`/form/${data.eventId}`);
	}
</script>

<svelte:head>
	<title>Form Submitted</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<!-- Success Message -->
	<div class="mb-6 text-center">
		<div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="h-8 w-8 text-green-600 dark:text-green-400"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
			</svg>
		</div>
		<h1 class="text-2xl font-bold">Form Submitted Successfully!</h1>
		<p class="mt-2 text-muted-foreground">
			Your permission form has been submitted. The event organizer will be notified.
		</p>
	</div>

	<!-- Action Buttons -->
	<div class="mb-6 flex flex-wrap justify-center gap-3">
		{#if pdfUrl}
			<Button variant="outline" onclick={printPdf}>Print PDF</Button>
			<Button variant="outline" onclick={downloadPdf}>Download PDF</Button>
		{/if}
		<Button variant="outline" onclick={fillAnother}>Fill Out Another Form</Button>
		{#if currentUser}
			<Button onclick={() => goto("/dashboard")}>Go to Dashboard</Button>
		{/if}
	</div>

	<!-- PDF Preview -->
	{#if submissionId}
		<Card>
			<CardHeader>
				<CardTitle>PDF Preview</CardTitle>
			</CardHeader>
			<CardContent>
				{#if pdfLoading}
					<div class="flex h-[600px] items-center justify-center">
						<p class="text-muted-foreground">Loading PDF preview...</p>
					</div>
				{:else if pdfUrl}
					<iframe
						id="success-pdf-preview"
						src={pdfUrl}
						class="h-[700px] w-full rounded border"
						title="Permission Form PDF"
					></iframe>
				{:else}
					<div class="flex h-[200px] items-center justify-center">
						<p class="text-muted-foreground">
							PDF preview is not available.
							{#if !currentUser}
								<a href="/login" class="text-primary underline">Log in</a> to view your submitted PDFs.
							{/if}
						</p>
					</div>
				{/if}
			</CardContent>
		</Card>
	{/if}
</div>
