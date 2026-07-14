<script lang="ts">
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import { toastSuccess } from "$lib/stores/toast";

	let changingPassword = $state(false);
	let currentPassword = $state("");
	let newPassword = $state("");
	let confirmPassword = $state("");
	let passwordError = $state("");

	const repo = getRepository();

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
</script>

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
