<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import OrganizationPicker from "$lib/components/OrganizationPicker.svelte";
	import NotificationSettings from "$lib/components/NotificationSettings.svelte";
	import { toastSuccess } from "$lib/stores/toast";
	import { formatEventDates } from "$lib/utils/formatDate";
	import AlertBox from "$lib/components/AlertBox.svelte";

	let currentUser: any = $state(null);

	// Organizations
	let selectedOrgs: string[] = $state([]);

	// Form fields
	let eventName = $state("");
	let startDate = $state("");
	let startTime = $state("");
	let endDate = $state("");
	let endTime = $state("");
	let isMultiDay = $state(false);
	let description = $state("");
	let ward = $state("");
	let stake = $state("");

	let leaderName = $state("");
	let leaderPhone = $state("");
	let leaderEmail = $state("");

	let additionalDetails = $state("");

	let notifyEmail = $state("");
	let notifyPhone = $state("");
	let notifyCarrier = $state("");

	// Pending attachments (uploaded after event is created)
	let pendingFiles: File[] = $state([]);

	let submitting = $state(false);
	let errors: Record<string, string> = $state({});
	let formUrl = $state("");
	let createdEventId = $state("");
	let copySuccess = $state(false);

	const unsubAuth = user.subscribe((u) => {
		currentUser = u;
	});

	onMount(() => {
		const unsubLoading = authLoading.subscribe((isLoading) => {
			if (isLoading) return;
			if (!currentUser || (currentUser.role !== "planner" && currentUser.role !== "super")) {
				goto("/login");
			}
		});

		return () => {
			unsubLoading();
			unsubAuth();
		};
	});

	function validateEmail(email: string): boolean {
		return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
	}

	function buildDatetime(date: string, time: string): string {
		if (!date) return '';
		return time ? `${date}T${time}` : date;
	}

	function validate(): boolean {
		const newErrors: Record<string, string> = {};

		if (!eventName.trim()) newErrors.eventName = "Event name is required";
		if (!startDate) newErrors.startDate = "Event date is required";
		if (isMultiDay && !endDate) newErrors.endDate = "End date is required";
		if (isMultiDay && startDate && endDate) {
			const start = buildDatetime(startDate, startTime);
			const end = buildDatetime(endDate, endTime);
			if (new Date(end) <= new Date(start)) {
				newErrors.endDate = "End date/time must be after start";
			}
		}
		if (!description.trim()) newErrors.description = "Description is required";
		if (!ward.trim()) newErrors.ward = "Ward is required";
		if (!stake.trim()) newErrors.stake = "Stake is required";
		if (!leaderName.trim()) newErrors.leaderName = "Leader name is required";
		if (!leaderPhone.trim()) newErrors.leaderPhone = "Leader phone is required";
		if (!leaderEmail.trim()) {
			newErrors.leaderEmail = "Leader email is required";
		} else if (!validateEmail(leaderEmail)) {
			newErrors.leaderEmail = "Invalid email format";
		}

		if (notifyEmail && !validateEmail(notifyEmail)) {
			newErrors.notifyEmail = "Invalid email format";
		}

		errors = newErrors;
		return Object.keys(newErrors).length === 0;
	}

	async function handleSubmit() {
		if (!validate()) return;

		submitting = true;
		try {
			const eventStartDt = buildDatetime(startDate, startTime);
			const eventEndDt = isMultiDay ? buildDatetime(endDate, endTime) : buildDatetime(startDate, endTime);
			const eventDatesDisplay = formatEventDates(eventStartDt, isMultiDay ? eventEndDt : buildDatetime(startDate, endTime));
			const repo = getRepository();
			const result = await repo.events.create({
				event_name: eventName,
				event_dates: eventDatesDisplay,
				event_start: eventStartDt,
				event_end: eventEndDt,
				event_description: description,
				ward,
				stake,
				leader_name: leaderName,
				leader_phone: leaderPhone,
				leader_email: leaderEmail,
				notify_email: notifyEmail || null,
				notify_phone: notifyPhone || null,
				notify_carrier: notifyCarrier || null,
				organizations: selectedOrgs,
				additional_details: additionalDetails || null,
			});

			const newEventId = result.event?.id || "";

			// Upload pending attachments
			for (const file of pendingFiles) {
				try {
					await repo.attachments.upload(newEventId, file);
				} catch (err: any) {
					console.error('Failed to upload attachment:', err.message);
				}
			}

			formUrl = result.formUrl || result.form_url || "";
			createdEventId = newEventId;
			toastSuccess("Event created successfully!");
		} catch (err: any) {
			errors = { form: err.message || "Failed to create event" };
		} finally {
			submitting = false;
		}
	}

	async function copyUrl() {
		try {
			await navigator.clipboard.writeText(formUrl);
			copySuccess = true;
			setTimeout(() => (copySuccess = false), 2000);
		} catch {
			// Fallback
		}
	}
