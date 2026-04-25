<script lang="ts">
	import { goto } from "$app/navigation";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Button } from "$lib/components/ui/button";
	import YouthIcon from "$lib/components/YouthIcon.svelte";
	import EmptyState from "$lib/components/EmptyState.svelte";
	import { formatDate } from "$lib/utils/formatDate";
	import type { YouthProgram } from "$lib/utils/youthClass";

	interface Submission {
		id: string;
		event_id?: string;
		event_name?: string;
		participant_name?: string;
		emergency_contact?: string;
		submitted_at?: string;
		[key: string]: unknown;
	}

	let {
		submissions,
		showActivity = false,
		showEmergencyContact = true,
		showDelete = true,
		getProgram,
		getEditUrl = (sub) => `/form/${sub.event_id}/edit/${sub.id}`,
		onPdfPreview,
		onDeleteAsk,
		deleting = null,
		emptyMessage = "No submissions yet.",
		emptyDescription,
	}: {
		submissions: Submission[];
		showActivity?: boolean;
		showEmergencyContact?: boolean;
		showDelete?: boolean;
		getProgram?: (sub: Submission) => YouthProgram | null;
		getEditUrl?: (sub: Submission) => string;
		onPdfPreview: (sub: Submission) => void;
		onDeleteAsk?: (sub: Submission) => void;
		deleting?: string | null;
		emptyMessage?: string;
		emptyDescription?: string;
	} = $props();

	const dash = "—";
</script>

{#if submissions.length === 0}
	<EmptyState message={emptyMessage} description={emptyDescription} />
{:else}
	<!-- Mobile card view -->
	<div class="space-y-3 sm:hidden">
		{#each submissions as sub (sub.id)}
			<Card>
				<CardContent class="py-3 px-4">
					<div class="flex items-center justify-between gap-2">
						<div class="min-w-0 flex-1">
							<div class="flex items-center gap-2">
								<YouthIcon size="sm" program={getProgram?.(sub) ?? null} />
								<p class="font-medium">{sub.participant_name || dash}</p>
							</div>
							{#if showActivity}
								<p class="text-sm text-muted-foreground">{sub.event_name || dash}</p>
							{/if}
							{#if showEmergencyContact}
								<p class="text-sm text-muted-foreground">{sub.emergency_contact || dash}</p>
							{/if}
							<p class="text-xs text-muted-foreground">{(sub.submitted_at && formatDate(sub.submitted_at)) || dash}</p>
						</div>
						<div class="flex gap-1">
							<Button
								variant="outline"
								size="sm"
								class="h-7 text-xs"
								onclick={() => onPdfPreview(sub)}
							>
								PDF
							</Button>
							<Button
								variant="outline"
								size="sm"
								class="h-7 text-xs"
								onclick={() => goto(getEditUrl(sub))}
							>
								Edit
							</Button>
							{#if showDelete && onDeleteAsk}
								<Button
									variant="destructive"
									size="sm"
									class="h-7 text-xs"
									onclick={() => onDeleteAsk(sub)}
									disabled={deleting === sub.id}
								>
									{deleting === sub.id ? "..." : "Delete"}
								</Button>
							{/if}
						</div>
					</div>
				</CardContent>
			</Card>
		{/each}
	</div>

	<!-- Desktop table view -->
	<div class="hidden sm:block overflow-x-auto">
		<table class="w-full text-sm">
			<thead>
				<tr class="border-b">
					<th class="px-4 py-3 text-left font-medium">Participant</th>
					{#if showActivity}
						<th class="px-4 py-3 text-left font-medium">Activity</th>
					{/if}
					{#if showEmergencyContact}
						<th class="px-4 py-3 text-left font-medium">Emergency Contact</th>
					{/if}
					<th class="px-4 py-3 text-left font-medium">Submitted</th>
					<th class="px-4 py-3 text-left font-medium">Actions</th>
				</tr>
			</thead>
			<tbody>
				{#each submissions as sub (sub.id)}
					<tr class="border-b">
						<td class="px-4 py-3">
							<div class="flex items-center gap-2">
								<YouthIcon size="sm" program={getProgram?.(sub) ?? null} />
								{sub.participant_name || dash}
							</div>
						</td>
						{#if showActivity}
							<td class="px-4 py-3">{sub.event_name || dash}</td>
						{/if}
						{#if showEmergencyContact}
							<td class="px-4 py-3">{sub.emergency_contact || dash}</td>
						{/if}
						<td class="px-4 py-3">{(sub.submitted_at && formatDate(sub.submitted_at)) || dash}</td>
						<td class="px-4 py-3">
							<div class="flex gap-1">
								<Button
									variant="outline"
									size="sm"
									class="h-7 text-xs"
									onclick={() => onPdfPreview(sub)}
								>
									PDF
								</Button>
								<Button
									variant="outline"
									size="sm"
									class="h-7 text-xs"
									onclick={() => goto(getEditUrl(sub))}
								>
									Edit
								</Button>
								{#if showDelete && onDeleteAsk}
									<Button
										variant="destructive"
										size="sm"
										class="h-7 text-xs"
										onclick={() => onDeleteAsk(sub)}
										disabled={deleting === sub.id}
									>
										{deleting === sub.id ? "..." : "Delete"}
									</Button>
								{/if}
							</div>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/if}
