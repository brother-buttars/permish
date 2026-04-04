---
title: "Database conventions"
created: 2026-03-22
updated: 2026-03-22
tags:
  - conventions
  - database
---

# Database conventions

## Stack

- SQLite via better-sqlite3
- Raw SQL (no ORM)

## File patterns

- Schema and migrations: `backend/src/db/schema.js`
- Connection: `backend/src/db/connection.js`

## Structure

Tables are created in `schema.js` with a `migrate()` function for adding columns to existing tables. Migration checks if column exists before adding (safe to re-run).

## Rules

1. Database column names are the source of truth -- frontend must match exactly.
2. New columns added via `migrate()` function, checking existence before ALTER TABLE.
3. Tests use in-memory SQLite (`:memory:`), overriding `app.locals.db`.
4. Organizations stored as JSON array on events table.

## Canonical examples

- `backend/src/db/schema.js` -- schema definition and migration pattern

## Anti-patterns

- Do NOT use field names that differ from the schema (see CLAUDE.md field mapping table)
- Do NOT forget to add migration for new columns to existing tables

## See also

- [[conventions/api|API conventions]]
