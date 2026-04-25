<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from "$lib/components/composables";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Select } from "$lib/components/ui/select";
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter,
	} from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { formatDate } from "$lib/utils/formatDate";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import { getYouthClass, type YouthProgram } from "$lib/utils/youthClass";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import MedicalInfoSection from "$lib/components/MedicalInfoSection.svelte";
	import { PageHeader, PageContainer } from "$lib/components/molecules";
	import { YouthClassBadge } from "$lib/components/atoms";

	let profiles: any[] = $state([]);
	let editingId: string | null = $state(null);
	let showNewForm = $state(false);
	let saving = $state(false);

	// Delete modal state
	let deleteModalOpen = $state(false);
	let deleteTargetId = $state('');
	let deleteTargetName = $state('');
	let deleteLoading = $state(false);

	// Form state
	let participantName = $state("");
	let dateOfBirth = $state("");
	let phone = $state("");
	let address = $state("");
	let city = $state("");
	let stateProvince = $state("");
	let emergencyContact = $state("");
	let primaryPhone = $state("");
	let secondaryPhone = $state("");
	let hasSpecialDiet = $state(false);
	let specialDietDetails = $state("");
	let hasAllergies = $state(false);
	let allergyDetails = $state("");
	let medications = $state("");
	let canSelfAdminister = $state(false);
	let hasChronicIllness = $state(false);
	let chronicIllnessDetails = $state("");
	let hadRecentSurgery = $state(false);
	let recentSurgeryDetails = $state("");
	let activityLimitations = $state("");
	let otherAccommodations = $state("");
	let youthProgram = $state("");
	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async () => {
			await loadProfiles();

			// Auto-open edit if ?edit=<id> is in URL
			const editId = new URL(window.location.href).searchParams.get('edit');
			if (editId) {
				const profile = profiles.find((p) => p.id === editId);
				if (profile) startEdit(profile);
			}
		},
	});

	async function loadProfiles() {
		try {
			profiles = await repo.profiles.list();
		} catch {
			profiles = [];
		}
	}

	function resetForm() {
		participantName = "";
		dateOfBirth = "";
		phone = "";
		address = "";
		city = "";
		stateProvince = "";
		emergencyContact = "";
		primaryPhone = "";
		secondaryPhone = "";
		hasSpecialDiet = false;
		specialDietDetails = "";
		hasAllergies = false;
		allergyDetails = "";
		medications = "";
		canSelfAdminister = false;
		hasChronicIllness = false;
		chronicIllnessDetails = "";
		hadRecentSurgery = false;
		recentSurgeryDetails = "";
		activityLimitations = "";
		otherAccommodations = "";
		youthProgram = "";
	}

	function fillForm(profile: any) {
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
		youthProgram = profile.youth_program || "";
	}

	function startEdit(profile: any) {
		editingId = profile.id;
		showNewForm = false;
		fillForm(profile);
	}

	function startNew() {
		editingId = null;
		showNewForm = true;
		resetForm();
	}

	function cancelEdit() {
		editingId = null;
		showNewForm = false;
		resetForm();
	}

	function getFormData() {
		return {
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
			youth_program: youthProgram || null,
		};
	}

	async function saveProfile() {
		if (!participantName.trim()) {
			toastError("Participant name is required.");
			return;
		}
		saving = true;
		try {
			if (editingId) {
				await repo.profiles.update(editingId, getFormData());
			} else {
				await repo.profiles.create(getFormData());
			}
			await loadProfiles();
			cancelEdit();
			toastSuccess("Profile saved successfully.");
		} catch (err: any) {
			toastError(err.message || "Failed to save profile.");
		} finally {
			saving = false;
		}
	}

	async function confirmDeleteProfile() {
		deleteLoading = true;
		try {
			await repo.profiles.delete(deleteTargetId);
			deleteModalOpen = false;
			await loadProfiles();
			toastSuccess("Profile deleted.");
		} catch (err: any) {
			toastError(err.message || "Failed to delete profile.");
		} finally {
			deleteLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Youth Profiles</title>
</svelte:head>

{#snippet profilesActions()}
	{#if !showNewForm && !editingId}
		<Button onclick={startNew}>Add New Profile</Button>
	{/if}
{/snippet}

<PageContainer>
	<PageHeader title="Youth Profiles" actions={profilesActions} />

	{#if !auth.ready}
		<LoadingState />
	{:else}
		<!-- New / Edit form -->
		{#if showNewForm || editingId}
			<Card class="mb-6">
				<CardHeader>
					<CardTitle>{editingId ? "Edit Profile" : "New Profile"}</CardTitle>
				</CardHeader>
				<CardContent>
					<form onsubmit={(e) => { e.preventDefault(); saveProfile(); }} class="space-y-6">
						<!-- Basic Info -->
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2 sm:col-span-2">
								<Label for="participantName">Participant Name *</Label>
								<Input id="participantName" bind:value={participantName} placeholder="Full name" required />
							</div>
							<div class="space-y-2">
								<Label for="dob">Date of Birth</Label>
								<Input id="dob" type="date" bind:value={dateOfBirth} />
							</div>
							<div class="space-y-2">
								<Label for="phone">Phone</Label>
								<Input id="phone" type="tel" bind:value={phone} placeholder="(555) 555-5555" />
							</div>
							<div class="space-y-2 sm:col-span-2">
								<Label for="youthProgram">Youth Program</Label>
								<Select
									id="youthProgram"
									bind:value={youthProgram}
								>
									<option value="">Not set</option>
									<option value="young_men">Young Men</option>
									<option value="young_women">Young Women</option>
								</Select>
								{#if youthProgram && dateOfBirth}
									{@const yc = getYouthClass(dateOfBirth, youthProgram as YouthProgram)}
									{#if yc}
										<p class="text-sm text-muted-foreground">
											Auto-assigned class: <span class="font-medium {yc.program === 'young_men' ? 'text-blue-600 dark:text-blue-400' : 'text-pink-600 dark:text-pink-400'}">{yc.label}</span>
										</p>
									{:else}
										<p class="text-sm text-muted-foreground">Age not in youth range (12–18)</p>
									{/if}
								{/if}
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

						<Separator />

						<!-- Emergency Contact -->
						<h3 class="text-lg font-medium">Emergency Contact</h3>
						<div class="grid gap-4 sm:grid-cols-2">
							<div class="space-y-2 sm:col-span-2">
								<Label for="ec">Emergency Contact Name</Label>
								<Input id="ec" bind:value={emergencyContact} placeholder="Contact name" />
							</div>
							<div class="space-y-2">
								<Label for="ecPhone">Primary Phone</Label>
								<Input id="ecPhone" type="tel" bind:value={primaryPhone} placeholder="(555) 555-5555" />
							</div>
							<div class="space-y-2">
								<Label for="ecPhone2">Secondary Phone</Label>
								<Input id="ecPhone2" type="tel" bind:value={secondaryPhone} placeholder="(555) 555-5555" />
							</div>
						</div>

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

						<div class="flex gap-3">
							<Button type="submit" disabled={saving}>
								{#if saving}Saving...{:else}Save Profile{/if}
							</Button>
							<Button type="button" variant="outline" onclick={cancelEdit}>Cancel</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		{/if}

		<!-- Profile List -->
		{#if profiles.length === 0 && !showNewForm}
			<Card>
				<CardContent class="py-12 text-center">
					<p class="text-muted-foreground">No youth profiles yet.</p>
					<Button variant="link" onclick={startNew}>Add your first profile</Button>
				</CardContent>
			</Card>
		{:else}
			<div class="grid gap-4">
				{#each profiles as profile}
					{#if editingId !== profile.id}
						<Card>
							<CardContent class="flex items-center justify-between py-4">
								<div class="flex items-center gap-3">
									<YouthIcon program={profile.youth_program} />
									<div>
										<div class="flex items-center gap-2">
											<p class="font-medium">{profile.participant_name}</p>
											{#if profile.youth_program && profile.participant_dob}
												{@const yc = getYouthClass(profile.participant_dob, profile.youth_program as YouthProgram)}
												{#if yc}
													<YouthClassBadge label={yc.label} program={yc.program} />
												{/if}
											{/if}
										</div>
									{#if profile.participant_dob}
										<p class="text-sm text-muted-foreground">DOB: {formatDate(profile.participant_dob)}</p>
									{/if}
									{#if profile.emergency_contact}
										<p class="text-sm text-muted-foreground">
											Emergency: {profile.emergency_contact}
											{#if profile.emergency_phone_primary}
												— {profile.emergency_phone_primary}
											{/if}
										</p>
									{/if}
									</div>
								</div>
								<div class="flex gap-2">
									<Button variant="outline" size="sm" onclick={() => startEdit(profile)}>
										Edit
									</Button>
									<Button variant="destructive" size="sm" onclick={() => { deleteModalOpen = true; deleteTargetId = profile.id; deleteTargetName = profile.participant_name; }}>
										Delete
									</Button>
								</div>
							</CardContent>
						</Card>
					{/if}
				{/each}
			</div>
		{/if}
	{/if}
</PageContainer>

<ConfirmModal
	bind:open={deleteModalOpen}
	title="Delete Profile"
	message="Are you sure you want to delete the profile for {deleteTargetName}? This cannot be undone."
	confirmLabel="Delete"
	confirmVariant="destructive"
	onConfirm={confirmDeleteProfile}
	loading={deleteLoading}
/>
