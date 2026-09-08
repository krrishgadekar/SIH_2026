'use strict';

/**
 * setupCentralDb.js
 *
 * Applies central-system/backend/db/schema.sql to the central Postgres database.
 *
 * Usage:
 *   node scripts/setupCentralDb.js            Create/update. Idempotent -- every
 *                                             statement is CREATE ... IF NOT EXISTS,
 *                                             so this NEVER drops or alters an
 *                                             existing table, and never touches data.
 *
 *   node scripts/setupCentralDb.js --reset    DESTRUCTIVE. Drops the entire public
 *                                             schema (all tables, all rows) and
 *                                             rebuilds from scratch.
 *
 * Why --reset exists: the no-flag path cannot migrate a table whose columns have
 * already diverged, because IF NOT EXISTS silently skips a table that is present
 * but wrong -- leaving you with a schema that looks applied but isn't. During
 * pre-checkpoint development, dropping and rebuilding is faster and safer than
 * hand-writing ALTERs. Once real data exists, replace --reset with proper
 * migrations.
 *
 * Env vars (see central-system/backend/db/pgClient.js):
 *   DATABASE_URL  or  PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
 */

const fs   = require('fs');
const path = require('path');
const pool = require('../central-system/backend/db/pgClient');

const schemaPath = path.resolve(
  __dirname, '..', 'central-system', 'backend', 'db', 'schema.sql');

const RESET = process.argv.includes('--reset');

async function run() {
  const target = process.env.DATABASE_URL
    ? process.env.DATABASE_URL.replace(/:[^:@/]*@/, ':****@')   // mask password
    : `${process.env.PGHOST || 'localhost'}:${process.env.PGPORT || 5432}` +
      `/${process.env.PGDATABASE || 'dr_screening_central'}`;

  console.log(`[setupCentralDb] Target: ${target}`);

  const sql = fs.readFileSync(schemaPath, 'utf8');

  try {
    if (RESET) {
      console.warn('[setupCentralDb] --reset given: DROPPING SCHEMA public CASCADE.');
      console.warn('[setupCentralDb] All tables and all rows will be destroyed.');
      await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      console.log('[setupCentralDb] Schema dropped and recreated empty.');
    }

    await pool.query(sql);
    console.log('[setupCentralDb] schema.sql applied successfully.');

    // Report what actually landed, so a silent no-op is visible rather than
    // being reported as success.
    const { rows } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    console.log(`[setupCentralDb] ${rows.length} tables present:`);
    for (const r of rows) console.log(`    - ${r.table_name}`);
  } catch (err) {
    console.error('[setupCentralDb] FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
