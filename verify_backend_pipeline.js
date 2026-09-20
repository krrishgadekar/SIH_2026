#!/usr/bin/env node
'use strict';

/**
 * verify_backend_pipeline.js
 *
 * The per-case MATLAB round trip: the input the orchestrator builds for
 * runCasePipeline.m, and the session protocol that carries it.
 *
 * Both used to be one generated line of MATLAB source, checked only by whether
 * a real case came out the far end. They are now data and a transport, and both
 * have contracts worth asserting directly:
 *
 *   - "not measured" must stay distinguishable from "measured as zero/false",
 *     end to end. This is the §H/§I safety property: a detector signal that was
 *     never run must reach the rule engine as ABSENT, so the evidence text says
 *     the criterion was not assessed instead of quietly claiming it passed.
 *   - a request the Node side has given up on must not be left lying in the
 *     request directory, where a slow session picks it up later and runs work
 *     nobody is waiting for.
 *
 * No MATLAB and no database: this runs anywhere, in about a second.
 */

const fs   = require('fs');
const os   = require('os');
const path = require('path');

const CENTRAL = path.join(__dirname, 'central-system', 'backend');

// Point the session client at a scratch heartbeat BEFORE requiring it: a real
// session on this machine rewrites the live one every 5 s, which would make
// "no session is running" impossible to test here.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-pipeline-'));
process.env.MATLAB_HEARTBEAT_PATH = path.join(scratch, 'session.heartbeat');
// And at a scratch request directory, or the live session would answer these
// requests for real rather than letting the test drive both ends.
process.env.MATLAB_SESSION_DIR = scratch;
const segScratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ns-seg-'));
process.env.SEG_SESSION_DIR = segScratch;
process.env.SEG_HEARTBEAT_PATH = path.join(segScratch, 'worker.heartbeat');

const orchestrator  = require(path.join(CENTRAL, 'services', 'gradingOrchestrator'));
const matlabSession = require(path.join(CENTRAL, 'services', 'matlabSessionClient'));
const segSession    = require(path.join(CENTRAL, 'services', 'segSessionClient'));
const { buildCasePipelineInput, caseRuleOpts } = orchestrator;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

const FULL_SEG = {
  redPerQuadrant: [3, 7, 2, 5],
  brightPerQuadrant: [1, 0, 4, 2],
  opticDisc: { x: 760, y: 430 },
  masks: {
    vessel: 'C:\\media\\cases\\x\\original_vessel.png',
    lesion384: 'C:\\media\\cases\\x\\original_lesion384.png',
    roi384: 'C:\\media\\cases\\x\\original_roi384.png',
  },
  venousBeadingQuadrants: [true, false, true, false],
  irmaQuadrants: [false, false, false, false],
  foveaUnreliable: true,
};

