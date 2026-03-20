<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import { api } from "$lib/api";
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

	let { data } = $props();

	let event: any = $state(null);
	let loading = $state(true);
	let error = $state("");
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
	let participantSigValue = $state("");
	let participantSigType = $state<"drawn" | "typed">("drawn");
	let participantSigDate = $state("");
	let guardianSigValue = $state("");
	let guardianSigType = $state<"drawn" | "typed">("drawn");
	let guardianSigDate = $state("");

	// Profile-based initial values for guardian sig
	let guardianInitialValue = $state("");
	let guardianInitialType = $state<"drawn" | "typed" | undefined>(undefined);

	// Save profile modal state
	let saveProfileModalOpen = $state(false);
	let saveProfileLoading = $state(false);

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

	onMount(async () => {
		try {
			const result = await api.getFormEvent(data.eventId);
			event = result.event || result;
		} catch (err: any) {
			error = err.message || "Failed to load event";
		} finally {
			loading = false;
		}

		// Auto-fill guardian signature from user profile if logged in
		if (currentUser) {
			try {
				const data = await api.getUserProfile();
				const p = data.profile;
				if (p.guardian_signature) {
					guardianInitialValue = p.guardian_signature;
					guardianInitialType = p.guardian_signature_type || "typed";
				}
				// Pre-fill emergency contact from user profile if not already filled
				if (!emergencyContact && p.name) emergencyContact = p.name;
				if (!primaryPhone && p.phone) primaryPhone = p.phone;
			} catch {
				// User profile fetch is optional
			}
		}

		return () => unsub();
	});

	function fillFromProfile(profile: any) {
		if (!profile) return;
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

		if (profile.guardian_signature) {
			guardianInitialValue = profile.guardian_signature;
			guardianInitialType = profile.guardian_signature_type || "typed";
		}
	}

	function validate(): string[] {
		const errors: string[] = [];
		if (!participantName.trim()) errors.push("Participant name is required.");
		if (!dateOfBirth) errors.push("Date of birth is required.");
		if (!participantSigValue) errors.push("Participant signature is required.");
		if (!guardianSigValue) errors.push("Parent/Guardian signature is required.");
		return errors;
	}

	async function handleSubmit() {
		validationErrors = validate();
		if (validationErrors.length > 0) return;

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
				participant_signature: participantSigValue,
				participant_signature_type: participantSigType,
				participant_signature_date: participantSigDate,
				guardian_signature: guardianSigValue,
				guardian_signature_type: guardianSigType,
				guardian_signature_date: guardianSigDate,
			};

			await api.submitForm(data.eventId, formData);

			if (currentUser) {
				saveProfileModalOpen = true;
				return; // Wait for modal interaction before redirecting
			}

			goto(`/form/${data.eventId}/success`);
		} catch (err: any) {
			validationErrors = [err.message || "Failed to submit form. Please try again."];
		} finally {
			submitting = false;
		}
	}

	async function saveProfileAndRedirect() {
		saveProfileLoading = true;
		try {
			await api.createProfile({
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
				guardian_signature: guardianSigValue,
				guardian_signature_type: guardianSigType,
			});
		} catch {
			// Profile save is optional, don't block redirect
		} finally {
			saveProfileLoading = false;
			saveProfileModalOpen = false;
			goto(`/form/${data.eventId}/success`);
		}
	}

	function skipSaveAndRedirect() {
		saveProfileModalOpen = false;
		goto(`/form/${data.eventId}/success`);
	}
</script>

