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

- Express 5 (JavaScript, CommonJS)
- better-sqlite3 for database
- JWT auth via HttpOnly cookies

## File patterns

- Routes: `backend/src/routes/{resource}.js`
- Middleware: `backend/src/middleware/{name}.js`
- Services: `backend/src/services/{name}.js`

## Structure

Routes use Express Router with middleware composition:

```javascript
const { Router } = require('express');
const { requireAuth, requirePlanner } = require('../middleware/auth');
const router = Router();

router.get('/', requireAuth, requirePlanner, (req, res) => { ... });
module.exports = router;
```

## Rules

1. Route mounting order in `index.js` is critical -- form routes BEFORE events routes (both use `/api/events` prefix).
2. `extractUser` runs on every request; `requireAuth` / `requirePlanner` for protected routes.
3. Auth uses JWT in HttpOnly SameSite=Strict cookies via `setAuthCookie`.
4. Rate limiters skip in test env (`NODE_ENV=test`).
5. Use `crypto.randomUUID()` instead of `uuid` package (ESM-only issue).
6. Database column names must match exactly between backend schema and frontend API calls.

## Canonical examples

- `backend/src/routes/auth.js` -- auth route patterns
- `backend/src/routes/events.js` -- CRUD with auth middleware
- `backend/src/middleware/auth.js` -- middleware pattern

## Anti-patterns

- Do NOT change route mounting order without understanding prefix conflicts
- Do NOT use `uuid` package -- use `crypto.randomUUID()`
- Do NOT use field names that differ from the SQLite schema

## See also

- [[conventions/registry|Component and utility registry]]
- [[conventions/database|Database conventions]]
