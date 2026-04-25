<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
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
	import LoadingState from "$lib/components/LoadingState.svelte";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import MedicalInfoSection from "$lib/components/MedicalInfoSection.svelte";
	import { PageContainer } from "$lib/components/molecules";

	let { data } = $props();

	let event: any = $state(null);
	let loading = $state(true);
	let error = $state("");
	let submitting = $state(false);
	let validationErrors: string[] = $state([]);

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
	let participantSigType = $state<"drawn" | "typed" | "hand">("hand");
	let participantSigDate = $state("");
	let guardianSigValue = $state("hand");
	let guardianSigType = $state<"drawn" | "typed" | "hand">("hand");
	let guardianSigDate = $state("");

	// Initial values for signature pads (from existing submission)
	let participantInitialValue = $state("");
	let participantInitialType = $state<"drawn" | "typed" | "hand" | undefined>(undefined);
	let guardianInitialValue = $state("");
	let guardianInitialType = $state<"drawn" | "typed" | "hand" | undefined>(undefined);

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

	function fillFromSubmission(sub: any) {
		if (!sub) return;
		participantName = sub.participant_name || "";
		dateOfBirth = sub.participant_dob || "";
		phone = sub.participant_phone || "";
		address = sub.address || "";
		city = sub.city || "";
		stateProvince = sub.state_province || "";
		emergencyContact = sub.emergency_contact || "";
		primaryPhone = sub.emergency_phone_primary || "";
		secondaryPhone = sub.emergency_phone_secondary || "";

		hasSpecialDiet = !!sub.special_diet;
		specialDietDetails = sub.special_diet_details || "";
		hasAllergies = !!sub.allergies;
		allergyDetails = sub.allergies_details || "";
		medications = sub.medications || "";
		canSelfAdminister = !!sub.can_self_administer_meds;

		hasChronicIllness = !!sub.chronic_illness;
		chronicIllnessDetails = sub.chronic_illness_details || "";
		hadRecentSurgery = !!sub.recent_surgery;
		recentSurgeryDetails = sub.recent_surgery_details || "";
		activityLimitations = sub.activity_limitations || "";

		otherAccommodations = sub.other_accommodations || "";

		// Signatures
		if (sub.participant_signature) {
			participantInitialValue = sub.participant_signature;
			participantInitialType = sub.participant_signature_type || "typed";
			participantSigValue = sub.participant_signature;
			participantSigType = sub.participant_signature_type || "drawn";
		}
		participantSigDate = sub.participant_signature_date || "";

		if (sub.guardian_signature) {
			guardianInitialValue = sub.guardian_signature;
			guardianInitialType = sub.guardian_signature_type || "typed";
			guardianSigValue = sub.guardian_signature;
			guardianSigType = sub.guardian_signature_type || "drawn";
		}
		guardianSigDate = sub.guardian_signature_date || "";
	}

	const repo = getRepository();

	onMount(() => {
		(async () => {
			try {
				const [eventResult, submission] = await Promise.all([
					repo.events.getById(data.eventId),
					repo.submissions.getById(data.submissionId),
				]);
				event = eventResult;
				fillFromSubmission(submission);
			} catch (err: any) {
				error = err.message || "Failed to load submission";
			} finally {
				loading = false;
			}
		})();
	});

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

			await repo.submissions.update(data.submissionId, formData);
			goto(`/event/${data.eventId}`);
		} catch (err: any) {
			validationErrors = [err.message || "Failed to update submission. Please try again."];
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Edit Submission — {event?.event_name || "Permish"}</title>
</svelte:head>

<PageContainer>
	{#if loading}
		<LoadingState message="Loading submission..." />
	{:else if error}
		<Card>
			<CardContent class="py-12 text-center">
				<p class="text-destructive">{error}</p>
				<Button variant="link" onclick={() => goto(`/event/${data.eventId}`)}>Back to activity</Button>
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

		<div class="mb-6">
			<Button variant="outline" onclick={() => goto(`/event/${data.eventId}`)}>Back to Activity</Button>
		</div>

		<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-8">
			<!-- Validation Errors -->
			{#if validationErrors.length > 0}
				<div id="validation-errors">
					<AlertBox errors={validationErrors} />
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
					initialValue={participantInitialValue}
					initialType={participantInitialType}
					allowHand
				/>

				<Separator />

				<SignaturePad
					label="Parent/Guardian Signature"
					bind:value={guardianSigValue}
					bind:type={guardianSigType}
					bind:date={guardianSigDate}
					initialValue={guardianInitialValue}
					initialType={guardianInitialType}
					allowHand
				/>
			</section>

			<!-- Submit -->
			<div class="sticky bottom-0 bg-background pb-4 pt-4">
				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}
						Updating...
					{:else}
						Update Submission
					{/if}
				</Button>
			</div>
		</form>
	{/if}
</PageContainer>
