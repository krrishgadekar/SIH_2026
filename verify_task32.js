'use strict';

/**
 * verify_task32.js -- Task 3.2 Definition of Done
 *
 * Run:  node verify_task32.js
 *
 * "Every endpoint in api-contracts.md's Local API section returns exactly the
 *  documented shape when hit with curl or Postman, including matching field
 *  names and enum values character-for-character."
 *
 * So this drives the real Express app over real HTTP -- not the route handlers
 * called directly -- because half of what the contract specifies (status codes,
 * multipart parsing, the JSON error shape on failure paths) only exists once
 * the request goes through the middleware stack.
 */

const fs   = require('fs');
const path = require('path');

const LOCAL_BACKEND = path.resolve(__dirname, 'phc-local-app', 'backend');
require(require.resolve('dotenv', { paths: [LOCAL_BACKEND] }))
  .config({ path: path.resolve(__dirname, '.env') });

const app = require(path.join(LOCAL_BACKEND, 'server.js'));
const db  = require(path.join(LOCAL_BACKEND, 'db', 'localDb'));

const IMAGE = path.resolve(__dirname, 'datasets', '2.jpg');
const PORT  = 4123;                       // not 4000, so a running dev server is fine

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}
const keysOf = (o) => Object.keys(o).sort().join(',');

/**
 * sameKeys(obj, expected)
 *
 * Compares against a sorted array rather than a hand-written sorted string.
 * Writing the expected order by hand is its own bug source -- JS sorts by
 * UTF-16 code unit, so 'captureId' precedes 'capturedAt' ('I' < 'd'), which is
 * not the order a human writes them in.
 */
const sameKeys = (obj, expected) => keysOf(obj) === [...expected].sort().join(',');

