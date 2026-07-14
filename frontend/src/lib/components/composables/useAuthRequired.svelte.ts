import { onMount } from "svelte";
import { goto } from "$app/navigation";
import { user as userStore, authLoading } from "$lib/stores/auth";
import { toastError } from "$lib/stores/toast";

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
	let error = $state<string | null>(null);

	const unsubUser = userStore.subscribe((u) => {
		currentUser = u as AuthUser | null;
	});

	// A failed onReady must surface — swallowing it rendered pages with empty
	// arrays, so a network blip read as "You haven't created any activities yet".
	async function runOnReady(u: AuthUser) {
		error = null;
		try {
			if (opts.onReady) await opts.onReady(u);
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to load";
			toastError(error);
		} finally {
			ready = true;
		}
	}

	async function retry() {
		if (!currentUser) return;
		ready = false;
		await runOnReady(currentUser);
	}

	onMount(() => {
		const unsubLoading = authLoading.subscribe(async (isLoading) => {
			if (isLoading) return;
			if (!currentUser) {
				if (opts.redirectTo) {
					goto(opts.redirectTo);
				} else {
					// Preserve the deep link (emailed event/group URLs) so login
					// returns the user here instead of dumping them on /dashboard.
					const here = typeof window !== "undefined"
						? window.location.pathname + window.location.search
						: "";
					goto(here && here !== "/" ? `/login?next=${encodeURIComponent(here)}` : "/login");
				}
				return;
			}
			if (
				opts.allowedRoles &&
				!opts.allowedRoles.includes(currentUser.role)
			) {
				goto("/dashboard");
				return;
			}
			await runOnReady(currentUser);
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
		get error() {
			return error;
		},
		retry,
	};
}
