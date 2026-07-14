/**
 * Shared focus-trap helpers for modal dialogs (Modal, ConfirmModal, PdfModal).
 * Keeps Tab/Shift+Tab cycling inside the dialog and restores focus to the
 * invoking element on close — one implementation so the three modals behave
 * identically.
 */

export const FOCUSABLE_SELECTOR =
	'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function getFocusable(root: HTMLElement | null | undefined): HTMLElement[] {
	if (!root) return [];
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/** Handle a Tab keydown so focus cycles within `root`. Call from a keydown handler. */
export function trapTabKey(e: KeyboardEvent, root: HTMLElement | null | undefined): void {
	if (e.key !== 'Tab' || !root) return;
	const focusable = getFocusable(root);
	if (focusable.length === 0) {
		e.preventDefault();
		root.focus();
		return;
	}
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	const active = document.activeElement as HTMLElement | null;
	if (e.shiftKey && (active === first || !root.contains(active))) {
		e.preventDefault();
		last.focus();
	} else if (!e.shiftKey && (active === last || !root.contains(active))) {
		e.preventDefault();
		first.focus();
	}
}
