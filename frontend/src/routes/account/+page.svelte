<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { getRepository, getDataMode, setDataMode, getBackupManager } from '$lib/data';
	import type { DataMode } from '$lib/data';
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

	let currentUser: any = $state(null);
	let loading = $state(true);
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
	let guardianSigType = $state<"drawn" | "typed">("typed");

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

	const repo = getRepository();
	const unsub = user.subscribe((u) => {
		currentUser = u;
	});

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser) {
				goto("/login");
				return;
			}
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
			} finally {
				loading = false;
			}
		});

		return () => {
			unsubLoading();
			unsub();
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
		applyingMode = true;
		try {
			setDataMode(dataMode);
			initialDataMode = dataMode;
			toastSuccess(`Data storage mode changed to "${dataMode}". Reloading...`);
			// Need to reload to reinitialize repository with new mode
			setTimeout(() => window.location.reload(), 1500);
		} catch (err: any) {
			toastError(err.message || 'Failed to change data mode.');
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

<svelte:head>
	<title>My Account</title>
</svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	<h1 class="mb-6 text-3xl font-bold">My Account</h1>

	{#if loading}
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
						<Input id="email" value={currentUser?.email || ""} disabled />
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

		<!-- Data Storage Mode -->
		<Card>
			<CardHeader>
				<CardTitle>Data Storage</CardTitle>
				<p class="text-sm text-muted-foreground">
					Choose how your data is stored and synced.
				</p>
			</CardHeader>
			<CardContent class="space-y-4">
				<div class="space-y-3">
					<label class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors {dataMode === 'online' ? 'border-primary bg-primary/5' : ''}">
						<input type="radio" name="dataMode" value="online" bind:group={dataMode} class="mt-1" />
						<div>
							<div class="font-medium">Online only</div>
							<div class="text-sm text-muted-foreground">All data stored on server. Requires internet.</div>
						</div>
					</label>

					<label class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors {dataMode === 'hybrid' ? 'border-primary bg-primary/5' : ''}">
						<input type="radio" name="dataMode" value="hybrid" bind:group={dataMode} class="mt-1" />
						<div>
							<div class="font-medium">Hybrid</div>
							<div class="text-sm text-muted-foreground">Works offline, syncs when connected. Recommended for desktop and mobile.</div>
						</div>
					</label>

					<label class="flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-muted/50 transition-colors {dataMode === 'local' ? 'border-primary bg-primary/5' : ''}">
						<input type="radio" name="dataMode" value="local" bind:group={dataMode} class="mt-1" />
						<div>
							<div class="font-medium">Local only</div>
							<div class="text-sm text-muted-foreground">Data never leaves this device. No sync, complete privacy.</div>
						</div>
					</label>
				</div>

				{#if dataMode !== initialDataMode}
					<div class="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-3 text-sm">
						{#if initialDataMode === 'online' && dataMode === 'hybrid'}
							Switching to hybrid will download your data for offline use. This may take a moment.
						{:else if initialDataMode === 'local' && dataMode === 'hybrid'}
							Switching to hybrid will upload your local data to the server.
						{:else if dataMode === 'local'}
							Local-only mode means no sync. Pending changes will remain pending until you switch back.
						{:else if initialDataMode === 'hybrid' && dataMode === 'online'}
							Switching to online will push pending changes first, then remove local data.
						{/if}
					</div>
					<Button onclick={applyDataMode} variant="outline" class="w-full" disabled={applyingMode}>
						{applyingMode ? "Applying..." : "Apply Changes"}
					</Button>
				{/if}
			</CardContent>
		</Card>

		<!-- Backup & Restore (only visible in local/hybrid mode) -->
		{#if dataMode === 'local' || dataMode === 'hybrid'}
			<Card>
				<CardHeader>
					<CardTitle>Backup & Restore</CardTitle>
					<p class="text-sm text-muted-foreground">
						Export your data as an encrypted backup file, or restore from a previous backup.
					</p>
				</CardHeader>
				<CardContent class="space-y-4">
					<!-- Export section -->
					<div class="space-y-2">
						<Label for="backupPassphrase">Encryption Passphrase (optional)</Label>
						<Input id="backupPassphrase" type="password" bind:value={backupPassphrase} placeholder="Leave empty for unencrypted backup" />
					</div>
					<Button onclick={handleExport} variant="outline" class="w-full" disabled={exporting}>
						{exporting ? "Exporting..." : "Export Backup"}
					</Button>

					<Separator />

					<!-- Import section -->
					<div class="space-y-2">
						<Label for="restoreFile">Restore from Backup</Label>
						<Input id="restoreFile" type="file" accept=".permish-backup" onchange={handleFileSelect} />
					</div>
					{#if restoreFile}
						<div class="space-y-2">
							<Label for="restorePassphrase">Decryption Passphrase</Label>
							<Input id="restorePassphrase" type="password" bind:value={restorePassphrase} placeholder="Enter passphrase if backup was encrypted" />
						</div>
						<Button onclick={() => showRestoreConfirm = true} variant="destructive" class="w-full" disabled={restoring}>
							{restoring ? "Restoring..." : "Restore Backup"}
						</Button>
					{/if}
				</CardContent>
			</Card>
		{/if}

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
</div>
