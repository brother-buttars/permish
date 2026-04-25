import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { page } from '$app/stores';
import { user as userStore } from './auth';
import type { AdminFilter } from '$lib/data/types';

// sessionStorage (not localStorage) so the filter is per-tab and doesn't survive
// browser quit. Stored value is tagged with the current user's id and validated
// on read — if a different user logs in (same tab without closing), or the user
// logs out, we drop the stored filter so it never crosses user boundaries.
const STORAGE_KEY = 'permish_admin_filter';

let currentUserId: string | null = null;

function readStorage(forUserId: string | null): AdminFilter {
	if (!browser || !forUserId) return {};
	try {
		const raw = sessionStorage.getItem(STORAGE_KEY);
		if (!raw) return {};
		const parsed = JSON.parse(raw);
		if (parsed?.userId !== forUserId) return {};
		return {
			groupId: parsed.filter?.groupId || null,
			activityId: parsed.filter?.activityId || null,
		};
	} catch {
		return {};
	}
}

function writeStorage(value: AdminFilter): void {
	if (!browser || !currentUserId) return;
	try {
		sessionStorage.setItem(
			STORAGE_KEY,
			JSON.stringify({ userId: currentUserId, filter: value }),
		);
	} catch {
		// ignore quota / private mode errors
	}
}

function clearStorage(): void {
	if (!browser) return;
	try {
		sessionStorage.removeItem(STORAGE_KEY);
	} catch {
		// ignore
	}
}

/**
 * Clear filter state and sessionStorage. Call from logout flows so the next
 * user on this tab starts clean even if the user-store transition somehow
 * doesn't fire (e.g., direct sessionStorage tampering, race conditions).
 */
export function resetAdminFilter(): void {
	clearStorage();
	adminFilter.set({});
}

export const adminFilter = writable<AdminFilter>({});

if (browser) {
	userStore.subscribe((u) => {
		const newId = (u as { id?: string } | null)?.id ?? null;
		// Only act on actual transitions: logout (current → null) or user swap (A → B).
		// Going from null → user (initial login or first resolution) preserves whatever
		// was just hydrated for that user.
		if (currentUserId !== null && newId !== currentUserId) {
			clearStorage();
			adminFilter.set({});
		}
		currentUserId = newId;
	});
}

/**
 * Hydrate the filter from URL query params, falling back to sessionStorage.
 * Call from the /admin layout AFTER auth resolves, so the user-id check on
 * stored values has the right context.
 */
export function hydrateFromUrl(searchParams: URLSearchParams): void {
	const groupId = searchParams.get('group');
	const activityId = searchParams.get('activity');
	if (groupId || activityId) {
		const next = { groupId: groupId || null, activityId: activityId || null };
		adminFilter.set(next);
		writeStorage(next);
	} else {
		adminFilter.set(readStorage(currentUserId));
	}
}

export function setFilter(next: Partial<AdminFilter>): void {
	const current = get(adminFilter);
	const merged: AdminFilter = {
		groupId: next.groupId !== undefined ? next.groupId : current.groupId,
		activityId: next.activityId !== undefined ? next.activityId : current.activityId,
	};
	adminFilter.set(merged);
	writeStorage(merged);
	if (browser) syncToUrl(merged);
}

export function clearFilter(): void {
	const empty: AdminFilter = { groupId: null, activityId: null };
	adminFilter.set(empty);
	writeStorage(empty);
	if (browser) syncToUrl(empty);
}

function syncToUrl(filter: AdminFilter): void {
	const $page = get(page);
	if (!$page?.url) return;
	const url = new URL($page.url);
	if (filter.groupId) url.searchParams.set('group', filter.groupId);
	else url.searchParams.delete('group');
	if (filter.activityId) url.searchParams.set('activity', filter.activityId);
	else url.searchParams.delete('activity');
	const target = url.pathname + (url.search ? url.search : '');
	if (target !== $page.url.pathname + $page.url.search) {
		goto(target, { replaceState: true, keepFocus: true, noScroll: true });
	}
}

export function buildAdminUrl(path: string): string {
	const filter = get(adminFilter);
	const params = new URLSearchParams();
	if (filter.groupId) params.set('group', filter.groupId);
	if (filter.activityId) params.set('activity', filter.activityId);
	const qs = params.toString();
	return qs ? `${path}?${qs}` : path;
}
