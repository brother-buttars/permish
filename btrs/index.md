---
title: "BTRS Vault"
created: 2026-03-22
updated: 2026-03-29
tags:
  - index
---

# permish -- BTRS vault

Welcome to the BTRS knowledge vault for **permish**.

## Navigation

### Knowledge (persistent reference)
- [[project-map|Project map]] -- Agent scopes and architecture overview
- [[knowledge/conventions/_index|Conventions]] -- Project conventions and patterns
- [[knowledge/decisions/_index|Decisions]] -- Architecture Decision Records
- [[knowledge/code-map/_index|Code map]] -- Module documentation
- [[knowledge/tech-debt/_index|Tech debt]] -- Technical debt tracker

### Work (active tasks)
- [[work/status|Status]] -- Current work status
- [[work/specs/_index|Specs]] -- Feature specifications
- [[work/plans/_index|Plans]] -- Implementation plans
- [[work/todos/_index|Todos]] -- Work items
- [[work/changelog/_index|Changelog]] -- Daily change logs

### Evidence (agent outputs)
- [[evidence/agents/_index|Agent outputs]] -- Agent work products
- [[evidence/reviews/_index|Reviews]] -- Code reviews
- [[evidence/verification/_index|Verification]] -- Verification reports

## Quick reference

- **Framework**: SvelteKit (frontend) + Bun/Hono (backend)
- **Language**: TypeScript (frontend and backend)
- **Component library**: shadcn-svelte (hand-built)
- **Test framework**: `bun test` (in-process via Hono `app.request()`)
- **Database**: `bun:sqlite` (raw SQL)
- **Styling**: Tailwind CSS v4
- **Auth**: JWT via HttpOnly cookies (bcryptjs)
- **PDF**: pdf-lib (fills official church PDF)
