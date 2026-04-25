import { onMount } from "svelte";
import { goto } from "$app/navigation";
import { user as userStore, authLoading } from "$lib/stores/auth";

type Role = "super" | "user";

interface AuthUser {
	id: string;
	email: string;
	name: string;
	role: Role;
	[key: string]: unknown;
}

interface UseAuthRequiredOptions {
	/** Where to send unauthenticated users. Default: '/login'. */
	redirectTo?: string;
	/** If set, only users with one of these roles pass. Others get sent to /dashboard. */
	allowedRoles?: Role[];
	/** Run after auth resolves and the user passes role checks. */
	onReady?: (user: AuthUser) => void | Promise<void>;
}

/**
 * Auth guard for routes that require an authenticated user. Replaces the
 * `user.subscribe` + `authLoading.subscribe` + `goto('/login')` boilerplate
 * that was duplicated in 12+ pages.
 *
 * Usage:
 *   const auth = useAuthRequired({
 *     onReady: async () => {
 *       events = await repo.events.list();
 *       loading = false;
 *     },
 *   });
 *   ...
 *   {#if !auth.ready}<LoadingState />{:else}...{/if}
 */
export function useAuthRequired(opts: UseAuthRequiredOptions = {}) {
	let currentUser = $state<AuthUser | null>(null);
	let ready = $state(false);

	const unsubUser = userStore.subscribe((u) => {
		currentUser = u as AuthUser | null;
	});

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser) {
				goto(opts.redirectTo ?? "/login");
				return;
			}
			if (
				opts.allowedRoles &&
				!opts.allowedRoles.includes(currentUser.role)
			) {
				goto("/dashboard");
				return;
			}
			try {
				if (opts.onReady) await opts.onReady(currentUser);
			} finally {
				ready = true;
			}
		});
		return () => {
			unsubLoading();
			unsubUser();
		};
	});

	return {
		get user() {
			return currentUser;
		},
		get ready() {
			return ready;
		},
	};
}
