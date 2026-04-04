---
id: ADR-002
title: "JWT auth via HttpOnly cookies with no refresh tokens"
status: accepted
created: 2026-03-19
updated: 2026-03-22
tags:
  - architecture
  - auth
  - security
---

# JWT auth via HttpOnly cookies with no refresh tokens

## Context

The app needs authentication for event planners (required) and parents (optional). Form submission itself is public.

## Decision

Use JWT tokens stored in HttpOnly, SameSite=Strict cookies with 24-hour expiry. No refresh token mechanism.

## Rationale

- HttpOnly prevents XSS from stealing tokens
- SameSite=Strict provides CSRF protection without extra middleware
- 24-hour expiry keeps it simple — users re-authenticate daily
- No refresh tokens reduces attack surface and implementation complexity
- bcryptjs handles password hashing
- Two roles: `planner` (full access) and `parent` (profiles + submissions)
- `extractUser` middleware runs on every request to populate `req.user`
- `requireAuth` / `requirePlanner` guards protect specific routes

## Consequences

- Users must log in again after 24 hours
- No silent token refresh — acceptable for this use case
- Cookie-based auth means the API is not directly usable from external clients without cookies

## See also

- [[code-map/api-layer|API layer]] -- auth middleware implementation
