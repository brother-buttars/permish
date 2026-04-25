<script lang="ts">
	import { onMount } from "svelte";
	import { getRepository } from '$lib/data';
	import { user } from "$lib/stores/auth";
	import { Label } from "$lib/components/ui/label";
	import { Select } from "$lib/components/ui/select";
	import { getYouthClass, profileMatchesEventOrgs, type YouthProgram } from "$lib/utils/youthClass";

	let { onSelect, eventOrgs = [] }: { onSelect: (profile: any) => void; eventOrgs?: string[] } = $props();

	let profiles: any[] = $state([]);
	let loading = $state(true);
	let selectedId = $state("");
	let currentUser: any = $state(null);

	const unsub = user.subscribe((u) => {
		currentUser = u;
	});

	let filteredProfiles = $derived(
		eventOrgs.length > 0
			? profiles.filter(p => profileMatchesEventOrgs(p.participant_dob, p.youth_program, eventOrgs))
			: profiles
	);

	onMount(() => {
		(async () => {
			if (!currentUser) {
				loading = false;
				return;
			}
			try {
				const repo = getRepository();
				profiles = await repo.profiles.list();
			} catch {
				profiles = [];
			} finally {
				loading = false;
			}
		})();

		return () => unsub();
	});

	function handleChange(e: Event) {
		const target = e.target as HTMLSelectElement;
		selectedId = target.value;
		if (selectedId === "") return;
		if (selectedId === "manual") {
			onSelect(null);
		} else {
			const profile = profiles.find((p) => p.id === selectedId);
			if (profile) onSelect(profile);
		}
	}

	function getClassLabel(profile: any): string {
		if (!profile.youth_program || !profile.participant_dob) return '';
		const yc = getYouthClass(profile.participant_dob, profile.youth_program as YouthProgram);
		return yc ? ` (${yc.label})` : '';
	}
</script>

{#if currentUser}
	<div class="space-y-2">
		<Label>Auto-fill from a saved profile</Label>
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading profiles...</p>
		{:else}
			<Select
				value={selectedId}
				onchange={handleChange}
			>
				<option value="">Select a profile...</option>
				{#each filteredProfiles as profile}
					<option value={profile.id}>
						{profile.participant_name}{getClassLabel(profile)}
					</option>
				{/each}
				<option value="manual">Fill out manually</option>
			</Select>
		{/if}
	</div>
{/if}
