<script lang="ts">
	import { goto } from '$app/navigation';
	import { register } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '$lib/components/ui/card/index.js';

	let name = $state('');
	let email = $state('');
	let password = $state('');
	let role = $state<'planner' | 'parent'>('parent');
	let error = $state('');
	let submitting = $state(false);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		error = '';
		submitting = true;
		try {
			await register(email, password, name, role);
			goto('/dashboard');
		} catch (err: any) {
			error = err.message || 'Registration failed';
		} finally {
			submitting = false;
		}
	}
</script>

<div class="flex items-center justify-center min-h-[calc(100vh-4rem)] px-4">
	<Card class="w-full max-w-md">
		<CardHeader>
			<CardTitle>Register</CardTitle>
			<CardDescription>Create a new account</CardDescription>
		</CardHeader>
		<form onsubmit={handleSubmit}>
			<CardContent>
				<div class="space-y-4">
					{#if error}
						<div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
							{error}
						</div>
					{/if}
					<div class="space-y-2">
						<Label for="name">Name</Label>
						<Input
							id="name"
							type="text"
							placeholder="Your name"
							bind:value={name}
							required
						/>
					</div>
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
							placeholder="Choose a password"
							bind:value={password}
							required
							minlength={6}
						/>
					</div>
					<div class="space-y-2">
						<Label>Role</Label>
						<div class="flex gap-4">
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="role"
									value="parent"
									bind:group={role}
									class="accent-primary"
								/>
								<span class="text-sm">Parent</span>
							</label>
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="radio"
									name="role"
									value="planner"
									bind:group={role}
									class="accent-primary"
								/>
								<span class="text-sm">Event Planner</span>
							</label>
						</div>
					</div>
				</div>
			</CardContent>
			<CardFooter class="flex flex-col gap-4">
				<Button type="submit" class="w-full" disabled={submitting}>
					{#if submitting}Creating account...{:else}Create Account{/if}
				</Button>
				<p class="text-sm text-muted-foreground text-center">
					Already have an account?
					<a href="/login" class="text-primary underline hover:no-underline">Login</a>
				</p>
			</CardFooter>
		</form>
	</Card>
</div>
