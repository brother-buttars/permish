---
id: ADR-004
title: "Hand-built shadcn-svelte components instead of CLI"
status: accepted
created: 2026-03-19
updated: 2026-03-22
tags:
  - architecture
  - ui
---

# Hand-built shadcn-svelte components instead of CLI

## Context

The app uses SvelteKit with Svelte 5 runes. shadcn-svelte provides a design system, but the CLI registry has reliability issues.

## Decision

Hand-build shadcn-svelte components in `frontend/src/lib/components/ui/` following the exact shadcn patterns (same CSS classes, same `cn()` utility, same prop interfaces).

## Rationale

- shadcn-svelte CLI registry is currently unreliable
- Hand-building ensures Svelte 5 runes compatibility (`$props()`, `$state()`, `$derived`)
- Components follow exact shadcn patterns for consistency
- bits-ui used as the headless primitive layer (Sheet, etc.)
- `cn()` utility (clsx + tailwind-merge) at `$lib/utils.ts`
- tailwind-variants used for component variant definitions

## Consequences

- New shadcn components must be manually created following established patterns
- Must check the [[conventions/registry|registry]] before creating new components to avoid duplication
- 7 primitive components currently exist: Button, Input, Label, Textarea, Card, Separator, Sheet

## See also

- [[conventions/ui|UI conventions]]
- [[conventions/registry|Component and utility registry]]
