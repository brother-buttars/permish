import { writable } from 'svelte/store';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  duration?: number;
}

const { subscribe, update } = writable<Toast[]>([]);

let counter = 0;

export const toasts = { subscribe };

export function addToast(toast: Omit<Toast, 'id'>) {
  const id = String(++counter);
  const duration = toast.duration ?? 4000;
  update(t => [{ ...toast, id }, ...t]);
  if (duration > 0) {
    setTimeout(() => removeToast(id), duration);
  }
}

export function removeToast(id: string) {
  update(t => t.filter(toast => toast.id !== id));
}

// Convenience helpers
export function toast(message: string) { addToast({ type: 'info', message }); }
export function toastSuccess(message: string) { addToast({ type: 'success', message }); }
export function toastError(message: string) { addToast({ type: 'error', message, duration: 6000 }); }
