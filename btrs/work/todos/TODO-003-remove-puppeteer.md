---
id: TODO-003
title: "Remove unused Puppeteer dependency"
status: complete
created: 2026-03-22
updated: 2026-03-22
priority: low
tags:
  - chore
  - backend
---

# Remove unused Puppeteer dependency

## Description

Puppeteer (~300MB) is still in `backend/package.json` but is no longer used for PDF generation since the switch to pdf-lib. It should be removed to reduce install size and Docker image size.

## Scope

- Remove `puppeteer` from `backend/package.json`
- Verify no imports reference it
- Run `pnpm install` to update lockfile
- Update `pnpm.onlyBuiltDependencies` list

## Acceptance criteria

- [ ] `puppeteer` removed from dependencies
- [ ] No remaining imports or references
- [ ] Backend starts and tests pass without it

## See also

- [[decisions/ADR-001-pdf-generation|ADR-001: PDF generation]]

## Owner agent

Primary: **btrs-api-engineer**
