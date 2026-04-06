<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, authLoading, checkAuth } from '$lib/stores/auth';
	import { getRepository } from '$lib/data';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '$lib/components/ui/card/index.js';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import AlertBox from '$lib/components/AlertBox.svelte';

	let currentUser: any = $state(null);
	let email = $state('');
	let name = $state('');
	let password = $state('');
	let confirmPassword = $state('');
	let error = $state('');
	let submitting = $state(false);

	onMount(() => {
		const unsubUser = user.subscribe(u => {
			currentUser = u;
			if (u && !u.must_change_password) {
				goto('/dashboard');
			}
		});
		const unsubLoading = authLoading.subscribe(v => {
			if (!v && !currentUser) {
				goto('/login');
			}
		});
		return () => { unsubUser(); unsubLoading(); };
	});

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';

		if (!email || !name || !password) {
			error = 'All fields are required.';
			return;
		}
		if (password.length < 8) {
			error = 'Password must be at least 8 characters.';
			return;
		}
		if (password !== confirmPassword) {
			error = 'Passwords do not match.';
			return;
		}

		submitting = true;
		try {
			const repo = getRepository();
			await (repo.auth as any).setupCredentials(email, name, password);
			toastSuccess('Credentials updated successfully.');
			await checkAuth();
			goto('/dashboard');
		} catch (err: any) {
			error = err.message || 'Failed to update credentials.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Set Up Your Account</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Set Up Your Account</CardTitle>
			<CardDescription>
				Please change your email, name, and password before continuing.
				This is required for security on first login.
			</CardDescription>
		</CardHeader>
		<form onsubmit={handleSubmit}>
			<CardContent class="space-y-4">
				{#if error}
					<AlertBox message={error} />
				{/if}

				<div class="space-y-2">
					<Label for="email">Email</Label>
					<Input id="email" type="email" bind:value={email} placeholder="your-email@example.com" required />
				</div>

				<div class="space-y-2">
					<Label for="name">Full Name</Label>
					<Input id="name" bind:value={name} placeholder="Your full name" required />
				</div>

				<div class="space-y-2">
					<Label for="password">New Password</Label>
					<Input id="password" type="password" bind:value={password} placeholder="Minimum 8 characters" required minlength={8} />
				</div>

				<div class="space-y-2">
					<Label for="confirmPassword">Confirm Password</Label>
					<Input id="confirmPassword" type="password" bind:value={confirmPassword} placeholder="Confirm your password" required />
				</div>

				<Button type="submit" class="w-full" disabled={submitting}>
					{submitting ? 'Saving...' : 'Save & Continue'}
				</Button>
			</CardContent>
		</form>
	</Card>
</div>
