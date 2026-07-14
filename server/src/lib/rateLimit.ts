import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './auth.ts';

// Minimal in-memory fixed-window limiter — replaces express-rate-limit.
// Skips entirely in test (matches backend/src/middleware/rateLimiter.js behavior).

const skip = () => process.env.NODE_ENV === 'test';

function clientKey(c: Parameters<MiddlewareHandler>[0]): string {
  return (
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    c.req.header('x-real-ip') ||
    'local'
  );
}

export function rateLimit(opts: { windowMs: number; max: number; message?: string }): MiddlewareHandler<AppEnv> {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const message = opts.message || 'Too many requests, try again later';

  return async (c, next) => {
    if (skip()) return next();
    const now = Date.now();
    const key = clientKey(c);
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
