'use strict';

/*
 * Durable copy of case media in PostgreSQL.
 *
 * Case media (fundus image, Grad-CAM, masks, report PDF) is written to the
 * local disk under MEDIA_ROOT. On hosts whose disk is ephemeral (Render's
 * free tier wipes it on every sleep/restart/redeploy) those files disappear
 * while the case rows survive, so every older case shows a broken image.
 *
 * This module mirrors each media file into the media_blobs table, byte for
 * byte as stored on disk (i.e. already AES-256-GCM encrypted when
 * MEDIA_ENCRYPTION_KEY is set -- the database never holds plaintext media),
 * and restores a missing file from there on first access.
 *
 * Disk stays the working copy; the table is the durable one. Failures here are
 * logged loudly but never fail ingestion or grading.
 */

const fs = require('fs');
const path = require('path');

const pool = require('../db/pgClient');
const mediaPaths = require('./mediaPaths');

const DISABLED = process.env.MEDIA_DB_MIRROR === '0';

/** MEDIA_ROOT-relative, forward-slash key for an absolute path, or null if outside. */
function keyFor(absPath) {
  if (!absPath) return null;
  const rel = path.relative(mediaPaths.MEDIA_ROOT, path.resolve(absPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  const key = rel.split(path.sep).join('/');
  if (key.startsWith('chunks/')) return null;   // transient upload parts, never mirrored
  return key;
}

/** Upsert one file's current on-disk bytes. */
async function persistFile(absPath) {
  if (DISABLED) return false;
  const key = keyFor(absPath);
  if (!key || !fs.existsSync(absPath) || absPath.endsWith('.enc-tmp')) return false;
  try {
    const data = fs.readFileSync(absPath);
    await pool.query(
      `INSERT INTO media_blobs (media_key, data, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (media_key) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [key, data]);
    return true;
  } catch (err) {
    console.error(`[mediaStore] could not persist ${key}: ${err.message}`);
    return false;
  }
}

/** Upsert every file under a directory (recursively). */
async function persistDir(dir) {
  if (DISABLED || !dir || !fs.existsSync(dir)) return 0;
  let n = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) n += await persistDir(p);
    else if (entry.isFile() && !entry.name.endsWith('.enc-tmp')) n += (await persistFile(p)) ? 1 : 0;
  }
  return n;
}

function writeRestored(key, data) {
  const abs = path.join(mediaPaths.MEDIA_ROOT, ...key.split('/'));
  if (fs.existsSync(abs)) return false;
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.restore-tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, abs);
  return true;
}

/** If absPath is missing on disk but mirrored, write it back. Returns true if the file now exists. */
async function restoreFile(absPath) {
  if (!absPath) return false;
  if (fs.existsSync(absPath)) return true;
  if (DISABLED) return false;
  const key = keyFor(absPath);
  if (!key) return false;
  try {
    const { rows } = await pool.query('SELECT data FROM media_blobs WHERE media_key = $1', [key]);
    if (!rows.length) return false;
    writeRestored(key, rows[0].data);
    return true;
  } catch (err) {
    console.error(`[mediaStore] could not restore ${key}: ${err.message}`);
    return false;
  }
}

/** Restore every mirrored file of one case that is missing on disk. */
async function restoreCaseDir(caseId) {
  if (DISABLED || !caseId) return 0;
  try {
    const { rows } = await pool.query(
      'SELECT media_key, data FROM media_blobs WHERE media_key LIKE $1', [`cases/${caseId}/%`]);
    let n = 0;
    for (const r of rows) n += writeRestored(r.media_key, r.data) ? 1 : 0;
    return n;
  } catch (err) {
    console.error(`[mediaStore] could not restore case ${caseId}: ${err.message}`);
    return 0;
  }
}

module.exports = { persistFile, persistDir, restoreFile, restoreCaseDir, _keyFor: keyFor };
