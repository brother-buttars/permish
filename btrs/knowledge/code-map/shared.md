---
title: "Shared"
created: 2026-03-22
updated: 2026-03-22
tags:
  - code-map
  - shared
---

# Shared

## Overview

Cross-cutting utilities, stores, and configuration used by both frontend components and backend services.

## Key files

| File | Purpose |
|------|---------|
| `frontend/src/lib/utils.ts` | cn() class name merger |
| `frontend/src/lib/utils/formatDate.ts` | Date formatting functions |
| `frontend/src/lib/utils/age.ts` | Age computation from DOB |
| `frontend/src/lib/utils/carriers.ts` | SMS carrier gateway list |
| `frontend/src/lib/utils/organizations.ts` | Church organization groups |
| `frontend/src/lib/utils/validation.ts` | Input validation helpers |
| `frontend/src/lib/stores/auth.ts` | Auth state and actions |
| `frontend/src/lib/stores/toast.ts` | Toast notification system |
| `frontend/src/lib/stores/theme.ts` | Theme management |
| `backend/src/config.js` | Environment variable loading |

## Dependencies

- Depends on: none
- Depended on by: frontend, API layer

## Owner agent

Primary: **btrs-web-engineer** (frontend shared), **btrs-api-engineer** (backend shared)
