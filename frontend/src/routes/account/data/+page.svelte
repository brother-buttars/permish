<script lang="ts">
	import { getRepository, getDataMode, setDataMode, getBackupManager, getSyncManager } from '$lib/data';
	import { useAuthRequired } from "$lib/components/composables";
	import type { DataMode } from '$lib/data';
	import { pullDataToLocal } from '$lib/data/migration';
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import DataModeSection from "../_components/DataModeSection.svelte";
	import BackupRestoreSection from "../_components/BackupRestoreSection.svelte";

	let dataMode = $state<DataMode>(getDataMode());
	let initialDataMode = $state<DataMode>(getDataMode());
	let applyingMode = $state(false);
	let migrationProgress = $state('');
	let showOnlineWarning = $state(false);

	let backupPassphrase = $state('');
	let exporting = $state(false);
	let restoreFile = $state<File | null>(null);
	let restorePassphrase = $state('');
	let restoring = $state(false);
	let showRestoreConfirm = $state(false);

	const repo = getRepository();
	const auth = useAuthRequired({});

	async function applyDataMode() {
		if (dataMode === 'online' && (initialDataMode === 'local' || initialDataMode === 'hybrid')) {
			showOnlineWarning = true;
			return;
		}
		await doModeSwitch();
	}

	async function doModeSwitch() {
		applyingMode = true;
		migrationProgress = '';

		try {
			const from = initialDataMode;
			const to = dataMode;

			if (from === 'online' && (to === 'hybrid' || to === 'local')) {
				migrationProgress = 'Preparing local database...';

				const { createPlatformDatabase } = await import('$lib/data/local/platform-database');
				const { initializeLocalSchema } = await import('$lib/data/local/schema');
				const db = await createPlatformDatabase();
				await initializeLocalSchema(db);

				if (auth.user) {
					const existing = await db.query('SELECT id FROM users WHERE email = ?', [auth.user.email]);
					if (existing.length === 0) {
						const encoder = new TextEncoder();
						const hashBuf = await crypto.subtle.digest('SHA-256', encoder.encode('temp-migration'));
						const hash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
						await db.execute(
							'INSERT INTO users (id, email, password_hash, name, role) VALUES (?, ?, ?, ?, ?)',
							[auth.user.id, auth.user.email, hash, auth.user.name, auth.user.role]
						);
					}
				}

				migrationProgress = 'Downloading your data...';
				const result = await pullDataToLocal(repo, db, (p) => {
					migrationProgress = p.step;
				});

				toastSuccess(`Downloaded ${result.events} events, ${result.profiles} profiles, ${result.submissions} submissions.`);
				db.close();
			}

			if (to === 'online' && (from === 'hybrid' || from === 'local')) {
				if (from === 'hybrid') {
					const mgr = getSyncManager();
					if (mgr) {
						const count = await mgr.getPendingCount();
						if (count > 0) {
							migrationProgress = `Pushing ${count} pending changes...`;
							await mgr.sync();
						}
					}
				}
			}

			setDataMode(to);
			initialDataMode = to;
			migrationProgress = 'Reloading...';
			setTimeout(() => window.location.reload(), 1000);
		} catch (err: any) {
			toastError(err.message || 'Failed to switch data mode.');
			migrationProgress = '';
		} finally {
			applyingMode = false;
		}
	}

	async function handleExport() {
		const mgr = getBackupManager();
		if (!mgr) {
			toastError('Backup is only available in local or hybrid mode.');
			return;
		}
		exporting = true;
		try {
			const { blob, metadata } = await mgr.createBackup(backupPassphrase || undefined);
			mgr.downloadBackup(blob);
			toastSuccess(`Backup exported: ${metadata.recordCounts.events} events, ${metadata.recordCounts.submissions} submissions.`);
			backupPassphrase = '';
		} catch (err: any) {
			toastError(err.message || 'Export failed.');
		} finally {
			exporting = false;
		}
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		restoreFile = input.files?.[0] || null;
	}

	async function handleRestore() {
		const mgr = getBackupManager();
		if (!mgr || !restoreFile) return;

		restoring = true;
		try {
			const metadata = await mgr.restoreBackup(restoreFile, restorePassphrase || undefined);
			toastSuccess(`Backup restored: ${metadata.recordCounts.events} events, ${metadata.recordCounts.submissions} submissions. Reloading...`);
			restoreFile = null;
			restorePassphrase = '';
			setTimeout(() => window.location.reload(), 1500);
		} catch (err: any) {
			toastError(err.message || 'Restore failed.');
		} finally {
			restoring = false;
		}
	}
</script>

<div class="space-y-6">
	<DataModeSection
		bind:dataMode
		{initialDataMode}
		{migrationProgress}
		{applyingMode}
		onApply={applyDataMode}
	/>

	{#if dataMode === 'local' || dataMode === 'hybrid'}
		<BackupRestoreSection
			bind:backupPassphrase
			bind:restorePassphrase
			{restoreFile}
			{exporting}
			{restoring}
			onExport={handleExport}
			onFileSelect={handleFileSelect}
			onAskRestore={() => showRestoreConfirm = true}
		/>
	{/if}
</div>

<ConfirmModal
	open={showRestoreConfirm}
	title="Restore Backup"
	message="This will replace all local data with the backup contents. This action cannot be undone."
	confirmLabel="Restore"
	onConfirm={() => { showRestoreConfirm = false; handleRestore(); }}
	onCancel={() => showRestoreConfirm = false}
/>

<ConfirmModal
	open={showOnlineWarning}
	title="Switch to Online Only"
	message={initialDataMode === 'local'
		? "Local-only data cannot be uploaded to the server. Any data that hasn't been manually exported will only exist on this device. Continue?"
		: "Pending changes will be synced first, then local data will be removed. Continue?"}
	confirmLabel="Switch to Online"
	onConfirm={() => { showOnlineWarning = false; doModeSwitch(); }}
	onCancel={() => showOnlineWarning = false}
/>
