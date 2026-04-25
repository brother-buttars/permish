---
title: "Anti-patterns"
created: 2026-03-22
updated: 2026-04-24
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

## Atomic design

See [[conventions/ui#atomic-layering]] for the layering rules.

- Do NOT inline a page header (title + subtitle + action buttons row) in a `+page.svelte` -- use the `PageHeader` molecule.
- Do NOT inline a clickable card list row (event card / submission card / group card) -- use the `ListCard` molecule.
- Do NOT inline a status / org / youth-class pill with raw utility-class strings -- use the matching badge atom (`StatusBadge`, `OrgBadge`, `YouthClassBadge`).
- Do NOT inline `<div class="container mx-auto max-w-4xl px-4 py-8">` as a page wrapper -- use the `PageContainer` molecule (`size="sm" | "md" | "default" | "lg" | "full"`).
- Do NOT build inline modal overlays (`<div class="fixed inset-0 z-50 ...bg-black/50 backdrop-blur-sm">`) -- use the `Modal` molecule, which handles backdrop click, escape key, and a11y consistently.
- Do NOT inline a status-tab / view-toggle with the long `bg-transparent text-foreground/50 border-transparent ...` Tailwind override -- use the `SegmentedTabs` molecule.
- Do NOT inline a search-plus-filters Card -- use the `FilterPanel` molecule.
- Do NOT inline empty-state markup -- the `EmptyState` molecule already exists, use it.
- Do NOT manage delete-confirm, PDF-preview, or attachment-preview state directly in a page (`deleteModalOpen`, `pdfModalUrl`, etc.) -- use `useDeleteConfirm()`, `usePdfPreview()`, `useAttachmentPreview()`.
- Do NOT duplicate auth-guard boilerplate (`if (!user) redirect`) in pages -- use `useAuthRequired()`.
- Do NOT extract a molecule until a pattern repeats 3+ times. Two inlined uses is fine; the third is when extraction pays off.
- Do NOT let a `+page.svelte` exceed ~300 LOC. Above that, extract a per-route organism into `routes/{path}/_components/`.

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
