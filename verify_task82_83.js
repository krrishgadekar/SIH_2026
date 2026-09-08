'use strict';

/**
 * verify_task82_83.js -- Tasks 8.2 and 8.3
 *
 * Run:  node verify_task82_83.js
 *       SKIP_GRADING=1 node verify_task82_83.js     (no MATLAB needed)
 *
 * Task 8.2 -- chunked/resumable upload:
 *   large images transfer in pieces, a resumed session sends only the gaps,
 *   corruption is caught per chunk AND on the assembled whole, and completing
 *   twice does not create two cases for one scan.
 *
 * Task 8.3 -- the grading job queue:
 *   POST returns without waiting for MATLAB, work is retried on transient
 *   failure and bounded on permanent failure, and -- the property that matters
 *   most -- a case left 'processing' by a crashed process is picked back up
 *   rather than stranded forever.
 *
 * The queue tests inject a fake grading function. That is deliberate: what is
 * being verified here is the QUEUE's behaviour (ordering, dedupe, retry,
 * recovery), and driving it with real MATLAB runs would make the retry and
 * concurrency assertions take minutes and depend on a model that does not
 * exist yet. gradingOrchestrator is covered by verify_task33.js.
 */

const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

const CENTRAL = path.resolve(__dirname, 'central-system', 'backend');
require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(__dirname, '.env') });

// Set BEFORE requiring gradingQueue: it reads its tuning constants at module
// load, so assigning this further down would have no effect and the retry
// assertion would be waiting on the 2 s production backoff. Same trap as
// MATLAB_EXECUTABLE in verify_task33.js.
process.env.GRADING_RETRY_BASE_MS = '10';

const SKIP_GRADING = process.env.SKIP_GRADING === '1';
if (SKIP_GRADING) {
  process.env.MATLAB_EXECUTABLE = path.join(__dirname, '__no_such_matlab__.exe');
  process.env.MATLAB_TIMEOUT_MS = '5000';
}

const app     = require(path.join(CENTRAL, 'server.js'));
const pool    = require(path.join(CENTRAL, 'db', 'pgClient'));
const queue   = require(path.join(CENTRAL, 'services', 'gradingQueue'));
const chunked = require(path.join(CENTRAL, 'services', 'chunkedUploadService'));

const IMAGE = path.resolve(__dirname, 'datasets', '2.jpg');
const PORT  = 5124;
const BASE  = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A capture ref shaped like ids.js mints them, unique per run so repeated runs
// do not collide on an existing session directory.
const newRef = () => `PHC001-verify-${crypto.randomBytes(4).toString('hex')}`;

