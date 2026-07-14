<script lang="ts">
	// The shared body of the permission form — Contact, Emergency, Medical,
	// Permission, and Signatures. Used by BOTH the create form (form/[id]) and the
	// edit form (form/[id]/edit/[submissionId]) so the ~30 fields can't drift.
	// All state lives in one bindable `fields` object.
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import SignaturePad from "$lib/components/SignaturePad.svelte";
	import MedicalInfoSection from "$lib/components/MedicalInfoSection.svelte";
	import { computeAgeLabel, type SubmissionFormFields, type SignatureType } from "$lib/utils/submissionForm";

	interface Props {
		fields: SubmissionFormFields;
		/** When true, the optional Emergency + Medical sections collapse behind toggles. */
		progressive?: boolean;
		showEmergency?: boolean;
		showMedical?: boolean;
		participantInitialValue?: string;
		participantInitialType?: SignatureType;
		guardianInitialValue?: string;
		guardianInitialType?: SignatureType;
	}

	let {
		fields = $bindable(),
		progressive = false,
		showEmergency = $bindable(false),
		showMedical = $bindable(false),
		participantInitialValue = "",
		participantInitialType = undefined,
		guardianInitialValue = "",
		guardianInitialType = undefined,
	}: Props = $props();

	let computedAge = $derived(computeAgeLabel(fields.dateOfBirth));
</script>

<!-- Contact Information -->
<section id="section-contact">
	<h2 class="mb-4 text-xl font-semibold">Contact Information</h2>
	<div class="grid gap-4 sm:grid-cols-2">
		<div class="space-y-2 sm:col-span-2">
			<Label for="participantName">Participant Name *</Label>
			<Input id="participantName" bind:value={fields.participantName} placeholder="Full name" required />
		</div>
		<div class="space-y-2">
			<Label for="dob">Date of Birth *</Label>
			<Input id="dob" type="date" bind:value={fields.dateOfBirth} required />
			{#if computedAge}
				<p class="text-sm text-muted-foreground">{computedAge}</p>
			{/if}
		</div>
		<div class="space-y-2">
			<Label for="phone">Phone</Label>
			<Input id="phone" type="tel" bind:value={fields.phone} placeholder="(555) 555-5555" />
		</div>
		<div class="space-y-2 sm:col-span-2">
			<Label for="address">Address</Label>
			<Input id="address" bind:value={fields.address} placeholder="Street address" />
		</div>
		<div class="space-y-2">
			<Label for="city">City</Label>
			<Input id="city" bind:value={fields.city} placeholder="City" />
		</div>
		<div class="space-y-2">
			<Label for="state">State/Province</Label>
			<Input id="state" bind:value={fields.stateProvince} placeholder="State or province" />
		</div>
	</div>

	<Separator class="my-6" />

	<h3 id="section-emergency" class="mb-3 text-lg font-medium">Emergency Contact</h3>
	{#if showEmergency || !progressive}
		<div class="grid gap-4 sm:grid-cols-2">
			<div class="space-y-2 sm:col-span-2">
				<Label for="emergencyContact">Emergency Contact Name</Label>
				<Input id="emergencyContact" bind:value={fields.emergencyContact} placeholder="Contact name" />
			</div>
			<div class="space-y-2">
				<Label for="primaryPhone">Primary Phone</Label>
				<Input id="primaryPhone" type="tel" bind:value={fields.primaryPhone} placeholder="(555) 555-5555" />
			</div>
			<div class="space-y-2">
				<Label for="secondaryPhone">Secondary Phone</Label>
				<Input id="secondaryPhone" type="tel" bind:value={fields.secondaryPhone} placeholder="(555) 555-5555" />
			</div>
		</div>
	{:else}
		<button type="button" onclick={() => (showEmergency = true)} class="w-full rounded-md border border-dashed border-input py-2.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground">
			+ Add an emergency contact <span class="text-xs">(optional)</span>
		</button>
	{/if}
</section>

<Separator />

<div id="section-medical">
	{#if showMedical || !progressive}
		<MedicalInfoSection
			bind:hasSpecialDiet={fields.hasSpecialDiet}
			bind:specialDietDetails={fields.specialDietDetails}
			bind:hasAllergies={fields.hasAllergies}
			bind:allergyDetails={fields.allergyDetails}
			bind:medications={fields.medications}
			bind:canSelfAdminister={fields.canSelfAdminister}
			bind:hasChronicIllness={fields.hasChronicIllness}
			bind:chronicIllnessDetails={fields.chronicIllnessDetails}
			bind:hadRecentSurgery={fields.hadRecentSurgery}
			bind:recentSurgeryDetails={fields.recentSurgeryDetails}
			bind:activityLimitations={fields.activityLimitations}
			bind:otherAccommodations={fields.otherAccommodations}
		/>
	{:else}
		<div>
			<h2 class="mb-3 text-xl font-semibold">Medical &amp; Dietary</h2>
			<button type="button" onclick={() => (showMedical = true)} class="w-full rounded-md border border-dashed border-input py-2.5 text-sm text-muted-foreground transition hover:border-primary hover:text-foreground">
				+ Add allergies, medications, or dietary needs <span class="text-xs">(optional)</span>
			</button>
		</div>
	{/if}
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
		bind:value={fields.participantSigValue}
		bind:type={fields.participantSigType}
		bind:date={fields.participantSigDate}
		initialValue={participantInitialValue}
		initialType={participantInitialType}
		allowHand
	/>

	<Separator />

	<SignaturePad
		label="Parent/Guardian Signature"
		bind:value={fields.guardianSigValue}
		bind:type={fields.guardianSigType}
		bind:date={fields.guardianSigDate}
		initialValue={guardianInitialValue}
		initialType={guardianInitialType}
		allowHand
	/>
</section>
