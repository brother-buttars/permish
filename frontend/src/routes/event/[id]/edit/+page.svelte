<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { carriers } from "$lib/utils/carriers";
	import { orgGroups } from "$lib/utils/organizations";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import { formatEventDates } from "$lib/utils/formatDate";

	let { data } = $props();

	let currentUser: any = $state(null);
	let loading = $state(true);

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

	const unsubAuth = user.subscribe((u) => { currentUser = u; });

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser || currentUser.role !== "planner") {
				goto("/login");
				return;
			}
			try {
				const result = await api.getEvent(data.eventId);
				const event = result.event || result;
				eventName = event.event_name || "";
				eventStart = event.event_start || "";
				eventEnd = event.event_end || "";
				isMultiDay = !!event.event_end;
				description = event.event_description || "";
				ward = event.ward || "";
				stake = event.stake || "";
				leaderName = event.leader_name || "";
				leaderPhone = event.leader_phone || "";
				leaderEmail = event.leader_email || "";
				notifyEmail = event.notify_email || "";
				notifyPhone = event.notify_phone || "";
				notifyCarrier = event.notify_carrier || "";
				// Parse organizations
				if (event.organizations) {
					try {
						selectedOrgs = typeof event.organizations === 'string'
							? JSON.parse(event.organizations)
							: event.organizations;
					} catch { selectedOrgs = []; }
				}
			} catch (err: any) {
				toastError("Failed to load event.");
				goto("/dashboard");
			} finally {
				loading = false;
			}
		});

		return () => { unsubLoading(); unsubAuth(); };
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
			await api.updateEvent(data.eventId, {
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
			toastSuccess("Event updated successfully!");
			goto(`/event/${data.eventId}`);
		} catch (err: any) {
			toastError(err.message || "Failed to update event.");
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Edit Event</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-4 py-8">
	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
	{:else}
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-3xl font-bold">Edit Event</h1>
			<Button variant="outline" onclick={() => goto(`/event/${data.eventId}`)}>Cancel</Button>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
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

			<div class="flex gap-3">
				<Button type="submit" class="flex-1" disabled={submitting}>
					{submitting ? "Saving..." : "Save Changes"}
				</Button>
				<Button type="button" variant="outline" onclick={() => goto(`/event/${data.eventId}`)}>
					Cancel
				</Button>
			</div>
		</form>
	{/if}
</div>
