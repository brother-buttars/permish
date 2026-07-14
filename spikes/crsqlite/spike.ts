/**
 * Phase 5 spike — does cr-sqlite's CRDT merge fix the "two offline devices edit
 * the same record" clobber that Permish's current last-write-wins queue suffers?
 *
 * Run: bun run spike.ts
 */
import { Database } from 'bun:sqlite';

// Bun's bundled SQLite disables extension loading, so point it at a build that
// allows it (Homebrew's) BEFORE opening any database. This is itself a finding:
// the server would ship/link an extension-enabled SQLite to use cr-sqlite.
Database.setCustomSQLite('/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib');

const EXT = new URL('./dist/crsqlite.dylib', import.meta.url).pathname;

const SCHEMA = `
  CREATE TABLE events (
    id TEXT PRIMARY KEY NOT NULL,
    event_name TEXT NOT NULL DEFAULT '',
    leader_phone TEXT NOT NULL DEFAULT ''
  );
`;

function device(label: string): Database {
  const db = new Database(':memory:');
  db.loadExtension(EXT);
  db.exec(SCHEMA);
  db.exec(`SELECT crsql_as_crr('events');`); // make the table a conflict-free replicated relation
  (db as any).__label = label;
  return db;
}

/** Pull the changeset newer than `sinceVersion` from `src`, apply it to `dst`. Returns rows synced. */
function syncChanges(src: Database, dst: Database, sinceVersion: number): number {
  const changes = src
    .query(
      `SELECT "table", pk, cid, val, col_version, db_version, COALESCE(site_id, crsql_site_id()) as site_id, cl, seq
       FROM crsql_changes WHERE db_version > ?`
    )
    .all(sinceVersion) as any[];
  const insert = dst.prepare(
    `INSERT INTO crsql_changes ("table", pk, cid, val, col_version, db_version, site_id, cl, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  for (const c of changes) {
    insert.run(c.table, c.pk, c.cid, c.val, c.col_version, c.db_version, c.site_id, c.cl, c.seq);
  }
  return changes.length;
}

function dump(db: Database): { event_name: string; leader_phone: string } {
  return db.query(`SELECT event_name, leader_phone FROM events WHERE id = 'e1'`).get() as any;
}

const A = device('A');
const B = device('B');

// 1. Both devices start synced: e1 = { Camp, 111 }.
A.exec(`INSERT INTO events (id, event_name, leader_phone) VALUES ('e1', 'Camp', '111');`);
syncChanges(A, B, 0);
console.log('\nInitial (both synced):', dump(A));

// Snapshot each device's current db_version so we only sync *new* offline edits.
const verA = (A.query('SELECT crsql_db_version() as v').get() as any).v;
const verB = (B.query('SELECT crsql_db_version() as v').get() as any).v;

// 2. OFFLINE: A renames the event; B fixes the leader phone. Different columns, same row.
A.exec(`UPDATE events SET event_name = 'Summer Camp' WHERE id = 'e1';`);
B.exec(`UPDATE events SET leader_phone = '999' WHERE id = 'e1';`);
console.log('Offline — A:', dump(A), ' B:', dump(B));

// 3. RECONNECT: exchange changesets both ways.
const a2b = syncChanges(A, B, verA);
const b2a = syncChanges(B, A, verB);
console.log(`\nReconnect: synced ${a2b} change(s) A→B, ${b2a} change(s) B→A`);

const finalA = dump(A);
const finalB = dump(B);
console.log('Final — A:', finalA, ' B:', finalB);

const merged =
  finalA.event_name === 'Summer Camp' && finalA.leader_phone === '999' &&
  finalB.event_name === 'Summer Camp' && finalB.leader_phone === '999';

console.log('\n' + '─'.repeat(60));
console.log(merged
  ? '✅ MERGED cleanly — both edits survived on both devices (no clobber).'
  : '❌ CLOBBERED — an edit was lost.');
console.log('Contrast: the current last-write-wins queue would push each device\'s');
console.log('FULL row, so whichever synced last wins entirely — one edit is lost.');
console.log('─'.repeat(60));

A.exec(`SELECT crsql_finalize();`);
B.exec(`SELECT crsql_finalize();`);
A.close();
B.close();

process.exit(merged ? 0 : 1);
