<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from "$lib/components/composables";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import OrganizationPicker from "$lib/components/OrganizationPicker.svelte";
	import NotificationSettings from "$lib/components/NotificationSettings.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import { formatEventDates } from "$lib/utils/formatDate";
	import { formatFileSize } from "$lib/utils/format";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { PageContainer } from "$lib/components/molecules";

	let { data } = $props();

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

	// Attachments
	let attachments: any[] = $state([]);
	let pendingFiles: File[] = $state([]);
	let deletingAttachment = $state<string | null>(null);
	let deleteAttachmentModalOpen = $state(false);
	let deleteAttachmentTarget = $state<any>(null);

	let notifyEmail = $state("");
	let notifyPhone = $state("");
	let notifyCarrier = $state("");

	let submitting = $state(false);
	let errors: Record<string, string> = $state({});

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async () => {
			try {
				const event = await repo.events.getById(data.eventId);
				eventName = event.event_name || "";
				// Parse event_start/event_end into separate date and time
				if (event.event_start) {
					const s = event.event_start.includes('T') ? event.event_start : event.event_start.replace(' ', 'T');
					startDate = s.split('T')[0] || '';
					startTime = s.split('T')[1]?.slice(0, 5) || '';
				}
				if (event.event_end) {
					const e = event.event_end.includes('T') ? event.event_end : event.event_end.replace(' ', 'T');
					const endDatePart = e.split('T')[0] || '';
					endTime = e.split('T')[1]?.slice(0, 5) || '';
					// Multi-day if end date differs from start date
					if (endDatePart !== startDate) {
						isMultiDay = true;
						endDate = endDatePart;
					} else {
						isMultiDay = false;
					}
				}
				description = event.event_description || "";
				ward = event.ward || "";
				stake = event.stake || "";
				leaderName = event.leader_name || "";
				leaderPhone = event.leader_phone || "";
				leaderEmail = event.leader_email || "";
				additionalDetails = event.additional_details || "";
				notifyEmail = event.notify_email || "";
				notifyPhone = event.notify_phone || "";
				notifyCarrier = event.notify_carrier || "";

				// Load attachments
				try {
					attachments = await repo.attachments.list(data.eventId);
				} catch { /* ok if none */ }

				// Parse organizations
				if (event.organizations) {
					try {
						selectedOrgs = typeof event.organizations === 'string'
							? JSON.parse(event.organizations)
							: event.organizations;
					} catch { selectedOrgs = []; }
				}
			} catch (err: any) {
				toastError("Failed to load activity.");
				goto("/dashboard");
			}
		},
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
		if (!eventName.trim()) newErrors.eventName = "Activity name is required";
		if (!startDate) newErrors.startDate = "Activity date is required";
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

	async function confirmDeleteAttachment() {
		if (!deleteAttachmentTarget) return;
		deletingAttachment = deleteAttachmentTarget.id;
		try {
			await repo.attachments.delete(data.eventId, deleteAttachmentTarget.id);
			attachments = attachments.filter(a => a.id !== deleteAttachmentTarget.id);
			toastSuccess("Attachment deleted.");
		} catch (err: any) {
			toastError(err.message || "Failed to delete attachment");
		} finally {
			deletingAttachment = null;
			deleteAttachmentModalOpen = false;
			deleteAttachmentTarget = null;
		}
	}

	async function handleSubmit() {
		if (!validate()) return;
		submitting = true;
		try {
			const eventStartDt = buildDatetime(startDate, startTime);
			const eventEndDt = isMultiDay ? buildDatetime(endDate, endTime) : buildDatetime(startDate, endTime);
			const eventDatesDisplay = formatEventDates(eventStartDt, isMultiDay ? eventEndDt : buildDatetime(startDate, endTime));
			await repo.events.update(data.eventId, {
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

			// Upload new attachments
			for (const file of pendingFiles) {
				try {
					await repo.attachments.upload(data.eventId, file);
				} catch (err: any) {
					console.error('Failed to upload attachment:', err.message);
					toastError(`Failed to upload ${file.name}: ${err.message}`);
				}
			}

			toastSuccess("Activity updated successfully!");
			goto(`/event/${data.eventId}`);
		} catch (err: any) {
			toastError(err.message || "Failed to update activity.");
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Edit Activity</title>
</svelte:head>

<PageContainer>
	{#if !auth.ready}
		<LoadingState />
	{:else}
		<div class="mb-6 flex items-center justify-between">
			<h1 class="text-3xl font-bold">Edit Activity</h1>
			<Button variant="outline" onclick={() => goto(`/event/${data.eventId}`)}>Cancel</Button>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
			<Card>
				<CardHeader>
					<CardTitle>Activity Details</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="eventName">Activity Name *</Label>
						<Input id="eventName" bind:value={eventName} placeholder="e.g., Youth Camp 2026" />
						{#if errors.eventName}<p class="text-sm text-destructive">{errors.eventName}</p>{/if}
					</div>
					<div class="space-y-4">
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2">
								<Label for="startDate">{isMultiDay ? 'Start Date' : 'Activity Date'} *</Label>
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
							<span class="text-sm font-medium">Multi-day activity</span>
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
						<Textarea id="description" bind:value={description} placeholder="Describe the activity..." rows={4} />
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

						{#if attachments.length > 0}
							<ul class="space-y-1">
								{#each attachments as att}
									<li class="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
										<span class="truncate">{att.original_name} <span class="text-muted-foreground">({formatFileSize(att.size)})</span></span>
										<button
											type="button"
											class="ml-2 text-destructive hover:text-destructive/80"
											disabled={deletingAttachment === att.id}
											onclick={() => { deleteAttachmentTarget = att; deleteAttachmentModalOpen = true; }}
										>
											{deletingAttachment === att.id ? '...' : 'Remove'}
										</button>
									</li>
								{/each}
							</ul>
						{/if}

						{#if pendingFiles.length > 0}
							<ul class="space-y-1">
								{#each pendingFiles as file, i}
									<li class="flex items-center justify-between rounded-md border border-dashed border-border px-3 py-2 text-sm">
										<span class="truncate">{file.name} <span class="text-muted-foreground">(new)</span></span>
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

			<OrganizationPicker bind:selectedOrgs />

			<NotificationSettings bind:notifyEmail bind:notifyPhone bind:notifyCarrier emailError={errors?.notifyEmail} />

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
</PageContainer>

<ConfirmModal
	bind:open={deleteAttachmentModalOpen}
	title="Remove Attachment"
	message="Remove &quot;{deleteAttachmentTarget?.original_name}&quot;? This cannot be undone."
	confirmLabel="Remove"
	confirmVariant="destructive"
	onConfirm={confirmDeleteAttachment}
	loading={deletingAttachment !== null}
/>
