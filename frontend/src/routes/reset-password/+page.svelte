<script lang="ts">
	import { page } from '$app/stores';
	import { getRepository } from '$lib/data';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card';
	import AlertBox from '$lib/components/AlertBox.svelte';

	let token = $derived($page.url.searchParams.get('token') || '');
	let newPassword = $state('');
	let confirmPassword = $state('');
	let submitting = $state(false);
	let success = $state(false);
	let error = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		if (!newPassword || newPassword.length < 8) {
			error = 'Password must be at least 8 characters';
			return;
		}
		if (newPassword !== confirmPassword) {
			error = 'Passwords do not match';
			return;
		}
		submitting = true;
		try {
			const repo = getRepository();
			await repo.auth.resetPassword(token, newPassword);
			success = true;
		} catch (err: any) {
			error = err.message || 'Failed to reset password';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Reset Password — Permish</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Reset Password</CardTitle>
			<CardDescription>Enter your new password</CardDescription>
		</CardHeader>
		{#if !token}
			<CardContent>
				<AlertBox message="Invalid reset link. Please request a new one." />
			</CardContent>
			<CardFooter>
				<a href="/forgot-password" class="w-full">
					<Button class="w-full">Request New Link</Button>
				</a>
			</CardFooter>
		{:else if success}
			<CardContent>
				<div class="rounded-md border border-primary bg-primary/10 p-4 text-sm text-primary">
					<p class="font-medium">Password reset successfully</p>
					<p class="mt-1">You can now sign in with your new password.</p>
				</div>
			</CardContent>
			<CardFooter>
				<a href="/login" class="w-full">
					<Button class="w-full">Sign In</Button>
				</a>
			</CardFooter>
		{:else}
			<form onsubmit={handleSubmit}>
				<CardContent>
					<div class="space-y-4">
						{#if error}
							<AlertBox message={error} />
						{/if}
						<div class="space-y-2">
							<Label for="newPassword">New Password</Label>
							<Input
								id="newPassword"
								type="password"
								placeholder="New password"
								bind:value={newPassword}
								required
							/>
							<p class="text-xs text-muted-foreground">Minimum 8 characters</p>
						</div>
						<div class="space-y-2">
							<Label for="confirmPassword">Confirm Password</Label>
							<Input
								id="confirmPassword"
								type="password"
								placeholder="Confirm new password"
								bind:value={confirmPassword}
								required
							/>
						</div>
					</div>
				</CardContent>
				<CardFooter>
					<Button type="submit" class="w-full" disabled={submitting}>
						{#if submitting}Resetting...{:else}Reset Password{/if}
					</Button>
				</CardFooter>
			</form>
		{/if}
	</Card>
</div>
