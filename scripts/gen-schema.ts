/**
 * Schema codegen — the single generator that keeps the server schema, the local
 * schema, and the sync SQL in lockstep.
 *
 * Run from the repo root:  bun run gen:schema
 *
 * Reads shared/schema.ts (the one source of truth) and writes:
 *   - server/src/schema.generated.ts
 *   - frontend/src/lib/data/local/schema.generated.ts
 *   - frontend/src/lib/data/sync/sync-columns.generated.ts
 *
 * Never edit the generated files by hand — edit shared/schema.ts and re-run.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSchemaDdl, SYNC } from '../shared/schema.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const HEADER = '// GENERATED FILE — do not edit.\n// Source: shared/schema.ts · Regenerate: `bun run gen:schema`\n\n';

function write(relPath: string, contents: string) {
  const path = root + relPath;
  writeFileSync(path, HEADER + contents);
  console.log('  wrote', relPath);
}

console.log('Generating schema from shared/schema.ts …');

write(
  'server/src/schema.generated.ts',
  'export const SERVER_SCHEMA_DDL = `\n' + buildSchemaDdl('server') + '`;\n'
);

write(
  'frontend/src/lib/data/local/schema.generated.ts',
  'export const SCHEMA_DDL = `\n' + buildSchemaDdl('local') + '`;\n'
);

write(
  'frontend/src/lib/data/sync/sync-columns.generated.ts',
  `export type SyncKind = 'plain' | 'bool' | 'nbool';
export interface SyncField { name: string; kind: SyncKind }
export interface SyncSpec { immutable: string[]; columns: SyncField[]; updateOnPull: boolean }

export const SYNC: Record<'events' | 'child_profiles' | 'submissions', SyncSpec> =
${JSON.stringify(SYNC, null, 2)};
`
);

console.log('Done.');
