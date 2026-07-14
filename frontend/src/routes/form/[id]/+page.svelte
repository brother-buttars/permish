<script lang="ts">
	import { onMount } from "svelte";
	import { goto, beforeNavigate } from "$app/navigation";
	import { page } from "$app/stores";
	import { getRepository } from '$lib/data';
	import { user } from "$lib/stores/auth";
	import { Button } from "$lib/components/ui/button";
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent,
	} from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import ProfileSelector from "$lib/components/ProfileSelector.svelte";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import PdfViewer from "$lib/components/PdfViewer.svelte";
	import PermissionFormFields from "$lib/components/PermissionFormFields.svelte";
	import { linkify } from "$lib/utils/linkify";
	import { formatFileSize } from "$lib/utils/format";
	import { validateSubmissionForm, buildSubmissionPayload, buildProfilePayload, emptyFields, type SubmissionFormFields } from "$lib/utils/submissionForm";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import FormProgress from "$lib/components/FormProgress.svelte";
	import { PageContainer, Modal } from "$lib/components/molecules";

	const formSections = [
		{ id: "section-contact", label: "Contact" },
		{ id: "section-emergency", label: "Emergency" },
		{ id: "section-medical", label: "Medical" },
		{ id: "section-permission", label: "Permission" },
		{ id: "section-signatures", label: "Signatures" },
	];

	let { data } = $props();

	let event: any = $state(null);
	let attachments: any[] = $state([]);
	let loading = $state(true);
	let error = $state("");

	// Attachment preview modal
	let attachPreviewOpen = $state(false);
	let attachPreviewUrl = $state('');
	let attachPreviewName = $state('');
	let attachPreviewType = $state('');
	let attachPreviewLoading = $state(false);
	let submitting = $state(false);
	let validationErrors: string[] = $state([]);
	let currentUser: any = $state(null);

	const unsub = user.subscribe((u) => {
		currentUser = u;
	});

	// All form fields in one object — bound into the shared PermissionFormFields
	// component and fed to the shared validate/build helpers.
	let fields = $state<SubmissionFormFields>(emptyFields());

	// Saved guardian signature from user profile (prefilled into the guardian pad).
	let savedGuardianSig = $state("");
	let savedGuardianSigType = $state<"drawn" | "typed" | "hand">("typed");

	// Track whether an existing profile was used
	let usedExistingProfile = $state(false);

	// Progressive disclosure: the optional Emergency Contact and Medical sections
	// start collapsed so the form reads as short (only name, DOB + signatures are
	// required). They auto-expand when a saved profile pre-fills their data.
	let showEmergency = $state(false);
	let showMedical = $state(false);

	// Save profile modal state
	let saveProfileModalOpen = $state(false);
	let saveProfileLoading = $state(false);
	let pendingSubmissionId = $state('');
	let formDirty = $state(false);
	let formSubmitted = $state(false);

	// Track form changes
	$effect(() => {
		if (fields.participantName || fields.dateOfBirth || fields.phone || fields.address || fields.emergencyContact) {
			formDirty = true;
		}
	});

	// Warn before navigating away from dirty form
	beforeNavigate(({ cancel }) => {
		if (formDirty && !formSubmitted && !saveProfileModalOpen) {
			if (!window.confirm('You have unsaved changes. Are you sure you want to leave?')) {
				cancel();
			}
		}
	});

	function isPreviewable(mimeType: string): boolean {
		return mimeType === 'application/pdf' || mimeType?.startsWith('image/');
	}

	const repo = getRepository();

	async function openAttachmentPreview(att: any) {
		attachPreviewName = att.original_name;
		attachPreviewType = att.mime_type;
		attachPreviewLoading = true;
		attachPreviewOpen = true;
		try {
			const url = repo.attachments.getUrl(data.eventId, att.id);
			const res = await fetch(url);
			const blob = await res.blob();
			attachPreviewUrl = URL.createObjectURL(blob);
		} catch {
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

	onMount(() => {
		(async () => {
			try {
				const result = await repo.submissions.getFormEvent(data.eventId);
				event = result.event;
				attachments = result.attachments || [];
			} catch (err: any) {
				error = err.message || "Failed to load activity";
			} finally {
				loading = false;
			}

			// Auto-fill emergency contact and store saved signature from user profile
			if (currentUser) {
				try {
					const p = await repo.auth.getProfile();
					if (p.guardian_signature) {
						savedGuardianSig = p.guardian_signature;
						savedGuardianSigType = p.guardian_signature_type || "typed";
					}
					if (!fields.emergencyContact && p.name) fields.emergencyContact = p.name;
					if (!fields.primaryPhone && p.phone) fields.primaryPhone = p.phone;
					if (fields.emergencyContact || fields.primaryPhone) showEmergency = true;
				} catch {
					// User profile fetch is optional
				}
			}
		})();

		return () => unsub();
	});

	function fillFromProfile(profile: any) {
		if (!profile) {
			usedExistingProfile = false;
			return;
		}
		usedExistingProfile = true;
		fields.participantName = profile.participant_name || "";
		fields.dateOfBirth = profile.participant_dob || "";
		fields.phone = profile.participant_phone || "";
		fields.address = profile.address || "";
		fields.city = profile.city || "";
		fields.stateProvince = profile.state_province || "";
		fields.emergencyContact = profile.emergency_contact || "";
		fields.primaryPhone = profile.emergency_phone_primary || "";
		fields.secondaryPhone = profile.emergency_phone_secondary || "";

		fields.hasSpecialDiet = !!profile.special_diet;
		fields.specialDietDetails = profile.special_diet_details || "";
		fields.hasAllergies = !!profile.allergies;
		fields.allergyDetails = profile.allergies_details || "";
		fields.medications = profile.medications || "";
		fields.canSelfAdminister = !!profile.can_self_administer_meds;

		fields.hasChronicIllness = !!profile.chronic_illness;
		fields.chronicIllnessDetails = profile.chronic_illness_details || "";
		fields.hadRecentSurgery = !!profile.recent_surgery;
		fields.recentSurgeryDetails = profile.recent_surgery_details || "";
		fields.activityLimitations = profile.activity_limitations || "";

		fields.otherAccommodations = profile.other_accommodations || "";

		// Reveal optional sections that now carry pre-filled data.
		if (fields.emergencyContact || fields.primaryPhone || fields.secondaryPhone) showEmergency = true;
		if (fields.hasSpecialDiet || fields.hasAllergies || fields.medications || fields.hasChronicIllness || fields.hadRecentSurgery || fields.activityLimitations || fields.otherAccommodations) showMedical = true;
	}

	async function handleSubmit() {
		validationErrors = validateSubmissionForm(fields);
		if (validationErrors.length > 0) {
			// Scroll to error summary so mobile users see the errors
			setTimeout(() => {
				document.getElementById('validation-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 50);
			return;
		}

		submitting = true;
		try {
			const result = await repo.submissions.submit(data.eventId, buildSubmissionPayload(fields));
			const submissionId = result.submission?.id || '';
			formSubmitted = true;

			if (currentUser && !usedExistingProfile) {
				pendingSubmissionId = submissionId;
				saveProfileModalOpen = true;
				return;
			}

			goto(`/form/${data.eventId}/success?sid=${submissionId}`);
		} catch (err: any) {
			validationErrors = [err.message || "Failed to submit form. Please try again."];
		} finally {
			submitting = false;
		}
	}

	async function saveProfileAndRedirect() {
		saveProfileLoading = true;
		try {
			await repo.profiles.create(buildProfilePayload(fields));
		} catch {
			// Profile save is optional, don't block redirect
		} finally {
			saveProfileLoading = false;
			saveProfileModalOpen = false;
			goto(`/form/${data.eventId}/success?sid=${pendingSubmissionId}`);
		}
	}

	function skipSaveAndRedirect() {
		saveProfileModalOpen = false;
		goto(`/form/${data.eventId}/success?sid=${pendingSubmissionId}`);
	}
</script>

<svelte:head>
	<title>{event?.event_name || "Permish"}</title>
</svelte:head>

<PageContainer>
	{#if loading}
		<LoadingState message="Loading activity..." />
	{:else if error}
		<Card>
			<CardContent class="py-12 text-center">
				<p class="text-destructive">{error}</p>
				<Button variant="link" onclick={() => goto("/")}>Return home</Button>
			</CardContent>
		</Card>
	{:else if event}
		<!-- Event Details Header -->
		<Card class="mb-8">
			<CardHeader>
				<CardTitle class="text-2xl">{event.event_name}</CardTitle>
				<CardDescription>{event.event_dates}</CardDescription>
			</CardHeader>
			<CardContent class="space-y-2 text-sm">
				{#if event.event_description}
					<p>{event.event_description}</p>
				{/if}
				{#if event.ward}
					<p><span class="font-medium">Ward:</span> {event.ward}</p>
				{/if}
				{#if event.stake}
					<p><span class="font-medium">Stake:</span> {event.stake}</p>
				{/if}
				{#if event.leader_name}
					<p>
						<span class="font-medium">Leader:</span>
						{event.leader_name}
						{#if event.leader_phone}
							&mdash; {event.leader_phone}
						{/if}
						{#if event.leader_email}
							&mdash; {event.leader_email}
						{/if}
					</p>
				{/if}

				{#if event.additional_details}
					<Separator />
					<div>
						<p class="mb-1 font-medium">Additional Details</p>
						<div class="leading-relaxed">{@html linkify(event.additional_details)}</div>
					</div>
				{/if}

				{#if attachments.length > 0}
					<Separator />
					<div>
						<p class="mb-1 font-medium">Attachments</p>
						<ul class="space-y-1">
							{#each attachments as att}
								<li class="flex items-center gap-2">
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
										<a href={repo.attachments.getUrl(data.eventId, att.id)} download={att.original_name} class="text-primary underline hover:no-underline">
											{att.original_name}
										</a>
									{/if}
									<span class="text-muted-foreground">({formatFileSize(att.size)})</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</CardContent>
		</Card>

		<FormProgress sections={formSections} />

		<!-- Form Card -->
		<Card>
			<CardContent class="pt-6">
				<!-- Profile Selector -->
				<div class="mb-6">
					<ProfileSelector onSelect={fillFromProfile} eventOrgs={(() => { try { return typeof event.organizations === 'string' ? JSON.parse(event.organizations) : (event.organizations || []); } catch { return []; } })()} />
					{#if !currentUser}
						<p class="mt-2 text-sm text-muted-foreground">
							Have an account?
							<a href="/login" class="text-primary underline hover:no-underline">Log in</a>
							to auto-fill from saved profiles.
						</p>
					{/if}
				</div>

				<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
					<!-- Validation Errors -->
					{#if validationErrors.length > 0}
						<div id="validation-errors">
							<AlertBox errors={validationErrors} />
						</div>
					{/if}

					<PermissionFormFields
						bind:fields
						progressive
						bind:showEmergency
						bind:showMedical
						guardianInitialValue={savedGuardianSig}
						guardianInitialType={savedGuardianSigType}
					/>

					<!-- Submit -->
					<div class="sticky bottom-0 bg-card pt-4 pb-2">
						<Button type="submit" class="w-full" disabled={submitting}>
							{#if submitting}
								Submitting...
							{:else}
								Submit Form
							{/if}
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	{/if}
</PageContainer>

<ConfirmModal
	bind:open={saveProfileModalOpen}
	title="Save Profile for {fields.participantName}?"
	message="Your form has been submitted! Would you like to save {fields.participantName}'s information as a profile so you can quickly fill out future forms?"
	confirmLabel="Save Profile"
	confirmVariant="default"
	onConfirm={saveProfileAndRedirect}
	onCancel={skipSaveAndRedirect}
	loading={saveProfileLoading}
/>

<Modal bind:open={attachPreviewOpen} size="fullscreen" onclose={closeAttachmentPreview}>
	{#snippet header({ close })}
		<div class="flex items-center justify-between border-b px-4 py-3">
			<h3 class="font-semibold">{attachPreviewName}</h3>
			<div class="flex gap-2">
				<Button variant="ghost" size="sm" onclick={close}>Close</Button>
			</div>
		</div>
	{/snippet}
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
</Modal>
