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

- SQLite via `bun:sqlite` (built into Bun)
- Raw SQL (no ORM)
- Single-source schema: `shared/schema.ts` → `bun run gen:schema`

## File patterns

- Data model (source of truth): `shared/schema.ts`
- Generated server DDL: `server/src/schema.generated.ts` (never edit by hand)
- DB open + bootstrap: `server/src/db.ts`

## Structure

The model is declared once in `shared/schema.ts`. Running `bun run gen:schema` regenerates
the server DDL (`server/src/schema.generated.ts`), the frontend local sql.js DDL, and the
sync column specs. Per-target differences are encoded via `targets` flags in the descriptor.
`server/src/db.ts` applies the generated schema on startup. A guard test
(`server/test/schema.test.ts`) fails if the committed generated files drift from `shared/schema.ts`.

## Rules

1. Database column names are the source of truth -- frontend must match exactly.
2. Never edit the `*.generated.ts` files by hand; change `shared/schema.ts` and run `bun run gen:schema`.
3. Tests use in-memory SQLite (`createDb(':memory:')`), driven in-process via Hono's `app.request()`.
4. Organizations stored as JSON array on events table.

## Canonical examples

- `shared/schema.ts` -- the single-source data model
- `server/src/db.ts` -- schema application and super-admin bootstrap

## Anti-patterns

- Do NOT use field names that differ from the schema (see CLAUDE.md field mapping table)
- Do NOT forget to add migration for new columns to existing tables

## See also

- [[conventions/api|API conventions]]
