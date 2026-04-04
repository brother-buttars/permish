---
title: "UI conventions"
created: 2026-03-22
updated: 2026-03-22
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

## File patterns

- UI primitives: `frontend/src/lib/components/ui/{component-name}/` (folder with `index.ts` + `.svelte` files)
- Feature components: `frontend/src/lib/components/{ComponentName}.svelte` (single file)
- Pages: `frontend/src/routes/{path}/+page.svelte`

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

1. Use `cn()` from `$lib/utils.ts` for merging Tailwind classes.
2. Use shadcn-svelte components for all standard UI elements -- check [[conventions/registry]] first.
3. All components must use Svelte 5 runes (no `export let`, no `$:` reactive statements).
4. Use `ConfirmModal` for destructive actions, never `confirm()`.
5. Use toast system (`toastSuccess`, `toastError`) for notifications, never `alert()`.
6. Theme colors use CSS variables in oklch format from `frontend/src/app.css`.

## Canonical examples

- `frontend/src/lib/components/ui/button/` -- good primitive component structure
- `frontend/src/lib/components/ConfirmModal.svelte` -- good feature component pattern
- `frontend/src/routes/dashboard/+page.svelte` -- good page structure

## Anti-patterns

- Do NOT use `export let` -- use `$props()` instead (Svelte 5 runes)
- Do NOT use `$:` reactive statements -- use `$derived` or `$effect`
- Do NOT recreate UI primitives that exist in `components/ui/`
- Do NOT use `alert()` or `confirm()` -- use toasts and ConfirmModal

## See also

- [[conventions/registry|Component and utility registry]]
- [[conventions/anti-patterns|Anti-patterns]]
