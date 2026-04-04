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

- Jest 30 + supertest (backend only)
- No frontend tests yet

## File patterns

- Test files: `backend/tests/{feature}.test.js`
- Service tests: `backend/tests/services/{service}.test.js`
- Setup: `backend/tests/setup.js`

## Structure

Tests use in-memory SQLite and override `app.locals.db`. Rate limiters skip in test env.

```javascript
const request = require('supertest');
const app = require('../src/index');

describe('Feature', () => {
  let db;
  beforeAll(() => { /* setup in-memory db */ });
  it('should do something', async () => {
    const res = await request(app).get('/api/endpoint');
    expect(res.status).toBe(200);
  });
});
```

## Rules

1. Use `crypto.randomUUID()` instead of `uuid` package.
2. Rate limiters are skipped when `NODE_ENV=test`.
3. Run tests with `pnpm test` from `backend/`.

## Canonical examples

- `backend/tests/auth.test.js` -- good test structure
- `backend/tests/setup.js` -- test database setup

## Anti-patterns

- Do NOT use `uuid` package in tests
- Do NOT forget to set up in-memory DB for new test files

## See also

- [[conventions/api|API conventions]]
