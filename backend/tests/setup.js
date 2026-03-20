const Database = require('better-sqlite3');
const { createTables } = require('../src/db/schema');

function createTestDb() {
  const db = new Database(':memory:');
  createTables(db);
  return db;
}

module.exports = { createTestDb };
