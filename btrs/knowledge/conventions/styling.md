---
title: "Styling conventions"
created: 2026-03-22
updated: 2026-03-22
tags:
  - conventions
  - styling
---

# Styling conventions

## Stack

- Tailwind CSS v4
- oklch color format with CSS variables
- Dark mode support via theme store

## File patterns

- Theme definition: `frontend/src/app.css`
- Utility: `frontend/src/lib/utils.ts` (`cn()` function)

## Rules

1. Use Tailwind utility classes -- avoid custom CSS.
2. Use `cn()` from `$lib/utils.ts` for conditional class merging.
3. Colors reference CSS variables: `bg-primary`, `text-muted-foreground`, etc.
4. Warm orange/blue theme with Inter + Source Serif fonts.
5. Dark mode uses CSS variable swapping.

## Canonical examples

- `frontend/src/app.css` -- theme variable definitions
- `frontend/src/lib/components/ui/button/button.svelte` -- class variant pattern

## Anti-patterns

- Do NOT write custom CSS when a Tailwind utility exists
- Do NOT hardcode hex colors -- use theme CSS variables
- Do NOT use `@apply` excessively

## See also

- [[conventions/ui|UI conventions]]
