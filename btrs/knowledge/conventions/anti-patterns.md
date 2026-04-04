---
title: "Anti-patterns"
created: 2026-03-22
updated: 2026-03-22
tags:
  - conventions
  - anti-patterns
---

# Anti-patterns

Common mistakes agents must avoid in this project.

## Svelte / frontend

- Do NOT use `export let` -- this project uses Svelte 5 runes (`$props()`)
- Do NOT use `$:` reactive statements -- use `$derived` or `$effect`
- Do NOT use `alert()` or `confirm()` -- use toast system and ConfirmModal
- Do NOT recreate UI primitives that exist in `components/ui/` -- check the registry first
- Do NOT use npm -- use pnpm

## Tailwind / styling

- Do NOT write custom CSS when a Tailwind utility exists
- Do NOT hardcode colors -- use oklch CSS variables from `app.css`
- Do NOT use `@apply` excessively

## Backend / API

- Do NOT change route mounting order in `index.js` -- form routes must come before events routes
- Do NOT use `uuid` package -- use `crypto.randomUUID()`
- Do NOT use field names that differ from the SQLite schema in `backend/src/db/schema.js`
- Do NOT forget to add migration checks when adding columns to existing tables

## Database

- Do NOT use field names that differ from schema column names (see CLAUDE.md mapping table)
- Do NOT skip the migration existence check when adding new columns

## General

- Do NOT use npm -- always use pnpm
- Do NOT commit `.env` files or secrets
- Do NOT add unnecessary abstractions -- keep it simple