<svelte:head>
	<title>{event?.event_name || "Permission Form"}</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8">
	{#if loading}
		<p class="text-center text-muted-foreground">Loading event...</p>
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
			</CardContent>
		</Card>

		<!-- Profile Selector -->
		<div class="mb-6">
			<ProfileSelector onSelect={fillFromProfile} />
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
				<div class="rounded-md border border-destructive/50 bg-destructive/10 p-4">
					<ul class="list-inside list-disc space-y-1 text-sm text-destructive">
						{#each validationErrors as err}
							<li>{err}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- Contact Information -->
			<section>
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

				<h3 class="mb-3 text-lg font-medium">Emergency Contact</h3>
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

			<!-- Medical Information -->
			<section>
				<h2 class="mb-4 text-xl font-semibold">Medical Information</h2>
				<div class="space-y-4">
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input type="checkbox" bind:checked={hasSpecialDiet} class="h-4 w-4 rounded border-input" />
							<span class="text-sm font-medium">Special dietary needs</span>
						</label>
						{#if hasSpecialDiet}
							<Input bind:value={specialDietDetails} placeholder="Describe dietary needs..." />
						{/if}
					</div>

					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input type="checkbox" bind:checked={hasAllergies} class="h-4 w-4 rounded border-input" />
							<span class="text-sm font-medium">Allergies</span>
						</label>
						{#if hasAllergies}
							<Input bind:value={allergyDetails} placeholder="List allergies..." />
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="medications">Medications</Label>
						<Textarea id="medications" bind:value={medications} placeholder="List any current medications..." />
					</div>

					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={canSelfAdminister} class="h-4 w-4 rounded border-input" />
						<span class="text-sm font-medium">Participant can self-administer medications</span>
					</label>
				</div>
			</section>

			<Separator />

			<!-- Conditions That Limit Activity -->
			<section>
				<h2 class="mb-4 text-xl font-semibold">Conditions That Limit Activity</h2>
				<div class="space-y-4">
					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input type="checkbox" bind:checked={hasChronicIllness} class="h-4 w-4 rounded border-input" />
							<span class="text-sm font-medium">Chronic illness or condition</span>
						</label>
						{#if hasChronicIllness}
							<Input bind:value={chronicIllnessDetails} placeholder="Describe condition..." />
						{/if}
					</div>

					<div class="space-y-2">
						<label class="flex items-center gap-2">
							<input type="checkbox" bind:checked={hadRecentSurgery} class="h-4 w-4 rounded border-input" />
							<span class="text-sm font-medium">Surgery or serious illness in the past year</span>
						</label>
						{#if hadRecentSurgery}
							<Input bind:value={recentSurgeryDetails} placeholder="Describe surgery or illness..." />
						{/if}
					</div>

					<div class="space-y-2">
						<Label for="limitations">Activity Limitations</Label>
						<Textarea id="limitations" bind:value={activityLimitations} placeholder="Describe any activity limitations..." />
					</div>
				</div>
			</section>

			<Separator />

			<!-- Other Accommodations -->
			<section>
				<h2 class="mb-4 text-xl font-semibold">Other Accommodations</h2>
				<Textarea bind:value={otherAccommodations} placeholder="Any other accommodations or information the event organizer should know..." />
			</section>

			<Separator />

			<!-- Permission Text -->
			<section>
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
			<section class="space-y-6">
				<SignaturePad
					label="Participant Signature"
					bind:value={participantSigValue}
					bind:type={participantSigType}
					bind:date={participantSigDate}
				/>

				<Separator />

				<SignaturePad
					label="Parent/Guardian Signature"
					bind:value={guardianSigValue}
					bind:type={guardianSigType}
					bind:date={guardianSigDate}
					initialValue={guardianInitialValue}
					initialType={guardianInitialType}
				/>
			</section>

			<!-- Submit -->
			<div class="sticky bottom-0 bg-background pb-4 pt-4">
				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}
						Submitting...
					{:else}
						Submit Permission Form
					{/if}
				</Button>
			</div>
		</form>
	{/if}
</div>

<ConfirmModal
	bind:open={saveProfileModalOpen}
	title="Save as Profile?"
	message="Your form has been submitted! Would you like to save this information as a profile for future use?"
	confirmLabel="Save Profile"
	confirmVariant="default"
	onConfirm={saveProfileAndRedirect}
	onCancel={skipSaveAndRedirect}
	loading={saveProfileLoading}
/>
