import { test, expect } from 'bun:test';
import { existsSync } from 'node:fs';
import { Database } from 'bun:sqlite';

// End-to-end proof of the *production* sync topology cr-sqlite adoption would use:
// multiple clients syncing through a central server (the Bun server) by exchanging
// cr-sqlite changesets — NOT peer-to-peer. This is the protocol the rewritten
// SyncManager + a `/api/sync` endpoint would implement. Self-skips without the lib.

const EXT = new URL('./dist/crsqlite.dylib', import.meta.url).pathname;
const SYS_SQLITE = '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib';
const available = existsSync(EXT) && existsSync(SYS_SQLITE);

const CHANGE_COLS = `"table", pk, cid, val, col_version, db_version, site_id, cl, seq`;

function node(): Database {
	const db = new Database(':memory:');
	db.loadExtension(EXT);
	db.exec(`CREATE TABLE events (id TEXT PRIMARY KEY NOT NULL, event_name TEXT NOT NULL DEFAULT '', leader_phone TEXT NOT NULL DEFAULT '');`);
	db.exec(`SELECT crsql_as_crr('events');`);
	return db;
}
const dbVersion = (db: Database) => (db.query('SELECT crsql_db_version() as v').get() as any).v as number;
const siteId = (db: Database) => (db.query('SELECT crsql_site_id() as s').get() as any).s;
const dump = (db: Database) => db.query(`SELECT event_name, leader_phone FROM events WHERE id = 'e1'`).get() as any;

/** A client tracks how far it has pushed its own changes and pulled the server's. */
interface Cursor { pushed: number; pulledServerVersion: number; site: unknown }

function applyChanges(dst: Database, rows: any[]) {
	const insert = dst.prepare(`INSERT INTO crsql_changes (${CHANGE_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
	for (const c of rows) insert.run(c.table, c.pk, c.cid, c.val, c.col_version, c.db_version, c.site_id, c.cl, c.seq);
}

/** Push the client's own local changes (its site only) to the server. */
function push(client: Database, server: Database, cur: Cursor) {
	const rows = client
		.query(`SELECT ${CHANGE_COLS} FROM crsql_changes WHERE db_version > ? AND site_id = crsql_site_id()`)
		.all(cur.pushed) as any[];
	applyChanges(server, rows);
	cur.pushed = dbVersion(client);
}

/** Pull everyone-else's changes the server has seen, since the client last pulled. */
function pull(client: Database, server: Database, cur: Cursor) {
	const rows = server
		.query(`SELECT ${CHANGE_COLS} FROM crsql_changes WHERE db_version > ? AND site_id != ?`)
		.all(cur.pulledServerVersion, cur.site) as any[];
	applyChanges(client, rows);
	cur.pulledServerVersion = dbVersion(server);
}

test.skipIf(!available)('multiple clients converge through a central server (no clobber)', () => {
	const server = node();
	const A = node();
	const B = node();
	const curA: Cursor = { pushed: 0, pulledServerVersion: 0, site: siteId(A) };
	const curB: Cursor = { pushed: 0, pulledServerVersion: 0, site: siteId(B) };

	// A creates the event and pushes; B pulls it down from the server.
	A.exec(`INSERT INTO events (id, event_name, leader_phone) VALUES ('e1', 'Camp', '111');`);
	push(A, server, curA);
	pull(B, server, curB);
	expect(dump(B)).toEqual({ event_name: 'Camp', leader_phone: '111' });

	// Both go offline and edit different columns of the same row.
	A.exec(`UPDATE events SET event_name = 'Summer Camp' WHERE id = 'e1';`);
	B.exec(`UPDATE events SET leader_phone = '999' WHERE id = 'e1';`);

	// Reconnect: each pushes its own edit, then pulls the other's (via the server).
	push(A, server, curA);
	push(B, server, curB);
	pull(A, server, curA);
	pull(B, server, curB);

	const expected = { event_name: 'Summer Camp', leader_phone: '999' };
	expect(dump(server)).toEqual(expected);
	expect(dump(A)).toEqual(expected);
	expect(dump(B)).toEqual(expected);

	for (const db of [server, A, B]) {
		db.exec(`SELECT crsql_finalize();`);
		db.close();
	}
});
