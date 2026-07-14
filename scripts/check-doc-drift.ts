/**
 * Doc/code drift guard.
 *
 * Run from the repo root:  bun run check:drift
 *
 * Fails (exit 1) if the *living* documentation still describes architecture that
 * was consolidated away — PocketBase, the Express backend, the Node sidecar,
 * Capacitor, the `PUBLIC_BACKEND` switch, `backend/src` paths, etc. This codifies
 * the manual grep used during the single-backend consolidation so the docs can't
 * silently drift back.
 *
 * Scope is deliberately narrow to stay high-signal / low-noise:
 *   - Scans living docs only (docs/, docs-site content, btrs knowledge, CLAUDE.md,
 *     READMEs) — NOT source comments (which legitimately carry `ported from …`
 *     provenance) and NOT dated historical records (changelog, evidence, ADRs).
 *   - A line is treated as an intentional, past-tense mention (and skipped) if it
 *     contains negation/provenance context (e.g. "no longer", "removed", "former")
 *     or the explicit escape hatch marker `drift-ok`.
 *
 * Companion to the code/code drift guard `server/test/schema.test.ts`, which fails
 * if the generated SQLite schema drifts from shared/schema.ts.
 */

import { Glob } from 'bun';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

/** Living docs to scan (globs, relative to repo root). */
const INCLUDE = [
  'docs/**/*.md',
  'docs-site/src/**/*.md',
  'docs-site/src/**/*.mdx',
  'btrs/index.md',
  'btrs/project-map.md',
  'btrs/knowledge/**/*.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  'README.md',
  'frontend/README.md',
  'scripts/README.md',
];

/** Paths never scanned: ADRs + dated records are point-in-time history; generated files aren't authored. */
const EXCLUDE = [/^btrs\/knowledge\/decisions\//, /\.generated\./];

/** Terms that must not appear as CURRENT facts in living docs. */
const BANNED: { re: RegExp; label: string }[] = [
  { re: /pocketbase/i, label: 'PocketBase — removed; the only backend is the Bun + Hono server' },
  { re: /\bcapacitor\b/i, label: 'Capacitor — not used; Tauri v2 handles mobile' },
  { re: /PUBLIC_BACKEND|PUBLIC_PB_URL|PUBLIC_SIDECAR_URL/, label: 'removed backend-switch env var' },
  { re: /pb_migrations/, label: 'pb_migrations — removed PocketBase schema dir' },
  { re: /better-sqlite3/, label: 'better-sqlite3 — server uses bun:sqlite, offline uses sql.js' },
  { re: /node[-\s]sidecar/i, label: 'Node sidecar — removed' },
  { re: /backend\/src/, label: 'backend/src — removed path; the backend now lives in server/src' },
  { re: /\bschema\.js\b/, label: 'schema.js — the data model is now shared/schema.ts' },
  { re: /\bexpress\s+(backend|server|mode|5|router|app)\b/i, label: 'Express — removed; replaced by Hono' },
  { re: /require\(['"]express/i, label: 'Express require — removed; replaced by Hono' },
];

/** A line with any of these is an intentional past-tense mention (or explicitly waived) and is skipped. */
const ALLOW_CONTEXT =
  /no longer|not used|there is no|there are no|\bformer(ly)?\b|previously|used to|instead of|replaced|replaces|ported from|consolidated away|\bremoved\b|deprecated|drift-ok/i;

const violations: { file: string; line: number; text: string; label: string }[] = [];

for (const pattern of INCLUDE) {
  const glob = new Glob(pattern);
  for await (const rel of glob.scan({ cwd: root, onlyFiles: true })) {
    if (EXCLUDE.some((re) => re.test(rel))) continue;
    const text = await Bun.file(`${root}${rel}`).text();
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (ALLOW_CONTEXT.test(line)) continue;
      for (const { re, label } of BANNED) {
        if (re.test(line)) {
          violations.push({ file: rel, line: i + 1, text: line.trim(), label });
          break; // one finding per line is enough
        }
      }
    }
  }
}

if (violations.length === 0) {
  console.log('✓ doc-drift: no removed-architecture terms in living docs');
  process.exit(0);
}

console.error(`✗ doc-drift: ${violations.length} stale reference(s) in living docs\n`);
for (const v of violations) {
  console.error(`  ${v.file}:${v.line}`);
  console.error(`    ${v.text}`);
  console.error(`    → ${v.label}\n`);
}
console.error(
  'These docs describe architecture that was consolidated away. Update them to the\n' +
    'single Bun + Hono + SQLite backend. If a mention is intentional (a past-tense\n' +
    'disclaimer or historical note), phrase it in the past tense or add a `drift-ok`\n' +
    'marker on the line.',
);
process.exit(1);
