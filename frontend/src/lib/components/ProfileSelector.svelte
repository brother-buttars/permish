<script lang="ts">
	import { onMount } from "svelte";
	import { api } from "$lib/api";
	import { user } from "$lib/stores/auth";
	import { Label } from "$lib/components/ui/label";

	let { onSelect }: { onSelect: (profile: any) => void } = $props();

	let profiles: any[] = $state([]);
	let loading = $state(true);
	let selectedId = $state("");
	let currentUser: any = $state(null);

	const unsub = user.subscribe((u) => {
		currentUser = u;
	});

	onMount(async () => {
		if (!currentUser) {
			loading = false;
			return;
		}
		try {
			const data = await api.listProfiles();
			profiles = data.profiles || data || [];
		} catch {
			profiles = [];
		} finally {
			loading = false;
		}

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
</script>

{#if currentUser}
	<div class="space-y-2">
		<Label>Auto-fill from a saved profile</Label>
		{#if loading}
			<p class="text-sm text-muted-foreground">Loading profiles...</p>
		{:else}
			<select
				class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
				value={selectedId}
				onchange={handleChange}
			>
				<option value="">Select a profile...</option>
				{#each profiles as profile}
					<option value={profile.id}>
						{profile.participant_name}
					</option>
				{/each}
				<option value="manual">Fill out manually</option>
			</select>
		{/if}
	</div>
{/if}