</script>

<svelte:head>
	<title>Create Event</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if formUrl}
		<!-- Success state -->
		<Card>
			<CardHeader>
				<CardTitle>Event Created!</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<p class="text-sm text-muted-foreground">Share this URL with parents to collect forms:</p>
				<div class="flex flex-col gap-2 sm:flex-row">
					<Input value={formUrl} readonly class="flex-1" />
					<Button onclick={copyUrl}>
						{copySuccess ? "Copied!" : "Copy URL"}
					</Button>
				</div>
			</CardContent>
			<CardFooter class="flex gap-2">
				<Button variant="outline" onclick={() => goto("/dashboard")}>Back to Dashboard</Button>
				{#if createdEventId}
					<Button onclick={() => goto(`/event/${createdEventId}`)}>View Event Dashboard</Button>
				{/if}
			</CardFooter>
		</Card>
	{:else}
		<!-- Form -->
		<h1 class="mb-6 text-3xl font-bold">Create New Event</h1>

		{#if errors.form}
			<AlertBox message={errors.form} class="mb-4" />
		{/if}

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
			<!-- Event Details -->
			<Card>
				<CardHeader>
					<CardTitle>Event Details</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="eventName">Event Name *</Label>
						<Input id="eventName" bind:value={eventName} placeholder="e.g., Youth Camp 2026" />
						{#if errors.eventName}<p class="text-sm text-destructive">{errors.eventName}</p>{/if}
					</div>

					<div class="space-y-4">
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="startDate">{isMultiDay ? 'Start Date' : 'Event Date'} *</Label>
								<Input id="startDate" type="date" bind:value={startDate} />
								{#if errors.startDate}<p class="text-sm text-destructive">{errors.startDate}</p>{/if}
							</div>
							<div class="space-y-2">
								<Label for="startTime">Start Time</Label>
								<Input id="startTime" type="time" bind:value={startTime} />
							</div>
						</div>

						<label class="flex items-center gap-2 cursor-pointer">
							<input type="checkbox" bind:checked={isMultiDay} class="h-4 w-4 rounded border-input" />
							<span class="text-sm font-medium">Multi-day event</span>
						</label>

						{#if isMultiDay}
							<div class="grid gap-4 sm:grid-cols-2">
								<div class="space-y-2">
									<Label for="endDate">End Date *</Label>
									<Input id="endDate" type="date" bind:value={endDate} />
									{#if errors.endDate}<p class="text-sm text-destructive">{errors.endDate}</p>{/if}
								</div>
								<div class="space-y-2">
									<Label for="endTime">End Time</Label>
									<Input id="endTime" type="time" bind:value={endTime} />
								</div>
							</div>
						{:else}
							<div class="grid gap-4 sm:grid-cols-2">
								<div></div>
								<div class="space-y-2">
									<Label for="endTimeSingle">End Time</Label>
									<Input id="endTimeSingle" type="time" bind:value={endTime} />
								</div>
							</div>
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="description">Description *</Label>
						<Textarea id="description" bind:value={description} placeholder="Describe the event..." rows={4} />
						{#if errors.description}<p class="text-sm text-destructive">{errors.description}</p>{/if}
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="ward">Ward *</Label>
							<Input id="ward" bind:value={ward} placeholder="Ward name" />
							{#if errors.ward}<p class="text-sm text-destructive">{errors.ward}</p>{/if}
						</div>
						<div class="space-y-2">
							<Label for="stake">Stake *</Label>
							<Input id="stake" bind:value={stake} placeholder="Stake name" />
							{#if errors.stake}<p class="text-sm text-destructive">{errors.stake}</p>{/if}
						</div>
					</div>
				</CardContent>
			</Card>

			<!-- Additional Info & Attachments -->
			<Card>
				<CardHeader>
					<CardTitle>Additional Information</CardTitle>
					<p class="text-sm text-muted-foreground">Optional details and files visible to parents on the form</p>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="additionalDetails">Additional Details</Label>
						<Textarea id="additionalDetails" bind:value={additionalDetails} placeholder="Extra info, links to Google Docs, packing lists, etc..." rows={4} />
						<p class="text-xs text-muted-foreground">URLs will be automatically linked.</p>
					</div>

					<Separator />

					<div class="space-y-2">
						<Label>Attachments</Label>
						<p class="text-xs text-muted-foreground">PDFs, images, documents — max 10MB each, up to 10 files.</p>
						<input
							type="file"
							accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt"
							multiple
							onchange={(e) => {
								const input = e.currentTarget;
								if (input.files) {
									pendingFiles = [...pendingFiles, ...Array.from(input.files)];
									input.value = '';
								}
							}}
							class="block w-full text-sm text-muted-foreground file:mr-4 file:rounded-md file:border-0 file:bg-primary file:px-4 file:py-2 file:text-sm file:font-semibold file:text-primary-foreground hover:file:bg-primary/90"
						/>
						{#if pendingFiles.length > 0}
							<ul class="space-y-1 pt-2">
								{#each pendingFiles as file, i}
									<li class="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
										<span class="truncate">{file.name}</span>
										<button
											type="button"
											class="ml-2 text-destructive hover:text-destructive/80"
											onclick={() => { pendingFiles = pendingFiles.filter((_, idx) => idx !== i); }}
										>
											Remove
										</button>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				</CardContent>
			</Card>

			<!-- Leader Info -->
			<Card>
				<CardHeader>
					<CardTitle>Leader Information</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="leaderName">Leader Name *</Label>
						<Input id="leaderName" bind:value={leaderName} placeholder="Full name" />
						{#if errors.leaderName}<p class="text-sm text-destructive">{errors.leaderName}</p>{/if}
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="leaderPhone">Phone *</Label>
							<Input id="leaderPhone" type="tel" bind:value={leaderPhone} placeholder="(555) 123-4567" />
							{#if errors.leaderPhone}<p class="text-sm text-destructive">{errors.leaderPhone}</p>{/if}
						</div>
						<div class="space-y-2">
							<Label for="leaderEmail">Email *</Label>
							<Input id="leaderEmail" type="email" bind:value={leaderEmail} placeholder="leader@example.com" />
							{#if errors.leaderEmail}<p class="text-sm text-destructive">{errors.leaderEmail}</p>{/if}
						</div>
					</div>
				</CardContent>
			</Card>

			<OrganizationPicker bind:selectedOrgs />

			<NotificationSettings bind:notifyEmail bind:notifyPhone bind:notifyCarrier emailError={errors.notifyEmail} />

			<Button type="submit" class="w-full" disabled={submitting}>
				{submitting ? "Creating..." : "Create Event"}
			</Button>
		</form>
	{/if}
</div>
