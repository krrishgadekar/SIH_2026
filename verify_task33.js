'use strict';

/**
 * verify_task33.js -- Task 3.3 Definition of Done
 *
 * Run:  node verify_task33.js
 *
 * "POST /api/v1/cases followed immediately by GET /api/v1/cases/:caseId on the
 *  same case returns a fully populated Branch-A-related set of fields and
 *  explicit null for everything Branch B/segmentation-related -- never
 *  undefined, never a missing key."
 *
 * The null half is the part worth testing carefully, and it cannot be checked
 * with `x === null` on the parsed object alone: JSON.stringify DROPS undefined
 * values, so a handler that returns undefined produces a response with the key
 * missing entirely, and `parsed.foo === null` is false in a way that looks like
 * a value problem rather than a missing-key problem. This checks key PRESENCE
 * on the raw body separately from the value.
 */

const fs   = require('fs');
const path = require('path');

const CENTRAL = path.resolve(__dirname, 'central-system', 'backend');
require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(__dirname, '.env') });

/**
 * SKIP_GRADING=1 verifies everything that does not require MATLAB.
 *
 * Needed because MATLAB cannot be run while mpm is installing products into the
 * same installation directory. The ingestion path and — more importantly — the
 * explicit-null contract are fully checkable without it, so the run is not
 * blocked on the install; only the Branch A assertions are deferred.
 *
 * These env vars must be set BEFORE requiring server.js: gradingOrchestrator
 * reads MATLAB_EXECUTABLE and MATLAB_TIMEOUT_MS at module load, so setting them
 * afterwards would have no effect and the run would hang for the full timeout.
 */
const SKIP_GRADING = process.env.SKIP_GRADING === '1';
if (SKIP_GRADING) {
  process.env.MATLAB_EXECUTABLE = path.join(__dirname, '__no_such_matlab__.exe');
  process.env.MATLAB_TIMEOUT_MS = '5000';
}

const app  = require(path.join(CENTRAL, 'server.js'));
const pool = require(path.join(CENTRAL, 'db', 'pgClient'));

const IMAGE = path.resolve(__dirname, 'datasets', '2.jpg');
const PORT  = 5123;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

// Fields that must be present-and-null until their phase ships.
const MUST_BE_NULL = [
  ['lesionCounts',                    'Phase 4 segmentation'],
  ['nvSuspicionScore',                'Phase 4 segmentation'],
  ['drGradeRuleEngine',               'Phase 5 rule engine'],
  ['branchAgreement',                 'Phase 5 rule engine'],
  ['uncertaintyScore',                'Phase 6 MC-Dropout'],
  ['lesionAttentionConsistencyScore', 'Phase 7 safeguards'],
  ['evidenceSummaryText',             'Phase 7 report'],
];

// Fields Branch A must actually populate.
const MUST_BE_SET = ['drGradeCnn', 'confidenceScore', 'conformalTier',
                     'imageUrl', 'gradCamOverlayUrl', 'patientReference'];

