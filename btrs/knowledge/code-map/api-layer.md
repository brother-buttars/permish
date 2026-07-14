---
title: "API layer"
created: 2026-03-22
updated: 2026-03-22
tags:
  - code-map
  - api
---

# API layer

## Overview

A single Bun + Hono + SQLite (`bun:sqlite`) backend providing the REST API for auth, events, form submissions, profiles, groups, invites, and PDF generation. JWT auth via HttpOnly SameSite=Strict cookies.

## Key files

| File | Purpose |
|------|---------|
| `server/src/index.ts` | HTTP entry (`export default { port, fetch }`) |
| `server/src/app.ts` | Hono app factory (`createApp(db)`), route mounting |
| `server/src/db.ts` | `bun:sqlite` schema + super-admin bootstrap |
| `server/src/config.ts` | Environment config |
| `server/src/routes/auth.ts` | Login, register, logout, session check |
| `server/src/routes/events.ts` | CRUD for events (authed) |
| `server/src/routes/form.ts` | Public form load and submission |
| `server/src/routes/profiles.ts` | Child profile CRUD |
| `server/src/routes/submissions.ts` | Submission management, PDF download |
| `server/src/routes/{groups,invites,admin}.ts` | Groups, invites, super-admin |
| `server/src/lib/auth.ts` | JWT cookie, `authMiddleware`, `requireAuth` |
| `server/src/lib/rateLimit.ts` | Rate limiting per endpoint |
| `server/src/services/pdf.ts` | PDF generation via pdf-lib |
| `server/src/services/email.ts` | Email via Nodemailer |

## Dependencies

- Depends on: database layer, PDF template
- Depended on by: frontend

## Owner agent

Primary: **btrs-api-engineer**
