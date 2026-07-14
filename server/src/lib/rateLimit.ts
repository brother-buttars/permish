import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './auth.ts';
import { config } from '../config.ts';

// Minimal in-memory fixed-window limiter — replaces express-rate-limit.
// Skips entirely in test (matches backend/src/middleware/rateLimiter.js behavior).

const skip = () => process.env.NODE_ENV === 'test';

function clientKey(c: Parameters<MiddlewareHandler>[0]): string {
  // X-Forwarded-For is client-controlled unless a trusted proxy sets it — only
  // honor it behind TRUST_PROXY; otherwise key on the actual socket address
  // (passed through the Hono env by index.ts).
  if (config.trustProxy) {
    const fwd = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip');
    if (fwd) return fwd;
  }
  const ip = (c.env as { ip?: string | null } | undefined)?.ip;
  if (ip) return ip;
  // No socket available (in-process app.request in tests): header key keeps the
  // limiter unit-testable. Real serving always has a socket address.
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  message?: string;
  key?: (c: Parameters<MiddlewareHandler<AppEnv>>[0]) => string;
}): MiddlewareHandler<AppEnv> {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const message = opts.message || 'Too many requests, try again later';

  return async (c, next) => {
    if (skip()) return next();
    const now = Date.now();
    // Sweep expired entries so the map cannot grow without bound
    if (hits.size > 1000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }
    const key = opts.key ? opts.key(c) : clientKey(c);
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + opts.windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > opts.max) return c.json({ error: message }, 429);
    return next();
  };
}

export const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many registration attempts, try again later' });
export const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts, try again later' });
export const submitLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 20, message: 'Too many submissions, try again later' });
export const formLoadLimiter = rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many requests, try again later' });
// Keyed by authenticated user (runs after requireAuth) — invite codes must not be brute-forceable
export const joinLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many join attempts, try again later',
  key: (c) => (c.get('user') as { id?: string } | undefined)?.id || 'anon',
});
export const forgotPasswordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: 'Too many password reset requests, try again later' });
