<script lang="ts">
	import { getRepository } from '$lib/data';
	import { Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { Badge } from '$lib/components/ui/badge';
	import ConfirmModal from '$lib/components/ConfirmModal.svelte';
	import { toastSuccess, toastError } from '$lib/stores/toast';
	import type { GroupMember } from '$lib/data/types';
	import { getGroupContext } from '../_context.svelte';

	const ctx = getGroupContext();
	const group = $derived(ctx.group!);

	const repo = getRepository();

	let confirmOpen = $state(false);
	let confirmTitle = $state('');
	let confirmMessage = $state('');
	let confirmAction = $state(() => {});
	let confirmLoading = $state(false);

	function promptChangeMemberRole(member: GroupMember, newRole: string) {
		confirmTitle = 'Change Role';
		confirmMessage = `Change ${member.name}'s role to ${newRole}?`;
		confirmAction = async () => {
			confirmLoading = true;
			try {
				await repo.groups.updateMemberRole(ctx.groupId, member.user_id, newRole);
				toastSuccess(`${member.name} is now ${newRole === 'admin' ? 'an admin' : 'a member'}`);
				confirmOpen = false;
				await ctx.reload();
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
				await repo.groups.removeMember(ctx.groupId, member.user_id);
				toastSuccess(`${member.name} has been removed`);
				confirmOpen = false;
				await ctx.reload();
			} catch (err: any) {
				toastError(err.message || 'Failed to remove member');
			} finally {
				confirmLoading = false;
			}
		};
		confirmOpen = true;
	}
</script>

<Card>
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
						{#if ctx.isAdmin && member.user_id !== ctx.authUserId}
							<div class="flex gap-2">
								{#if member.role === 'member'}
									<Button variant="outline" size="sm" onclick={() => promptChangeMemberRole(member, 'admin')}>Make Admin</Button>
								{:else}
									<Button variant="outline" size="sm" onclick={() => promptChangeMemberRole(member, 'member')}>Make Member</Button>
								{/if}
								<Button
									variant="outline"
									size="sm"
									class="text-destructive hover:bg-destructive hover:text-destructive-foreground"
									onclick={() => promptRemoveMember(member)}
								>Remove</Button>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</CardContent>
</Card>

<ConfirmModal
	bind:open={confirmOpen}
	title={confirmTitle}
	message={confirmMessage}
	confirmLabel="Confirm"
	onConfirm={confirmAction}
	loading={confirmLoading}
/>
