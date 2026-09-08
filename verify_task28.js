'use strict';

/**
 * verify_task28.js -- Task 2.8 plumbing, end to end
 *
 * Run:  node verify_task28.js
 *
 * The MATLAB half of Task 2.8 (adaptiveEnhance) is already verified by
 * ml-pipeline/verifyPreprocessing.m. What was missing was the PLUMBING: the
 * quality gate computed six sub-scores at the PHC, logged them, and threw them
 * away, so the central pipeline had nothing to adapt on and "adaptive
 * enhancement" could not run however good the MATLAB was.
 *
 * This traces one set of scores along the whole path:
 *
 *   quality gate -> captures.quality_scores  (local SQLite)
 *                -> multipart qualityScores  (sync manager)
 *                -> cases.quality_scores     (central JSONB)
 *                -> MATLAB struct literal    (orchestrator)
 *
 * A break anywhere in that chain is silent: adaptiveEnhance simply receives no
 * scores and falls back to the default chain, which is exactly the behaviour
 * Task 2.8 exists to replace. Nothing errors. So each hop is asserted
 * separately rather than only checking the two ends.
 *
 * No MATLAB required: grading is stubbed out, since what is under test is
 * whether the numbers arrive, not what MATLAB does with them.
 */

const fs   = require('fs');
const path = require('path');

const ROOT    = __dirname;
const LOCAL   = path.resolve(ROOT, 'phc-local-app', 'backend');
const CENTRAL = path.resolve(ROOT, 'central-system', 'backend');

require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(ROOT, '.env') });

const CENTRAL_PORT = 5198;
process.env.CENTRAL_URL = `http://localhost:${CENTRAL_PORT}`;
process.env.SYNC_HEALTH_TIMEOUT_MS = '1500';
process.env.MATLAB_EXECUTABLE = path.join(ROOT, '__no_matlab__.exe');
process.env.MATLAB_TIMEOUT_MS = '3000';

const centralApp  = require(path.join(CENTRAL, 'server.js'));
const pool        = require(path.join(CENTRAL, 'db', 'pgClient'));
const db          = require(path.join(LOCAL, 'db', 'localDb'));
const syncManager = require(path.join(LOCAL, 'services', 'syncManager'));
const { generateLocalId } = require(path.join(LOCAL, 'services', 'ids'));

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

const TAG = `t28-${Math.random().toString(36).slice(2, 7)}`;

// A deliberately BORDERLINE-looking set: dim and slightly soft, which is
// exactly the case adaptive enhancement exists for.
const SCORES = {
  focusScore:        0.42,
  illuminationScore: 0.38,
  fovScore:          0.81,
  coveragePercent:   0.77,
  glareScore:        0.22,
  motionScore:       0.05,
  occlusionScore:    0.11,
};

