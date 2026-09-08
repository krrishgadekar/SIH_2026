'use strict';

/**
 * syncManager.js  (Task 3.4)
 *
 * Drains the local sync queue to the central server, opportunistically.
 *
 *   start(opts)   begin the polling loop; returns a handle with .stop()
 *   syncOnce()    run exactly one cycle (exported so tests can drive it
 *                 deterministically instead of sleeping past an interval)
 *   isOnline()    one heartbeat against the central /health endpoint
 *
 * ── The design constraint that shapes everything here ───────────────────────
 * This runs at a rural PHC with unreliable or absent connectivity (design doc
 * §1.4). Being offline is the NORMAL case, not an error case. So:
 *
 *   - a failed cycle must never throw out of the loop, or one bad night takes
 *     the local backend down and the technician cannot capture at all;
 *   - a heartbeat precedes every attempt, so a dead network costs one fast
 *     failed request rather than one slow multipart upload per queued case;
 *   - nothing is deleted on success. The queue row flips to 'synced' and stays,
 *     because it is the audit trail of what left this building.
 *
 * Chunked/resumable upload for large images is Task 8.2, deliberately not here.
 */

const fs   = require('fs');
const path = require('path');

const db        = require('../db/localDb');
const syncState = require('./syncState');

const CENTRAL_URL   = process.env.CENTRAL_URL   || 'http://localhost:5000';
const SYNC_INTERVAL = parseInt(process.env.SYNC_INTERVAL_MS || '10000', 10);
const HEALTH_TIMEOUT = parseInt(process.env.SYNC_HEALTH_TIMEOUT_MS || '3000', 10);
const UPLOAD_TIMEOUT = parseInt(process.env.SYNC_UPLOAD_TIMEOUT_MS || '600000', 10);

// The central phc_sites UUID for this site. Set per deployment. When unset, the
// case is still accepted centrally but lands with phc_id NULL, which shows up
// on the admin dashboard as an unattributed bucket rather than under this PHC's
// name -- correct, but not useful. Configure it.
const PHC_ID = process.env.PHC_ID || null;

let timer   = null;
let running = false;   // guards against a slow cycle overlapping the next tick

/**
 * isOnline()
 *
 * A cheap GET /health, with its own short timeout.
 *
 * The timeout matters more than it looks: without one, a network that accepts
 * connections but never answers (a captive portal, a half-open link — both
 * common on rural mobile data) leaves this hanging indefinitely and the queue
 * never drains, with nothing in the logs to say why.
 */
