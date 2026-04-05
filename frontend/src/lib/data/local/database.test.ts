import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../test-helpers';

describe('LocalDatabase (sql.js)', () => {
  let db: TestDatabase;

  beforeEach(async () => {
    db = await createTestDatabase();
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // already closed
    }
  });

  describe('execute', () => {
    it('should create a table', async () => {
      const result = await db.execute(
        'CREATE TABLE test_table (id TEXT PRIMARY KEY, name TEXT NOT NULL)'
      );
      expect(result).toHaveProperty('rowsAffected');
    });

    it('should insert a record and report rowsAffected', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      const result = await db.execute('INSERT INTO items (id, label) VALUES (?, ?)', [1, 'alpha']);
      expect(result.rowsAffected).toBe(1);
    });

    it('should update records and report correct rowsAffected', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      await db.execute('INSERT INTO items (id, label) VALUES (?, ?)', [1, 'a']);
      await db.execute('INSERT INTO items (id, label) VALUES (?, ?)', [2, 'b']);
      await db.execute('INSERT INTO items (id, label) VALUES (?, ?)', [3, 'a']);

      const result = await db.execute("UPDATE items SET label = 'updated' WHERE label = 'a'");
      expect(result.rowsAffected).toBe(2);
    });

    it('should handle params binding with different types', async () => {
      await db.execute(
        'CREATE TABLE mixed (id INTEGER PRIMARY KEY, name TEXT, active INTEGER, score REAL)'
      );
      await db.execute('INSERT INTO mixed VALUES (?, ?, ?, ?)', [1, 'test', 1, 3.14]);

      const rows = await db.query<{ id: number; name: string; active: number; score: number }>(
        'SELECT * FROM mixed WHERE id = ?',
        [1]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe('test');
      expect(rows[0].active).toBe(1);
      expect(rows[0].score).toBeCloseTo(3.14);
    });
  });

  describe('query', () => {
    it('should return empty array for no results', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      const rows = await db.query('SELECT * FROM items');
      expect(rows).toEqual([]);
    });

    it('should return inserted records as objects', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      await db.execute('INSERT INTO items VALUES (?, ?)', [1, 'first']);
      await db.execute('INSERT INTO items VALUES (?, ?)', [2, 'second']);

      const rows = await db.query<{ id: number; label: string }>('SELECT * FROM items ORDER BY id');
      expect(rows).toHaveLength(2);
      expect(rows[0]).toEqual({ id: 1, label: 'first' });
      expect(rows[1]).toEqual({ id: 2, label: 'second' });
    });

    it('should support parameterized queries', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      await db.execute('INSERT INTO items VALUES (?, ?)', [1, 'first']);
      await db.execute('INSERT INTO items VALUES (?, ?)', [2, 'second']);

      const rows = await db.query<{ id: number; label: string }>(
        'SELECT * FROM items WHERE id = ?',
        [2]
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].label).toBe('second');
    });

    it('should handle NULL values', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      await db.execute('INSERT INTO items VALUES (?, ?)', [1, null]);

      const rows = await db.query<{ id: number; label: string | null }>(
        'SELECT * FROM items WHERE id = 1'
      );
      expect(rows[0].label).toBeNull();
    });
  });

  describe('exportDatabase / importDatabase', () => {
    it('should round-trip data through export and import', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      await db.execute('INSERT INTO items VALUES (?, ?)', [1, 'hello']);
      await db.execute('INSERT INTO items VALUES (?, ?)', [2, 'world']);

      // Export
      const exported = db.exportDatabase();
      expect(exported).toBeInstanceOf(Uint8Array);
      expect(exported.length).toBeGreaterThan(0);

      // Import into a fresh database
      const db2 = await createTestDatabase();
      await db2.importDatabase(exported);

      const rows = await db2.query<{ id: number; label: string }>(
        'SELECT * FROM items ORDER BY id'
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].label).toBe('hello');
      expect(rows[1].label).toBe('world');

      db2.close();
    });

    it('should allow continued operations after import', async () => {
      await db.execute('CREATE TABLE items (id INTEGER PRIMARY KEY, label TEXT)');
      await db.execute('INSERT INTO items VALUES (?, ?)', [1, 'before']);

      const exported = db.exportDatabase();

      const db2 = await createTestDatabase();
      await db2.importDatabase(exported);

      // Insert more data after import
      await db2.execute('INSERT INTO items VALUES (?, ?)', [2, 'after']);

      const rows = await db2.query<{ id: number; label: string }>(
        'SELECT * FROM items ORDER BY id'
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].label).toBe('before');
      expect(rows[1].label).toBe('after');

      db2.close();
    });
  });
});