async function main() {
  const server = centralApp.listen(CENTRAL_PORT);
  const patientId = `PHC001-${TAG}`;
  let captureId;

  try {
    db.prepare(`
      INSERT INTO patients (patient_id, name, age, contact_number, registered_at)
      VALUES (?, 'Verify Task28', 61, '+919812345678', ?)
    `).run(patientId, new Date().toISOString());

    // ── Hop 1: local column exists and stores the scores ───────────────────
    console.log('\n--- Hop 1: quality gate -> captures.quality_scores ---');

    const cols = db.prepare('PRAGMA table_info(captures)').all().map((c) => c.name);
    check('captures.quality_scores column exists (migration ran)',
      cols.includes('quality_scores'), cols.join(', '));

    captureId = generateLocalId();
    const imgSrc  = path.join(ROOT, 'datasets', '2.jpg');
    const storage = path.join(LOCAL, 'storage');
    fs.mkdirSync(storage, { recursive: true });
    const imgPath = path.join(storage, `${captureId}.jpg`);
    fs.copyFileSync(imgSrc, imgPath);

    // Written the way captureHandler writes it after the gate returns.
    db.prepare(`
      INSERT INTO captures (capture_id, patient_id, camera_device_id, image_path,
                            quality_status, quality_reason, retake_count,
                            captured_at, quality_scores)
      VALUES (?, ?, 'unknown', ?, 'borderline', NULL, 0, ?, ?)
    `).run(captureId, patientId, imgPath, new Date().toISOString(),
           JSON.stringify(SCORES));

    db.prepare(`
      INSERT INTO sync_queue (queue_id, capture_id, status, priority, chunks_sent, chunks_total)
      VALUES (?, ?, 'pending', 'high', 0, 1)
    `).run(generateLocalId(), captureId);

    const localRow = db.prepare('SELECT quality_scores FROM captures WHERE capture_id = ?')
                       .get(captureId);
    check('scores persisted locally as JSON',
      !!localRow.quality_scores &&
      JSON.parse(localRow.quality_scores).illuminationScore === 0.38,
      localRow.quality_scores);

    // ── Hop 2 + 3: sync -> central JSONB ──────────────────────────────────
    console.log('\n--- Hops 2-3: sync manager -> cases.quality_scores ---');
    const r = await syncManager.syncOnce();
    check('capture synced', r.synced >= 1, JSON.stringify(r));

    const { rows } = await pool.query(
      'SELECT case_id, quality_scores FROM cases WHERE capture_id_ref = $1', [captureId]);
    check('case created centrally', rows.length === 1, rows.length);

    const central = rows[0] && rows[0].quality_scores;
    check('quality_scores arrived centrally', !!central, JSON.stringify(central));

    // The failure this catches: pg storing a JSON *string* rather than an
    // object, which inserts cleanly and only breaks later on a nested query.
    check('stored as a JSONB OBJECT, not a JSON string',
      central && typeof central === 'object' && !Array.isArray(central),
      typeof central);

    if (central) {
      check('all seven sub-scores survived the trip',
        Object.keys(central).length === Object.keys(SCORES).length,
        Object.keys(central).join(', '));
      let exact = true;
      for (const [k, v] of Object.entries(SCORES)) {
        if (Math.abs(Number(central[k]) - v) > 1e-9) { exact = false; break; }
      }
      check('every value round-tripped exactly', exact, JSON.stringify(central));
    }

    // ── Hop 4: orchestrator -> MATLAB struct literal ──────────────────────
    console.log('\n--- Hop 4: orchestrator -> MATLAB struct literal ---');
    // Assert on the EXPRESSION the orchestrator actually generates, not on this
    // file's source text. A first version grepped the source and failed on the
    // explanatory comment that quotes the old chain -- testing prose, not code.
    const { buildMatlabExpr } =
      require(path.join(CENTRAL, 'services', 'gradingOrchestrator'));

    const expr = buildMatlabExpr('/tmp/in.jpg', '/tmp/out.png', SCORES);
    check('generated MATLAB calls the canonical preprocessForBranchA',
      expr.includes('preprocessForBranchA(img, qualityScores)'));
    check('generated MATLAB no longer runs the old hand-written chain',
      !expr.includes('illuminationNormalize(claheEnhance(benGrahamCrop'));
    check('scores are rendered as a MATLAB struct literal',
      expr.includes("struct('focusScore', 0.42") &&
      expr.includes("'illuminationScore', 0.38"),
      (expr.match(/qualityScores = [^;]*/) || [''])[0]);

    // The whitelist is a security boundary, not tidiness: this expression is
    // interpolated into a command line MATLAB evaluates, and the values
    // originate at a PHC.
    const injected = buildMatlabExpr('/tmp/in.jpg', '/tmp/out.png',
      { focusScore: 0.5, evil: "'); system('rm -rf /'); x=('" });
    check('unknown fields are dropped, not interpolated',
      !injected.includes('system(') && !injected.includes('evil'),
      (injected.match(/qualityScores = [^;]*/) || [''])[0]);

    const noScores = buildMatlabExpr('/tmp/in.jpg', '/tmp/out.png', null);
    check('no scores renders as [] so MATLAB takes the default chain',
      noScores.includes('qualityScores = [];'),
      (noScores.match(/qualityScores = [^;]*/) || [''])[0]);

    // ── Fallback: no scores must NOT break anything ───────────────────────
    console.log('\n--- Fallback: a capture with no scores ---');
    const bareId = generateLocalId();
    const barePath = path.join(storage, `${bareId}.jpg`);
    fs.copyFileSync(imgSrc, barePath);
    db.prepare(`
      INSERT INTO captures (capture_id, patient_id, camera_device_id, image_path,
                            quality_status, quality_reason, retake_count,
                            captured_at, quality_scores)
      VALUES (?, ?, 'unknown', ?, 'pass', NULL, 0, ?, NULL)
    `).run(bareId, patientId, barePath, new Date().toISOString());
    db.prepare(`
      INSERT INTO sync_queue (queue_id, capture_id, status, priority, chunks_sent, chunks_total)
      VALUES (?, ?, 'pending', 'low', 0, 1)
    `).run(generateLocalId(), bareId);

    const r2 = await syncManager.syncOnce();
    check('a capture with no scores still syncs', r2.synced >= 1, JSON.stringify(r2));

    const bare = await pool.query(
      'SELECT quality_scores FROM cases WHERE capture_id_ref = $1', [bareId]);
    check('absent scores land as NULL, not as an empty object',
      bare.rows.length === 1 && bare.rows[0].quality_scores === null,
      JSON.stringify(bare.rows[0] && bare.rows[0].quality_scores));

    console.log(`\n===== ${failures === 0 ? 'Task 2.8 plumbing verified — adaptive enhancement is live' : `${failures} FAILURE(S)`} =====\n`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    try {
      const caps = db.prepare('SELECT capture_id, image_path FROM captures WHERE patient_id = ?')
                     .all(patientId);
      for (const c of caps) {
        db.prepare('DELETE FROM sync_queue WHERE capture_id = ?').run(c.capture_id);
        if (c.image_path && fs.existsSync(c.image_path)) fs.unlinkSync(c.image_path);
        db.prepare('DELETE FROM captures WHERE capture_id = ?').run(c.capture_id);
      }
      db.prepare('DELETE FROM patients WHERE patient_id = ?').run(patientId);
      await pool.query('DELETE FROM cases WHERE patient_id = $1', [patientId]);
      await pool.query('DELETE FROM patients WHERE patient_id = $1', [patientId]);
    } catch (e) { console.warn('cleanup:', e.message); }
    syncManager.stop();
    server.closeAllConnections();
    server.close();
    await pool.end();
  }
}

main();
