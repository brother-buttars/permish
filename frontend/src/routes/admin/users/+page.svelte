<script lang="ts">
	import { getRepository } from '$lib/data';
	import { user as userStore } from '$lib/stores/auth';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card, CardHeader, CardTitle, CardContent } from "$lib/components/ui/card";
	import { Select } from "$lib/components/ui/select";
	import { Badge } from "$lib/components/ui/badge";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import { Modal } from "$lib/components/molecules";
	import { adminFilter } from "$lib/stores/adminFilter";

	let users: any[] = $state([]);

	let showCreateForm = $state(false);
	let newEmail = $state("");
	let newPassword = $state("");
	let newName = $state("");
	let newRole = $state("user");
	let createError = $state("");
	let creating = $state(false);

	let deleteModalOpen = $state(false);
	let deleteTarget: any = $state(null);
	let deleting = $state(false);

	let resetModalOpen = $state(false);
	let resetTarget: any = $state(null);
	let resetPassword = $state("");
	let resetting = $state(false);

	let search = $state("");

	const repo = getRepository();

	async function loadUsers() {
		try {
			users = await repo.admin.listUsers({
				groupId: $adminFilter.groupId,
				activityId: $adminFilter.activityId,
			});
		} catch (err: any) {
			toastError(err.message || "Failed to load users");
		}
	}

	$effect(() => {
		// reload whenever the filter changes
		void $adminFilter.groupId;
		void $adminFilter.activityId;
		loadUsers();
	});

	let filteredUsers = $derived.by(() => {
		if (!search) return users;
		const q = search.toLowerCase();
		return users.filter(u =>
			u.name?.toLowerCase().includes(q) ||
			u.email?.toLowerCase().includes(q) ||
			u.role?.toLowerCase().includes(q)
		);
	});

	async function handleCreateUser() {
		createError = "";
		if (!newEmail || !newPassword || !newName) {
			createError = "All fields are required.";
			return;
		}
		creating = true;
		try {
			await repo.admin.createUser({ email: newEmail, password: newPassword, name: newName, role: newRole });
			toastSuccess("User created successfully.");
			newEmail = ""; newPassword = ""; newName = ""; newRole = "user";
			showCreateForm = false;
			await loadUsers();
		} catch (err: any) {
			createError = err.message || "Failed to create user.";
		} finally {
			creating = false;
		}
	}

	async function handleRoleChange(userId: string, newRole: string) {
		try {
			await repo.admin.updateRole(userId, newRole);
			toastSuccess("Role updated.");
			await loadUsers();
		} catch (err: any) {
			toastError(err.message || "Failed to update role.");
		}
	}

	async function confirmDelete() {
		if (!deleteTarget) return;
		deleting = true;
		try {
			await repo.admin.deleteUser(deleteTarget.id);
			toastSuccess("User deleted.");
			deleteModalOpen = false;
			deleteTarget = null;
			await loadUsers();
		} catch (err: any) {
			toastError(err.message || "Failed to delete user.");
		} finally {
			deleting = false;
		}
	}

	async function confirmResetPassword() {
		if (!resetTarget || !resetPassword) return;
		resetting = true;
		try {
			await repo.admin.resetPassword(resetTarget.id, resetPassword);
			toastSuccess(`Password reset for ${resetTarget.name}.`);
			resetModalOpen = false;
			resetTarget = null;
			resetPassword = "";
		} catch (err: any) {
			toastError(err.message || "Failed to reset password.");
		} finally {
			resetting = false;
		}
	}

	function roleBadgeVariant(role: string): "active" | "past" | "inactive" {
		if (role === 'super') return 'past';
		return 'inactive';
	}
</script>

<div class="mb-4 flex items-center justify-between">
	<h2 class="text-xl font-semibold">Users</h2>
	<Button onclick={() => { showCreateForm = !showCreateForm; }}>
		{showCreateForm ? "Cancel" : "Create User"}
	</Button>
</div>

