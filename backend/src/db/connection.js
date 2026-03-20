const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('../config');
const { createTables } = require('./schema');

let db;

function getDb() {
  if (db) return db;

  fs.mkdirSync(config.dataDir, { recursive: true });
  const dbPath = path.join(config.dataDir, 'permission-forms.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables(db);
  return db;
}

module.exports = { getDb };
