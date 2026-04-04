---
id: ADR-003
title: "SQLite with raw SQL via better-sqlite3"
status: accepted
created: 2026-03-19
updated: 2026-03-22
tags:
  - architecture
  - database
---

# SQLite with raw SQL via better-sqlite3

## Context

The app stores users, events, child profiles, and form submissions. It runs on a single server via Docker Compose.

## Decision

Use SQLite via better-sqlite3 with raw SQL queries. No ORM.

## Rationale

- Single-file database — no separate database container or setup
- Synchronous API via better-sqlite3 simplifies error handling
- Schema is straightforward (4 tables, no complex joins)
- Migrations handled by a `migrate()` function that checks column existence before ALTER TABLE
- In tests, uses `:memory:` SQLite for fast isolated testing
- Docker volume (`db-data`) persists the database file

## Consequences

- No query builder or type safety — field names must match exactly between frontend and backend
- Schema changes require manual migration code in `schema.js`
- Single-writer limitation acceptable for expected load
- Must `pnpm rebuild better-sqlite3` after Node version changes

## See also

- [[code-map/database-layer|Database layer]]
- [[conventions/database|Database conventions]]
