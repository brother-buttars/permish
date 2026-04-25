<script lang="ts">
	import { goto } from '$app/navigation';
	import { getRepository } from '$lib/data';
	import { useAuthRequired } from '$lib/components/composables';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import { PageContainer } from '$lib/components/molecules';
	import type { GroupDetail, GroupMember, GroupInvite, AuditEntry } from '$lib/data/types';
	import { formatDate } from '$lib/utils/formatDate';

	let { data } = $props();

	let group: GroupDetail | null = $state(null);

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

	// Invites
	let invites: GroupInvite[] = $state([]);
	let mintRole = $state<'member' | 'admin'>('member');
	let mintMaxUses = $state<string>('');
	let mintExpiresIn = $state<'' | '24h' | '7d' | '30d'>('');
	let minting = $state(false);
	let copiedInviteId = $state<string | null>(null);

	// Activity / audit
	let auditEntries: AuditEntry[] = $state([]);
	let auditLoading = $state(false);

	const repo = getRepository();
	const auth = useAuthRequired({
		onReady: async () => {
			await loadGroup();
			await Promise.all([loadInvites(), loadAudit()]);
		},
	});

	let isAdmin = $derived(
		(group as GroupDetail | null)?.effective_admin === true ||
		(group as GroupDetail | null)?.member_role === 'admin'
	);

	async function loadGroup() {
		try {
			group = await repo.groups.getById(data.groupId);
		} catch (err: any) {
			toastError(err.message || 'Failed to load group');
			goto('/groups');
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
			await Promise.all([loadGroup(), loadInvites(), loadAudit()]);
		} catch (err: any) {
			toastError(err.message || 'Failed to invite member');
		} finally {
			inviting = false;
		}
	}

	async function loadInvites() {
		if (!isAdmin) { invites = []; return; }
		try {
			invites = await repo.groups.listInvites(data.groupId);
		} catch {
			invites = [];
		}
	}

	async function loadAudit() {
		if (!isAdmin) { auditEntries = []; return; }
		auditLoading = true;
		try {
			auditEntries = await repo.groups.getAuditLog(data.groupId, { limit: 100 });
		} catch {
			auditEntries = [];
		} finally {
			auditLoading = false;
		}
	}

	function formatAuditAction(entry: AuditEntry): string {
		const meta = (entry.meta || {}) as Record<string, any>;
		const actor = entry.actor_name || entry.actor_email || 'Unknown user';
		switch (entry.action) {
			case 'group.create':
				return `${actor} created the group`;
			case 'group.update':
				return `${actor} updated group details`;
			case 'member.added':
				return meta.source === 'group.create'
					? `${actor} created the group (joined as admin)`
					: `${actor} joined as ${meta.role || 'member'}${meta.source ? ` (via ${String(meta.source).replace('invite.', 'invite ')})` : ''}`;
			case 'member.role_changed':
				return `${actor} changed a member's role from ${meta.from} to ${meta.to}`;
			case 'member.removed':
				return meta.self_leave ? `${actor} left the group` : `${actor} removed a member`;
			case 'invite.created': {
				const role = meta.role || 'member';
				const target = meta.email ? `for ${meta.email}` : 'shareable code';
				return `${actor} created an ${role} invite (${target})`;
			}
			case 'invite.revoked':
				return `${actor} revoked an invite`;
			case 'invite.regenerated':
				return `${actor} regenerated the default invite code`;
			case 'invite.accepted':
				return `${actor} accepted an invite`;
			case 'user.role_changed':
				return `${actor} changed a user's role from ${meta.from} to ${meta.to}`;
			case 'user.created':
				return `${actor} created a user account (${meta.email})`;
			case 'user.deleted':
				return `${actor} deleted a user account`;
			default:
				return `${actor}: ${entry.action}`;
		}
	}

	function expiresAtFromChoice(choice: typeof mintExpiresIn): string | undefined {
		if (!choice) return undefined;
		const now = Date.now();
		const ms = choice === '24h' ? 24 * 3600e3 : choice === '7d' ? 7 * 86400e3 : 30 * 86400e3;
		return new Date(now + ms).toISOString();
	}

	async function mintInvite() {
		minting = true;
		try {
			await repo.groups.createInvite(data.groupId, {
				role: mintRole,
				max_uses: mintMaxUses ? parseInt(mintMaxUses, 10) : undefined,
				expires_at: expiresAtFromChoice(mintExpiresIn),
			});
			toastSuccess(`${mintRole === 'admin' ? 'Admin' : 'Member'} invite created`);
			mintRole = 'member';
			mintMaxUses = '';
			mintExpiresIn = '';
			await loadInvites();
		} catch (err: any) {
			toastError(err.message || 'Failed to create invite');
		} finally {
			minting = false;
		}
	}

	async function copyInviteLink(invite: GroupInvite) {
		const url = `${location.origin}/invite/${invite.token}`;
		try {
			await navigator.clipboard.writeText(url);
			copiedInviteId = invite.id;
			setTimeout(() => { if (copiedInviteId === invite.id) copiedInviteId = null; }, 2000);
		} catch {
			// ignore
		}
	}

	async function copyInviteCodeValue(invite: GroupInvite) {
		if (!invite.code) return;
		try {
			await navigator.clipboard.writeText(invite.code);
			copiedInviteId = invite.id;
			setTimeout(() => { if (copiedInviteId === invite.id) copiedInviteId = null; }, 2000);
		} catch {
			// ignore
		}
	}

	function promptRevokeInvite(invite: GroupInvite) {
		confirmTitle = 'Revoke Invite';
		confirmMessage = invite.email
			? `Revoke the invite sent to ${invite.email}? They won't be able to use the link.`
			: `Revoke this invite code? Anyone holding it will no longer be able to join.`;
		confirmAction = async () => {
			confirmLoading = true;
			try {
				await repo.groups.revokeInvite(data.groupId, invite.id);
				toastSuccess('Invite revoked');
				confirmOpen = false;
				await loadInvites();
			} catch (err: any) {
				toastError(err.message || 'Failed to revoke invite');
			} finally {
				confirmLoading = false;
			}
		};
		confirmOpen = true;
	}

	function inviteStatus(invite: GroupInvite): { label: string; tone: 'active' | 'used' | 'revoked' | 'expired' } {
		if (invite.revoked_at) return { label: 'Revoked', tone: 'revoked' };
		if (invite.accepted_at) return { label: 'Accepted', tone: 'used' };
		if (invite.expires_at && new Date(invite.expires_at) < new Date()) return { label: 'Expired', tone: 'expired' };
		if (invite.max_uses != null && invite.used_count >= invite.max_uses) return { label: 'Used up', tone: 'used' };
		return { label: 'Active', tone: 'active' };
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
				await Promise.all([loadGroup(), loadInvites(), loadAudit()]);
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

<PageContainer>
	{#if !auth.ready}
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

		<!-- Invitations (admin only) -->
		{#if isAdmin}
			<Card class="mb-6">
				<CardHeader>
					<CardTitle>Invitations</CardTitle>
				</CardHeader>
				<CardContent class="space-y-6">
					<!-- Default shareable code -->
					{#if group.invite_code}
						<div class="space-y-2">
							<p class="text-sm text-muted-foreground">Default member invite code — share with anyone to let them join.</p>
							<div class="flex items-center gap-2">
								<code class="flex-1 rounded-md border border-input bg-muted px-4 py-2 font-mono text-lg tracking-widest">{group.invite_code}</code>
								<Button variant="outline" onclick={copyInviteCode}>{codeCopied ? 'Copied!' : 'Copy'}</Button>
								<Button variant="outline" onclick={regenerateCode} disabled={regenerating}>
									{regenerating ? 'Regenerating...' : 'Regenerate'}
								</Button>
							</div>
						</div>

						<Separator />
					{/if}

					<!-- Invite by email -->
					<div class="space-y-2">
						<p class="text-sm font-medium">Invite by email</p>
						<p class="text-sm text-muted-foreground">Sends a tokenized link. Recipients don't need to be registered yet.</p>
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
							<Button type="submit" disabled={inviting}>{inviting ? 'Inviting...' : 'Send invite'}</Button>
						</form>
					</div>

					<Separator />

					<!-- Mint a new code-based invite -->
					<div class="space-y-2">
						<p class="text-sm font-medium">Mint a shareable code</p>
						<p class="text-sm text-muted-foreground">Useful for admin-role invites or short-lived codes.</p>
						<form onsubmit={(e) => { e.preventDefault(); mintInvite(); }} class="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
							<div class="space-y-2">
								<Label for="mintRole">Role</Label>
								<select id="mintRole" bind:value={mintRole} class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
									<option value="member">Member</option>
									<option value="admin">Admin</option>
								</select>
							</div>
							<div class="space-y-2">
								<Label for="mintMaxUses">Max uses</Label>
								<Input id="mintMaxUses" type="number" min="1" bind:value={mintMaxUses} placeholder="Unlimited" />
							</div>
							<div class="space-y-2">
								<Label for="mintExpires">Expires</Label>
								<select id="mintExpires" bind:value={mintExpiresIn} class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
									<option value="">Never</option>
									<option value="24h">24 hours</option>
									<option value="7d">7 days</option>
									<option value="30d">30 days</option>
								</select>
							</div>
							<Button type="submit" disabled={minting}>{minting ? 'Creating...' : 'Create'}</Button>
						</form>
					</div>

					<!-- Existing invites list -->
					{#if invites.length > 0}
						<Separator />
						<div class="space-y-2">
							<p class="text-sm font-medium">All invites</p>
							<div class="divide-y divide-border rounded-md border">
								{#each invites as invite (invite.id)}
									{@const status = inviteStatus(invite)}
									<div class="flex flex-wrap items-center gap-3 p-3">
										<div class="flex-1 min-w-[200px]">
											<div class="flex items-center gap-2">
												{#if invite.email}
													<span class="text-sm">{invite.email}</span>
												{:else if invite.code}
													<code class="rounded border border-input bg-muted px-2 py-0.5 font-mono text-sm">{invite.code}</code>
												{:else}
													<span class="text-sm text-muted-foreground">Tokenized link</span>
												{/if}
												<Badge variant="secondary" class="text-xs capitalize">{invite.role}</Badge>
												<Badge
													variant={status.tone === 'active' ? 'active' : status.tone === 'revoked' ? 'inactive' : 'past'}
													class="text-xs"
												>{status.label}</Badge>
											</div>
											<div class="mt-1 text-xs text-muted-foreground">
												{#if invite.max_uses != null}
													Used {invite.used_count}/{invite.max_uses}
												{:else}
													Used {invite.used_count} times
												{/if}
												{#if invite.expires_at}
													· Expires {formatDate(invite.expires_at)}
												{/if}
												{#if invite.created_at}
													· Created {formatDate(invite.created_at)}
												{/if}
											</div>
										</div>
										<div class="flex items-center gap-2">
											{#if status.tone === 'active'}
												{#if invite.code}
													<Button variant="outline" size="sm" onclick={() => copyInviteCodeValue(invite)}>
														{copiedInviteId === invite.id ? 'Copied!' : 'Copy code'}
													</Button>
												{/if}
												<Button variant="outline" size="sm" onclick={() => copyInviteLink(invite)}>
													{copiedInviteId === invite.id && !invite.code ? 'Copied!' : 'Copy link'}
												</Button>
												<Button variant="outline" size="sm" onclick={() => promptRevokeInvite(invite)}>Revoke</Button>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/if}
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
								{#if isAdmin && member.user_id !== auth.user?.id}
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

		<!-- Activity (admin only) -->
		{#if isAdmin}
			<Card class="mb-6">
				<CardHeader>
					<CardTitle>Activity</CardTitle>
				</CardHeader>
				<CardContent>
					{#if auditLoading && auditEntries.length === 0}
						<p class="text-sm text-muted-foreground py-4 text-center">Loading…</p>
					{:else if auditEntries.length === 0}
						<p class="text-sm text-muted-foreground py-4 text-center">No activity yet.</p>
					{:else}
						<ul class="divide-y divide-border">
							{#each auditEntries as entry (entry.id)}
								<li class="flex items-start justify-between gap-4 py-3">
									<p class="text-sm">{formatAuditAction(entry)}</p>
									<span class="shrink-0 text-xs text-muted-foreground">{formatDate(entry.created_at)}</span>
								</li>
							{/each}
						</ul>
					{/if}
				</CardContent>
			</Card>
		{/if}

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
</PageContainer>

<ConfirmModal
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmLabel="Confirm"
	onConfirm={confirmAction}
	loading={confirmLoading}
/>
