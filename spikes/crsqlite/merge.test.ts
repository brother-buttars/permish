import { test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { Database } from 'bun:sqlite';

// Regression test for the Phase 5 finding: cr-sqlite merges concurrent offline
// edits to the same row without clobbering (unlike the current last-write-wins
// queue). Self-skips when the native extension or an extension-enabled SQLite
// isn't present (e.g. CI without the prebuilt binary) — run `bun run spike.ts`
// notes in README.md to provision it locally.

const EXT = new URL('./dist/crsqlite.dylib', import.meta.url).pathname;
const SYS_SQLITE = '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib';
const available = existsSync(EXT) && existsSync(SYS_SQLITE);

function device(): Database {
	const db = new Database(':memory:');
	db.loadExtension(EXT);
	db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY NOT NULL, event_name TEXT NOT NULL DEFAULT '', leader_phone TEXT NOT NULL DEFAULT '');`);
	db.exec(`SELECT crsql_as_crr('events');`);
	return db;
}

function syncChanges(src: Database, dst: Database, since: number): void {
	const changes = src
		.query(
			`SELECT "table", pk, cid, val, col_version, db_version, COALESCE(site_id, crsql_site_id()) as site_id, cl, seq
       FROM crsql_changes WHERE db_version > ?`
		)
		.all(since) as any[];
	const insert = dst.prepare(
		`INSERT INTO crsql_changes ("table", pk, cid, val, col_version, db_version, site_id, cl, seq)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
	);
	for (const c of changes) insert.run(c.table, c.pk, c.cid, c.val, c.col_version, c.db_version, c.site_id, c.cl, c.seq);
}

const dump = (db: Database) => db.query(`SELECT event_name, leader_phone FROM events WHERE id = 'e1'`).get() as any;

test.skipIf(!available)('cr-sqlite merges concurrent offline edits to the same row (no clobber)', () => {
	const A = device();
	const B = device();

	A.exec(`INSERT INTO events (id, event_name, leader_phone) VALUES ('e1', 'Camp', '111');`);
	syncChanges(A, B, 0);
	expect(dump(B)).toEqual({ event_name: 'Camp', leader_phone: '111' });

	const verA = (A.query('SELECT crsql_db_version() as v').get() as any).v;
	const verB = (B.query('SELECT crsql_db_version() as v').get() as any).v;

	// Different columns of the same row, edited offline on each device.
	A.exec(`UPDATE events SET event_name = 'Summer Camp' WHERE id = 'e1';`);
	B.exec(`UPDATE events SET leader_phone = '999' WHERE id = 'e1';`);

	// Reconnect: exchange changesets both ways.
	syncChanges(A, B, verA);
	syncChanges(B, A, verB);

	const expected = { event_name: 'Summer Camp', leader_phone: '999' };
	expect(dump(A)).toEqual(expected); // both edits survived on A
	expect(dump(B)).toEqual(expected); // ...and on B

	A.exec(`SELECT crsql_finalize();`);
	B.exec(`SELECT crsql_finalize();`);
	A.close();
	B.close();
});
