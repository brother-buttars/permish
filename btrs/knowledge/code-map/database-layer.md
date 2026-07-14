---
title: "Database layer"
created: 2026-03-22
updated: 2026-03-22
tags:
  - code-map
  - database
---

# Database layer

## Overview

SQLite via `bun:sqlite` (built into Bun) with raw SQL queries — no ORM. The data model
is defined **once** in `shared/schema.ts` and DDL is generated from it with `bun run gen:schema`.

## Key files

| File | Purpose |
|------|---------|
| `shared/schema.ts` | Single source of truth for the data model (all targets) |
| `server/src/schema.generated.ts` | Generated server DDL (`bun:sqlite`) — never edit by hand |
| `server/src/db.ts` | Opens the `bun:sqlite` DB, applies the schema, bootstraps the super-admin |
| `server/test/schema.test.ts` | Guard test — fails if generated files drift from `shared/schema.ts` |

## Dependencies

- Depends on: none (foundational)
- Depended on by: API layer

## Owner agent

Primary: **btrs-database-engineer**
