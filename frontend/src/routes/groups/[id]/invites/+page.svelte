<script lang="ts">
	import { goto } from '$app/navigation';
	import { getRepository } from '$lib/data';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Badge } from '$lib/components/ui/badge';
	import { Separator } from '$lib/components/ui/separator';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import LoadingState from '$lib/components/LoadingState.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import { formatDate } from '$lib/utils/formatDate';
	import type { GroupInvite } from '$lib/data/types';
	import { getGroupContext } from '../_context.svelte';
	import { inviteStatus, expiresAtFromChoice } from '../_lib';

	const ctx = getGroupContext();
	const group = $derived(ctx.group!);

	const repo = getRepository();

	let invitesLoaded = $state(false);
	let invites: GroupInvite[] = $state([]);

	let inviteEmail = $state('');
	let inviteRole = $state<'member' | 'admin'>('member');
	let inviting = $state(false);

	let codeCopied = $state(false);
	let regenerating = $state(false);

	let mintRole = $state<'member' | 'admin'>('member');
	let mintMaxUses = $state<string>('');
	let mintExpiresIn = $state<'' | '24h' | '7d' | '30d'>('');
	let minting = $state(false);
	let copiedInviteId = $state<string | null>(null);

	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state(() => {});
	let confirmLoading = $state(false);

	$effect(() => {
		// Bounce non-admins back to overview.
		if (ctx.group && !ctx.isAdmin) {
			goto(`/groups/${ctx.groupId}`, { replaceState: true });
		}
	});

	$effect(() => {
		// Load invites once the group resolves and the user is admin.
		if (ctx.group && ctx.isAdmin && !invitesLoaded) {
			loadInvites();
		}
	});

	async function loadInvites() {
		try {
			invites = await repo.groups.listInvites(ctx.groupId);
		} catch {
			invites = [];
		} finally {
			invitesLoaded = true;
		}
	}

	async function copyInviteCode() {
		if (!group.invite_code) return;
		try {
			await navigator.clipboard.writeText(group.invite_code);
			codeCopied = true;
			setTimeout(() => codeCopied = false, 2000);
		} catch { /* ignore */ }
	}

	async function regenerateCode() {
		regenerating = true;
		try {
			await repo.groups.regenerateInvite(ctx.groupId);
			toastSuccess('Invite code regenerated');
			await ctx.reload();
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
			const result = await repo.groups.invite(ctx.groupId, inviteEmail.trim(), inviteRole);
			toastSuccess(result.message || 'Invitation sent');
			inviteEmail = '';
			inviteRole = 'member';
			await Promise.all([ctx.reload(), loadInvites()]);
		} catch (err: any) {
			toastError(err.message || 'Failed to invite member');
		} finally {
			inviting = false;
		}
	}

	async function mintInvite() {
		minting = true;
		try {
			await repo.groups.createInvite(ctx.groupId, {
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
		} catch { /* ignore */ }
	}

	async function copyInviteCodeValue(invite: GroupInvite) {
		if (!invite.code) return;
		try {
			await navigator.clipboard.writeText(invite.code);
			copiedInviteId = invite.id;
			setTimeout(() => { if (copiedInviteId === invite.id) copiedInviteId = null; }, 2000);
		} catch { /* ignore */ }
	}

	function promptRevokeInvite(invite: GroupInvite) {
		confirmTitle = 'Revoke Invite';
		confirmMessage = invite.email
			? `Revoke the invite sent to ${invite.email}? They won't be able to use the link.`
			: `Revoke this invite code? Anyone holding it will no longer be able to join.`;
		confirmAction = async () => {
			confirmLoading = true;
			try {
				await repo.groups.revokeInvite(ctx.groupId, invite.id);
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
</script>

{#if !invitesLoaded}
	<LoadingState />
{:else}
	<Card>
		<CardHeader>
			<CardTitle>Invitations</CardTitle>
		</CardHeader>
		<CardContent class="space-y-6">
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

<ConfirmModal
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmLabel="Confirm"
	onConfirm={confirmAction}
	loading={confirmLoading}
/>
