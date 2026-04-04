---
title: "Frontend"
created: 2026-03-22
updated: 2026-03-22
tags:
  - code-map
  - frontend
---

# Frontend

## Overview

SvelteKit app providing the user-facing interface for form submission, event management, and profile management. Uses Svelte 5 runes with shadcn-svelte components.

## Key files

| File | Purpose |
|------|---------|
| `frontend/src/routes/+layout.svelte` | Root layout with nav, auth check, theme |
| `frontend/src/routes/dashboard/+page.svelte` | Dashboard with event manager / parent tabs |
| `frontend/src/routes/form/[id]/+page.svelte` | Public form submission page |
| `frontend/src/routes/events/+page.svelte` | Event list for planners |
| `frontend/src/routes/create/+page.svelte` | Create new event |
| `frontend/src/routes/profiles/+page.svelte` | Child profile management |
| `frontend/src/lib/api.ts` | Backend API fetch wrapper |
| `frontend/src/lib/components/SignaturePad.svelte` | Signature capture component |
| `frontend/src/app.css` | Theme variables (oklch) and dark mode |

## Dependencies

- Depends on: API layer (backend), shared utilities
- Depended on by: none (end-user facing)

## Owner agent

Primary: **btrs-web-engineer**
