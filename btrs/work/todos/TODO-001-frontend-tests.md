---
id: TODO-001
title: "Add frontend test suite"
status: complete
created: 2026-03-22
updated: 2026-03-22
priority: medium
tags:
  - testing
  - frontend
---

# Add frontend test suite

## Description

The frontend has no tests. Set up Vitest and/or Playwright for unit and e2e testing of SvelteKit pages and components.

## Scope

- Choose test framework (Vitest for unit, Playwright for e2e)
- Configure test runner in `frontend/`
- Write initial tests for critical flows: login, form submission, profile management
- Add test script to `frontend/package.json`

## Acceptance criteria

- [ ] Test framework configured and running
- [ ] Unit tests for key utilities (`formatDate`, `computeAge`, `validation`)
- [ ] Component tests for `SignaturePad`, `ConfirmModal`
- [ ] E2e test for parent form submission flow

## Owner agent

Primary: **btrs-qa-test-engineering**
