---
title: "UI conventions"
created: 2026-03-22
updated: 2026-04-24
tags:
  - conventions
  - ui
---

# UI conventions

## Stack

- SvelteKit 2 with Svelte 5 runes mode
- shadcn-svelte components (hand-built in `frontend/src/lib/components/ui/`)
- bits-ui for headless primitives
- Tailwind CSS v4

## Atomic layering

The frontend is organized as an atomic design system. Every component lives in exactly one of these layers:

| Layer | Lives in | What it is | Examples |
|-------|----------|------------|----------|
| **Atom** | `lib/components/ui/` (shadcn primitives) and `lib/components/atoms/` (project atoms) | Single-purpose, no app state, no business logic. Pure visual primitive. | Button, Input, Label, Badge, Card, Spinner, StatusBadge, OrgBadge |
| **Molecule** | `lib/components/molecules/` | Composes 2+ atoms into a reusable block. May own UI state (open/close, validation message) but no domain state. | PageHeader, FilterPanel, SegmentedTabs, ListCard, EmptyState, FormField, ConfirmModal |
| **Organism** | `lib/components/organisms/` | Larger feature block. Owns domain state, talks to repository/composables, composes molecules + atoms. | UserMenu, AppHeader, SignaturePad, MedicalInfoSection, SubmissionListView, EventListView |
| **Composable** | `lib/components/composables/` | Stateful hook (function returning runes-backed state + actions). No markup. | `useDeleteConfirm()`, `usePdfPreview()`, `useAuthRequired()` |
| **Page** | `routes/**/+page.svelte` | Route-level layout. Wires up data via `getRepository()` and composables, lays out organisms + molecules. Should not contain inlined header/card/filter markup. | dashboard, events, event/[id] |

### The 3× rule

If a visual pattern appears inlined in **three or more places**, extract it to a molecule before adding the fourth use. Three similar lines is fine; four is debt. Before extracting, check `conventions/registry.md` — the molecule may already exist.

### Choosing the right layer

- It only renders one HTML element + classes → **atom**.
- It needs a label, an icon, and a button next to each other, used in many pages → **molecule**.
- It loads data, mutates state, or knows about domain types (Event, Submission, Profile) → **organism**.
- It's reusable stateful logic with no markup → **composable**.
- Don't reach for an organism just because a molecule has a slot — slots are fine.

### When NOT to extract

- Used once, looks unlikely to repeat → leave it in the page.
- Two uses, but they're diverging in feel → leave them; revisit at three.
- The "abstraction" would just be a wrapper around a single shadcn primitive with no added behavior → use the primitive directly.

## File patterns

- UI primitives (shadcn): `frontend/src/lib/components/ui/{component-name}/` (folder with `index.ts` + `.svelte` files)
- Project atoms: `frontend/src/lib/components/atoms/{ComponentName}.svelte`
- Molecules: `frontend/src/lib/components/molecules/{ComponentName}.svelte`
- Organisms: `frontend/src/lib/components/organisms/{ComponentName}.svelte`
- Composables: `frontend/src/lib/components/composables/{useName}.svelte.ts` (`.svelte.ts` so runes work)
- Pages: `frontend/src/routes/{path}/+page.svelte`

Per-page sub-organisms that aren't reused live next to the route as `routes/{path}/_components/{Name}.svelte` (underscore prefix so SvelteKit ignores them as routes).

## Structure

Components use Svelte 5 runes: `$props()`, `$state()`, `$derived`, `$effect`, `$bindable()`.

```svelte
<script lang="ts">
  import { cn } from "$lib/utils";

  let { class: className, ...restProps } = $props();
</script>

<div class={cn("base-classes", className)} {...restProps}>
  {@render children?.()}
</div>
```

## Rules

1. Before writing any new component, check [[conventions/registry]] for an existing one.
2. Use `cn()` from `$lib/utils.ts` for merging Tailwind classes.
3. Use shadcn-svelte primitives from `lib/components/ui/` for all standard UI building blocks.
4. All components must use Svelte 5 runes (no `export let`, no `$:` reactive statements).
5. Use `ConfirmModal` for destructive actions, never `confirm()`.
6. Use toast system (`toastSuccess`, `toastError`) for notifications, never `alert()`.
7. Theme colors use CSS variables in oklch format from `frontend/src/app.css`.
8. **Honor the 3× rule.** If you find yourself writing the same header/card/filter/badge markup for the third time, extract a molecule before continuing.
9. Pages should orchestrate, not render details. **Soft target: 300 LOC per `+page.svelte`.** Pages that are intentionally over 300 LOC are input-heavy (`form/[id]`, `account`, `profiles`, `event/[id]/edit`, `create`) and consist mostly of `$state` form-field declarations + validation logic — further extraction would just shuffle that verbosity into bindable-prop noise.

## Canonical examples

- `frontend/src/lib/components/ui/button/` -- canonical atom structure
- `frontend/src/lib/components/ConfirmModal.svelte` -- canonical molecule pattern
- `frontend/src/lib/components/SignaturePad.svelte` -- canonical organism (owns canvas state, composes atoms)
- `frontend/src/routes/dashboard/+page.svelte` -- canonical page structure (wires organisms together, no inlined detail)

## Anti-patterns

See [[conventions/anti-patterns]] for the full list. Atomic-design highlights:

- Do NOT inline a page header (title + subtitle + actions row) — use `PageHeader` molecule.
- Do NOT inline a card list row — use `ListCard` molecule.
- Do NOT inline a status/org/youth badge with raw utility classes — use the corresponding badge atom.
- Do NOT recreate UI primitives that exist in `components/ui/`.
- Do NOT manage delete-confirm or PDF-preview state directly in a page — use the matching composable.

## See also

- [[conventions/registry|Component and utility registry]]
- [[conventions/anti-patterns|Anti-patterns]]
