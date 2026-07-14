// Validation + sanitization helpers — ported from backend/src/middleware/validate.js
// so behavior matches the old Express server exactly.

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePhone(phone?: string | null): boolean {
  if (!phone) return true;
  const cleaned = phone.replace(/[\s\-().]/g, '');
  return /^\+?\d{7,15}$/.test(cleaned);
}

export function validateDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr) && !Number.isNaN(Date.parse(dateStr));
}

export function sanitizeString<T>(str: T, maxLength = 500): T | string {
  if (typeof str !== 'string') return str;
  return str.slice(0, maxLength).replace(/[<>]/g, '');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Offline-first clients (hybrid mode) mint record ids locally and send them on
 * create so the same row keeps one identity on both sides. Only well-formed
 * UUIDs are honored; anything else falls back to a server-minted id.
 */
export function clientProvidedId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}
