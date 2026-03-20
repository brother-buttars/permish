<script lang="ts">
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { user, authLoading } from "$lib/stores/auth";
	import { api } from "$lib/api";
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import SignaturePad from "$lib/components/SignaturePad.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";

	let currentUser: any = $state(null);
	let loading = $state(true);
	let saving = $state(false);

	let name = $state("");
	let phone = $state("");
	let address = $state("");
	let city = $state("");
	let stateProvince = $state("");
	let guardianSigValue = $state("");
	let guardianSigType = $state<"drawn" | "typed">("typed");

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
				const data = await api.getUserProfile();
				const p = data.profile;
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
			await api.updateUserProfile({
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
</script>

<svelte:head>
	<title>My Account</title>
</svelte:head>

<div class="container mx-auto max-w-2xl px-4 py-8">
	<h1 class="mb-6 text-3xl font-bold">My Account</h1>

	{#if loading}
		<p class="text-center text-muted-foreground">Loading...</p>
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
						Save your signature here to auto-fill permission forms.
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
	{/if}
</div>
