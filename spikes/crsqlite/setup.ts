import { Database } from 'bun:sqlite';
import { existsSync } from 'node:fs';

// Point Bun at an extension-enabled SQLite ONCE before any Database opens, so
// cr-sqlite can be loaded. Must happen exactly once per process — hence a preload.
const SYS_SQLITE = '/opt/homebrew/opt/sqlite/lib/libsqlite3.dylib';
if (existsSync(SYS_SQLITE)) {
	try {
		Database.setCustomSQLite(SYS_SQLITE);
	} catch {
		// already set — fine
	}
}
