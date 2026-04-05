<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { user, authLoading } from '$lib/stores/auth';
	import { getRepository } from '$lib/data';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import type { GroupDetail, GroupMember } from '$lib/data/types';

	let { data } = $props();

	let group: GroupDetail | null = $state(null);
	let loading = $state(true);
	let currentUser: any = $state(null);

	// Invite form
	let inviteEmail = $state('');
	let inviteRole = $state<'member' | 'admin'>('member');
	let inviting = $state(false);

	// Copy state
	let codeCopied = $state(false);

	// Regenerate state
	let regenerating = $state(false);

	// Confirm modal
	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state(() => {});
	let confirmLoading = $state(false);

	const repo = getRepository();

	$effect(() => {
		// Keep isAdmin reactive
	});

	let isAdmin = $derived(group?.member_role === 'admin');

	onMount(() => {
		const unsubUser = user.subscribe(u => { currentUser = u; });
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser) { goto('/login'); return; }
			await loadGroup();
		});
		return () => { unsubUser(); unsubLoading(); };
	});

	async function loadGroup() {
		try {
			group = await repo.groups.getById(data.groupId);
		} catch (err: any) {
			toastError(err.message || 'Failed to load group');
			goto('/groups');
		} finally {
			loading = false;
		}
	}

	async function copyInviteCode() {
		if (!group?.invite_code) return;
		try {
			await navigator.clipboard.writeText(group.invite_code);
			codeCopied = true;
			setTimeout(() => codeCopied = false, 2000);
		} catch {
			// Fallback: select text
		}
	}

	async function regenerateCode() {
		regenerating = true;
		try {
			const result = await repo.groups.regenerateInvite(data.groupId);
			if (group) {
				group = { ...group, invite_code: result.invite_code };
			}
			toastSuccess('Invite code regenerated');
		} catch (err: any) {
			toastError(err.message || 'Failed to regenerate code');
		} finally {
			regenerating = false;
		}
	}

	async function inviteMember() {
		if (!inviteEmail.trim()) return;
		inviting = true;
		try {
			const result = await repo.groups.invite(data.groupId, inviteEmail.trim(), inviteRole);
			toastSuccess(result.message || 'Invitation sent');
			inviteEmail = '';
			inviteRole = 'member';
			await loadGroup();
		} catch (err: any) {
			toastError(err.message || 'Failed to invite member');
		} finally {
			inviting = false;
		}
	}

	function promptChangeMemberRole(member: GroupMember, newRole: string) {
		confirmTitle = 'Change Role';
		confirmMessage = `Change ${member.name}'s role to ${newRole}?`;
		confirmAction = async () => {
			confirmLoading = true;
			try {
				await repo.groups.updateMemberRole(data.groupId, member.user_id, newRole);
				toastSuccess(`${member.name} is now ${newRole === 'admin' ? 'an admin' : 'a member'}`);
				confirmOpen = false;
				await loadGroup();
			} catch (err: any) {
				toastError(err.message || 'Failed to change role');
			} finally {
				confirmLoading = false;
			}
		};
		confirmOpen = true;
	}

	function promptRemoveMember(member: GroupMember) {
		confirmTitle = 'Remove Member';
		confirmMessage = `Remove ${member.name} from this group? They will need a new invite code to rejoin.`;
		confirmAction = async () => {
			confirmLoading = true;
			try {
				await repo.groups.removeMember(data.groupId, member.user_id);
				toastSuccess(`${member.name} has been removed`);
				confirmOpen = false;
				await loadGroup();
			} catch (err: any) {
				toastError(err.message || 'Failed to remove member');
			} finally {
				confirmLoading = false;
			}
		};
		confirmOpen = true;
	}
</script>

<svelte:head><title>{group?.name || 'Group'}</title></svelte:head>

