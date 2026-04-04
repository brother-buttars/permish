---
id: TODO-004
title: "Production deployment configuration"
status: pending
created: 2026-03-22
updated: 2026-03-22
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

- [ ] Docker Compose works for production deployment
- [ ] HTTPS configured via reverse proxy
- [ ] Automated database backups
- [ ] Deployment documentation

## Owner agent

Primary: **btrs-container-ops** + **btrs-devops**
