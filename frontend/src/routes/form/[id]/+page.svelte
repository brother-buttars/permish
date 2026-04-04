<script lang="ts">
	import { onMount } from "svelte";
	import { goto, beforeNavigate } from "$app/navigation";
	import { page } from "$app/stores";
	import { getRepository } from '$lib/data';
	import { user } from "$lib/stores/auth";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent,
	} from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import SignaturePad from "$lib/components/SignaturePad.svelte";
	import ProfileSelector from "$lib/components/ProfileSelector.svelte";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import PdfViewer from "$lib/components/PdfViewer.svelte";
	import { linkify } from "$lib/utils/linkify";
	import { formatFileSize } from "$lib/utils/format";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import MedicalInfoSection from "$lib/components/MedicalInfoSection.svelte";
	import FormProgress from "$lib/components/FormProgress.svelte";

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

	// Form fields
	let participantName = $state("");
	let dateOfBirth = $state("");
	let phone = $state("");
	let address = $state("");
	let city = $state("");
	let stateProvince = $state("");
	let emergencyContact = $state("");
	let primaryPhone = $state("");
	let secondaryPhone = $state("");

	// Medical
	let hasSpecialDiet = $state(false);
	let specialDietDetails = $state("");
	let hasAllergies = $state(false);
	let allergyDetails = $state("");
	let medications = $state("");
	let canSelfAdminister = $state(false);

	// Conditions
	let hasChronicIllness = $state(false);
	let chronicIllnessDetails = $state("");
	let hadRecentSurgery = $state(false);
	let recentSurgeryDetails = $state("");
	let activityLimitations = $state("");

	// Other
	let otherAccommodations = $state("");

	// Signatures
	let participantSigValue = $state("hand");
	let participantSigType = $state<"drawn" | "typed" | "hand">("typed");
	let participantSigDate = $state("");
	let guardianSigValue = $state("hand");
	let guardianSigType = $state<"drawn" | "typed" | "hand">("typed");
	let guardianSigDate = $state("");

	// Saved guardian signature from user profile (used when switching away from "hand")
	let savedGuardianSig = $state("");
	let savedGuardianSigType = $state<"drawn" | "typed">("typed");

	// Track whether an existing profile was used
	let usedExistingProfile = $state(false);

	// Save profile modal state
	let saveProfileModalOpen = $state(false);
	let saveProfileLoading = $state(false);
	let pendingSubmissionId = $state('');
	let formDirty = $state(false);
	let formSubmitted = $state(false);

	// Track form changes
	$effect(() => {
		if (participantName || dateOfBirth || phone || address || emergencyContact) {
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

	let computedAge = $derived.by(() => {
		if (!dateOfBirth) return "";
		const today = new Date();
		const dob = new Date(dateOfBirth);
		let age = today.getFullYear() - dob.getFullYear();
		const monthDiff = today.getMonth() - dob.getMonth();
		if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
			age--;
		}
		return age >= 0 ? `${age} years old` : "";
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

	onMount(async () => {
		try {
			const result = await repo.submissions.getFormEvent(data.eventId);
			event = result.event;
			attachments = result.attachments || [];
		} catch (err: any) {
			error = err.message || "Failed to load event";
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
				if (!emergencyContact && p.name) emergencyContact = p.name;
				if (!primaryPhone && p.phone) primaryPhone = p.phone;
			} catch {
				// User profile fetch is optional
			}
		}

		return () => unsub();
	});

	function fillFromProfile(profile: any) {
		if (!profile) {
			usedExistingProfile = false;
			return;
		}
		usedExistingProfile = true;
		participantName = profile.participant_name || "";
		dateOfBirth = profile.participant_dob || "";
		phone = profile.participant_phone || "";
		address = profile.address || "";
		city = profile.city || "";
		stateProvince = profile.state_province || "";
		emergencyContact = profile.emergency_contact || "";
		primaryPhone = profile.emergency_phone_primary || "";
		secondaryPhone = profile.emergency_phone_secondary || "";

		hasSpecialDiet = !!profile.special_diet;
		specialDietDetails = profile.special_diet_details || "";
		hasAllergies = !!profile.allergies;
		allergyDetails = profile.allergies_details || "";
		medications = profile.medications || "";
		canSelfAdminister = !!profile.can_self_administer_meds;

		hasChronicIllness = !!profile.chronic_illness;
		chronicIllnessDetails = profile.chronic_illness_details || "";
		hadRecentSurgery = !!profile.recent_surgery;
		recentSurgeryDetails = profile.recent_surgery_details || "";
		activityLimitations = profile.activity_limitations || "";

		otherAccommodations = profile.other_accommodations || "";
	}

	function validate(): string[] {
		const errors: string[] = [];
		if (!participantName.trim()) errors.push("Participant name is required.");
		if (!dateOfBirth) errors.push("Date of birth is required.");
		if (participantSigType !== "hand" && !participantSigValue) errors.push("Participant signature is required.");
		if (guardianSigType !== "hand" && !guardianSigValue) errors.push("Parent/Guardian signature is required.");
		return errors;
	}

	async function handleSubmit() {
		validationErrors = validate();
		if (validationErrors.length > 0) {
			// Scroll to error summary so mobile users see the errors
			setTimeout(() => {
				document.getElementById('validation-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 50);
			return;
		}

		submitting = true;
		try {
			const formData = {
				participant_name: participantName,
				participant_dob: dateOfBirth,
				participant_phone: phone,
				address,
				city,
				state_province: stateProvince,
				emergency_contact: emergencyContact,
				emergency_phone_primary: primaryPhone,
				emergency_phone_secondary: secondaryPhone,
				special_diet: hasSpecialDiet,
				special_diet_details: hasSpecialDiet ? specialDietDetails : "",
				allergies: hasAllergies,
				allergies_details: hasAllergies ? allergyDetails : "",
				medications,
				can_self_administer_meds: canSelfAdminister,
				chronic_illness: hasChronicIllness,
				chronic_illness_details: hasChronicIllness ? chronicIllnessDetails : "",
				recent_surgery: hadRecentSurgery,
				recent_surgery_details: hadRecentSurgery ? recentSurgeryDetails : "",
				activity_limitations: activityLimitations,
				other_accommodations: otherAccommodations,
				participant_signature: participantSigType === "hand" ? null : participantSigValue,
				participant_signature_type: participantSigType,
				participant_signature_date: participantSigDate,
				guardian_signature: guardianSigType === "hand" ? null : guardianSigValue,
				guardian_signature_type: guardianSigType,
				guardian_signature_date: guardianSigDate,
			};

			const result = await repo.submissions.submit(data.eventId, formData);
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
			await repo.profiles.create({
				participant_name: participantName,
				participant_dob: dateOfBirth,
				participant_phone: phone,
				address,
				city,
				state_province: stateProvince,
				emergency_contact: emergencyContact,
				emergency_phone_primary: primaryPhone,
				emergency_phone_secondary: secondaryPhone,
				special_diet: hasSpecialDiet,
				special_diet_details: specialDietDetails,
				allergies: hasAllergies,
				allergies_details: allergyDetails,
				medications,
				can_self_administer_meds: canSelfAdminister,
				chronic_illness: hasChronicIllness,
				chronic_illness_details: chronicIllnessDetails,
				recent_surgery: hadRecentSurgery,
				recent_surgery_details: recentSurgeryDetails,
				activity_limitations: activityLimitations,
				other_accommodations: otherAccommodations,
			});
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

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<LoadingState message="Loading event..." />
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

					<!-- Contact Information -->
					<section id="section-contact">
						<h2 class="mb-4 text-xl font-semibold">Contact Information</h2>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 sm:col-span-2">
						<Label for="participantName">Participant Name *</Label>
						<Input id="participantName" bind:value={participantName} placeholder="Full name" required />
					</div>
					<div class="space-y-2">
						<Label for="dob">Date of Birth *</Label>
						<Input id="dob" type="date" bind:value={dateOfBirth} required />
						{#if computedAge}
							<p class="text-sm text-muted-foreground">{computedAge}</p>
						{/if}
					</div>
					<div class="space-y-2">
						<Label for="phone">Phone</Label>
						<Input id="phone" type="tel" bind:value={phone} placeholder="(555) 555-5555" />
					</div>
					<div class="space-y-2 sm:col-span-2">
						<Label for="address">Address</Label>
						<Input id="address" bind:value={address} placeholder="Street address" />
					</div>
					<div class="space-y-2">
						<Label for="city">City</Label>
						<Input id="city" bind:value={city} placeholder="City" />
					</div>
					<div class="space-y-2">
						<Label for="state">State/Province</Label>
						<Input id="state" bind:value={stateProvince} placeholder="State or province" />
					</div>
				</div>

				<Separator class="my-6" />

				<h3 id="section-emergency" class="mb-3 text-lg font-medium">Emergency Contact</h3>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2 sm:col-span-2">
						<Label for="emergencyContact">Emergency Contact Name</Label>
						<Input id="emergencyContact" bind:value={emergencyContact} placeholder="Contact name" />
					</div>
					<div class="space-y-2">
						<Label for="primaryPhone">Primary Phone</Label>
						<Input id="primaryPhone" type="tel" bind:value={primaryPhone} placeholder="(555) 555-5555" />
					</div>
					<div class="space-y-2">
						<Label for="secondaryPhone">Secondary Phone</Label>
						<Input id="secondaryPhone" type="tel" bind:value={secondaryPhone} placeholder="(555) 555-5555" />
					</div>
				</div>
			</section>

			<Separator />

			<div id="section-medical">
			<MedicalInfoSection
				bind:hasSpecialDiet
				bind:specialDietDetails
				bind:hasAllergies
				bind:allergyDetails
				bind:medications
				bind:canSelfAdminister
				bind:hasChronicIllness
				bind:chronicIllnessDetails
				bind:hadRecentSurgery
				bind:recentSurgeryDetails
				bind:activityLimitations
				bind:otherAccommodations
			/>
			</div>

			<Separator />

			<!-- Permission Text -->
			<section id="section-permission">
				<Card class="bg-muted/30">
					<CardContent class="py-6">
						<p class="text-sm leading-relaxed">
							I give permission for my child or youth to participate in the event and
							activities listed above. I understand that reasonable safety precautions
							will be taken during these activities and that my child or youth will be
							under qualified supervision. I authorize the adult leaders supervising
							this event to administer emergency treatment to the above-named
							participant for any injuries or illnesses that may occur during the event.
							If I cannot be reached in an emergency, I authorize the leaders to act in
							my behalf in obtaining emergency medical treatment, including
							hospitalization, for the participant.
						</p>
					</CardContent>
				</Card>
			</section>

			<Separator />

			<!-- Signatures -->
			<section id="section-signatures" class="space-y-6">
				<SignaturePad
					label="Participant Signature"
					bind:value={participantSigValue}
					bind:type={participantSigType}
					bind:date={participantSigDate}
					allowHand
				/>

				<Separator />

				<SignaturePad
					label="Parent/Guardian Signature"
					bind:value={guardianSigValue}
					bind:type={guardianSigType}
					bind:date={guardianSigDate}
					initialValue={savedGuardianSig}
					initialType={savedGuardianSigType}
					allowHand
				/>
			</section>

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
</div>

<ConfirmModal
	bind:open={saveProfileModalOpen}
	title="Save Profile for {participantName}?"
	message="Your form has been submitted! Would you like to save {participantName}'s information as a profile so you can quickly fill out future forms?"
	confirmLabel="Save Profile"
	confirmVariant="default"
	onConfirm={saveProfileAndRedirect}
	onCancel={skipSaveAndRedirect}
	loading={saveProfileLoading}
/>

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