async function main() {
  const server = app.listen(PORT);
  const BASE   = `http://localhost:${PORT}`;

  try {
    const patientId = `PHC001-t33-${Math.random().toString(36).slice(2, 6)}`;

    // ── POST /api/v1/cases ────────────────────────────────────────────────
    console.log('\n--- POST /api/v1/cases ---');
    console.log('[verify] grading runs synchronously; allow ~30s for MATLAB.\n');

    const form = new FormData();
    form.append('patientId', patientId);
    form.append('captureIdRef', 'PHC001-lz4a2b-c7f1');
    form.append('cameraDeviceId', 'unknown');
    form.append('patientName', 'Verify Task33');
    form.append('patientAge', '54');
    form.append('patientContactNumber', '+919812345678');
    form.append('questionnaireData', JSON.stringify({
      riskFactors: { yearsSinceDiagnosis: 'lt1', glycemicControl: 'moderate',
                     bloodPressure: 'high', pregnant: false },
      symptoms: { blurredVision: true, floaters: false,
                  suddenVisionChange: false, eyePain: false },
      language: 'hi',
    }));
    form.append('captureMetadata', JSON.stringify({
      cameraDeviceReported: 'forus_3nethra_v2', pupilStatus: 'dilated',
      lightingEnvironment: 'indoor_clinic', observedIssues: ['none_noticed'],
      workerUsabilityRating: 'clear',
    }));
    form.append('image',
      new Blob([fs.readFileSync(IMAGE)], { type: 'image/jpeg' }), '2.jpg');

    const t0     = Date.now();
    const postRes = await fetch(`${BASE}/api/v1/cases`, { method: 'POST', body: form });
    const posted  = await postRes.json();
    console.log(`[verify] POST returned in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    check('201 Created', postRes.status === 201, JSON.stringify(posted));
    check('returns exactly { caseId, receivedAt }',
      Object.keys(posted).sort().join(',') === 'caseId,receivedAt',
      Object.keys(posted).join(','));
    check('receivedAt is ISO 8601 UTC',
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(posted.receivedAt || ''),
      posted.receivedAt);

    const caseId = posted.caseId;
    if (!caseId) { console.error('\nNo caseId returned; cannot continue.'); return; }

    // ── GET status ────────────────────────────────────────────────────────
    console.log('\n--- GET /api/v1/cases/:caseId/status ---');
    const st = await (await fetch(`${BASE}/api/v1/cases/${caseId}/status`)).json();
    check('returns exactly { caseId, status }',
      Object.keys(st).sort().join(',') === 'caseId,status', Object.keys(st).join(','));
    check("status is 'processing' | 'graded' | 'error'",
      ['processing', 'graded', 'error'].includes(st.status), st.status);
    if (SKIP_GRADING) {
      // Grading was deliberately made to fail, so the case must be marked
      // 'error' -- NOT left on 'processing'. A poller cannot otherwise tell
      // "failed, needs attention" apart from "still working".
      check("status is 'error' when grading fails (not stuck on 'processing')",
        st.status === 'error', st.status);
    } else {
      check("status is 'graded' after synchronous grading", st.status === 'graded', st.status);
    }

    // ── GET detail ────────────────────────────────────────────────────────
    console.log('\n--- GET /api/v1/cases/:caseId ---');
    const detailRes  = await fetch(`${BASE}/api/v1/cases/${caseId}`);
    const rawBody    = await detailRes.text();
    const detail     = JSON.parse(rawBody);
    const presentKeys = new Set(Object.keys(detail));

    check('200 OK', detailRes.status === 200);
    console.log(JSON.stringify(detail, null, 2).split('\n').slice(0, 22).join('\n') + '\n        ...');

    console.log('\n--- Branch A fields ---');
    if (SKIP_GRADING) {
      console.log('  SKIP  MATLAB not invoked; Branch A population deferred to a full run.');
      // Still assert something real: an ungraded case must present its Branch A
      // fields as null, exactly like the not-yet-built ones. A case whose
      // grading FAILED must not be indistinguishable from a graded one.
      for (const k of ['drGradeCnn', 'confidenceScore', 'conformalTier']) {
        check(`${k} present and null while ungraded`,
          presentKeys.has(k) && detail[k] === null, JSON.stringify(detail[k]));
      }
      check('gradCamOverlayUrl is null when no Grad-CAM was produced',
        detail.gradCamOverlayUrl === null, detail.gradCamOverlayUrl);
    } else {
      for (const k of MUST_BE_SET) {
        check(`${k} is set`, detail[k] !== null && detail[k] !== undefined, String(detail[k]));
      }
      check('drGradeCnn in 0..4',
        Number.isInteger(detail.drGradeCnn) && detail.drGradeCnn >= 0 && detail.drGradeCnn <= 4,
        detail.drGradeCnn);
      check('conformalTier in {A,B,C}',
        ['A', 'B', 'C'].includes(detail.conformalTier), detail.conformalTier);
    }

    console.log('\n--- Media URLs resolve ---');
    check('imageUrl is a /media path', String(detail.imageUrl).startsWith('/media/'),
      detail.imageUrl);
    const urls = [['image', detail.imageUrl]];
    if (!SKIP_GRADING) {
      check('gradCamOverlayUrl is a /media path',
        String(detail.gradCamOverlayUrl).startsWith('/media/'), detail.gradCamOverlayUrl);
      urls.push(['gradcam', detail.gradCamOverlayUrl]);
    }
    // Fetch the URL rather than just checking its shape. The whole reason
    // Grad-CAM output was rerouted through mediaPaths is that a path stored
    // correctly in the database can still be unreachable over HTTP.
    for (const [label, url] of urls) {
      const r = await fetch(BASE + url);
      check(`${label} URL actually serves a file (${r.status})`, r.status === 200, url);
    }

    console.log('\n--- Unbuilt fields: key PRESENT and value NULL ---');
    for (const [k, phase] of MUST_BE_NULL) {
      check(`${k} key is present (not dropped as undefined) [${phase}]`, presentKeys.has(k));
      check(`${k} is exactly null`, detail[k] === null, JSON.stringify(detail[k]));
    }

    console.log('\n--- Pass-through and history ---');
    check('questionnaireData round-trips as an object, not a JSON string',
      detail.questionnaireData && typeof detail.questionnaireData === 'object' &&
      detail.questionnaireData.riskFactors?.glycemicControl === 'moderate',
      JSON.stringify(detail.questionnaireData));
    check('captureMetadata round-trips as an object',
      detail.captureMetadata && typeof detail.captureMetadata === 'object' &&
      detail.captureMetadata.pupilStatus === 'dilated',
      JSON.stringify(detail.captureMetadata));
    check('priorAssessments is an array (empty for a first screening)',
      Array.isArray(detail.priorAssessments), JSON.stringify(detail.priorAssessments));
    check('patientReference is not the raw patientId',
      detail.patientReference !== patientId &&
      /^PT-[ABCDEFGHJKLMNPQRTUVWXYZ2346789]{6}$/.test(detail.patientReference || ''),
      detail.patientReference);
    check('patientReference contains no part of the real patientId',
      !patientId.split('-').some((seg) => seg && detail.patientReference.includes(seg)),
      `${detail.patientReference} vs ${patientId}`);

    console.log('\n--- Not-found handling ---');
    const nf = await fetch(`${BASE}/api/v1/cases/00000000-0000-0000-0000-000000000000`);
    check('404 + case_not_found for an unknown UUID',
      nf.status === 404 && (await nf.json()).error === 'case_not_found', nf.status);
    const bad = await fetch(`${BASE}/api/v1/cases/not-a-uuid`);
    check('404 (not 500) for a malformed UUID', bad.status === 404, bad.status);

    // Do not claim the DoD is met when grading was skipped. The Branch A half
    // is genuinely unverified in that mode, and a green "DoD met" on a partial
    // run is exactly the kind of thing that gets believed later.
    const verdict = failures > 0
      ? `${failures} FAILURE(S)`
      : SKIP_GRADING
        ? 'PARTIAL PASS — ingestion + null contract verified; Branch A NOT verified.\n' +
          '      Re-run without SKIP_GRADING once MATLAB is available.'
        : 'Task 3.3 DoD met';
    console.log(`\n===== ${verdict} =====\n`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    // closeAllConnections() BEFORE close(). Node's fetch (undici) keeps sockets
    // alive, and server.close() only stops NEW connections -- it waits
    // indefinitely for existing keep-alive sockets to drain. Without this the
    // script prints its full results and then hangs forever, leaving an
    // orphaned process holding the port. That looks like a test still running
    // long after it has actually passed.
    server.closeAllConnections();
    server.close();
    await pool.end();
  }
}

main();
