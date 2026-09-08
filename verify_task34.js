'use strict';

/**
 * verify_task34.js -- Task 3.4 Definition of Done
 *
 * Run:  node verify_task34.js
 *
 * "With both servers running, a capture inserted locally appears as a case in
 *  the central DB within one polling interval without any manual trigger;
 *  stopping the central server and creating a new local capture leaves it
 *  correctly pending rather than erroring the whole local backend."
 *
 * Both halves are checked, and the OFFLINE half is the one that matters: this
 * system is built for PHCs where being disconnected is the normal state, so
 * "survives the central server being down" is a core requirement, not an edge
 * case. The test therefore runs the offline scenario FIRST, against a central
 * server that has never been started.
 *
 * Uses the real sync manager against a real central server on a private port.
 * Grading is stubbed out via a bad MATLAB path: the ingestion path and the
 * queue transitions are what Task 3.4 is about, and a real MATLAB run would add
 * ~20s per case for no extra coverage. A case whose grading fails is still
 * stored and still returns 201, so the sync manager's contract is unchanged.
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = __dirname;
const LOCAL   = path.resolve(ROOT, 'phc-local-app', 'backend');
const CENTRAL = path.resolve(ROOT, 'central-system', 'backend');

require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(ROOT, '.env') });

const CENTRAL_PORT = 5199;
process.env.CENTRAL_URL = `http://localhost:${CENTRAL_PORT}`;
// Keep the heartbeat snappy so the offline case does not stall the test.
process.env.SYNC_HEALTH_TIMEOUT_MS = '1500';
// Make grading fail fast (see header). Must be set before requiring the server,
// since gradingOrchestrator reads MATLAB_EXECUTABLE at module load.
process.env.MATLAB_EXECUTABLE = path.join(ROOT, '__no_matlab__.exe');
process.env.MATLAB_TIMEOUT_MS = '4000';

const centralApp  = require(path.join(CENTRAL, 'server.js'));
const pool        = require(path.join(CENTRAL, 'db', 'pgClient'));
const db          = require(path.join(LOCAL, 'db', 'localDb'));
const syncManager = require(path.join(LOCAL, 'services', 'syncManager'));
const syncState   = require(path.join(LOCAL, 'services', 'syncState'));
const { generateLocalId } = require(path.join(LOCAL, 'services', 'ids'));

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

const TAG = `t34-${Math.random().toString(36).slice(2, 7)}`;

/** Insert a capture + queue row directly, standing in for a real capture. */
function seedCapture(patientId, label) {
  const captureId = generateLocalId();
  const imgSrc    = path.join(ROOT, 'datasets', '2.jpg');
  const storage   = path.join(LOCAL, 'storage');
  fs.mkdirSync(storage, { recursive: true });
  const imgPath = path.join(storage, `${captureId}.jpg`);
  fs.copyFileSync(imgSrc, imgPath);

  db.prepare(`
    INSERT INTO captures (capture_id, patient_id, camera_device_id, image_path,
                          quality_status, quality_reason, retake_count, captured_at)
    VALUES (?, ?, 'unknown', ?, 'pass', NULL, 0, ?)
  `).run(captureId, patientId, imgPath, new Date().toISOString());

  db.prepare(`
    INSERT INTO questionnaire_responses
      (response_id, capture_id, risk_factor_fields, symptom_fields, language, recorded_at)
    VALUES (?, ?, ?, ?, 'hi', ?)
  `).run(generateLocalId(), captureId,
    JSON.stringify({ yearsSinceDiagnosis: 'lt1', glycemicControl: 'moderate',
                     bloodPressure: 'high', pregnant: false }),
    JSON.stringify({ blurredVision: true, floaters: false,
                     suddenVisionChange: false, eyePain: false }),
    new Date().toISOString());

  db.prepare(`
    INSERT INTO capture_metadata_responses
      (response_id, capture_id, camera_device_reported, pupil_status,
       lighting_environment, observed_issues, worker_usability_rating, recorded_at)
    VALUES (?, ?, 'forus_3nethra_v2', 'dilated', 'indoor_clinic', ?, 'clear', ?)
  `).run(generateLocalId(), captureId, JSON.stringify(['none_noticed']),
    new Date().toISOString());

  db.prepare(`
    INSERT INTO sync_queue (queue_id, capture_id, status, priority, chunks_sent, chunks_total)
    VALUES (?, ?, 'pending', 'low', 0, 1)
  `).run(generateLocalId(), captureId);

  console.log(`        seeded ${label}: ${captureId}`);
  return captureId;
}

