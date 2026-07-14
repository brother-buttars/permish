<script lang="ts">
	import { onMount } from "svelte";
	import { goto, beforeNavigate } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { user } from "$lib/stores/auth";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
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
	import { toastSuccess } from "$lib/stores/toast";

	let { data } = $props();

	let event: any = $state(null);
	let loading = $state(true);
	let error = $state("");
	let submitting = $state(false);
	let validationErrors: string[] = $state([]);
	let saved = $state(false);

	// All form fields in one object (shared component + shared helpers).
	let fields = $state<SubmissionFormFields>(emptyFields());

	// Parents reach this page from /submissions; /event/[id] is a planner page.
	// Route each audience back to the page they can actually use.
	const backDest = $derived(
		$user && event && ($user.role === 'super' || event.created_by === $user.id)
			? `/event/${data.eventId}`
			: '/submissions'
	);
	const backLabel = $derived(backDest === '/submissions' ? 'Back to My Submissions' : 'Back to Activity');

	// Dirty = fields changed since the submission was loaded in.
	let fieldsBaseline = $state(JSON.stringify(emptyFields()));
	const formDirty = $derived(JSON.stringify(fields) !== fieldsBaseline);

	let leaveModalOpen = $state(false);
	let pendingNavUrl: string | null = null;
	let allowLeave = false;
	beforeNavigate(({ cancel, to }) => {
		if (formDirty && !saved && !allowLeave) {
			cancel();
			pendingNavUrl = to?.url.href ?? null;
			leaveModalOpen = true;
		}
	});
	function confirmLeave() {
		allowLeave = true;
		leaveModalOpen = false;
		if (pendingNavUrl) goto(pendingNavUrl);
	}
	function handleBeforeUnload(e: BeforeUnloadEvent) {
		if (formDirty && !saved) {
			e.preventDefault();
			e.returnValue = '';
		}
	}

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

		// Signatures — preserve the stored type even when there is no signature
		// value (a "hand" submission must stay "hand", not flip to the drawn
		// default and fail validation).
		if (sub.participant_signature) {
			participantInitialValue = sub.participant_signature;
			participantInitialType = sub.participant_signature_type || "typed";
			fields.participantSigValue = sub.participant_signature;
		}
		fields.participantSigType = sub.participant_signature_type || fields.participantSigType;
		fields.participantSigDate = sub.participant_signature_date || "";

		if (sub.guardian_signature) {
			guardianInitialValue = sub.guardian_signature;
			guardianInitialType = sub.guardian_signature_type || "typed";
			fields.guardianSigValue = sub.guardian_signature;
		}
		fields.guardianSigType = sub.guardian_signature_type || fields.guardianSigType;
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
				// Loading the existing submission is not a user edit
				fieldsBaseline = JSON.stringify(fields);
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
			saved = true;
			toastSuccess('Submission updated.');
			goto(backDest);
		} catch (err: any) {
			validationErrors = [err.message || "Failed to update submission. Please try again."];
			setTimeout(() => {
				document.getElementById('validation-errors')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
			}, 50);
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
			<Button variant="outline" onclick={() => goto(backDest)}>{backLabel}</Button>
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

<svelte:window on:beforeunload={handleBeforeUnload} />

<ConfirmModal
	bind:open={leaveModalOpen}
	title="Discard changes?"
	message="You have unsaved changes to this submission. If you leave now they will be lost."
	confirmLabel="Discard"
	onConfirm={confirmLeave}
	onCancel={() => (leaveModalOpen = false)}
/>
