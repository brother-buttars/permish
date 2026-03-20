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

	let currentUser: any = $state(null);

	// Form fields
	let eventName = $state("");
	let eventDates = $state("");
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
		if (!eventDates.trim()) newErrors.eventDates = "Event dates are required";
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
			const data = await api.createEvent({
				event_name: eventName,
				event_dates: eventDates,
				description,
				ward,
				stake,
				leader_name: leaderName,
				leader_phone: leaderPhone,
				leader_email: leaderEmail,
				notify_email: notifyEmail || undefined,
				notify_phone: notifyPhone || undefined,
				notify_carrier: notifyCarrier || undefined,
			});

			formUrl = data.formUrl || data.form_url || "";
			createdEventId = data.event?.id || data.id || "";
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

					<div class="space-y-2">
						<Label for="eventDates">Event Dates *</Label>
						<Input id="eventDates" bind:value={eventDates} placeholder="e.g., June 15-18, 2026" />
						{#if errors.eventDates}<p class="text-sm text-destructive">{errors.eventDates}</p>{/if}
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
