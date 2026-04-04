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

SQLite database via better-sqlite3 with raw SQL queries. Schema defined in `schema.js` with a migration function for adding columns to existing tables.

## Key files

| File | Purpose |
|------|---------|
| `backend/src/db/schema.js` | Table creation and column migrations |
| `backend/src/db/connection.js` | Database connection setup |

## Dependencies

- Depends on: none (foundational)
- Depended on by: API layer

## Owner agent

Primary: **btrs-database-engineer**
