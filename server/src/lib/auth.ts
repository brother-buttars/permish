import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { config } from '../config.ts';
import type { DB } from '../db.ts';

export interface AuthUser {
  id: string;
  email: string;
  role: 'super' | 'user';
  name: string;
}

// Hono env typing so c.get('user') / c.set('user') are typed.
export type AppEnv = { Variables: { user: AuthUser | null; mustChangePassword: boolean } };

const COOKIE = 'token';

export async function setAuthCookie(c: Context, user: AuthUser): Promise<void> {
  const exp = Math.floor(Date.now() / 1000) + config.jwtExpirySeconds;
  const token = await sign({ ...user, exp }, config.jwtSecret, 'HS256');
  setCookie(c, COOKIE, token, {
    httpOnly: true,
    sameSite: 'Strict',
    secure: config.isProduction,
    path: '/',
    maxAge: config.jwtExpirySeconds,
  });
}

export function clearAuthCookie(c: Context): void {
  deleteCookie(c, COOKIE, { path: '/' });
}

// Routes a must-change-password account may still reach (to complete setup).
const MUST_CHANGE_ALLOWED = new Set([
  '/api/auth/setup-credentials',
  '/api/auth/me',
  '/api/auth/logout',
]);

/**
 * Populates c.get('user') from the JWT cookie, re-verified against the users
 * table so deletions/demotions take effect immediately (not at token expiry).
 * Also gates accounts flagged must_change_password to the credential-setup
 * routes only. Never rejects on missing/invalid tokens.
 */
export function createAuthMiddleware(db: DB): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    c.set('user', null);
    c.set('mustChangePassword', false);
    const token = getCookie(c, COOKIE);
    if (!token) return next();
    try {
      const payload = (await verify(token, config.jwtSecret, 'HS256')) as unknown as AuthUser;
      const row = db
        .query<
          { id: string; email: string; name: string; role: 'super' | 'user'; must_change_password: number },
          [string]
        >('SELECT id, email, name, role, must_change_password FROM users WHERE id = ?')
        .get(payload.id);
      if (!row) return next(); // user deleted — token is dead
      c.set('user', { id: row.id, email: row.email, role: row.role, name: row.name });
      c.set('mustChangePassword', !!row.must_change_password);
      if (row.must_change_password && !MUST_CHANGE_ALLOWED.has(c.req.path)) {
        return c.json(
          { error: 'You must set new credentials before continuing', code: 'must_change_password' },
          403
        );
      }
    } catch {
      // invalid/expired token — treated as unauthenticated
    }
    return next();
  };
}

/** Rejects with 401 when no authenticated user is present. */
export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('user')) return c.json({ error: 'Authentication required' }, 401);
  return next();
};

/** Narrowing helper for route handlers that run after requireAuth. */
export function currentUser(c: Context<AppEnv>): AuthUser {
  const user = c.get('user');
  if (!user) throw new Error('currentUser called without requireAuth');
  return user;
}
