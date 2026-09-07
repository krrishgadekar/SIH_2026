'use strict';

/**
 * verify_task31.js -- Task 3.1 Definition of Done
 *
 * Run:  node verify_task31.js [imagePath]
 *
 * "Calling this function directly (before it's wired to a route) with a real
 *  image path returns an object whose fields exactly match api-contracts.md's
 *  POST /captures response, and the row exists in captures with matching
 *  values."
 *
 * So this checks two things, and the second is the one that catches real bugs:
 *   1. the RETURNED object matches the contract exactly -- right keys, no extra
 *      keys, right types, right enum values;
 *   2. the PERSISTED row agrees with what was returned. A handler that returns
 *      a correct-looking object while writing something else to the database is
 *      the failure this is here to catch.
 */

const fs   = require('fs');
const path = require('path');

const LOCAL_BACKEND = path.resolve(__dirname, 'phc-local-app', 'backend');
require(require.resolve('dotenv', { paths: [LOCAL_BACKEND] }))
  .config({ path: path.resolve(__dirname, '.env') });

const db                  = require(path.join(LOCAL_BACKEND, 'db', 'localDb'));
const { handleCapture }   = require(path.join(LOCAL_BACKEND, 'services', 'captureHandler'));
const { generateLocalId } = require(path.join(LOCAL_BACKEND, 'services', 'ids'));

const IMAGE = path.resolve(
  process.argv[2] || path.join(__dirname, 'datasets', '2.jpg'));

// The exact response body from api-contracts.md, POST /captures.
const CONTRACT_KEYS = [
  'captureId', 'patientId', 'qualityStatus', 'qualityReason',
  'retakeCount', 'capturedAt',
];
const QUALITY_STATUS = ['pass', 'retake', 'borderline'];
const QUALITY_REASON = [
  'blur', 'low_illumination', 'insufficient_fov',
  'glare', 'motion_artifact', 'eyelash_occlusion',
];
const ID_RE  = /^[A-Za-z0-9]+-[a-z0-9]+-[a-z0-9]{4}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) {
    failures++;
    if (detail !== undefined) console.log(`        ${detail}`);
  }
}

async function main() {
  if (!fs.existsSync(IMAGE)) {
    console.error(`[verify] test image not found: ${IMAGE}`);
    process.exitCode = 1;
    return;
  }

  // ── Seed a patient (handleCapture requires an existing one) ───────────────
  const patientId = generateLocalId();
  db.prepare(`
    INSERT INTO patients (patient_id, name, age, contact_number, registered_at)
    VALUES (?, 'Verify Task31', 54, '+919812345678', ?)
  `).run(patientId, new Date().toISOString());

  console.log(`\n[verify] patient  : ${patientId}`);
  console.log(`[verify] image    : ${IMAGE}`);
  console.log('[verify] calling handleCapture (spawns MATLAB; allow ~30s cold)\n');

  const t0 = Date.now();
  let result;
  try {
    result = await handleCapture(patientId, IMAGE, 'unknown');
  } catch (err) {
    console.error('[verify] handleCapture FAILED:', err.message);
    process.exitCode = 1;
    return;
  }
  console.log(`[verify] returned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(result, null, 2));

  // ── 1. Returned object vs the contract ────────────────────────────────────
  console.log('\n--- Response shape (api-contracts.md POST /captures) ---');

  const got = Object.keys(result).sort();
  check('has exactly the six contract keys, no more, no fewer',
    JSON.stringify(got) === JSON.stringify([...CONTRACT_KEYS].sort()),
    `got: ${got.join(', ')}`);

  check('captureId is a string in {PHC}-{base36}-{4 alnum} form',
    typeof result.captureId === 'string' && ID_RE.test(result.captureId),
    result.captureId);
  check('patientId echoes the input', result.patientId === patientId);
  check('qualityStatus is one of pass|retake|borderline',
    QUALITY_STATUS.includes(result.qualityStatus), result.qualityStatus);

  // null on pass; otherwise one of the six exact enum strings. These are
  // compared with === in the frontend, so a near-miss silently breaks the UI.
  const reasonOk = result.qualityStatus === 'pass'
    ? result.qualityReason === null
    : (result.qualityReason === null || QUALITY_REASON.includes(result.qualityReason));
  check('qualityReason is null on pass, else a valid enum string',
    reasonOk, String(result.qualityReason));
  check('qualityReason is null (not undefined, not "")',
    result.qualityReason !== undefined && result.qualityReason !== '');

  check('retakeCount is a non-negative integer',
    Number.isInteger(result.retakeCount) && result.retakeCount >= 0,
    result.retakeCount);
  check('capturedAt is an ISO 8601 UTC string',
    typeof result.capturedAt === 'string' && ISO_RE.test(result.capturedAt),
    result.capturedAt);

  // ── 2. Persisted row vs what was returned ─────────────────────────────────
  console.log('\n--- Persisted row agrees with the response ---');

  const row = db.prepare('SELECT * FROM captures WHERE capture_id = ?')
                .get(result.captureId);
  check('row exists in captures', !!row);

  if (row) {
    console.table([row]);
    check('patient_id matches',     row.patient_id     === result.patientId);
    check('quality_status matches', row.quality_status === result.qualityStatus);
    check('quality_reason matches', (row.quality_reason ?? null) === result.qualityReason);
    check('retake_count matches',   row.retake_count   === result.retakeCount);
    check('captured_at matches',    row.captured_at    === result.capturedAt);
    check('camera_device_id stored', row.camera_device_id === 'unknown');
    check('quality_status is no longer the internal "pending"',
      row.quality_status !== 'pending');

    check('image_path points at a real file on disk',
      !!row.image_path && fs.existsSync(row.image_path), row.image_path);
    if (row.image_path && fs.existsSync(row.image_path)) {
      const stored = fs.statSync(row.image_path).size;
      const source = fs.statSync(IMAGE).size;
      check('stored image is byte-identical in size to the source',
        stored === source, `stored ${stored} vs source ${source}`);
      console.log(`        ${row.image_path}`);
    }
  }

  console.log(`\n===== ${failures === 0 ? 'Task 3.1 DoD met' : `${failures} FAILURE(S)`} =====\n`);
  if (failures > 0) process.exitCode = 1;
}

main();