async function main() {
  const server = app.listen(PORT);
  const BASE   = `http://localhost:${PORT}`;

  const json = async (method, url, body, extra = {}) => {
    const res = await fetch(BASE + url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      ...extra,
    });
    return { status: res.status, body: await res.json() };
  };

  try {
    // ── POST /patients ──────────────────────────────────────────────────────
    console.log('\n--- POST /patients ---');
    const created = await json('POST', '/patients',
      { name: 'Sunita Devi', age: 54, contactNumber: '+919812345678' });

    check('201 Created', created.status === 201, created.status);
    check('exactly the contract keys',
      sameKeys(created.body, ['patientId','name','age','contactNumber','registeredAt']),
      keysOf(created.body));
    check('patientId is a string', typeof created.body.patientId === 'string');
    check('registeredAt is ISO 8601 UTC',
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(created.body.registeredAt),
      created.body.registeredAt);
    const patientId = created.body.patientId;

    const noContact = await json('POST', '/patients', { name: 'X', age: 40 });
    check('400 + contact_number_required when contactNumber missing',
      noContact.status === 400 && noContact.body.error === 'contact_number_required',
      JSON.stringify(noContact.body));
    check('error body carries both .error and .message',
      !!noContact.body.error && !!noContact.body.message);

    // ── GET /patients/:patientId ────────────────────────────────────────────
    console.log('\n--- GET /patients/:patientId ---');
    const fetched = await json('GET', `/patients/${patientId}`);
    check('200 OK', fetched.status === 200);
    check('same shape as the POST response',
      keysOf(fetched.body) === keysOf(created.body));
    check('round-trips identically',
      JSON.stringify(fetched.body) === JSON.stringify(created.body));

    const missing = await json('GET', '/patients/PHC001-nope-zzzz');
    check('404 + patient_not_found for an unknown id',
      missing.status === 404 && missing.body.error === 'patient_not_found',
      JSON.stringify(missing.body));

    // ── POST /captures (multipart) ──────────────────────────────────────────
    console.log('\n--- POST /captures ---');
    const form = new FormData();
    form.append('patientId', patientId);
    form.append('cameraDeviceId', 'unknown');
    form.append('image',
      new Blob([fs.readFileSync(IMAGE)], { type: 'image/jpeg' }), '2.jpg');

    const capRes  = await fetch(`${BASE}/captures`, { method: 'POST', body: form });
    const capture = await capRes.json();

    check('201 Created', capRes.status === 201, capRes.status);
    check('exactly the contract keys',
      sameKeys(capture, ['captureId','patientId','qualityStatus','qualityReason',
                         'retakeCount','capturedAt']),
      keysOf(capture));
    check('qualityStatus is a valid enum',
      ['pass', 'retake', 'borderline'].includes(capture.qualityStatus),
      capture.qualityStatus);
    check('qualityReason is null on pass',
      capture.qualityStatus !== 'pass' || capture.qualityReason === null);
    console.log(`        -> ${capture.qualityStatus}, retakeCount ${capture.retakeCount}`);
    const captureId = capture.captureId;

    const noImage = await json('POST', '/captures', { patientId });
    check('400 when no image is attached',
      noImage.status === 400, JSON.stringify(noImage.body));

    // ── sync_queue enqueue (the gap we just closed) ─────────────────────────
    console.log('\n--- sync_queue enqueue ---');
    const q = db.prepare('SELECT * FROM sync_queue WHERE capture_id = ?').get(captureId);
    const shouldQueue = capture.qualityStatus !== 'retake';
    check(`capture was ${shouldQueue ? '' : 'NOT '}enqueued (status=${capture.qualityStatus})`,
      shouldQueue ? !!q : !q);
    if (q) {
      check("queued as status 'pending'", q.status === 'pending', q.status);
      check('priority is high|low', ['high', 'low'].includes(q.priority), q.priority);
      check('chunks_total defaults to 1', q.chunks_total === 1);
    }

    // ── POST /captures/:captureId/questionnaire ─────────────────────────────
    console.log('\n--- POST /captures/:captureId/questionnaire ---');
    const qn = await json('POST', `/captures/${captureId}/questionnaire`, {
      riskFactors: { yearsSinceDiagnosis: 'lt1', glycemicControl: 'moderate',
                     bloodPressure: 'high', pregnant: false },
      symptoms: { blurredVision: true, floaters: false,
                  suddenVisionChange: false, eyePain: false },
      language: 'hi',
    });
    check('201 Created', qn.status === 201, qn.status);
    check('returns { responseId, captureId }',
      sameKeys(qn.body, ['responseId','captureId']), keysOf(qn.body));

    const qnRow = db.prepare('SELECT * FROM questionnaire_responses WHERE response_id = ?')
                    .get(qn.body.responseId);
    check('row persisted', !!qnRow);
    check('risk_factor_fields stored as valid JSON',
      !!qnRow && JSON.parse(qnRow.risk_factor_fields).glycemicControl === 'moderate');
    check('pregnant:false preserved as false, not null',
      !!qnRow && JSON.parse(qnRow.risk_factor_fields).pregnant === false);

    const qnBad = await json('POST', `/captures/${captureId}/questionnaire`, {
      riskFactors: { yearsSinceDiagnosis: 'less_than_1', glycemicControl: 'moderate',
                     bloodPressure: 'high', pregnant: null },
      symptoms: { blurredVision: true, floaters: false,
                  suddenVisionChange: false, eyePain: false },
    });
    check('400 on an invalid enum value',
      qnBad.status === 400 && qnBad.body.error === 'invalid_field',
      JSON.stringify(qnBad.body));

    // ── POST /captures/:captureId/capture-metadata ──────────────────────────
    console.log('\n--- POST /captures/:captureId/capture-metadata ---');
    const cm = await json('POST', `/captures/${captureId}/capture-metadata`, {
      cameraDeviceReported: 'forus_3nethra_v2', pupilStatus: 'dilated',
      lightingEnvironment: 'indoor_clinic', observedIssues: ['none_noticed'],
      workerUsabilityRating: 'clear',
    });
    check('201 Created', cm.status === 201, cm.status);
    check('returns { responseId, captureId }',
      sameKeys(cm.body, ['responseId','captureId']), keysOf(cm.body));

    const contradiction = await json('POST', `/captures/${captureId}/capture-metadata`, {
      pupilStatus: 'dilated', lightingEnvironment: 'indoor_clinic',
      observedIssues: ['none_noticed', 'glare'], workerUsabilityRating: 'clear',
    });
    check("400 when 'none_noticed' is combined with a real issue",
      contradiction.status === 400, JSON.stringify(contradiction.body));

    const unknownCapture = await json('POST', '/captures/PHC001-nope-zzzz/questionnaire', {
      riskFactors: { yearsSinceDiagnosis: 'lt1', glycemicControl: 'good',
                     bloodPressure: 'normal', pregnant: null },
      symptoms: { blurredVision: false, floaters: false,
                  suddenVisionChange: false, eyePain: false },
    });
    check('404 for an unknown captureId',
      unknownCapture.status === 404 && unknownCapture.body.error === 'capture_not_found',
      JSON.stringify(unknownCapture.body));

    // ── GET /captures ───────────────────────────────────────────────────────
    console.log('\n--- GET /captures ---');
    const list = await json('GET', '/captures');
    check('200 OK', list.status === 200);
    check('returns an array', Array.isArray(list.body));
    const entry = list.body.find((r) => r.captureId === captureId);
    check('contains the capture just created', !!entry);
    if (entry) {
      check('exactly the contract keys',
        sameKeys(entry, ['captureId','patientId','patientName','status','capturedAt']),
        keysOf(entry));
      check('patientName is joined in', entry.patientName === 'Sunita Devi', entry.patientName);
      check('status is a Local Queue enum, not a quality_status',
        ['captured', 'quality_passed', 'synced', 'result_pending', 'result_delivered']
          .includes(entry.status), entry.status);
      console.log(`        -> status '${entry.status}'`);
    }

    // ── GET /sync/status ────────────────────────────────────────────────────
    console.log('\n--- GET /sync/status ---');
    const sync = await json('GET', '/sync/status');
    check('200 OK', sync.status === 200);
    check('exactly the contract keys',
      sameKeys(sync.body, ['online','pendingCount','lastSyncAttempt']), keysOf(sync.body));
    check('online is a boolean', typeof sync.body.online === 'boolean');
    check('pendingCount is a number', typeof sync.body.pendingCount === 'number');
    check('pendingCount reflects the enqueued capture', sync.body.pendingCount >= 1,
      sync.body.pendingCount);
    check('lastSyncAttempt is null before any attempt',
      sync.body.lastSyncAttempt === null, sync.body.lastSyncAttempt);

    // ── Error shape ─────────────────────────────────────────────────────────
    console.log('\n--- Global error shape ---');
    const nf = await json('GET', '/no/such/route');
    check('404 is JSON, not an HTML error page',
      nf.status === 404 && !!nf.body.error && !!nf.body.message,
      JSON.stringify(nf.body));

    console.log(`\n===== ${failures === 0 ? 'Task 3.2 DoD met' : `${failures} FAILURE(S)`} =====\n`);
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
  }
}

main();
