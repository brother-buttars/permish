<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import {
		Card,
		CardHeader,
		CardTitle,
		CardContent,
		CardFooter,
	} from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import SignaturePad from "$lib/components/SignaturePad.svelte";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { formatDate } from "$lib/utils/formatDate";

	let profiles: any[] = $state([]);
	let loading = $state(true);
	let currentUser: any = $state(null);
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
	let guardianSigValue = $state("");
	let guardianSigType = $state<"drawn" | "typed">("typed");

	const unsub = user.subscribe((u) => {
		currentUser = u;
	});

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser) {
				goto("/login");
				return;
			}
			await loadProfiles();

			// Auto-open edit if ?edit=<id> is in URL
			const editId = new URL(window.location.href).searchParams.get('edit');
			if (editId) {
				const profile = profiles.find((p) => p.id === editId);
				if (profile) startEdit(profile);
			}
		});

		return () => {
			unsubLoading();
			unsub();
		};
	});

	async function loadProfiles() {
		try {
			const data = await api.listProfiles();
			profiles = data.profiles || data || [];
		} catch {
			profiles = [];
		} finally {
			loading = false;
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
		guardianSigValue = "";
		guardianSigType = "typed";
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
		guardianSigValue = profile.guardian_signature || "";
		guardianSigType = profile.guardian_signature_type || "typed";
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
			guardian_signature: guardianSigValue,
			guardian_signature_type: guardianSigType,
		};
	}

	async function saveProfile() {
		if (!participantName.trim()) {
			alert("Participant name is required.");
			return;
		}
		saving = true;
		try {
			if (editingId) {
				await api.updateProfile(editingId, getFormData());
			} else {
				await api.createProfile(getFormData());
			}
			await loadProfiles();
			cancelEdit();
		} catch (err: any) {
			alert(err.message || "Failed to save profile.");
		} finally {
			saving = false;
		}
	}

	async function confirmDeleteProfile() {
		deleteLoading = true;
		try {
			await api.deleteProfile(deleteTargetId);
			deleteModalOpen = false;
			await loadProfiles();
		} catch (err: any) {
			alert(err.message || "Failed to delete profile.");
		} finally {
			deleteLoading = false;
		}
	}
</script>

<svelte:head>
	<title>Child Profiles</title>
</svelte:head>

<div class="container mx-auto max-w-3xl px-4 py-8">
	<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
		<h1 class="text-3xl font-bold">Child Profiles</h1>
		{#if !showNewForm && !editingId}
			<Button onclick={startNew}>Add New Profile</Button>
		{/if}
	</div>

	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
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

						<!-- Medical -->
						<h3 class="text-lg font-medium">Medical Information</h3>
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
								<Label for="meds">Medications</Label>
								<Textarea id="meds" bind:value={medications} placeholder="List current medications..." />
							</div>

							<label class="flex items-center gap-2">
								<input type="checkbox" bind:checked={canSelfAdminister} class="h-4 w-4 rounded border-input" />
								<span class="text-sm font-medium">Can self-administer medications</span>
							</label>
						</div>

						<Separator />

						<!-- Conditions -->
						<h3 class="text-lg font-medium">Conditions That Limit Activity</h3>
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
								<Textarea id="limitations" bind:value={activityLimitations} placeholder="Describe any limitations..." />
							</div>
						</div>

						<Separator />

						<!-- Other -->
						<div class="space-y-2">
							<Label for="accommodations">Other Accommodations</Label>
							<Textarea id="accommodations" bind:value={otherAccommodations} placeholder="Any other information..." />
						</div>

						<Separator />

						<!-- Guardian Signature -->
						<SignaturePad
							label="Guardian Signature"
							bind:value={guardianSigValue}
							bind:type={guardianSigType}
							showDate={false}
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
					<p class="text-muted-foreground">No child profiles yet.</p>
					<Button variant="link" onclick={startNew}>Add your first profile</Button>
				</CardContent>
			</Card>
		{:else}
			<div class="grid gap-4">
				{#each profiles as profile}
					{#if editingId !== profile.id}
						<Card>
							<CardContent class="flex items-center justify-between py-4">
								<div>
									<p class="font-medium">{profile.participant_name}</p>
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
</div>

<ConfirmModal
	bind:open={deleteModalOpen}
	title="Delete Profile"
	message="Are you sure you want to delete the profile for {deleteTargetName}? This cannot be undone."
	confirmLabel="Delete"
	confirmVariant="destructive"
	onConfirm={confirmDeleteProfile}
	loading={deleteLoading}
/>
