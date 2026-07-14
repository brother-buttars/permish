<!-- See CONTRIBUTING.md for the full workflow. Keep this description tight. -->

## Summary

<!-- What does this PR do, and why? 1–3 sentences. -->

## Changes

<!-- Bullet the notable changes. -->
-

## Verification

<!-- How did you confirm this works? Commands run + output, screenshots, or the flow you exercised. -->
-

## Checklist

- [ ] Branched off `main` (direct pushes are blocked — everything goes through a PR)
- [ ] Ran the required checks locally and they pass:
  - [ ] `bun run check:drift` — **Docs Drift**
  - [ ] `cd server && bun test` — **Server Tests**
  - [ ] `cd frontend && pnpm build && pnpm test` — **Frontend Build**
- [ ] Updated the docs if behavior or architecture changed (the Docs Drift check enforces this)
- [ ] Commits follow [Conventional Commits](https://www.conventionalcommits.org/) (`type: summary`)
