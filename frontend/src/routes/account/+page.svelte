<script lang="ts">
	import { onMount } from "svelte";
	import { getRepository, getDataMode, setDataMode, getBackupManager, getSyncManager } from '$lib/data';
	import { useAuthRequired } from "$lib/components/composables";
	import type { DataMode } from '$lib/data';
	import type { SyncStatus } from '$lib/data/sync/manager';
	import { pullDataToLocal, pushPendingToRemote, clearLocalDatabase } from '$lib/data/migration';
	import type { MigrationProgress } from '$lib/data/migration';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import SignaturePad from "$lib/components/SignaturePad.svelte";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import LoadingState from "$lib/components/LoadingState.svelte";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import { PageHeader, PageContainer } from "$lib/components/molecules";
	import DataModeSection from "./_components/DataModeSection.svelte";
	import BackupRestoreSection from "./_components/BackupRestoreSection.svelte";
	import SyncSection from "./_components/SyncSection.svelte";

	let saving = $state(false);
	let changingPassword = $state(false);
	let currentPassword = $state("");
	let newPassword = $state("");
	let confirmPassword = $state("");
	let passwordError = $state("");

	let name = $state("");
	let phone = $state("");
	let address = $state("");
	let city = $state("");
	let stateProvince = $state("");
	let guardianSigValue = $state("");
	let guardianSigType = $state<"drawn" | "typed" | "hand">("typed");

	// Data mode state
	let dataMode = $state<DataMode>(getDataMode());
	let initialDataMode = $state<DataMode>(getDataMode());
	let applyingMode = $state(false);

	// Backup state
	let backupPassphrase = $state('');
	let exporting = $state(false);
	let restoreFile = $state<File | null>(null);
	let restorePassphrase = $state('');
	let restoring = $state(false);

	// Confirm modal for restore
	let showRestoreConfirm = $state(false);

	// Sync state (hybrid mode)
	let syncStatus = $state<SyncStatus>('idle');
	let pendingCount = $state(0);
	let failedChanges = $state<any[]>([]);
	let syncUnsub: (() => void) | null = null;
	let syncPollTimer: ReturnType<typeof setInterval> | null = null;
	let showDiscardConfirm = $state(false);
	let discardTargetId = $state<string | null>(null);

	// Migration state
	let migrationProgress = $state('');
	let showOnlineWarning = $state(false);

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async () => {
			try {
				const p = await repo.auth.getProfile();
				name = p.name || "";
				phone = p.phone || "";
				address = p.address || "";
				city = p.city || "";
				stateProvince = p.state_province || "";
				guardianSigValue = p.guardian_signature || "";
				guardianSigType = p.guardian_signature_type || "typed";
			} catch {
				// Use defaults
			}
		},
	});

	onMount(() => {
		// Set up sync monitoring for hybrid mode
		if (getDataMode() === 'hybrid') {
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
		}

		return () => {
			syncUnsub?.();
			if (syncPollTimer) clearInterval(syncPollTimer);
		};
	});

	async function handleSave() {
		saving = true;
		try {
			await repo.auth.updateProfile({
				name,
				phone,
				address,
				city,
				state_province: stateProvince,
				guardian_signature: guardianSigValue,
				guardian_signature_type: guardianSigType,
			});
			toastSuccess("Profile saved successfully.");
		} catch (err: any) {
			toastError(err.message || "Failed to save profile.");
		} finally {
			saving = false;
		}
	}

	async function handlePasswordChange() {
		passwordError = "";
		if (!currentPassword || !newPassword) {
			passwordError = "All fields are required.";
			return;
		}
		if (newPassword.length < 8) {
			passwordError = "New password must be at least 8 characters.";
			return;
		}
		if (newPassword !== confirmPassword) {
			passwordError = "New passwords do not match.";
			return;
		}
		changingPassword = true;
		try {
			await repo.auth.changePassword(currentPassword, newPassword);
			toastSuccess("Password changed successfully.");
			currentPassword = "";
			newPassword = "";
			confirmPassword = "";
		} catch (err: any) {
			passwordError = err.message || "Failed to change password.";
		} finally {
			changingPassword = false;
		}
	}

	async function applyDataMode() {
		// Switching TO online from local/hybrid may lose data — confirm first
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

			// Online → Hybrid or Local: pull data from server to local DB
			if (from === 'online' && (to === 'hybrid' || to === 'local')) {
				migrationProgress = 'Preparing local database...';

				// Create local DB, initialize schema
				const { createPlatformDatabase } = await import('$lib/data/local/platform-database');
				const { initializeLocalSchema } = await import('$lib/data/local/schema');
				const db = await createPlatformDatabase();
				await initializeLocalSchema(db);

				// Also create the local user account (copy from current auth)
				if (auth.user) {
					const existing = await db.query('SELECT id FROM users WHERE email = ?', [auth.user.email]);
					if (existing.length === 0) {
						// Create with a placeholder password — user re-enters on local login
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

			// Local/Hybrid → Online: push pending changes first
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
				// Note: local → online can't push because there's no remote connection in local mode
				// The warning modal handles this case
			}

			// Local → Hybrid: pending changes will sync automatically when SyncManager starts
			// No special migration needed — SyncManager picks up pending_changes on start

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

<svelte:head>
	<title>My Account</title>
</svelte:head>

<PageContainer>
	<PageHeader title="My Account" />

	{#if !auth.ready}
		<LoadingState />
	{:else}
		<form onsubmit={(e) => { e.preventDefault(); handleSave(); }} class="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle>Personal Information</CardTitle>
				</CardHeader>
				<CardContent class="space-y-4">
					<div class="space-y-2">
						<Label for="name">Full Name</Label>
						<Input id="name" bind:value={name} placeholder="Your full name" />
					</div>

					<div class="space-y-2">
						<Label for="email">Email</Label>
						<Input id="email" value={auth.user?.email || ""} disabled />
						<p class="text-xs text-muted-foreground">Email cannot be changed.</p>
					</div>

					<div class="space-y-2">
						<Label for="phone">Phone</Label>
						<Input id="phone" type="tel" bind:value={phone} placeholder="(555) 555-5555" />
					</div>

					<div class="space-y-2">
						<Label for="address">Address</Label>
						<Input id="address" bind:value={address} placeholder="Street address" />
					</div>

					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="city">City</Label>
							<Input id="city" bind:value={city} placeholder="City" />
						</div>
						<div class="space-y-2">
							<Label for="state">State/Province</Label>
							<Input id="state" bind:value={stateProvince} placeholder="State or province" />
						</div>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Guardian Signature</CardTitle>
					<p class="text-sm text-muted-foreground">
						Save your signature here to auto-fill forms.
					</p>
				</CardHeader>
				<CardContent>
					<SignaturePad
						label="Your Signature"
						bind:value={guardianSigValue}
						bind:type={guardianSigType}
						showDate={false}
						initialValue={guardianSigValue}
						initialType={guardianSigType}
					/>
				</CardContent>
			</Card>

			<Button type="submit" class="w-full" disabled={saving}>
				{saving ? "Saving..." : "Save Profile"}
			</Button>
		</form>

		<Separator class="my-8" />

		<!-- Change Password -->
		<Card>
			<CardHeader>
				<CardTitle>Change Password</CardTitle>
			</CardHeader>
			<CardContent>
				<form onsubmit={(e) => { e.preventDefault(); handlePasswordChange(); }} class="space-y-4">
					{#if passwordError}
						<AlertBox message={passwordError} />
					{/if}
					<div class="space-y-2">
						<Label for="currentPassword">Current Password</Label>
						<Input id="currentPassword" type="password" bind:value={currentPassword} />
					</div>
					<div class="space-y-2">
						<Label for="newPassword">New Password</Label>
						<Input id="newPassword" type="password" bind:value={newPassword} />
						<p class="text-xs text-muted-foreground">Minimum 8 characters</p>
					</div>
					<div class="space-y-2">
						<Label for="confirmPassword">Confirm New Password</Label>
						<Input id="confirmPassword" type="password" bind:value={confirmPassword} />
					</div>
					<Button type="submit" variant="outline" class="w-full" disabled={changingPassword}>
						{changingPassword ? "Changing..." : "Change Password"}
					</Button>
				</form>
			</CardContent>
		</Card>

		<Separator class="my-8" />

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

		{#if dataMode === 'hybrid'}
			<SyncSection
				{syncStatus}
				{pendingCount}
				{failedChanges}
				onSync={triggerSync}
				onRetry={handleRetry}
				onAskDiscard={(id) => { discardTargetId = id; showDiscardConfirm = true; }}
			/>
		{/if}

		<!-- Confirm modal for discard -->
		<ConfirmModal
			open={showDiscardConfirm}
			title="Discard Change"
			message="This change will be permanently removed and will not be synced to the server. This action cannot be undone."
			confirmLabel="Discard"
			onConfirm={() => { showDiscardConfirm = false; if (discardTargetId) handleDiscard(discardTargetId); }}
			onCancel={() => { showDiscardConfirm = false; discardTargetId = null; }}
		/>

		<!-- Confirm modal for restore -->
		<ConfirmModal
			open={showRestoreConfirm}
			title="Restore Backup"
			message="This will replace all local data with the backup contents. This action cannot be undone."
			confirmLabel="Restore"
			onConfirm={() => { showRestoreConfirm = false; handleRestore(); }}
			onCancel={() => showRestoreConfirm = false}
		/>
	{/if}

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
</PageContainer>
