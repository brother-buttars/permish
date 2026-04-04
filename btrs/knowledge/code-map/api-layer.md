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

Express 5 backend providing REST API for auth, events, form submissions, profiles, and PDF generation. JWT auth via HttpOnly cookies.

## Key files

| File | Purpose |
|------|---------|
| `backend/src/index.js` | Entry point, middleware, route mounting |
| `backend/src/routes/auth.js` | Login, register, logout, session check |
| `backend/src/routes/events.js` | CRUD for events (planner-only) |
| `backend/src/routes/form.js` | Public form load and submission |
| `backend/src/routes/profiles.js` | Child profile CRUD |
| `backend/src/routes/submissions.js` | Submission management, PDF download |
| `backend/src/middleware/auth.js` | JWT extraction, auth guards |
| `backend/src/middleware/rateLimiter.js` | Rate limiting per endpoint |
| `backend/src/services/pdf.js` | PDF generation via pdf-lib |
| `backend/src/services/email.js` | Email via Nodemailer |

## Dependencies

- Depends on: database layer, PDF template
- Depended on by: frontend

## Owner agent

Primary: **btrs-api-engineer**