async function main() {
  console.log('\n--- The case-pipeline input: what MATLAB is asked to do ---');
  const full = buildCasePipelineInput('C:\\media\\cases\\x\\original.jpg',
    'forus_3nethra_v2', 'case-1', FULL_SEG, 2, [[0, 1], [1, 0]]);

  check('every path crosses as forward slashes',
    [full.imagePath, full.vesselPath, full.lesion384Path, full.roi384Path]
      .every((p) => !p.includes('\\')),
    JSON.stringify([full.imagePath, full.vesselPath]));
  check('quadrant counts pass through unchanged',
    JSON.stringify(full.redQ) === '[3,7,2,5]' && JSON.stringify(full.brightQ) === '[1,0,4,2]');
  check('the optic disc becomes [x, y]', JSON.stringify(full.odXY) === '[760,430]');
  check('the Grad-CAM stays a matrix', JSON.stringify(full.camMap) === '[[0,1],[1,0]]');
  check('the whole input is JSON-serialisable, no Buffers or dates',
    JSON.stringify(JSON.parse(JSON.stringify(full))) === JSON.stringify(full));

  console.log('\n--- Segmentation did not run: refuse, do not invent ---');
  const bare = buildCasePipelineInput('C:\\x.jpg', '', 'case-2', null, null, null);
  check('redQ and brightQ are null, NOT [0,0,0,0]',
    bare.redQ === null && bare.brightQ === null,
    JSON.stringify([bare.redQ, bare.brightQ]));
  check('the optic disc is null, not [0,0]', bare.odXY === null);
  check('the Grad-CAM is null, not a zero matrix', bare.camMap === null);
  check('branchAGrade is null, not 0', bare.branchAGrade === null);
  check('mask paths are empty strings, which isfile() rejects',
    bare.vesselPath === '' && bare.lesion384Path === '' && bare.roi384Path === '');

  // A grade of 0 is a real result -- "no DR" -- and must survive as 0.
  const zero = buildCasePipelineInput('C:\\x.jpg', '', 'case-3',
    { redPerQuadrant: [0, 0, 0, 0], brightPerQuadrant: [0, 0, 0, 0] }, 0, null);
  check('a grade of 0 survives as 0, not as null', zero.branchAGrade === 0);
  check('all-zero counts survive as counts, not as absence',
    JSON.stringify(zero.redQ) === '[0,0,0,0]');

  console.log('\n--- §H/§I: a detector signal is sent ONLY when measured ---');
  check('nothing measured -> no keys at all, so nothing is "assessed"',
    JSON.stringify(caseRuleOpts(null)) === '{}');
  check('an all-false measurement IS sent (assessed, and negative)',
    JSON.stringify(caseRuleOpts({ irmaQuadrants: [false, false, false, false] }))
      === '{"irmaQuadrants":[false,false,false,false]}');
  check('a malformed array is dropped rather than half-trusted',
    JSON.stringify(caseRuleOpts({ irmaQuadrants: [true, false, true] })) === '{}');
  check('0/1 integers are accepted as the booleans they are',
    JSON.stringify(caseRuleOpts({ venousBeadingQuadrants: [1, 0, 1, 0] }))
      === '{"venousBeadingQuadrants":[true,false,true,false]}');
  check('foveaUnreliable is sent only when TRUE',
    JSON.stringify(caseRuleOpts({ foveaUnreliable: false })) === '{}'
      && caseRuleOpts({ foveaUnreliable: true }).foveaUnreliable === true);
  check('a non-boolean foveaUnreliable does not read as "reliable" or as true',
    JSON.stringify(caseRuleOpts({ foveaUnreliable: 'yes' })) === '{}');
  check('the full case carries exactly the two measured signals',
    JSON.stringify(full.ruleOpts)
      === '{"venousBeadingQuadrants":[true,false,true,false],'
        + '"irmaQuadrants":[false,false,false,false],"foveaUnreliable":true}',
    JSON.stringify(full.ruleOpts));

  console.log('\n--- The session protocol ---');
  check('no heartbeat file means no session', matlabSession.alive() === false);
  fs.writeFileSync(process.env.MATLAB_HEARTBEAT_PATH, 'now');
  check('a fresh heartbeat means a session', matlabSession.alive() === true);
  const old = Date.now() - 120_000;
  fs.utimesSync(process.env.MATLAB_HEARTBEAT_PATH, old / 1000, old / 1000);
  check('a stale heartbeat means a wedged session, not a live one',
    matlabSession.alive() === false);

  // A session that answers.
  const answered = matlabSession.call({ casePipeline: 'C:/in.json' },
    { timeoutMs: 5_000, prefix: 't' });
  const served = await serveOnce({ ruleEngineGrade: 2, nvSuspicionScore: null });
  check('the request names what it wants done',
    served.request.casePipeline === 'C:/in.json', JSON.stringify(served.request));
  const body = await answered;
  check('the response comes back parsed', body.ruleEngineGrade === 2);
  check('the response file is cleaned up',
    !fs.existsSync(served.responsePath));

  // A session that reports a failure.
  const failing = matlabSession.call({ casePipeline: 'C:/in.json' },
    { timeoutMs: 5_000, prefix: 't' });
  await serveOnce({ error: 'Unrecognized function or variable "runCasePipeline".' });
  let message = null;
  try { await failing; } catch (err) { message = err.message; }
  check('a MATLAB error surfaces as MATLAB wrote it',
    message === 'Unrecognized function or variable "runCasePipeline".', message);

  // A session that never answers.
  let timedOut = null;
  try {
    await matlabSession.call({ casePipeline: 'C:/in.json' }, { timeoutMs: 300, prefix: 't' });
  } catch (err) { timedOut = err; }
  check('a silent session times out', timedOut !== null && timedOut.code === 'matlab_session_timeout');
  check('the timeout says how to start the session',
    timedOut && timedOut.message.includes('manageMatlabSession.ps1'));
  // The defect this guards: left behind, the request is picked up minutes later
  // by a session that has just restarted, which then runs a case nobody is
  // waiting for and leaves an orphan response file next to it.
  check('a timed-out request is TAKEN BACK, not left for a late session',
    fs.readdirSync(matlabSession.REQUEST_DIR).filter((f) => f.startsWith('t_')).length === 0,
    fs.readdirSync(matlabSession.REQUEST_DIR).join(', '));

  console.log('\n--- Branch B: the worker, and what happens without it ---');
  // Losing the segmentation worker must never lose a case. Branch B is the
  // SECOND opinion: a case graded by the classifier alone, with
  // branch_agreement NULL, is a degraded result the tier logic already
  // handles. A thrown error would turn that into a lost case.
  check('no worker means no worker', segSession.alive() === false);

  const { segment } = orchestrator;
  fs.writeFileSync(process.env.SEG_HEARTBEAT_PATH, 'now');
  check('a fresh heartbeat means the worker is preferred', segSession.alive() === true);

  const counts = { redPerQuadrant: [3, 7, 2, 5], brightPerQuadrant: [1, 0, 4, 2] };
  const viaWorker = segment('C:/no/such/image.jpg', '');
  const segServed = await serveOnce(counts, segSession.REQUEST_DIR, segSession.RESPONSE_DIR, 'seg_');
  check('the worker is asked for the image the case names',
    segServed.request.image === 'C:/no/such/image.jpg', JSON.stringify(segServed.request));
  const segBody = await viaWorker;
  check('the worker result is what Branch B grades',
    JSON.stringify(segBody && segBody.redPerQuadrant) === '[3,7,2,5]',
    JSON.stringify(segBody));

  // The worker fails on this image. The orchestrator must fall back to a fresh
  // segInfer.py, which on a path that does not exist fails too -- and the whole
  // thing must still resolve NULL rather than throw.
  const bothFail = segment('C:/no/such/image.jpg', '');
  await serveOnce({ error: 'FileNotFoundError: no file at C:/no/such/image.jpg' },
    segSession.REQUEST_DIR, segSession.RESPONSE_DIR, 'seg_');
  let threw = null;
  let result = 'not-resolved';
  try { result = await bothFail; } catch (err) { threw = err; }
  check('a failure on both paths resolves NULL, it does not throw',
    threw === null && result === null, threw ? threw.message : String(result));

  console.log(failures === 0
    ? '\n===== The per-case MATLAB round trip is verified ====='
    : `\n===== ${failures} FAILURE(S) =====`);
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.rmSync(segScratch, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
}

/**
 * Stand in for the MATLAB session for exactly one request: wait for a request
 * file to appear, read it, and write the given body back under the matching id.
 */
function serveOnce(body, requestDir = matlabSession.REQUEST_DIR,
                  responseDir = matlabSession.RESPONSE_DIR, prefix = 't_') {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = setInterval(() => {
      const pending = fs.existsSync(requestDir)
        ? fs.readdirSync(requestDir).filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
        : [];
      if (pending.length) {
        clearInterval(poll);
        const reqPath = path.join(requestDir, pending[0]);
        const request = JSON.parse(fs.readFileSync(reqPath, 'utf8'));
        const responsePath = path.join(responseDir, pending[0]);
        fs.writeFileSync(`${responsePath}.tmp`, JSON.stringify(body));
        fs.renameSync(`${responsePath}.tmp`, responsePath);
        fs.unlinkSync(reqPath);
        return resolve({ request, responsePath });
      }
      if (Date.now() - startedAt > 4_000) {
        clearInterval(poll);
        reject(new Error('no request appeared'));
      }
    }, 10);
  });
}

main().catch((err) => { console.error(err); process.exit(1); });
