---
id: TODO-011
title: "Fix Docker Compose PUBLIC_API_URL and add health checks"
status: completed
created: 2026-03-22
updated: 2026-04-24
priority: high
tags:
  - infra
  - bugfix
---

# Fix Docker Compose PUBLIC_API_URL and add health checks

## Description

`docker-compose.yml` sets `PUBLIC_API_URL=http://backend:3001` which is an internal Docker hostname not reachable from the browser. API calls fail in Docker deployment. Also missing health checks on services.

## Acceptance criteria

- [x] `PUBLIC_API_URL` changed to browser-reachable URL
- [x] Health check added for backend using `/api/health`
- [x] `depends_on` uses `condition: service_healthy`

## Resolution (2026-04-24)

- `PUBLIC_API_URL` default already changed to `http://localhost:3001` (commit `09b28cf`) and overridable via env for production behind Caddy.
- `depends_on: backend: condition: service_healthy` already in place.
- Fixed today: backend healthcheck previously hit `/api/auth/me` with `.catch(()=>{})` (always passed). Now hits `/api/health` and throws on non-OK response.
