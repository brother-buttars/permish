<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { carriers } from "$lib/utils/carriers";
	import { orgGroups } from "$lib/utils/organizations";
	import { toastSuccess } from "$lib/stores/toast";
	import { formatEventDates } from "$lib/utils/formatDate";

	let currentUser: any = $state(null);

	// Organizations
	let selectedOrgs: string[] = $state([]);

	function toggleOrg(key: string) {
		if (selectedOrgs.includes(key)) {
			selectedOrgs = selectedOrgs.filter(o => o !== key);
		} else {
			selectedOrgs = [...selectedOrgs, key];
		}
	}

	function toggleGroup(groupKey: string, checked: boolean) {
		const group = orgGroups.find(g => g.key === groupKey);
		if (!group) return;
		const childKeys = group.children.map(c => c.key);
		if (checked) {
			selectedOrgs = [...new Set([...selectedOrgs, ...childKeys])];
		} else {
			selectedOrgs = selectedOrgs.filter(o => !childKeys.includes(o));
		}
	}

	// Form fields
	let eventName = $state("");
	let eventStart = $state("");
	let eventEnd = $state("");
	let isMultiDay = $state(false);
	let description = $state("");
	let ward = $state("");
	let stake = $state("");

	let leaderName = $state("");
	let leaderPhone = $state("");
	let leaderEmail = $state("");

	let notifyEmail = $state("");
	let notifyPhone = $state("");
	let notifyCarrier = $state("");

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
			if (!currentUser || currentUser.role !== "planner") {
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

	function validate(): boolean {
		const newErrors: Record<string, string> = {};

		if (!eventName.trim()) newErrors.eventName = "Event name is required";
		if (!eventStart) newErrors.eventStart = "Event date is required";
		if (isMultiDay && !eventEnd) newErrors.eventEnd = "End date is required";
		if (isMultiDay && eventStart && eventEnd && new Date(eventEnd) <= new Date(eventStart)) {
			newErrors.eventEnd = "End date must be after start date";
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
			const eventDatesDisplay = formatEventDates(eventStart, isMultiDay ? eventEnd : null);
			const data = await api.createEvent({
				event_name: eventName,
				event_dates: eventDatesDisplay,
				event_start: eventStart,
				event_end: isMultiDay ? eventEnd : null,
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
			});

			formUrl = data.formUrl || data.form_url || "";
			createdEventId = data.event?.id || data.id || "";
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

<div class="container mx-auto max-w-2xl px-4 py-8">
	{#if formUrl}
		<!-- Success state -->
		<Card>
			<CardHeader>
				<CardTitle>Event Created!</CardTitle>
			</CardHeader>
			<CardContent class="space-y-4">
				<p class="text-sm text-muted-foreground">Share this URL with parents to collect permission forms:</p>
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
			<div class="mb-4 rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
				{errors.form}
			</div>
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
						<div class="space-y-2">
							<Label for="eventStart">{isMultiDay ? 'Event Start Date' : 'Event Date'} *</Label>
							<Input id="eventStart" type="datetime-local" bind:value={eventStart} />
							{#if errors.eventStart}<p class="text-sm text-destructive">{errors.eventStart}</p>{/if}
						</div>

						<label class="flex items-center gap-2">
							<input type="checkbox" bind:checked={isMultiDay} class="h-4 w-4 rounded border-input" />
							<span class="text-sm font-medium">Multi-day event</span>
						</label>

						{#if isMultiDay}
							<div class="space-y-2">
								<Label for="eventEnd">Event End Date *</Label>
								<Input id="eventEnd" type="datetime-local" bind:value={eventEnd} />
								{#if errors.eventEnd}<p class="text-sm text-destructive">{errors.eventEnd}</p>{/if}
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

			<!-- Organizations -->
			<Card>
				<CardHeader>
					<CardTitle>Organizations</CardTitle>
					<p class="text-sm text-muted-foreground">Select which groups are included in this event</p>
				</CardHeader>
				<CardContent class="space-y-4">
					{#each orgGroups as group}
						<div class="space-y-2">
							<label class="flex items-center gap-2">
								<input
									type="checkbox"
									checked={group.children.every(c => selectedOrgs.includes(c.key))}
									onchange={(e) => toggleGroup(group.key, e.currentTarget.checked)}
									class="h-4 w-4 rounded border-input"
								/>
								<span class="text-sm font-semibold">{group.label}</span>
							</label>
							<div class="ml-6 flex flex-wrap gap-4">
								{#each group.children as child}
									<label class="flex items-center gap-2">
										<input
											type="checkbox"
											checked={selectedOrgs.includes(child.key)}
											onchange={() => toggleOrg(child.key)}
											class="h-4 w-4 rounded border-input"
										/>
										<span class="text-sm">{child.label}</span>
									</label>
								{/each}
							</div>
						</div>
					{/each}
				</CardContent>
			</Card>

			<!-- Notification Settings -->
			<Card>
				<CardHeader>
					<CardTitle>Notification Settings</CardTitle>
					<p class="text-sm text-muted-foreground">Optional — get notified when forms are submitted</p>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="notifyEmail">Notification Email</Label>
						<Input id="notifyEmail" type="email" bind:value={notifyEmail} placeholder="notify@example.com" />
						{#if errors.notifyEmail}<p class="text-sm text-destructive">{errors.notifyEmail}</p>{/if}
					</div>

					<Separator />

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="notifyPhone">Notification Phone</Label>
							<Input id="notifyPhone" type="tel" bind:value={notifyPhone} placeholder="(555) 123-4567" />
						</div>
						<div class="space-y-2">
							<Label for="notifyCarrier">Carrier</Label>
							<select
								id="notifyCarrier"
								bind:value={notifyCarrier}
								class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
							>
								<option value="">Select carrier...</option>
								{#each carriers as carrier}
									<option value={carrier.value}>{carrier.label}</option>
								{/each}
							</select>
						</div>
					</div>
				</CardContent>
			</Card>

			<Button type="submit" class="w-full" disabled={submitting}>
				{submitting ? "Creating..." : "Create Event"}
			</Button>
		</form>
	{/if}
</div>