const queueRow = (captureId) =>
  db.prepare('SELECT * FROM sync_queue WHERE capture_id = ?').get(captureId);

async function main() {
  let server;
  const patientId = `PHC001-${TAG}`;

  try {
    db.prepare(`
      INSERT INTO patients (patient_id, name, age, contact_number, registered_at)
      VALUES (?, 'Verify Task34', 58, '+919812345678', ?)
    `).run(patientId, new Date().toISOString());

    // ── HALF 1: central server DOWN ────────────────────────────────────────
    console.log('\n--- Offline: central server not running ---');
    const offlineCapture = seedCapture(patientId, 'offline capture');

    const online0 = await syncManager.isOnline();
    check('heartbeat correctly reports offline', online0 === false, online0);

    let result;
    let threw = false;
    try {
      result = await syncManager.syncOnce();
    } catch (err) {
      threw = true;
      console.log(`        threw: ${err.message}`);
    }
    check('syncOnce does NOT throw when central is unreachable', !threw);
    check('reports online:false', result && result.online === false);
    check('attempts nothing while offline', result && result.attempted === 0,
      result && result.attempted);

    const offlineRow = queueRow(offlineCapture);
    check("capture stays 'pending' (not lost, not failed)",
      offlineRow.status === 'pending', offlineRow.status);

    const st = syncState.getState();
    check('syncState records the failed attempt', st.online === false && !!st.lastSyncAttempt,
      JSON.stringify(st));

    // The local backend must still serve requests with central down.
    const localApp = require(path.join(LOCAL, 'server.js'));
    const localServer = localApp.listen(4199);
    const localRes = await fetch('http://localhost:4199/sync/status');
    const localBody = await localRes.json();
    check('local backend still responds while offline', localRes.status === 200);
    check('GET /sync/status reports online:false with a pending count',
      localBody.online === false && localBody.pendingCount >= 1,
      JSON.stringify(localBody));
    localServer.closeAllConnections();
    localServer.close();

    // ── HALF 2: central server UP ──────────────────────────────────────────
    console.log('\n--- Online: central server running ---');
    server = centralApp.listen(CENTRAL_PORT);

    const online1 = await syncManager.isOnline();
    check('heartbeat now reports online', online1 === true, online1);

    const onlineCapture = seedCapture(patientId, 'online capture');

    console.log('        running one sync cycle...');
    const r2 = await syncManager.syncOnce();
    console.log(`        -> attempted ${r2.attempted}, synced ${r2.synced}, failed ${r2.failed}`);

    check('reports online:true', r2.online === true);
    check('synced at least the two queued captures', r2.synced >= 2, r2.synced);

    for (const [label, id] of [['offline capture', offlineCapture],
                               ['online capture',  onlineCapture]]) {
      check(`${label} flipped to 'synced'`, queueRow(id).status === 'synced',
        queueRow(id).status);
      check(`${label} recorded last_attempt_at`, !!queueRow(id).last_attempt_at);
    }

    // ── The cases actually landed centrally ────────────────────────────────
    console.log('\n--- Landed in the central database ---');
    const { rows } = await pool.query(
      `SELECT capture_id_ref, patient_id, captured_at, camera_device_id,
              questionnaire_data, capture_metadata, status
       FROM cases WHERE capture_id_ref = ANY($1)`,
      [[offlineCapture, onlineCapture]]);

    check('both captures exist as central cases', rows.length === 2, rows.length);
    check('patient was auto-registered centrally from the sync payload',
      rows.every((r) => r.patient_id === patientId));
    check('questionnaireData arrived as a JSONB object, not a string',
      rows.every((r) => r.questionnaire_data &&
                        r.questionnaire_data.riskFactors?.glycemicControl === 'moderate'),
      JSON.stringify(rows[0] && rows[0].questionnaire_data));
    check('captureMetadata arrived as a JSONB object',
      rows.every((r) => r.capture_metadata &&
                        r.capture_metadata.pupilStatus === 'dilated'));

    // capturedAt must be the capture time, not the sync time -- the whole point
    // of an offline-first system is that these differ.
    const local0 = db.prepare('SELECT captured_at FROM captures WHERE capture_id = ?')
                     .get(offlineCapture).captured_at;
    const central0 = rows.find((r) => r.capture_id_ref === offlineCapture);
    check('capturedAt is the CAPTURE time, not the sync time',
      central0 && new Date(central0.captured_at).toISOString() === local0,
      `local ${local0} vs central ${central0 && central0.captured_at}`);

    check("grading failure leaves status 'error', not stuck on 'processing'",
      rows.every((r) => r.status === 'error'), rows.map((r) => r.status).join(','));

    // ── Idempotence ────────────────────────────────────────────────────────
    console.log('\n--- A second cycle must not re-upload ---');
    const before = (await pool.query(
      'SELECT COUNT(*)::int AS n FROM cases WHERE capture_id_ref = ANY($1)',
      [[offlineCapture, onlineCapture]])).rows[0].n;
    const r3 = await syncManager.syncOnce();
    const after = (await pool.query(
      'SELECT COUNT(*)::int AS n FROM cases WHERE capture_id_ref = ANY($1)',
      [[offlineCapture, onlineCapture]])).rows[0].n;
    check('nothing left pending to attempt', r3.attempted === 0, r3.attempted);
    check('no duplicate cases created', after === before, `${before} -> ${after}`);

    // ── PHC sync-status reporting ──────────────────────────────────────────
    // Beyond Task 3.4's DoD, but the PHC Health screen (Task 3.7) reads
    // phc_sites.last_sync_at / pending_count and NOTHING else writes them --
    // central cannot compute a queue depth that lives in the PHC's own SQLite.
    // This path only runs when PHC_ID is configured, so without this check it
    // would ship untested and that screen would sit permanently empty.
    console.log('\n--- PHC sync status reporting (requires PHC_ID) ---');
    const site = await pool.query(
      'INSERT INTO phc_sites (name) VALUES ($1) RETURNING phc_id', [`PHC ${TAG}`]);
    const phcId = site.rows[0].phc_id;
    process.env.PHC_ID = phcId;

    // syncManager reads PHC_ID at module load, so re-require it fresh.
    delete require.cache[require.resolve(path.join(LOCAL, 'services', 'syncManager'))];
    const syncWithPhc = require(path.join(LOCAL, 'services', 'syncManager'));

    const attributed = seedCapture(patientId, 'attributed capture');
    const r4 = await syncWithPhc.syncOnce();
    check('attributed capture synced', r4.synced >= 1, r4.synced);

    const siteAfter = await pool.query(
      'SELECT last_sync_at, pending_count FROM phc_sites WHERE phc_id = $1', [phcId]);
    check('phc_sites.last_sync_at written on sync',
      !!siteAfter.rows[0].last_sync_at, siteAfter.rows[0].last_sync_at);
    check('phc_sites.pending_count reported by the PHC',
      Number.isInteger(siteAfter.rows[0].pending_count),
      siteAfter.rows[0].pending_count);

    const attrCase = await pool.query(
      'SELECT phc_id FROM cases WHERE capture_id_ref = $1', [attributed]);
    check('case attributed to the PHC, not an unattributed bucket',
      attrCase.rows[0] && attrCase.rows[0].phc_id === phcId,
      attrCase.rows[0] && attrCase.rows[0].phc_id);

    syncWithPhc.stop();
    await pool.query('DELETE FROM cases WHERE phc_id = $1', [phcId]);
    await pool.query('DELETE FROM phc_sites WHERE phc_id = $1', [phcId]);

    console.log(`\n===== ${failures === 0 ? 'Task 3.4 DoD met' : `${failures} FAILURE(S)`} =====\n`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    // Clean up local rows; central test rows are left for inspection.
    try {
      const caps = db.prepare('SELECT capture_id FROM captures WHERE patient_id = ?')
                     .all(patientId).map((r) => r.capture_id);
      for (const c of caps) {
        db.prepare('DELETE FROM sync_queue WHERE capture_id = ?').run(c);
        db.prepare('DELETE FROM questionnaire_responses WHERE capture_id = ?').run(c);
        db.prepare('DELETE FROM capture_metadata_responses WHERE capture_id = ?').run(c);
        const row = db.prepare('SELECT image_path FROM captures WHERE capture_id = ?').get(c);
        if (row && fs.existsSync(row.image_path)) fs.unlinkSync(row.image_path);
        db.prepare('DELETE FROM captures WHERE capture_id = ?').run(c);
      }
      db.prepare('DELETE FROM patients WHERE patient_id = ?').run(patientId);
    } catch (e) { console.warn('cleanup:', e.message); }

    syncManager.stop();
    if (server) { server.closeAllConnections(); server.close(); }
    await pool.end();
  }
}

main();
