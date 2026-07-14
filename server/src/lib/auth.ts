import type { Context, MiddlewareHandler } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sign, verify } from 'hono/jwt';
import { config } from '../config.ts';

export interface AuthUser {
  id: string;
  email: string;
  role: 'super' | 'user';
  name: string;
}

// Hono env typing so c.get('user') / c.set('user') are typed.
export type AppEnv = { Variables: { user: AuthUser | null } };

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

/** Populates c.get('user') from the JWT cookie (or null). Never rejects. */
export const authMiddleware: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, COOKIE);
  if (!token) {
    c.set('user', null);
    return next();
  }
  try {
    const payload = (await verify(token, config.jwtSecret, 'HS256')) as unknown as AuthUser;
    c.set('user', { id: payload.id, email: payload.email, role: payload.role, name: payload.name });
  } catch {
    c.set('user', null);
  }
  return next();
};

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
