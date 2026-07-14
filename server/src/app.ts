import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { config } from './config.ts';
import type { DB } from './db.ts';
import { type AppEnv, createAuthMiddleware } from './lib/auth.ts';
import { createAuthRoutes } from './routes/auth.ts';
import { createFormRoutes } from './routes/form.ts';
import { createEventRoutes } from './routes/events.ts';
import { createProfileRoutes } from './routes/profiles.ts';
import { createSubmissionRoutes } from './routes/submissions.ts';
import { createGroupRoutes } from './routes/groups.ts';
import { createInviteRoutes } from './routes/invites.ts';
import { createAdminRoutes } from './routes/admin.ts';

/** Builds the Hono app around a database. Pure — no I/O — so tests can pass an in-memory DB. */
export function createApp(db: DB) {
  const app = new Hono<AppEnv>();

  // CORS: allow the frontend origin(s); reflect origin so cookie credentials work.
  const allowed = new Set([config.frontendUrl, ...config.corsOrigins]);
  app.use(
    '*',
    cors({
      origin: (origin) => (!origin || allowed.has(origin) ? origin || config.frontendUrl : null),
      credentials: true,
    })
  );
  app.use('*', createAuthMiddleware(db));

  const health = (c: Context<AppEnv>) =>
    c.json({ status: 'ok', ok: true, service: 'permish-server', mode: 'bun+hono+sqlite' });
  app.get('/health', health);
  app.get('/api/health', health); // path the old Express backend + Docker healthcheck used

  // Order mirrors the old Express mounting: PUBLIC form routes before the authed
  // events routes (both live under /api/events but never collide on path+method).
  app.route('/api/events', createFormRoutes(db));
  app.route('/api/events', createEventRoutes(db));
  app.route('/api/auth', createAuthRoutes(db));
  app.route('/api/profiles', createProfileRoutes(db));
  app.route('/api/submissions', createSubmissionRoutes(db));
  app.route('/api/groups', createGroupRoutes(db));
  app.route('/api/invites', createInviteRoutes(db));
  app.route('/api/admin', createAdminRoutes(db));

  return app;
}
