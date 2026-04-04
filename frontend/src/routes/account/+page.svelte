<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { getRepository } from '$lib/data';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import SignaturePad from "$lib/components/SignaturePad.svelte";
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
	{/if}
</div>
