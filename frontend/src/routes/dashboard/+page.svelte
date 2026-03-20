<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { formatDate } from "$lib/utils/formatDate";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { getOrgDisplayLabels } from "$lib/utils/organizations";
	import { toastError } from "$lib/stores/toast";

	let events: any[] = $state([]);
	let profiles: any[] = $state([]);
	let submissions: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);

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

			try {
				// Load all data for all roles
				const promises: Promise<any>[] = [
					api.listProfiles(),
					api.getMySubmissions(),
				];

				if (currentUser.role === "planner") {
					promises.push(api.listEvents());
				}

				const results = await Promise.all(promises);
				profiles = results[0].profiles || results[0] || [];
				submissions = results[1].submissions || results[1] || [];

				if (currentUser.role === "planner" && results[2]) {
					events = results[2].events || results[2] || [];
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

	function parseOrgs(ev: any): string[] {
		if (!ev?.organizations) return [];
		if (typeof ev.organizations === 'string') {
			try { return JSON.parse(ev.organizations); } catch { return []; }
		}
		return ev.organizations;
	}

	function isYM(label: string): boolean {
		return ['Young Men', 'Deacons', 'Teachers', 'Priests'].includes(label);
	}
	function isYW(label: string): boolean {
		return ['Young Women', 'Beehives', 'Mia Maids', 'Laurels'].includes(label);
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
	<title>Dashboard</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
	{:else}
		<h1 class="mb-8 text-3xl font-bold">Dashboard</h1>

		<!-- ═══ Event Planner Section ═══ -->
		{#if currentUser?.role === "planner"}
			<section class="mb-10">
				<div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<h2 class="text-xl font-semibold">My Events</h2>
					<Button onclick={() => goto("/create")}>Create New Event</Button>
				</div>

				{#if events.length === 0}
					<Card>
						<CardContent class="py-8 text-center">
							<p class="text-muted-foreground">You haven't created any events yet.</p>
							<Button variant="link" onclick={() => goto("/create")}>Create your first event</Button>
						</CardContent>
					</Card>
				{:else}
					<div class="grid gap-4">
						{#each events as event}
							<Card class="cursor-pointer transition-shadow hover:shadow-md" onclick={() => goto(`/event/${event.id}`)}>
								<CardHeader>
									<CardTitle>{event.event_name}</CardTitle>
									<CardDescription>{event.event_dates}</CardDescription>
								</CardHeader>
								<CardContent>
									<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
										<div class="flex flex-col gap-1">
											<span class="text-sm text-muted-foreground">
												{event.submission_count ?? 0} submission{(event.submission_count ?? 0) === 1 ? "" : "s"}
											</span>
											{#if parseOrgs(event).length > 0}
												<div class="flex flex-wrap gap-1">
													{#each getOrgDisplayLabels(parseOrgs(event)) as label}
														<span class="rounded-full border px-2 py-0.5 text-xs font-medium {isYM(label) ? 'border-primary/30 bg-primary/10 text-primary' : isYW(label) ? 'border-accent-foreground/20 bg-accent text-accent-foreground' : 'border-border bg-muted text-muted-foreground'}">{label}</span>
													{/each}
												</div>
											{/if}
										</div>
										<span class="text-sm">
											{#if event.is_active}
												<span class="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">Active</span>
											{:else}
												<span class="rounded-full border border-border bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">Inactive</span>
											{/if}
										</span>
									</div>
								</CardContent>
							</Card>
						{/each}
					</div>
				{/if}
			</section>

			<Separator class="my-8" />
		{/if}

		<!-- ═══ Parent / Personal Section ═══ -->
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
								<div>
									<p class="font-medium">{profile.participant_name}</p>
									{#if profile.participant_dob}
										<p class="text-sm text-muted-foreground">DOB: {formatDate(profile.participant_dob)}</p>
									{/if}
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
				<div class="overflow-x-auto">
					<table class="w-full text-sm">
						<thead>
							<tr class="border-b">
								<th class="px-4 py-3 text-left font-medium">Event</th>
								<th class="px-4 py-3 text-left font-medium">Participant</th>
								<th class="px-4 py-3 text-left font-medium">Submitted</th>
								<th class="px-4 py-3 text-left font-medium">PDF</th>
							</tr>
						</thead>
						<tbody>
							{#each submissions as sub}
								<tr class="border-b">
									<td class="px-4 py-3">{sub.event_name || "—"}</td>
									<td class="px-4 py-3">{sub.participant_name || "—"}</td>
									<td class="px-4 py-3">{formatDate(sub.submitted_at)}</td>
									<td class="px-4 py-3">
										<button
											onclick={() => openPdfPreview(sub.id, sub.participant_name || 'submission')}
											class="text-primary underline hover:no-underline"
										>
											PDF
										</button>
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
