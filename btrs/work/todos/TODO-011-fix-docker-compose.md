---
id: TODO-011
title: "Fix Docker Compose PUBLIC_API_URL and add health checks"
status: pending
created: 2026-03-22
updated: 2026-03-22
priority: high
tags:
  - infra
  - bugfix
---

# Fix Docker Compose PUBLIC_API_URL and add health checks

## Description

`docker-compose.yml` sets `PUBLIC_API_URL=http://backend:3001` which is an internal Docker hostname not reachable from the browser. API calls fail in Docker deployment. Also missing health checks on services.

## Acceptance criteria

- [ ] `PUBLIC_API_URL` changed to browser-reachable URL
- [ ] Health check added for backend using `/api/health`
- [ ] `depends_on` uses `condition: service_healthy`
