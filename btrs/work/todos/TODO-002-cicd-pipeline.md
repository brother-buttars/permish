---
id: TODO-002
title: "Set up CI/CD pipeline"
status: complete
created: 2026-03-22
updated: 2026-03-22
priority: medium
tags:
  - cicd
  - infra
---

# Set up CI/CD pipeline

## Description

No GitHub Actions or CI/CD pipeline exists. Set up automated build, test, and deploy workflows.

## Scope

- GitHub Actions workflow for PR checks (lint, test, build)
- Backend test job (Jest)
- Frontend build verification
- Optional: deploy workflow for Docker Compose target

## Acceptance criteria

- [ ] CI workflow runs on pull requests
- [ ] Backend tests pass in CI
- [ ] Frontend builds successfully in CI
- [ ] Deploy workflow exists (manual trigger)

## Owner agent

Primary: **btrs-cicd-ops**
