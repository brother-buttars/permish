# Contributing to Permish

Thanks for helping out! This page covers the **pull-request workflow** and the checks your
change has to pass. For a full development setup (running the app, desktop/mobile builds,
data modes, environment variables) see [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md).

## TL;DR

```bash
git checkout -b my-change          # branch — main is protected, no direct pushes
# …make your change…
bun run check:drift                # 1. docs drift guard   (repo root)
cd server && bun test              # 2. server tests
cd frontend && pnpm build && pnpm test   # 3. frontend build + tests
git commit -m "type: short summary"
git push -u origin my-change
gh pr create --base main           # open a PR; CI must be green to merge
```

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| [Bun](https://bun.sh) | 1.1+ | Server (`server/`) and repo-root scripts |
| Node.js | 24 LTS | `nvm install` reads `.nvmrc` |
| [pnpm](https://pnpm.io) | 10+ | Frontend (`frontend/`) and docs site — **not npm** |

## The pull-request workflow

`main` is a protected branch. **All changes go through a pull request** — direct pushes are
rejected, and the requirement is enforced for everyone, including administrators.

1. **Branch** off `main`: `git checkout -b my-change`.
2. **Make your change.** If you touch docs, keep them accurate — see [Keeping docs in sync](#keeping-docs-in-sync).
3. **Run the checks locally** (see below) so CI passes on the first try.
4. **Commit** using the [commit convention](#commit-messages).
5. **Push** your branch and **open a PR** against `main` (`gh pr create --base main`).
6. **CI runs the three required checks.** All must be green before the PR can merge.
7. **Merge** once green — squash merge is the norm; delete the branch after.

No approvals are required (solo-friendly), but the checks are non-negotiable.

## Required checks

These three jobs (defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml)) must
pass before a PR merges. Run them locally first:

| Check | Local command | What it does |
|-------|---------------|--------------|
| **Docs Drift** | `bun run check:drift` | Fails if living docs reintroduce terminology for architecture that was consolidated away. See [`scripts/check-doc-drift.ts`](scripts/check-doc-drift.ts). |
| **Server Tests** | `cd server && bun test` | In-process Hono tests against an in-memory SQLite DB. |
| **Frontend Build** | `cd frontend && pnpm build && pnpm test` | Production build + Vitest. |

If you change the data model, regenerate the schema first — `bun run gen:schema` — and never
edit the `*.generated.ts` files by hand. A guard test (`server/test/schema.test.ts`, part of
`bun test`) fails if the generated files drift from `shared/schema.ts`.

## Keeping docs in sync

The living docs (`docs/`, the docs site, `CLAUDE.md`, the READMEs, and this file) must
describe the app as it is today — a single Bun + Hono + SQLite backend. The **Docs Drift**
check enforces this: it fails a PR whose docs reintroduce terminology for the old,
consolidated-away architecture.

- A past-tense mention (e.g. "this used to run on…") is allowed automatically.
- For a genuine, intentional exception, add a `drift-ok` marker on the line.
- The banned terms and scanned paths are the two lists at the top of
  [`scripts/check-doc-drift.ts`](scripts/check-doc-drift.ts) — update them if the
  architecture changes.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/): a `type:` prefix and a
short imperative summary. Common types in this repo:

```
feat:      a new user-facing feature      fix:       a bug fix
docs:      documentation only             refactor:  code change, no behavior change
test:      tests only                     chore:     tooling / housekeeping
ci:        CI / workflow changes
```

A scope is optional: `fix(admin): …`. Keep the summary under ~72 characters.

## Project conventions

Before writing code, skim [`CLAUDE.md`](CLAUDE.md) — it's the source of truth for
conventions: the repository pattern for data access, exact field names, the shadcn-svelte
component approach, toast/modal usage, and route mounting order. The docs site also has a
[Code Style](https://brother-buttars.github.io/permish/contributing/code-style/) page.
