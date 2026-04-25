---
id: TODO-004
title: "Production deployment configuration"
status: completed
created: 2026-03-22
updated: 2026-04-24
priority: medium
tags:
  - infra
  - deployment
---

# Production deployment configuration

## Description

Docker Compose file exists but lacks production hardening. Need environment configuration, SSL/TLS, backup strategy, and health checks.

## Scope

- Add health check to Docker Compose services
- Configure reverse proxy (nginx/Caddy) for SSL termination
- Set up `.env.production` template
- Implement SQLite backup cron job
- Document deployment process

## Acceptance criteria

- [x] Docker Compose works for production deployment
- [x] HTTPS configured via reverse proxy
- [x] Automated database backups
- [x] Deployment documentation

## Resolution (2026-04-24)

- Health checks: complete — backend, pocketbase, sidecar, and frontend all have `healthcheck` blocks; backend now hits `/api/health` (TODO-011).
- HTTPS: Caddy reverse proxy with automatic certs (`Caddyfile`, `--profile production`).
- Backups: added `scripts/backup.sh` that handles Express + PocketBase modes with retention pruning. Documented in `docs/DEPLOYMENT.md`.
- Documentation: `docs/DEPLOYMENT.md` (482 lines) covers VPS, Tauri desktop, mobile.

## Owner agent

Primary: **btrs-container-ops** + **btrs-devops**
