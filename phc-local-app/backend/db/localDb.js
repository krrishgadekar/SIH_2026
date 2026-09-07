'use strict';

/**
 * localDb.js
 *
 * The PHC local SQLite database handle.
 *
 * Exports the RAW better-sqlite3 instance. Every route and service calls
 * db.prepare(sql).run(...) / .get(...) / .all(...) directly against it.
 * Deliberately no query-builder or repository layer on top -- at this scale
 * that is indirection without benefit, and it would hide the SQL that the
 * api-contracts.md field mapping has to be checked against (Task 0.2).
 *
 * Requiring this module creates local.sqlite (if absent) and applies
 * schema.sql. Every statement in schema.sql is CREATE ... IF NOT EXISTS, so
 * this is idempotent and safe on every server start.
 *
 * better-sqlite3 is synchronous by design. That is the right choice here: the
 * queries are single-row primary-key lookups on a local file, so the async
 * ceremony would cost more than the blocking does, and the local app is a
 * single-technician workload, not a concurrent server.
 */

const path     = require('path');
const fs       = require('fs');
const Database = require('better-sqlite3');

const DB_PATH     = path.join(__dirname, 'local.sqlite');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

const db = new Database(DB_PATH);

// WAL keeps reads from blocking behind the sync manager's writes, which matters
// because syncManager.js polls on a timer while the technician is capturing.
db.pragma('journal_mode = WAL');

// Enforce the REFERENCES clauses in schema.sql. SQLite ignores foreign keys
// unless this is switched on per-connection -- without it, a capture could be
// written against a patient_id that does not exist and nothing would complain.
db.pragma('foreign_keys = ON');

db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));

module.exports = db;
