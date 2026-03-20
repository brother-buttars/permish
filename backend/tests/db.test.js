const { createTestDb } = require('./setup');

describe('Database schema', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  test('creates users table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").all();
    expect(tables).toHaveLength(1);
  });

  test('creates events table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='events'").all();
    expect(tables).toHaveLength(1);
  });

  test('creates child_profiles table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='child_profiles'").all();
    expect(tables).toHaveLength(1);
  });

  test('creates submissions table', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'").all();
    expect(tables).toHaveLength(1);
  });

  test('enforces unique email on users', () => {
    const insert = db.prepare("INSERT INTO users (id, email, password_hash, name, role, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))");
    insert.run('id1', 'test@test.com', 'hash', 'Test', 'parent');
    expect(() => insert.run('id2', 'test@test.com', 'hash', 'Test2', 'parent')).toThrow();
  });
});
