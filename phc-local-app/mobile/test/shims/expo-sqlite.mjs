// expo-sqlite's async API over Node's built-in node:sqlite -- same SQLite engine.
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const clean = (params = []) => (Array.isArray(params) ? params : [params]).map((p) => (p === undefined ? null : p));

class Db {
  constructor(file) { this.db = new DatabaseSync(file); }
  async execAsync(sql) { this.db.exec(sql); }
  async getFirstAsync(sql, params) { return this.db.prepare(sql).get(...clean(params)) ?? null; }
  async getAllAsync(sql, params) { return this.db.prepare(sql).all(...clean(params)); }
  async runAsync(sql, params) {
    const r = this.db.prepare(sql).run(...clean(params));
    return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
  }
  async withTransactionAsync(fn) { return this.#tx('BEGIN', () => fn()); }
  async withExclusiveTransactionAsync(fn) { return this.#tx('BEGIN EXCLUSIVE', () => fn(this)); }
  async #tx(begin, fn) {
    this.db.exec(begin);
    try { await fn(); this.db.exec('COMMIT'); } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
}

export async function openDatabaseAsync(name) {
  return new Db(path.join(process.env.NETRASETU_TEST_ROOT, name));
}