<div class="container mx-auto max-w-4xl px-4 py-8">
	{#if loading}
		<LoadingState />
	{:else if group}
		<!-- Header -->
		<div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="flex items-center gap-3">
					<h1 class="text-3xl font-bold">{group.name}</h1>
					<Badge variant="secondary" class="text-xs capitalize">{group.type}</Badge>
				</div>
				<p class="text-sm text-muted-foreground mt-1">
					{#if group.ward && group.stake}
						{group.ward} · {group.stake}
					{:else if group.ward}
						{group.ward}
					{:else if group.stake}
						{group.stake}
					{/if}
				</p>
			</div>
			<div class="flex gap-2">
				<Button variant="outline" onclick={() => goto('/groups')}>Back to Groups</Button>
			</div>
		</div>

		<!-- Group Profile -->
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>Group Details</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
				{#if group.leader_name}
					<div class="grid gap-1 sm:grid-cols-3">
						<span class="text-sm text-muted-foreground">Leader</span>
						<span class="sm:col-span-2">{group.leader_name}</span>
					</div>
				{/if}
				{#if group.leader_phone}
					<div class="grid gap-1 sm:grid-cols-3">
						<span class="text-sm text-muted-foreground">Phone</span>
						<span class="sm:col-span-2">{group.leader_phone}</span>
					</div>
				{/if}
				{#if group.leader_email}
					<div class="grid gap-1 sm:grid-cols-3">
						<span class="text-sm text-muted-foreground">Email</span>
						<span class="sm:col-span-2">{group.leader_email}</span>
					</div>
				{/if}
				{#if group.parent}
					<div class="grid gap-1 sm:grid-cols-3">
						<span class="text-sm text-muted-foreground">Parent Group</span>
						<span class="sm:col-span-2">
							<a href="/groups/{group.parent.id}" class="text-primary underline hover:no-underline">{group.parent.name}</a>
						</span>
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Invite Code (admin only) -->
		{#if isAdmin && group.invite_code}
			<Card class="mb-6">
				<CardHeader>
					<CardTitle>Invite Code</CardTitle>
				</CardHeader>
				<CardContent class="space-y-3">
					<p class="text-sm text-muted-foreground">Share this code with people you want to join the group.</p>
					<div class="flex items-center gap-2">
						<code class="flex-1 rounded-md border border-input bg-muted px-4 py-2 font-mono text-lg tracking-widest">{group.invite_code}</code>
						<Button variant="outline" onclick={copyInviteCode}>
							{codeCopied ? 'Copied!' : 'Copy'}
						</Button>
						<Button variant="outline" onclick={regenerateCode} disabled={regenerating}>
							{regenerating ? 'Regenerating...' : 'Regenerate'}
						</Button>
					</div>
				</CardContent>
			</Card>
		{/if}

		<!-- Invite by email (admin only) -->
		{#if isAdmin}
			<Card class="mb-6">
				<CardHeader>
					<CardTitle>Invite by Email</CardTitle>
				</CardHeader>
				<CardContent>
					<form onsubmit={(e) => { e.preventDefault(); inviteMember(); }} class="flex flex-col gap-3 sm:flex-row sm:items-end">
						<div class="flex-1 space-y-2">
							<Label for="inviteEmail">Email address</Label>
							<Input id="inviteEmail" type="email" bind:value={inviteEmail} placeholder="member@example.com" />
						</div>
						<div class="space-y-2">
							<Label for="inviteRole">Role</Label>
							<select id="inviteRole" bind:value={inviteRole} class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:w-32">
								<option value="member">Member</option>
								<option value="admin">Admin</option>
							</select>
						</div>
						<Button type="submit" disabled={inviting}>{inviting ? 'Inviting...' : 'Invite'}</Button>
					</form>
				</CardContent>
			</Card>
		{/if}

		<!-- Members -->
		<Card class="mb-6">
			<CardHeader>
				<CardTitle>Members ({group.members?.length || 0})</CardTitle>
			</CardHeader>
			<CardContent>
				{#if !group.members || group.members.length === 0}
					<p class="text-sm text-muted-foreground py-4 text-center">No members yet.</p>
				{:else}
					<div class="divide-y divide-border">
						{#each group.members as member}
							<div class="flex items-center justify-between py-3">
								<div>
									<div class="flex items-center gap-2">
										<span class="font-medium">{member.name}</span>
										{#if member.role === 'admin'}
											<Badge class="text-xs">Admin</Badge>
										{/if}
									</div>
									<p class="text-sm text-muted-foreground">{member.email}</p>
								</div>
								{#if isAdmin && member.user_id !== currentUser?.id}
									<div class="flex gap-2">
										{#if member.role === 'member'}
											<Button variant="outline" size="sm" onclick={() => promptChangeMemberRole(member, 'admin')}>Make Admin</Button>
										{:else}
											<Button variant="outline" size="sm" onclick={() => promptChangeMemberRole(member, 'member')}>Make Member</Button>
										{/if}
										<Button variant="outline" size="sm" class="text-destructive hover:bg-destructive hover:text-destructive-foreground" onclick={() => promptRemoveMember(member)}>Remove</Button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</CardContent>
		</Card>

		<!-- Subgroups (for stakes) -->
		{#if group.subgroups && group.subgroups.length > 0}
			<Card class="mb-6">
				<CardHeader>
					<CardTitle>Subgroups</CardTitle>
				</CardHeader>
				<CardContent>
					<div class="grid gap-3">
						{#each group.subgroups as sub}
							<div class="flex items-center justify-between rounded-md border border-border px-4 py-3 cursor-pointer hover:bg-muted transition-colors" onclick={() => goto(`/groups/${sub.id}`)} onkeydown={(e) => { if (e.key === 'Enter') goto(`/groups/${sub.id}`); }} role="button" tabindex="0">
								<div>
									<span class="font-medium">{sub.name}</span>
									{#if sub.ward}
										<span class="text-sm text-muted-foreground ml-2">{sub.ward}</span>
									{/if}
								</div>
								<Badge variant="secondary" class="text-xs capitalize">{sub.type}</Badge>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		{/if}
	{/if}
</div>

<ConfirmModal
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmLabel="Confirm"
	onConfirm={confirmAction}
	loading={confirmLoading}
/>