async function isOnline() {
  try {
    const res = await fetch(`${CENTRAL_URL}/health`, {
      signal: AbortSignal.timeout(HEALTH_TIMEOUT),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Everything the central ingestion endpoint needs for one capture. */
function loadCaseBundle(captureId) {
  const capture = db.prepare('SELECT * FROM captures WHERE capture_id = ?').get(captureId);
  if (!capture) return null;

  const patient = db.prepare('SELECT * FROM patients WHERE patient_id = ?')
                    .get(capture.patient_id);

  const questionnaire = db.prepare(
    'SELECT * FROM questionnaire_responses WHERE capture_id = ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(captureId);

  const metadata = db.prepare(
    'SELECT * FROM capture_metadata_responses WHERE capture_id = ? ORDER BY recorded_at DESC LIMIT 1'
  ).get(captureId);

  return { capture, patient, questionnaire, metadata };
}

/**
 * buildFormData(bundle)
 *
 * Assembles the multipart body for POST /api/v1/cases.
 *
 * The patient demographics are included because cases.patient_id is a foreign
 * key centrally and there is no separate patient-sync endpoint — without them
 * the very first case for a patient is rejected with patient_not_found. See the
 * note on that endpoint in api-contracts.md.
 */
function buildFormData({ capture, patient, questionnaire, metadata }) {
  const form = new FormData();

  form.append('patientId',      capture.patient_id);
  form.append('captureIdRef',   capture.capture_id);
  form.append('cameraDeviceId', capture.camera_device_id || 'unknown');
  // The capture time, NOT the sync time. A case queued overnight must not be
  // dated to the moment the network came back.
  form.append('capturedAt',     capture.captured_at);

  if (PHC_ID) form.append('phcId', PHC_ID);

  if (patient) {
    form.append('patientName',          patient.name);
    form.append('patientAge',           String(patient.age));
    form.append('patientContactNumber', patient.contact_number);
  }

  // Local columns are TEXT holding JSON; central expects JSON strings it will
  // parse. Re-parse and re-stringify rather than forwarding the stored text
  // blind, so a corrupt row fails here with a clear error instead of being
  // stored centrally as unusable JSONB.
  if (questionnaire) {
    form.append('questionnaireData', JSON.stringify({
      riskFactors: JSON.parse(questionnaire.risk_factor_fields),
      symptoms:    JSON.parse(questionnaire.symptom_fields),
      language:    questionnaire.language,
    }));
  }
  if (metadata) {
    form.append('captureMetadata', JSON.stringify({
      cameraDeviceReported:  metadata.camera_device_reported,
      pupilStatus:           metadata.pupil_status,
      lightingEnvironment:   metadata.lighting_environment,
      observedIssues:        JSON.parse(metadata.observed_issues),
      workerUsabilityRating: metadata.worker_usability_rating,
    }));
  }

  // Lets the central server keep phc_sites.pending_count current, which is what
  // the admin PHC Health screen reads. Counted BEFORE this upload succeeds, so
  // it is the depth at the moment contact was made.
  form.append('pendingCount', String(countPending()));

  const buf = fs.readFileSync(capture.image_path);
  const ext = path.extname(capture.image_path).toLowerCase() || '.jpg';
  const mime = ext === '.png' ? 'image/png'
             : (ext === '.tif' || ext === '.tiff') ? 'image/tiff'
             : 'image/jpeg';
  form.append('image', new Blob([buf], { type: mime }), `image${ext}`);

  return form;
}

function countPending() {
  return db.prepare("SELECT COUNT(*) AS n FROM sync_queue WHERE status = 'pending'").get().n;
}

/**
 * syncOnce()
 *
 * One full cycle: heartbeat, then drain what is pending.
 *
 * @returns {Promise<{online, attempted, synced, failed}>}
 */
async function syncOnce() {
  const nowIso = new Date().toISOString();

  const online = await isOnline();
  syncState.recordAttempt(online, nowIso);

  if (!online) {
    // Offline is the expected state, not an error — log nothing per cycle or a
    // week disconnected fills the disk with identical lines.
    return { online: false, attempted: 0, synced: 0, failed: 0 };
  }

  // High priority first (design doc §9.2): referable/uncertain cases go before
  // confident-negative ones when bandwidth is scarce. Oldest first within a
  // priority so a backlog drains in the order it was captured.
  const pending = db.prepare(`
    SELECT q.queue_id, q.capture_id, q.priority
    FROM sync_queue q
    JOIN captures c ON c.capture_id = q.capture_id
    WHERE q.status = 'pending'
    ORDER BY CASE q.priority WHEN 'high' THEN 0 ELSE 1 END, c.captured_at ASC
  `).all();

  let synced = 0, failed = 0;

  for (const row of pending) {
    // Stamp the attempt before trying, so a crash mid-upload still leaves
    // evidence that this row was reached.
    db.prepare('UPDATE sync_queue SET last_attempt_at = ? WHERE queue_id = ?')
      .run(new Date().toISOString(), row.queue_id);

    try {
      const bundle = loadCaseBundle(row.capture_id);
      if (!bundle) throw new Error(`capture ${row.capture_id} missing`);
      if (!fs.existsSync(bundle.capture.image_path)) {
        throw new Error(`image missing at ${bundle.capture.image_path}`);
      }

      const res = await fetch(`${CENTRAL_URL}/api/v1/cases`, {
        method: 'POST',
        body: buildFormData(bundle),
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`central returned ${res.status}: ${body.slice(0, 200)}`);
      }

      const { caseId } = await res.json();
      db.prepare("UPDATE sync_queue SET status = 'synced' WHERE queue_id = ?")
        .run(row.queue_id);
      synced++;
      console.log(`[syncManager] ${row.capture_id} -> case ${caseId}`);
    } catch (err) {
      // Left 'pending' on purpose, with last_attempt_at recorded. The next
      // cycle retries it. Nothing is dropped and nothing is marked failed —
      // there is no state in this system for "gave up on a patient's scan".
      failed++;
      console.warn(`[syncManager] ${row.capture_id} failed, staying pending: ${err.message}`);
    }
  }

  return { online: true, attempted: pending.length, synced, failed };
}

/**
 * start(opts)
 *
 * @param {object} [opts]
 * @param {number} [opts.intervalMs]
 * @returns {{stop: function}}
 */
function start({ intervalMs = SYNC_INTERVAL } = {}) {
  if (timer) return { stop };

  const tick = async () => {
    // Skip if the previous cycle is still going. Without this, a slow upload
    // over poor bandwidth would have overlapping cycles picking up the same
    // pending rows and uploading the same case repeatedly.
    if (running) return;
    running = true;
    try {
      await syncOnce();
    } catch (err) {
      // Belt and braces: syncOnce already handles per-case failure, so reaching
      // here means something unexpected. Swallow it — an offline-first local
      // app must keep accepting captures no matter what the network is doing.
      console.error('[syncManager] cycle error:', err.message);
    } finally {
      running = false;
    }
  };

  timer = setInterval(tick, intervalMs);
  // Do not hold the process open just for the sync loop.
  if (timer.unref) timer.unref();

  console.log(`[syncManager] polling ${CENTRAL_URL} every ${intervalMs}ms`
    + `${PHC_ID ? '' : ' (PHC_ID unset — cases will sync without a PHC attribution)'}`);

  tick();   // one immediate pass, so startup does not wait a full interval
  return { stop };
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

module.exports = { start, stop, syncOnce, isOnline, countPending };
