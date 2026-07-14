---
title: "API conventions"
created: 2026-03-22
updated: 2026-03-22
tags:
  - conventions
  - api
---

# API conventions

## Stack

- Hono (TypeScript, ESM) on Bun
- `bun:sqlite` for database
- JWT auth via HttpOnly SameSite=Strict cookies

## File patterns

- Routes: `server/src/routes/{resource}.ts`
- Middleware / auth helpers: `server/src/lib/{name}.ts`
- Services: `server/src/services/{name}.ts`

## Structure

Each resource exports a factory returning a Hono router; middleware is composed per route. Routers are mounted in `server/src/app.ts` via `createApp(db)`:

```typescript
import { Hono } from 'hono';
import { requireAuth } from '../lib/auth';

export function createEventRoutes(db: Database) {
  const app = new Hono();

  app.get('/', requireAuth, (c) => {
    const user = c.get('user');
    // ...
    return c.json({ events });
  });

  return app;
}
```

## Rules

1. Route mounting order in `app.ts` is critical -- form routes BEFORE events routes (both use `/api/events` prefix).
2. `authMiddleware` populates `c.get('user')` on every request; `requireAuth` guards protected routes; admin routes additionally require `role === 'super'`.
3. Auth uses JWT in HttpOnly SameSite=Strict cookies (see `server/src/lib/auth.ts`).
4. Rate limiters skip in test env (`NODE_ENV=test`).
5. Use `crypto.randomUUID()` instead of `uuid` package (ESM-only issue).
6. Database column names must match exactly between backend schema and frontend API calls.

## Canonical examples

- `server/src/routes/auth.ts` -- auth route patterns
- `server/src/routes/events.ts` -- CRUD with auth middleware
- `server/src/lib/auth.ts` -- middleware pattern

## Anti-patterns

- Do NOT change route mounting order without understanding prefix conflicts
- Do NOT use `uuid` package -- use `crypto.randomUUID()`
- Do NOT use field names that differ from the SQLite schema

## See also

- [[conventions/registry|Component and utility registry]]
- [[conventions/database|Database conventions]]
