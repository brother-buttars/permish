<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { getDataMode, getSyncManager } from '$lib/data';
	import type { SyncStatus } from '$lib/data/sync/manager';
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess } from "$lib/stores/toast";
	import SyncSection from "../_components/SyncSection.svelte";

	let syncStatus = $state<SyncStatus>('idle');
	let pendingCount = $state(0);
	let failedChanges = $state<any[]>([]);
	let syncUnsub: (() => void) | null = null;
	let syncPollTimer: ReturnType<typeof setInterval> | null = null;
	let showDiscardConfirm = $state(false);
	let discardTargetId = $state<string | null>(null);

	onMount(() => {
		// Sync tab only meaningful in hybrid mode — bounce to /account/data otherwise.
		if (getDataMode() !== 'hybrid') {
			goto('/account/data', { replaceState: true });
			return;
		}

		const mgr = getSyncManager();
		if (mgr) {
			syncStatus = mgr.status;
			syncUnsub = mgr.onStatusChange((s) => { syncStatus = s; });

			async function refreshSyncState() {
				if (mgr) {
					pendingCount = await mgr.getPendingCount();
					failedChanges = await mgr.getFailedChanges();
				}
			}
			refreshSyncState();
			syncPollTimer = setInterval(refreshSyncState, 5000);
		}

		return () => {
			syncUnsub?.();
			if (syncPollTimer) clearInterval(syncPollTimer);
		};
	});

	async function triggerSync() {
		const mgr = getSyncManager();
		await mgr?.sync();
		if (mgr) {
			pendingCount = await mgr.getPendingCount();
			failedChanges = await mgr.getFailedChanges();
		}
	}

	async function handleRetry(changeId: string) {
		const mgr = getSyncManager();
		await mgr?.retryChange(changeId);
		if (mgr) {
			pendingCount = await mgr.getPendingCount();
			failedChanges = await mgr.getFailedChanges();
		}
	}

	async function handleDiscard(changeId: string) {
		const mgr = getSyncManager();
		await mgr?.discardChange(changeId);
		if (mgr) {
			pendingCount = await mgr.getPendingCount();
			failedChanges = await mgr.getFailedChanges();
		}
		toastSuccess('Change discarded.');
	}
</script>

<SyncSection
	{syncStatus}
	{pendingCount}
	{failedChanges}
	onSync={triggerSync}
	onRetry={handleRetry}
	onAskDiscard={(id) => { discardTargetId = id; showDiscardConfirm = true; }}
/>

<ConfirmModal
	open={showDiscardConfirm}
	title="Discard Change"
	message="This change will be permanently removed and will not be synced to the server. This action cannot be undone."
	confirmLabel="Discard"
	onConfirm={() => { showDiscardConfirm = false; if (discardTargetId) handleDiscard(discardTargetId); }}
	onCancel={() => { showDiscardConfirm = false; discardTargetId = null; }}
/>