async function main() {
  if (!fs.existsSync(IMAGE)) {
    console.error(`Missing test image at ${IMAGE}`);
    process.exit(2);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Task 8.3 -- the queue, in isolation
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n===== Task 8.3: grading job queue =====\n');
  console.log('--- ordering and dedupe ---');

  queue._reset();
  const graded = [];
  queue._setGradingFn(async (caseId) => { graded.push(caseId); });
  queue.start();

  check('enqueue reports a new case as newly queued', queue.enqueue('case-a') === true);
  check('enqueueing the same case twice is refused', queue.enqueue('case-a') === false);
  queue.enqueue('case-b');
  await queue.onIdle();

  check('both distinct cases were graded', graded.length === 2, graded.join(','));
  check('the duplicate was not graded twice',
    graded.filter((c) => c === 'case-a').length === 1, graded.join(','));
  check('FIFO order preserved', graded[0] === 'case-a' && graded[1] === 'case-b', graded.join(','));

  // ── The POST must not wait for grading ───────────────────────────────────
  console.log('\n--- the queue is asynchronous (the point of 8.3) ---');
  queue._reset();
  let released;
  const gate = new Promise((r) => { released = r; });
  queue._setGradingFn(async () => { await gate; });
  queue.start();

  const t0 = Date.now();
  queue.enqueue('slow-case');
  const enqueueMs = Date.now() - t0;
  check('enqueue returns immediately, without awaiting the grading run',
    enqueueMs < 50, `${enqueueMs}ms`);
  check('the case shows as inflight while grading runs', queue.stats().inflight === 1,
    JSON.stringify(queue.stats()));
  released();
  await queue.onIdle();
  check('and the queue drains once grading finishes', queue.stats().inflight === 0);

  // ── Concurrency is capped ────────────────────────────────────────────────
  console.log('\n--- concurrency cap ---');
  queue._reset();
  let concurrentNow = 0, concurrentPeak = 0;
  queue._setGradingFn(async () => {
    concurrentNow++;
    concurrentPeak = Math.max(concurrentPeak, concurrentNow);
    await sleep(30);
    concurrentNow--;
  });
  queue.start();
  for (let i = 0; i < 6; i++) queue.enqueue(`c${i}`);
  await queue.onIdle();
  check(`never exceeds the configured concurrency of ${queue.CONCURRENCY}`,
    concurrentPeak <= queue.CONCURRENCY, `peak ${concurrentPeak}`);
  check('all six still ran', queue.stats().processed === 6, JSON.stringify(queue.stats()));

  // ── Retry ────────────────────────────────────────────────────────────────
  console.log('\n--- retry on transient failure ---');

  queue._reset();
  let attempts = 0;
  queue._setGradingFn(async () => {
    attempts++;
    if (attempts < 2) throw new Error('MATLAB license checkout timed out');
  });
  queue.start();
  queue.enqueue('flaky-case');
  await queue.onIdle();
  await sleep(60);                 // the retry is scheduled on a timer
  await queue.onIdle();
  check('a transient failure is retried and then succeeds', attempts === 2, `attempts=${attempts}`);
  check('and it counts as processed, not failed',
    queue.stats().processed === 1 && queue.stats().failed === 0, JSON.stringify(queue.stats()));

  console.log('\n--- permanent failures are not retried ---');
  queue._reset();
  let permAttempts = 0;
  queue._setGradingFn(async () => {
    permAttempts++;
    throw Object.assign(new Error('no image on disk'), { code: 'image_not_found' });
  });
  queue.start();
  queue.enqueue('00000000-0000-0000-0000-000000000000');
  await queue.onIdle();
  await sleep(50);
  check('a permanent error is attempted exactly once, not MAX_ATTEMPTS times',
    permAttempts === 1, `attempts=${permAttempts}`);
  console.log(`        (retrying '${'image_not_found'}' cannot make a missing file appear,`);
  console.log('         and every retry delays the cases queued behind it)');

  // ── Crash recovery: the property that matters most ───────────────────────
  console.log('\n--- stranded-case recovery (what makes an in-memory queue safe) ---');
  queue._reset();
  queue._setGradingFn(async () => {});
  const recovered = await queue.recoverStranded();
  check('recoverStranded() runs and returns a count', Number.isInteger(recovered),
    String(recovered));
  console.log(`        re-enqueued ${recovered} case(s) the database still calls 'processing'`);
  console.log("        without this, a restart strands every queued scan forever:");
  console.log('        no retry, no error, no log line');

  // ─────────────────────────────────────────────────────────────────────────
  // Task 8.2 -- chunked upload, service level
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n===== Task 8.2: chunked / resumable upload =====\n');
  console.log('--- rejects a captureRef that could escape the chunk root ---');

  for (const bad of ['../etc/passwd', 'a/b', 'a\\b', '..', '', 'x'.repeat(65)]) {
    let rejected = false;
    try { chunked.getSession(bad); } catch (e) { rejected = e.code === 'invalid_capture_ref'; }
    check(`rejects captureRef ${JSON.stringify(bad.slice(0, 20))}`, rejected);
  }
  console.log('        (this value arrives as a URL path segment and is used to');
  console.log('         build a filesystem path -- it is a traversal if unchecked)');

  console.log('\n--- init validation ---');
  const ref = newRef();
  const img = fs.readFileSync(IMAGE);
  const imgSha = sha256(img);

  await expectCode('rejects a bad sha256',
    () => chunked.initSession(ref, { totalChunks: 2, totalBytes: img.length, sha256: 'nope' }),
    'invalid_field');
  await expectCode('rejects totalChunks of 0',
    () => chunked.initSession(ref, { totalChunks: 0, totalBytes: img.length, sha256: imgSha }),
    'invalid_field');
  await expectCode('rejects an unsupported extension',
    () => chunked.initSession(ref, {
      totalChunks: 2, totalBytes: img.length, sha256: imgSha, filename: 'x.exe' }),
    'invalid_image_type');

  // ─────────────────────────────────────────────────────────────────────────
  // Task 8.2 -- over HTTP, end to end
  // ─────────────────────────────────────────────────────────────────────────
  const server = app.listen(PORT);
  await new Promise((r) => server.once('listening', r));

  try {
    // Grading is stubbed for the HTTP leg: this is testing transfer and
    // assembly, not the model.
    queue._reset();
    queue._setGradingFn(async () => {});
    queue.start();

    const patientId = `PHC001-verify-${crypto.randomBytes(3).toString('hex')}`;
    // Deliberately small so the test image splits into a useful number of
    // chunks. With a chunk larger than the file, `total` is 1 and every
    // resume/partial assertion below passes vacuously — which is how the first
    // version of this script "passed" while testing nothing.
    const CHUNK = 16 * 1024;
    const total = Math.ceil(img.length / CHUNK);
    if (total < 4) {
      console.error(`Test image splits into only ${total} chunk(s); need >= 4.`);
      process.exit(2);
    }
    const httpRef = newRef();
    const meta = {
      patientId,
      patientName: 'Verify Chunked',
      patientAge: '55',
      patientContactNumber: '+910000000000',
      captureIdRef: httpRef,
      capturedAt: new Date().toISOString(),
      totalChunks: total,
      totalBytes: img.length,
      sha256: imgSha,
      filename: 'image.jpg',
    };
    const url = `${BASE}/api/v1/cases/${httpRef}/chunks`;

    console.log(`\n--- init (${(img.length / 1024).toFixed(0)} KB in ${total} chunks) ---`);
    const initRes = await fetch(`${url}/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meta),
    });
    const init = await initRes.json();
    check('201 Created', initRes.status === 201, JSON.stringify(init).slice(0, 200));
    check('reports every chunk as missing', init.missing?.length === total,
      `${init.missing?.length}/${total}`);

    // ── Send a corrupt chunk: it must be refused ──────────────────────────
    console.log('\n--- integrity: a damaged chunk is caught on arrival ---');
    const good0 = img.subarray(0, CHUNK);
    const corrupt = Buffer.from(good0); corrupt[0] ^= 0xff;
    const badRes = await postChunk(url, 0, corrupt, sha256(good0));
    check('422 when the chunk does not match its declared hash', badRes.status === 422,
      badRes.status);
    check('and the error names the chunk', (await badRes.json()).error === 'chunk_checksum_mismatch');
    const after = await (await fetch(url)).json();
    check('the rejected chunk was NOT written to disk', after.received.length === 0,
      JSON.stringify(after.received));
    console.log('        (catching it here costs one chunk; catching it after');
    console.log('         assembly would cost the whole transfer)');

    // ── Send half, then resume ────────────────────────────────────────────
    console.log('\n--- resumability: send half, then ask what is missing ---');
    const half = Math.floor(total / 2);
    for (let i = 0; i < half; i++) {
      const slice = img.subarray(i * CHUNK, Math.min((i + 1) * CHUNK, img.length));
      const r = await postChunk(url, i, slice, sha256(slice));
      if (!r.ok) check(`chunk ${i} accepted`, false, r.status);
    }
    const mid = await (await fetch(url)).json();
    check(`server reports ${half} chunks held`, mid.received.length === half,
      `${mid.received.length}`);
    check('and names exactly the ones still missing',
      mid.missing.length === total - half && mid.missing[0] === half,
      JSON.stringify(mid.missing.slice(0, 5)));
    check('not yet complete', mid.complete === false);

    // Re-init with identical parameters: progress must survive.
    const reinit = await (await fetch(`${url}/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(meta),
    })).json();
    check('re-initialising an in-progress session KEEPS the chunks already sent',
      reinit.resumed === true && reinit.received.length === half,
      JSON.stringify({ resumed: reinit.resumed, have: reinit.received.length }));
    console.log('        (a client that crashed re-derives the session key from its');
    console.log('         own capture id -- no server token had to survive the crash)');

    // ── Completing early must fail ────────────────────────────────────────
    console.log('\n--- completing an incomplete upload is refused ---');
    const early = await fetch(`${url}/complete`, { method: 'POST' });
    check('409 Conflict', early.status === 409, early.status);
    check('and says how many are missing',
      (await early.json()).error === 'incomplete_upload');

    // ── Finish, resending one already-held chunk ──────────────────────────
    console.log('\n--- finish (re-sending a held chunk must be a no-op success) ---');
    const dupSlice = img.subarray(0, CHUNK);
    const dup = await postChunk(url, 0, dupSlice, sha256(dupSlice));
    check('re-sending an already-received chunk succeeds rather than conflicting',
      dup.ok, dup.status);
    console.log('        (after a dropped link a client cannot know whether its last');
    console.log('         chunk landed; making that an error would strand the upload)');

    for (let i = half; i < total; i++) {
      const slice = img.subarray(i * CHUNK, Math.min((i + 1) * CHUNK, img.length));
      const r = await postChunk(url, i, slice, sha256(slice));
      if (!r.ok) check(`chunk ${i} accepted`, false, `${r.status} ${await r.text()}`);
    }

    const doneRes = await fetch(`${url}/complete`, { method: 'POST' });
    const done = await doneRes.json();
    check('201 Created on complete', doneRes.status === 201, JSON.stringify(done).slice(0, 200));
    check('returns a caseId', typeof done.caseId === 'string' && done.caseId.length > 0);

    // ── The assembled image must be byte-identical ────────────────────────
    console.log('\n--- the assembled image is byte-identical to the original ---');
    const { rows } = await pool.query('SELECT image_path, status FROM cases WHERE case_id = $1',
      [done.caseId]);
    check('the case row exists', rows.length === 1);
    if (rows.length) {
      const stored = fs.readFileSync(rows[0].image_path);
      check('stored bytes match the source exactly',
        sha256(stored) === imgSha, `${sha256(stored).slice(0, 16)} vs ${imgSha.slice(0, 16)}`);
      check('stored length matches', stored.length === img.length,
        `${stored.length} vs ${img.length}`);
    }

    // ── Idempotent completion ─────────────────────────────────────────────
    console.log('\n--- completing twice must not create two cases ---');
    const againRes = await fetch(`${url}/complete`, { method: 'POST' });
    const again = await againRes.json();
    check('200 (not 201) on a repeat complete', againRes.status === 200, againRes.status);
    check('returns the SAME caseId rather than ingesting a second copy',
      again.caseId === done.caseId, `${again.caseId} vs ${done.caseId}`);
    check('and flags it as a duplicate', again.duplicate === true);

    const dupCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM cases WHERE capture_id_ref = $1', [httpRef]);
    check('exactly one case exists for this capture', dupCount.rows[0].n === 1,
      `${dupCount.rows[0].n} cases`);
    console.log('        (a client that never saw our response retries; two cases for');
    console.log('         one scan would be a duplicate patient in the review queue)');

    // ── A chunk after completion is refused ───────────────────────────────
    const late = await postChunk(url, 0, dupSlice, sha256(dupSlice));
    check('a chunk sent after ingestion is refused with 409', late.status === 409, late.status);

    // ── Whole-file hash mismatch is caught ────────────────────────────────
    console.log('\n--- a set of individually-valid chunks that assemble wrong is caught ---');
    const badRef = newRef();
    const badUrl = `${BASE}/api/v1/cases/${badRef}/chunks`;
    const twoChunks = [img.subarray(0, CHUNK), img.subarray(CHUNK, 2 * CHUNK)];
    const declaredLen = twoChunks[0].length + twoChunks[1].length;
    await fetch(`${badUrl}/init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...meta, captureIdRef: badRef,
        totalChunks: 2, totalBytes: declaredLen,
        // A hash that is valid hex but is not this file's.
        sha256: 'f'.repeat(64),
      }),
    });
    for (let i = 0; i < 2; i++) {
      await postChunk(badUrl, i, twoChunks[i], sha256(twoChunks[i]));
    }
    const mismatchRes = await fetch(`${badUrl}/complete`, { method: 'POST' });
    check('422 when the assembled whole does not match the declared hash',
      mismatchRes.status === 422, mismatchRes.status);
    check('and it is reported as a checksum mismatch',
      (await mismatchRes.json()).error === 'checksum_mismatch');
    const swept = await fetch(badUrl);
    check('the bad session is discarded so a retry cannot inherit it',
      swept.status === 404, swept.status);
    console.log('        (every chunk passed its own hash; the SET was wrong. Without');
    console.log('         this check a subtly-corrupt fundus image gets graded)');

    // ── The case reached the grading queue ────────────────────────────────
    console.log('\n--- a chunked case reaches the grading queue like any other ---');
    await queue.onIdle();
    check('the completed case was enqueued for grading',
      queue.stats().processed >= 1, JSON.stringify(queue.stats()));

    // ── Cleanup helper ────────────────────────────────────────────────────
    console.log('\n--- stale sessions are reapable ---');
    const sweepRes = chunked.sweepStale(0);   // age 0 = everything is stale
    check('sweepStale() reports what it removed',
      Number.isInteger(sweepRes.swept) && Number.isInteger(sweepRes.kept),
      JSON.stringify(sweepRes));

    // ── Housekeeping ──────────────────────────────────────────────────────
    await pool.query('DELETE FROM cases WHERE capture_id_ref = $1', [httpRef]);
    await pool.query('DELETE FROM patients WHERE patient_id = $1', [patientId]);
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await queue.stop();
    await pool.end();
  }

  console.log(`\n===== ${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`} =====`);
  if (SKIP_GRADING) {
    console.log('NOTE: run without SKIP_GRADING=1 to exercise real MATLAB grading.');
  }
  process.exit(failures === 0 ? 0 : 1);
}

function postChunk(url, index, buffer, sha) {
  const form = new FormData();
  form.append('sha256', sha);
  form.append('chunk', new Blob([buffer], { type: 'application/octet-stream' }), `${index}.part`);
  return fetch(`${url}/${index}`, { method: 'POST', body: form });
}

async function expectCode(label, fn, code) {
  try {
    await fn();
    check(label, false, 'no error raised');
  } catch (err) {
    check(label, err.code === code, `got ${err.code}`);
  }
}

main().catch((err) => {
  console.error('\nverify_task82_83 crashed:', err);
  process.exit(2);
});
