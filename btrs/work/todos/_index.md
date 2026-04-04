---
title: "Todos"
created: 2026-03-22
updated: 2026-03-22
tags:
  - index
---

# Todos

Work items and tasks for PermissionForm.

## Critical

- [[todos/TODO-005-critical-jwt-secret|TODO-005: Production JWT secret safety check]] -- Prevent default secret in production

## High

- [[todos/TODO-006-wire-rate-limiters|TODO-006: Wire up rate limiters]] -- submitLimiter and formLoadLimiter not applied
- [[todos/TODO-008-extract-pdf-modal|TODO-008: Extract PdfPreviewModal component]] -- 240 lines duplicated across 4 pages + a11y
- [[todos/TODO-009-error-handling-toasts|TODO-009: Replace console.error with toasts]] -- Silent failures on 5+ pages
- [[todos/TODO-011-fix-docker-compose|TODO-011: Fix Docker Compose config]] -- PUBLIC_API_URL broken, no health checks

## Medium

- [[todos/TODO-007-remove-unused-deps|TODO-007: Remove unused deps]] -- uuid, handlebars, tailwind-variants
- [[todos/TODO-010-deduplicate-utilities|TODO-010: Deduplicate utility functions]] -- parseOrgs, computeAge, isPastEvent across pages
- [[todos/TODO-004-production-deployment|TODO-004: Production deployment config]] -- SSL, backups

## Completed

- ~~[[todos/TODO-001-frontend-tests|TODO-001: Add frontend test suite]]~~ -- 39 Vitest tests, completed 2026-03-22
- ~~[[todos/TODO-002-cicd-pipeline|TODO-002: Set up CI/CD pipeline]]~~ -- GitHub Actions, completed 2026-03-22
- ~~[[todos/TODO-003-remove-puppeteer|TODO-003: Remove Puppeteer]]~~ -- Removed 2026-03-22
