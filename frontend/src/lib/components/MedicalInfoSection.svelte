<script lang="ts">
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Textarea } from "$lib/components/ui/textarea";
	import { Separator } from "$lib/components/ui/separator";
	import PresetPicker from "$lib/components/PresetPicker.svelte";
	import { getPresetItems, buildMedicalString, parseMedicalString } from "$lib/utils/medicalPresets";

	let {
		hasSpecialDiet = $bindable(false),
		specialDietDetails = $bindable(""),
		hasAllergies = $bindable(false),
		allergyDetails = $bindable(""),
		medications = $bindable(""),
		canSelfAdminister = $bindable(false),
		hasChronicIllness = $bindable(false),
		chronicIllnessDetails = $bindable(""),
		hadRecentSurgery = $bindable(false),
		recentSurgeryDetails = $bindable(""),
		activityLimitations = $bindable(""),
		otherAccommodations = $bindable(""),
	}: {
		hasSpecialDiet: boolean;
		specialDietDetails: string;
		hasAllergies: boolean;
		allergyDetails: string;
		medications: string;
		canSelfAdminister: boolean;
		hasChronicIllness: boolean;
		chronicIllnessDetails: string;
		hadRecentSurgery: boolean;
		recentSurgeryDetails: string;
		activityLimitations: string;
		otherAccommodations: string;
	} = $props();

	// --- Allergy presets ---
	const allergyItems = getPresetItems('allergies');
	let allergyPresets = $state<string[]>([]);
	let allergyCustom = $state('');
	let lastBuiltAllergy = '';

	// Initialize from prop
	{
		const parsed = parseMedicalString(allergyDetails, allergyItems);
		allergyPresets = parsed.selected;
		allergyCustom = parsed.custom;
		lastBuiltAllergy = allergyDetails;
	}

	$effect(() => {
		const built = buildMedicalString(allergyPresets, allergyCustom);
		if (allergyDetails !== lastBuiltAllergy && allergyDetails !== built) {
			// External change — re-parse
			const parsed = parseMedicalString(allergyDetails, allergyItems);
			allergyPresets = parsed.selected;
			allergyCustom = parsed.custom;
			lastBuiltAllergy = allergyDetails;
		} else {
			lastBuiltAllergy = built;
			allergyDetails = built;
		}
	});

	// --- Diet presets ---
	const dietItems = getPresetItems('special_diet');
	let dietPresets = $state<string[]>([]);
	let dietCustom = $state('');
	let lastBuiltDiet = '';

	{
		const parsed = parseMedicalString(specialDietDetails, dietItems);
		dietPresets = parsed.selected;
		dietCustom = parsed.custom;
		lastBuiltDiet = specialDietDetails;
	}

	$effect(() => {
		const built = buildMedicalString(dietPresets, dietCustom);
		if (specialDietDetails !== lastBuiltDiet && specialDietDetails !== built) {
			const parsed = parseMedicalString(specialDietDetails, dietItems);
			dietPresets = parsed.selected;
			dietCustom = parsed.custom;
			lastBuiltDiet = specialDietDetails;
		} else {
			lastBuiltDiet = built;
			specialDietDetails = built;
		}
	});

	// --- Chronic illness presets ---
	const chronicItems = getPresetItems('chronic_illness');
	let chronicPresets = $state<string[]>([]);
	let chronicCustom = $state('');
	let lastBuiltChronic = '';

	{
		const parsed = parseMedicalString(chronicIllnessDetails, chronicItems);
		chronicPresets = parsed.selected;
		chronicCustom = parsed.custom;
		lastBuiltChronic = chronicIllnessDetails;
	}

	$effect(() => {
		const built = buildMedicalString(chronicPresets, chronicCustom);
		if (chronicIllnessDetails !== lastBuiltChronic && chronicIllnessDetails !== built) {
			const parsed = parseMedicalString(chronicIllnessDetails, chronicItems);
			chronicPresets = parsed.selected;
			chronicCustom = parsed.custom;
			lastBuiltChronic = chronicIllnessDetails;
		} else {
			lastBuiltChronic = built;
			chronicIllnessDetails = built;
		}
	});
</script>

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
				<PresetPicker
					items={dietItems}
					bind:selected={dietPresets}
					bind:customText={dietCustom}
					placeholder="Other dietary needs..."
				/>
			{/if}
		</div>

		<div class="space-y-2">
			<label class="flex items-center gap-2">
				<input type="checkbox" bind:checked={hasAllergies} class="h-4 w-4 rounded border-input" />
				<span class="text-sm font-medium">Allergies</span>
			</label>
			{#if hasAllergies}
				<PresetPicker
					items={allergyItems}
					bind:selected={allergyPresets}
					bind:customText={allergyCustom}
					placeholder="Other allergies..."
				/>
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
				<PresetPicker
					items={chronicItems}
					bind:selected={chronicPresets}
					bind:customText={chronicCustom}
					placeholder="Other conditions..."
				/>
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
	<Textarea bind:value={otherAccommodations} placeholder="Any other accommodations or information the activity organizer should know..." />
</section>
