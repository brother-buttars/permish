<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from "$lib/data";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Input } from "$lib/components/ui/input";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { toastError } from "$lib/stores/toast";
	import { adminFilter } from "$lib/stores/adminFilter";
	import { formatDate } from "$lib/utils/formatDate";
	import type { AdminSubmission } from "$lib/data/types";

	let submissions: AdminSubmission[] = $state([]);
	let loading = $state(true);
	let search = $state("");

	const repo = getRepository();

	async function load() {
		loading = true;
		try {
			submissions = await repo.admin.listSubmissions({
				groupId: $adminFilter.groupId,
				activityId: $adminFilter.activityId,
			});
		} catch (err: any) {
			toastError(err.message || "Failed to load submissions");
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		void $adminFilter.groupId;
		void $adminFilter.activityId;
		load();
	});

	const filtered = $derived.by(() => {
		if (!search) return submissions;
		const q = search.toLowerCase();
		return submissions.filter(s =>
			s.participant_name?.toLowerCase().includes(q) ||
			s.event_name?.toLowerCase().includes(q) ||
			s.submitter_name?.toLowerCase().includes(q) ||
			s.submitter_email?.toLowerCase().includes(q) ||
			s.group_name?.toLowerCase().includes(q),
		);
	});
</script>

<div class="mb-4 flex items-center justify-between">
	<h2 class="text-xl font-semibold">Submissions</h2>
</div>

<Card class="mb-4">
	<CardContent class="pt-6">
		<Input bind:value={search} placeholder="Search by name, activity, or submitter..." />
	</CardContent>
</Card>

{#if loading}
	<LoadingState />
{:else if filtered.length === 0}
	<EmptyState message="No submissions in this scope." />
{:else}
	<div class="space-y-3">
		{#each filtered as s (s.id)}
			<Card class="cursor-pointer transition hover:drop-shadow-md" onclick={() => goto(`/submissions/${s.id}`)}>
				<CardContent class="py-4">
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0 flex-1">
							<p class="font-medium truncate">{s.participant_name}</p>
							<p class="text-sm text-muted-foreground mt-0.5 truncate">
								{s.event_name}
								{#if s.group_name} · {s.group_name}{/if}
							</p>
							{#if s.submitter_name}
								<p class="text-xs text-muted-foreground mt-0.5 truncate">
									Submitted by {s.submitter_name}
								</p>
							{/if}
						</div>
						<span class="shrink-0 text-xs text-muted-foreground">{formatDate(s.submitted_at, true)}</span>
					</div>
				</CardContent>
			</Card>
		{/each}
	</div>
	<p class="mt-2 text-xs text-muted-foreground">{filtered.length} submission{filtered.length === 1 ? '' : 's'}</p>
{/if}
