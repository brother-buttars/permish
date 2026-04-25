<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import { Input } from "$lib/components/ui/input";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import { inferProgramFromOrgs } from "$lib/utils/organizations";
	import { parseOrgs } from "$lib/utils/events";
	import { Select } from "$lib/components/ui/select";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { PageHeader, PageContainer, SegmentedTabs, FilterPanel } from "$lib/components/molecules";
	import { SubmissionListView } from "$lib/components/organisms";
	import { useDeleteConfirm, usePdfPreview, useAuthRequired } from "$lib/components/composables";

	let view = $state<'planner' | 'parent'>('planner');
	let allSubmissions: any[] = $state([]);
	let mySubmissions: any[] = $state([]);
	let search = $state('');
	let eventFilter = $state('');
	let isPlanner = $state(false);

	// Unique events for filter dropdown
	let uniqueEvents: { id: string; name: string }[] = $state([]);

	let deleting = $state<string | null>(null);
	const del = useDeleteConfirm<string>();
	const pdf = usePdfPreview();

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async (currentUser) => {
			isPlanner = currentUser.role === 'planner' || currentUser.role === 'super';
			view = isPlanner ? 'planner' : 'parent';

			const promises: Promise<any>[] = [];
			if (isPlanner) {
				promises.push(repo.events.getAllSubmissions());
			}
			promises.push(repo.submissions.getMine());

			const results = await Promise.all(promises);

			if (isPlanner) {
				allSubmissions = results[0];
				mySubmissions = results[1];

				const eventMap = new Map<string, string>();
				allSubmissions.forEach(s => {
					if (s.event_id && s.event_name) {
						eventMap.set(s.event_id, s.event_name);
					}
				});
				uniqueEvents = Array.from(eventMap, ([id, name]) => ({ id, name }));
			} else {
				mySubmissions = results[0];
			}
		},
	});

	let filteredPlannerSubmissions = $derived.by(() => {
		return allSubmissions.filter(sub => {
			if (eventFilter && sub.event_id !== eventFilter) return false;
			if (search) {
				const q = search.toLowerCase();
				const nameMatch = sub.participant_name?.toLowerCase().includes(q);
				const contactMatch = sub.emergency_contact?.toLowerCase().includes(q);
				if (!nameMatch && !contactMatch) return false;
			}
			return true;
		});
	});

	let filteredParentSubmissions = $derived.by(() => {
		return mySubmissions.filter(sub => {
			if (search) {
				const q = search.toLowerCase();
				const nameMatch = sub.participant_name?.toLowerCase().includes(q);
				const eventMatch = sub.event_name?.toLowerCase().includes(q);
				if (!nameMatch && !eventMatch) return false;
			}
			return true;
		});
	});

	function confirmDeleteSubmission() {
		const id = del.targetId;
		if (!id) return;
		deleting = id;
		return del.run(async (targetId) => {
			try {
				await repo.submissions.delete(targetId);
				allSubmissions = allSubmissions.filter(s => s.id !== targetId);
				mySubmissions = mySubmissions.filter(s => s.id !== targetId);
				toastSuccess("Submission deleted.");
			} catch (err: any) {
				toastError(err.message || "Failed to delete submission");
			} finally {
				deleting = null;
			}
		});
	}

</script>

<svelte:head><title>Submissions</title></svelte:head>

{#snippet submissionsActions()}
	{#if isPlanner}
		<SegmentedTabs
			bind:value={view}
			tabs={[
				{ value: 'planner', label: 'Activity Manager' },
				{ value: 'parent', label: 'Parent' },
			]}
		/>
	{/if}
{/snippet}

<PageContainer>
	<PageHeader title="Submissions" actions={submissionsActions} />

	<FilterPanel showSearch={false}>
		<div class="flex flex-col gap-4 sm:flex-row">
			<div class="flex-1">
				<Input type="text" placeholder="Search by participant or contact..." bind:value={search} />
			</div>
			{#if view === 'planner' && uniqueEvents.length > 0}
				<Select bind:value={eventFilter}>
					<option value="">All Activities</option>
					{#each uniqueEvents as ev}
						<option value={ev.id}>{ev.name}</option>
					{/each}
				</Select>
			{/if}
		</div>
	</FilterPanel>

	<!-- Content -->
	{#if !auth.ready}
		<LoadingState />
	{:else if view === 'planner'}
		{#if filteredPlannerSubmissions.length > 0}
			<p class="mb-3 text-sm text-muted-foreground">{filteredPlannerSubmissions.length} submission{filteredPlannerSubmissions.length === 1 ? '' : 's'}</p>
		{/if}
		<SubmissionListView
			submissions={filteredPlannerSubmissions}
			showActivity={true}
			getProgram={(sub) => inferProgramFromOrgs(parseOrgs(sub))}
			onPdfPreview={(sub) => pdf.open(sub.id, sub.participant_name || 'submission')}
			onDeleteAsk={(sub) => del.ask(sub.id, sub.participant_name ?? '')}
			{deleting}
			emptyMessage="No submissions found."
		/>
	{:else}
		{#if filteredParentSubmissions.length > 0}
			<p class="mb-3 text-sm text-muted-foreground">{filteredParentSubmissions.length} submission{filteredParentSubmissions.length === 1 ? '' : 's'}</p>
		{/if}
		<SubmissionListView
			submissions={filteredParentSubmissions}
			showActivity={true}
			showEmergencyContact={false}
			showDelete={false}
			getProgram={(sub) => inferProgramFromOrgs(parseOrgs(sub))}
			onPdfPreview={(sub) => pdf.open(sub.id, sub.participant_name || 'submission')}
			emptyMessage="No submissions found."
		/>
	{/if}
</PageContainer>

<PdfModal bind:open={pdf.isOpen} url={pdf.url} name={pdf.name} loading={pdf.loading} onclose={pdf.close} />

<ConfirmModal
	bind:open={del.open}
	title="Delete Submission"
	message='Delete the submission for "{del.targetName}"? This cannot be undone.'
	confirmLabel="Delete"
	confirmVariant="destructive"
	onConfirm={confirmDeleteSubmission}
	loading={del.loading}
/>
