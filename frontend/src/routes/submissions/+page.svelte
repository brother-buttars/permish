<script lang="ts">
	import { goto } from "$app/navigation";
	import { getRepository } from '$lib/data';
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import PdfModal from "$lib/components/PdfModal.svelte";
	import { inferProgramFromOrgs } from "$lib/utils/organizations";
	import { parseOrgs } from "$lib/utils/events";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import { PageHeader, PageContainer, SegmentedTabs, FilterPanel, AdminFilterBar } from "$lib/components/molecules";
	import { SubmissionListView } from "$lib/components/organisms";
	import { useDeleteConfirm, usePdfPreview, useAuthRequired } from "$lib/components/composables";
	import { adminFilter } from "$lib/stores/adminFilter";

	let view = $state<'planner' | 'parent'>('planner');
	let allSubmissions: any[] = $state([]);
	let mySubmissions: any[] = $state([]);
	let search = $state('');
	let isPlanner = $state(false);

	let deleting = $state<string | null>(null);
	const del = useDeleteConfirm<string>();
	const pdf = usePdfPreview();

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async (currentUser) => {
			isPlanner = currentUser.role === 'super';
			view = isPlanner ? 'planner' : 'parent';

			mySubmissions = await repo.submissions.getMine();
			if (isPlanner) await loadPlanner();
		},
	});

	// Super users get a group/activity scope filter here (the admin Submissions
	// tab folded in). getAllSubmissions carries group_name for scoped display.
	async function loadPlanner() {
		allSubmissions = await repo.events.getAllSubmissions({
			groupId: $adminFilter.groupId,
			activityId: $adminFilter.activityId,
		});
	}

	$effect(() => {
		void $adminFilter.groupId;
		void $adminFilter.activityId;
		if (auth.ready && isPlanner) loadPlanner();
	});

	let filteredPlannerSubmissions = $derived.by(() => {
		return allSubmissions.filter(sub => {
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

	{#if isPlanner && view === 'planner'}
		<AdminFilterBar />
	{/if}

	<FilterPanel bind:search searchPlaceholder="Search by participant or contact..." />

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