{#if showCreateForm}
	<Card class="mb-6">
		<CardHeader>
			<CardTitle>Create User</CardTitle>
		</CardHeader>
		<CardContent>
			<form onsubmit={(e) => { e.preventDefault(); handleCreateUser(); }} class="space-y-4">
				{#if createError}
					<AlertBox message={createError} />
				{/if}
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="newName">Name</Label>
						<Input id="newName" bind:value={newName} placeholder="Full name" />
					</div>
					<div class="space-y-2">
						<Label for="newEmail">Email</Label>
						<Input id="newEmail" type="email" bind:value={newEmail} placeholder="user@example.com" />
					</div>
					<div class="space-y-2">
						<Label for="newPassword">Password</Label>
						<Input id="newPassword" type="password" bind:value={newPassword} placeholder="Min 8 characters" />
					</div>
					<div class="space-y-2">
						<Label for="newRole">Role</Label>
						<Select id="newRole" bind:value={newRole}>
							<option value="user">User</option>
							<option value="super">Super Admin</option>
						</Select>
					</div>
				</div>
				<Button type="submit" disabled={creating}>
					{creating ? "Creating..." : "Create User"}
				</Button>
			</form>
		</CardContent>
	</Card>
{/if}

<Card class="mb-6">
	<CardContent class="pt-6">
		<Input bind:value={search} placeholder="Search users by name, email, or role..." />
	</CardContent>
</Card>

<!-- Mobile card view -->
<div class="space-y-3 sm:hidden">
	{#each filteredUsers as u}
		<Card>
			<CardContent class="py-3 px-4">
				<div class="flex items-start justify-between gap-2">
					<div class="min-w-0 flex-1">
						<p class="font-medium truncate">{u.name}</p>
						<p class="text-sm text-muted-foreground truncate">{u.email}</p>
					</div>
					<Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge>
				</div>
				<div class="mt-3 flex flex-wrap gap-2">
					<Select
						value={u.role}
						onchange={(e) => handleRoleChange(u.id, e.currentTarget.value)}
						class="h-8 text-xs flex-1"
					>
						<option value="user">User</option>
						<option value="super">Super</option>
					</Select>
					<Button variant="outline" size="sm" class="h-8 text-xs" onclick={() => { resetTarget = u; resetPassword = ""; resetModalOpen = true; }}>
						Reset PW
					</Button>
					{#if u.id !== $userStore?.id}
						<Button variant="destructive" size="sm" class="h-8 text-xs" onclick={() => { deleteTarget = u; deleteModalOpen = true; }}>
							Delete
						</Button>
					{/if}
				</div>
			</CardContent>
		</Card>
	{/each}
</div>

<!-- Desktop table -->
<div class="hidden sm:block">
	<Card>
		<CardContent class="p-0">
			<div class="overflow-x-auto">
				<table class="w-full text-sm">
					<thead>
						<tr class="border-b">
							<th class="px-4 py-3 text-left font-medium">Name</th>
							<th class="px-4 py-3 text-left font-medium">Email</th>
							<th class="px-4 py-3 text-left font-medium">Role</th>
							<th class="px-4 py-3 text-left font-medium">Actions</th>
						</tr>
					</thead>
					<tbody>
						{#each filteredUsers as u}
							<tr class="border-b">
								<td class="px-4 py-3">{u.name}</td>
								<td class="px-4 py-3 text-muted-foreground">{u.email}</td>
								<td class="px-4 py-3">
									<Select
										value={u.role}
										onchange={(e) => handleRoleChange(u.id, e.currentTarget.value)}
										class="h-8 w-28 text-xs"
									>
										<option value="user">User</option>
										<option value="super">Super</option>
									</Select>
								</td>
								<td class="px-4 py-3">
									<div class="flex gap-1">
										<Button variant="outline" size="sm" class="h-7 text-xs" onclick={() => { resetTarget = u; resetPassword = ""; resetModalOpen = true; }}>
											Reset PW
										</Button>
										{#if u.id !== $userStore?.id}
											<Button variant="destructive" size="sm" class="h-7 text-xs" onclick={() => { deleteTarget = u; deleteModalOpen = true; }}>
												Delete
											</Button>
										{/if}
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</CardContent>
	</Card>
</div>

<p class="mt-2 text-xs text-muted-foreground">{filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'}</p>

<ConfirmModal
	bind:open={deleteModalOpen}
	title="Delete User"
	message="Are you sure you want to delete {deleteTarget?.name} ({deleteTarget?.email})? This cannot be undone."
	confirmLabel="Delete User"
	onConfirm={confirmDelete}
	loading={deleting}
/>

<Modal bind:open={resetModalOpen} size="sm">
	<h3 class="text-lg font-semibold">Reset Password</h3>
	<p class="mt-1 text-sm text-muted-foreground">Set a new password for {resetTarget?.name}</p>
	<form onsubmit={(e) => { e.preventDefault(); confirmResetPassword(); }} class="mt-4 space-y-4">
		<div class="space-y-2">
			<Label for="resetPw">New Password</Label>
			<Input id="resetPw" type="password" bind:value={resetPassword} placeholder="Min 8 characters" />
		</div>
		<div class="flex justify-end gap-3">
			<Button variant="outline" onclick={() => { resetModalOpen = false; }}>Cancel</Button>
			<Button type="submit" disabled={resetting || !resetPassword}>
				{resetting ? "Resetting..." : "Reset Password"}
			</Button>
		</div>
	</form>
</Modal>
