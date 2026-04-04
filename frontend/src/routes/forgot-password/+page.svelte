<script lang="ts">
	import { getRepository } from '$lib/data';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card';
	import AlertBox from '$lib/components/AlertBox.svelte';

	let email = $state('');
	let submitting = $state(false);
	let sent = $state(false);
	let error = $state('');

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		if (!email) {
			error = 'Email is required';
			return;
		}
		submitting = true;
		try {
			const repo = getRepository();
			await repo.auth.forgotPassword(email);
			sent = true;
		} catch (err: any) {
			error = err.message || 'Failed to send reset email';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Forgot Password — Permish</title>
</svelte:head>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Forgot Password</CardTitle>
			<CardDescription>Enter your email and we'll send you a reset link</CardDescription>
		</CardHeader>
		{#if sent}
			<CardContent>
				<div class="rounded-md border border-primary bg-primary/10 p-4 text-sm text-primary">
					<p class="font-medium">Check your email</p>
					<p class="mt-1">If an account exists with <strong>{email}</strong>, we've sent a password reset link. Check your inbox and spam folder.</p>
				</div>
			</CardContent>
			<CardFooter>
				<a href="/login" class="w-full">
					<Button variant="outline" class="w-full">Back to Login</Button>
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
							<Label for="email">Email</Label>
							<Input
								id="email"
								type="email"
								placeholder="you@example.com"
								bind:value={email}
								required
							/>
						</div>
					</div>
				</CardContent>
				<CardFooter class="flex flex-col gap-4">
					<Button type="submit" class="w-full" disabled={submitting}>
						{#if submitting}Sending...{:else}Send Reset Link{/if}
					</Button>
					<p class="text-sm text-muted-foreground text-center">
						Remember your password?
						<a href="/login" class="text-primary underline hover:no-underline">Sign in</a>
					</p>
				</CardFooter>
			</form>
		{/if}
	</Card>
</div>
