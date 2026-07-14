---
title: "Testing conventions"
created: 2026-03-22
updated: 2026-03-22
tags:
  - conventions
  - testing
---

# Testing conventions

## Stack

- Server: `bun test` (built into Bun) — in-process, no network or ports
- Frontend: Vitest

## File patterns

- Server tests: `server/test/{feature}.test.ts`
- Schema guard: `server/test/schema.test.ts`
- Frontend tests: `frontend/src/**/{unit}.test.ts`

## Structure

Server tests build the app in-process with an in-memory SQLite DB (`createDb(':memory:')`)
and drive it via Hono's `app.request()`. Rate limiters skip in test env (`NODE_ENV=test`).

```typescript
import { test, expect } from 'bun:test';
import { createApp } from '../src/app';
import { createDb } from '../src/db';

test('GET /api/endpoint returns 200', async () => {
  const app = createApp(createDb(':memory:'));
  const res = await app.request('/api/endpoint');
  expect(res.status).toBe(200);
});
```

## Rules

1. Use `crypto.randomUUID()` instead of the `uuid` package.
2. Rate limiters are skipped when `NODE_ENV=test`.
3. Run server tests with `bun test` from `server/`; frontend tests with `pnpm test` from `frontend/`.

## CI drift guards

Two guards run in CI to keep code and docs from silently diverging:

- **Schema drift** -- `server/test/schema.test.ts` fails if the generated SQLite files drift from `shared/schema.ts` (runs as part of `bun test`).
- **Doc drift** -- `bun run check:drift` (`scripts/check-doc-drift.ts`, the **Docs Drift** CI job) fails if living docs reintroduce terminology for architecture that was consolidated away. Skips past-tense mentions; waive an exception with a `drift-ok` marker on the line.

## Canonical examples

- `server/test/routes.test.ts` -- good route test structure
- `server/test/e2e.test.ts` -- end-to-end flow via `app.request()`

## Anti-patterns

- Do NOT use `uuid` package in tests
- Do NOT forget to set up in-memory DB for new test files

## See also

- [[conventions/api|API conventions]]
