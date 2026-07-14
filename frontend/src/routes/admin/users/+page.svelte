<script lang="ts">
	import { getRepository } from '$lib/data';
	import { user as userStore } from '$lib/stores/auth';
	import { Button } from "$lib/components/ui/button";
	import { Input } from "$lib/components/ui/input";
	import { Label } from "$lib/components/ui/label";
	import { Card, CardContent } from "$lib/components/ui/card";
	import { Select } from "$lib/components/ui/select";
	import { Badge } from "$lib/components/ui/badge";
	import ConfirmModal from "$lib/components/ConfirmModal.svelte";
	import AlertBox from "$lib/components/AlertBox.svelte";
	import { toastSuccess, toastError } from "$lib/stores/toast";
	import { Modal } from "$lib/components/molecules";
	import { adminFilter } from "$lib/stores/adminFilter";
	import type { AdminGroupNode } from "$lib/data/types";

	let users: any[] = $state([]);

	let createModalOpen = $state(false);
	let newEmail = $state("");
	let newPassword = $state("");
	let newName = $state("");
	let newRole = $state("user");
	let createError = $state("");
	let creating = $state(false);

	// Group assignments in the create modal: groupId -> 'admin' | 'member' (absent = not assigned)
	let groupsTree: AdminGroupNode[] = $state([]);
	let groupsLoading = $state(false);
	let assignments: Record<string, 'admin' | 'member'> = $state({});

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

	async function openCreateModal() {
		newEmail = "";
		newPassword = "";
		newName = "";
		newRole = "user";
		createError = "";
		assignments = {};
		createModalOpen = true;

		// Lazy-load groups the first time we open
		if (groupsTree.length === 0 && !groupsLoading) {
			groupsLoading = true;
			try {
				groupsTree = await repo.admin.listGroupsTree();
			} catch (err: any) {
				toastError(err.message || "Failed to load groups");
			} finally {
				groupsLoading = false;
			}
		}
	}

	function toggleAssignment(groupId: string) {
		const next = { ...assignments };
		if (next[groupId]) delete next[groupId];
		else next[groupId] = 'member';
		assignments = next;
	}

	function setAssignmentRole(groupId: string, role: 'admin' | 'member') {
		assignments = { ...assignments, [groupId]: role };
	}

	async function handleCreateUser() {
		createError = "";
		if (!newEmail || !newPassword || !newName) {
			createError = "Name, email, and password are required.";
			return;
		}
		creating = true;
		try {
			const assignmentList = Object.entries(assignments).map(([groupId, role]) => ({ groupId, role }));
			await repo.admin.createUser({
				email: newEmail,
				password: newPassword,
				name: newName,
				role: newRole,
				assignments: assignmentList.length ? assignmentList : undefined,
			});
			toastSuccess("User created.");
			createModalOpen = false;
			await loadUsers();
		} catch (err: any) {
			createError = err.message || "Failed to create user.";
		} finally {
			creating = false;
		}
	}

	// Role changes are privilege changes — a mis-tap on the dropdown must not
	// silently grant super. Confirm before applying; reload to revert the
	// select's visual state if the admin cancels.
	let roleChangeOpen = $state(false);
	let roleChangeTarget = $state<{ id: string; name: string; role: string } | null>(null);
	let roleChangeLoading = $state(false);

	function handleRoleChange(userId: string, newRole: string) {
		const target = users.find((u) => u.id === userId);
		if (!target || target.role === newRole) return;
		roleChangeTarget = { id: userId, name: target.name, role: newRole };
		roleChangeOpen = true;
	}

	async function confirmRoleChange() {
		if (!roleChangeTarget) return;
		roleChangeLoading = true;
		try {
			await repo.admin.updateRole(roleChangeTarget.id, roleChangeTarget.role);
			toastSuccess("Role updated.");
			roleChangeOpen = false;
			roleChangeTarget = null;
		} catch (err: any) {
			toastError(err.message || "Failed to update role.");
		} finally {
			roleChangeLoading = false;
			await loadUsers();
		}
	}

	async function cancelRoleChange() {
		roleChangeOpen = false;
		roleChangeTarget = null;
		// Re-render the selects with the unchanged roles
		await loadUsers();
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
	<Button onclick={openCreateModal}>Create User</Button>
</div>

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

<!-- Create user modal -->
<Modal bind:open={createModalOpen} size="lg">
	{#snippet header()}
		<h3 class="text-lg font-semibold">Create User</h3>
		<p class="mt-1 text-sm text-muted-foreground">Add a user and optionally assign them to stakes or wards.</p>
	{/snippet}

	<form onsubmit={(e) => { e.preventDefault(); handleCreateUser(); }} class="mt-4 space-y-4">
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
				<Label for="newRole">System role</Label>
				<Select id="newRole" bind:value={newRole}>
					<option value="user">User</option>
					<option value="super">Super Admin</option>
				</Select>
			</div>
		</div>

		<div class="space-y-2">
			<Label>Stake & ward memberships</Label>
			<p class="text-xs text-muted-foreground">
				Pick the stakes and wards this user belongs to. Mark them as Admin to grant management access for that group.
			</p>
			<div class="max-h-72 overflow-y-auto rounded-md border border-border">
				{#if groupsLoading}
					<p class="p-3 text-sm text-muted-foreground">Loading groups…</p>
				{:else if groupsTree.length === 0}
					<p class="p-3 text-sm text-muted-foreground">No stakes or wards yet. Create groups first to assign users.</p>
				{:else}
					<ul class="divide-y divide-border text-sm">
						{#each groupsTree as g (g.id)}
							{@const checked = !!assignments[g.id]}
							<li class="flex items-center gap-2 px-3 py-2" style="padding-left: {0.75 + g.depth * 1}rem;">
								<input
									type="checkbox"
									id={`grp-${g.id}`}
									{checked}
									onchange={() => toggleAssignment(g.id)}
									class="h-4 w-4 rounded border-border"
								/>
								<label for={`grp-${g.id}`} class="flex-1 cursor-pointer">
									{g.name}
									<span class="ml-1 text-xs text-muted-foreground">({g.type})</span>
								</label>
								{#if checked}
									<Select
										value={assignments[g.id]}
										onchange={(e) => setAssignmentRole(g.id, e.currentTarget.value as 'admin' | 'member')}
										class="h-7 w-24 text-xs"
									>
										<option value="member">Member</option>
										<option value="admin">Admin</option>
									</Select>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		</div>

		<div class="flex justify-end gap-3 pt-2">
			<Button variant="outline" onclick={() => { createModalOpen = false; }}>Cancel</Button>
			<Button type="submit" disabled={creating}>
				{creating ? "Creating…" : "Create User"}
			</Button>
		</div>
	</form>
</Modal>

<ConfirmModal
	bind:open={deleteModalOpen}
	title="Delete User"
	message="Are you sure you want to delete {deleteTarget?.name} ({deleteTarget?.email})? This cannot be undone."
	confirmLabel="Delete User"
	onConfirm={confirmDelete}
	loading={deleting}
/>

<ConfirmModal
	bind:open={roleChangeOpen}
	title="Change Role"
	message={roleChangeTarget?.role === 'super'
		? `Make ${roleChangeTarget?.name} a super admin? They will have full access to all users, groups, and children's submissions.`
		: `Change ${roleChangeTarget?.name} to a regular user? They will immediately lose admin access.`}
	confirmLabel="Change Role"
	confirmVariant="default"
	onConfirm={confirmRoleChange}
	onCancel={cancelRoleChange}
	loading={roleChangeLoading}
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
