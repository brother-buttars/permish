<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import {
		Card,
		CardHeader,
		CardTitle,
		CardDescription,
		CardContent,
	} from "$lib/components/ui/card";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import PermissionFormFields from "$lib/components/PermissionFormFields.svelte";
	import { PageContainer } from "$lib/components/molecules";
	import { validateSubmissionForm, buildSubmissionPayload, emptyFields, type SubmissionFormFields, type SignatureType } from "$lib/utils/submissionForm";

	let { data } = $props();

	let event: any = $state(null);
	let loading = $state(true);
	let error = $state("");
	let submitting = $state(false);
	let validationErrors: string[] = $state([]);

	// All form fields in one object (shared component + shared helpers).
	let fields = $state<SubmissionFormFields>(emptyFields());

	// Initial values for signature pads (from the existing submission).
	let participantInitialValue = $state("");
	let participantInitialType = $state<SignatureType | undefined>(undefined);
	let guardianInitialValue = $state("");
	let guardianInitialType = $state<SignatureType | undefined>(undefined);

	function fillFromSubmission(sub: any) {
		if (!sub) return;
		fields.participantName = sub.participant_name || "";
		fields.dateOfBirth = sub.participant_dob || "";
		fields.phone = sub.participant_phone || "";
		fields.address = sub.address || "";
		fields.city = sub.city || "";
		fields.stateProvince = sub.state_province || "";
		fields.emergencyContact = sub.emergency_contact || "";
		fields.primaryPhone = sub.emergency_phone_primary || "";
		fields.secondaryPhone = sub.emergency_phone_secondary || "";

		fields.hasSpecialDiet = !!sub.special_diet;
		fields.specialDietDetails = sub.special_diet_details || "";
		fields.hasAllergies = !!sub.allergies;
		fields.allergyDetails = sub.allergies_details || "";
		fields.medications = sub.medications || "";
		fields.canSelfAdminister = !!sub.can_self_administer_meds;

		fields.hasChronicIllness = !!sub.chronic_illness;
		fields.chronicIllnessDetails = sub.chronic_illness_details || "";
		fields.hadRecentSurgery = !!sub.recent_surgery;
		fields.recentSurgeryDetails = sub.recent_surgery_details || "";
		fields.activityLimitations = sub.activity_limitations || "";

		fields.otherAccommodations = sub.other_accommodations || "";

		// Signatures
		if (sub.participant_signature) {
			participantInitialValue = sub.participant_signature;
			participantInitialType = sub.participant_signature_type || "typed";
			fields.participantSigValue = sub.participant_signature;
			fields.participantSigType = sub.participant_signature_type || "drawn";
		}
		fields.participantSigDate = sub.participant_signature_date || "";

		if (sub.guardian_signature) {
			guardianInitialValue = sub.guardian_signature;
			guardianInitialType = sub.guardian_signature_type || "typed";
			fields.guardianSigValue = sub.guardian_signature;
			fields.guardianSigType = sub.guardian_signature_type || "drawn";
		}
		fields.guardianSigDate = sub.guardian_signature_date || "";
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

	async function handleSubmit() {
		validationErrors = validateSubmissionForm(fields);
		if (validationErrors.length > 0) {
			setTimeout(() => {
				document.getElementById('validation-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 50);
			return;
		}

		submitting = true;
		try {
			await repo.submissions.update(data.submissionId, buildSubmissionPayload(fields));
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

			<PermissionFormFields
				bind:fields
				{participantInitialValue}
				{participantInitialType}
				{guardianInitialValue}
				{guardianInitialType}
			/>

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
