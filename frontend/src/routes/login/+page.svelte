<script lang="ts">
	import { goto } from '$app/navigation';
	import { login } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card/index.js';
	import AlertBox from "$lib/components/AlertBox.svelte";
	import InstallPrompt from "$lib/components/InstallPrompt.svelte";

	let email = $state('');
	let password = $state('');
	let error = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		submitting = true;
		try {
			await login(email, password);
			// Check for a return URL (e.g., from /import-event)
			const returnUrl = typeof window !== 'undefined' && localStorage.getItem('permish_return_url');
			if (returnUrl) {
				localStorage.removeItem('permish_return_url');
				goto(returnUrl);
			} else {
				goto('/dashboard');
			}
		} catch (err: any) {
			error = err.message || 'Login failed';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Login</CardTitle>
			<CardDescription>Sign in to your account</CardDescription>
		</CardHeader>
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
					<div class="space-y-2">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							placeholder="Your password"
							bind:value={password}
							required
						/>
					</div>
					<div class="text-right">
						<a href="/forgot-password" class="text-xs text-muted-foreground hover:text-primary underline">Forgot password?</a>
					</div>
				</div>
			</CardContent>
			<CardFooter class="flex flex-col gap-4">
				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}Signing in...{:else}Sign In{/if}
				</Button>
				<p class="text-sm text-muted-foreground text-center">
					Don't have an account?
					<a href="/register" class="text-primary underline hover:no-underline">Register</a>
				</p>
				<InstallPrompt />

				<a href="/server-settings" class="text-xs text-muted-foreground hover:text-foreground transition-colors">
					Connect to a different server
				</a>
			</CardFooter>
		</form>
	</Card>
</div>
