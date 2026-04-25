/**
 * Delete-confirmation modal lifecycle. Replaces the
 * `deleteModalOpen` / `deleteTargetId` / `deleteTargetName` / `deleteLoading`
 * quartet that was inlined in 6+ pages.
 *
 * Usage:
 *   const del = useDeleteConfirm<string>();
 *   ...
 *   <Button onclick={() => del.ask(submission.id, submission.participant_name)}>Delete</Button>
 *   <ConfirmModal
 *     bind:open={del.open}
 *     title="Delete Submission"
 *     message={`Delete "${del.targetName}"? This cannot be undone.`}
 *     confirmLabel="Delete"
 *     confirmVariant="destructive"
 *     loading={del.loading}
 *     onConfirm={() => del.run(async (id) => {
 *       await repo.submissions.delete(id);
 *       toastSuccess('Deleted');
 *     })}
 *   />
 */
export function useDeleteConfirm<T = string>() {
	let open = $state(false);
	let targetId = $state<T | null>(null);
	let targetName = $state("");
	let loading = $state(false);

	function ask(id: T, name = "") {
		targetId = id;
		targetName = name;
		open = true;
	}

	async function run(action: (id: T) => Promise<void>) {
		if (targetId === null) return;
		loading = true;
		try {
			await action(targetId);
			open = false;
		} finally {
			loading = false;
		}
	}

	return {
		get open() {
			return open;
		},
		set open(v: boolean) {
			open = v;
		},
		get targetId() {
			return targetId;
		},
		get targetName() {
			return targetName;
		},
		get loading() {
			return loading;
		},
		ask,
		run,
	};
}
