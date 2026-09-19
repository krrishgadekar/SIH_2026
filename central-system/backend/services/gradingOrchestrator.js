'use strict';

/**
 * gradingOrchestrator.js
 *
 * Chains the full Phase 2 ML pipeline for one case and persists the results.
 *
 * Call: await processCase(caseId)
 *
 * Pipeline (two round-trips, since 2026-09-09):
 *   PYTHON  ben_graham → EfficientNet-B0 → temperature → conformal tier
 *           → Grad-CAM (same spawn)
 *   MATLAB  readFundusImage → preprocessForBranchA (camera cross-check)
 *           → generateEvidenceReport
 *
 * Branch A moved to Python because MATLAB's official PyTorch converter
 * (importNetworkFromPyTorch) imported the network and computed the wrong
 * numbers — 8-11% agreement with the model's own published logits,
 * correlation -0.25, while Python reproduces them exactly. See
 * ml-pipeline/testImportedNetwork.m, which re-runs that check in one command.
 *
 * CORRECTION (2026-09-18): that finding does not generalize to every MATLAB
 * import path. models/branchA_v1.mat was produced via a DIFFERENT converter
 * (torch.onnx.export -> importNetworkFromONNX) and independently verified
 * against the same PyTorch checkpoint on 10 real images at max|diff| ~2e-6
 * post-softmax (training/parityCheck.m). An INFERENCE_BACKEND=matlab path now
 * exists as an alternative to the Python one below (see
 * runBranchAInferenceMatlab / branchAInferMatlab.m); INFERENCE_BACKEND
 * defaults to 'python' unless documented otherwise elsewhere. Both paths are
 * kept — this is a backend switch, not a replacement.
 *
 * DB writes:
 *   grading_results        — CNN grade, referable flag, calibrated confidence,
 *                            conformal tier (temporary placeholder rule),
 *                            model version.
 *   explainability_outputs — Grad-CAM PNG path.
 *   cases.status           — updated to 'graded'.
 *
 * NULL columns left for later phases:
 *   grading_results.dr_grade_rule_engine  — Phase 4
 *   grading_results.branch_agreement      — Phase 5
 *   grading_results.uncertainty_score     — Phase 6
 *
 * Conformal tier rule (TEMPORARY — replaced by real conformal calibration
 * in Task 6.2):
 *   confidence > 0.9  → 'A'   (auto-grade safe)
 *   0.6 ≤ conf ≤ 0.9 → 'B'   (review recommended)
 *   confidence < 0.6  → 'C'   (urgent review)
 *
 * MATLAB bridge: same child_process + matlab -batch approach as Task 1.6
 * (qualityGateClient.js). No official MATLAB Engine API for Node.js exists.
 * MATLAB_EXECUTABLE env var overrides the 'matlab' PATH lookup.
 * Task 8.1 (post-checkpoint) replaces this with a compiled standalone binary.
 */

const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const os         = require('os');
const pool       = require('../db/pgClient');
const mediaPaths = require('./mediaPaths');
const matlabFallback = require('./matlabFallback');

// Task: MATLAB workaround for a dev machine with no MATLAB install (no
// license, no disk space). When true, MATLAB genuinely failing to SPAWN
// (ENOENT — the interpreter is not on this machine) falls back to
// matlabFallback.js's JS port of the rule engine / branch-agreement /
// evidence-report logic instead of failing the whole case to 'error'. Branch A
// (the CNN grade, Python) and Phase 4 segmentation (also Python) are
// completely unaffected either way — only the MATLAB-only stages (Branch B's
// grading call site, the camera cross-check, lesion-attention consistency)
// are substituted. Set MATLAB_ALLOW_FALLBACK=0 to disable this and get the
// original hard-fail behaviour back (e.g. on a machine that has MATLAB and
// wants a real MATLAB error to actually fail the case).
const ALLOW_MATLAB_FALLBACK = process.env.MATLAB_ALLOW_FALLBACK !== '0';

// ── Path constants ────────────────────────────────────────────────────────────
const ML_ROOT          = path.resolve(__dirname, '..', 'ml-pipeline');
const PREPROCESSING_DIR = path.join(ML_ROOT, 'preprocessing');
const GRADING_DIR       = path.join(ML_ROOT, 'grading');
const CALIBRATION_DIR   = path.join(ML_ROOT, 'calibration');
const EXPLAINABILITY_DIR= path.join(ML_ROOT, 'explainability');
// Task 6.3. preprocessForBranchA calls classifyCameraFamily and
// applyCalibrationProfile, which live here — without this on the path the
// whole pipeline dies at preprocessing with 'Unrecognized function'.
const CAMERA_CAL_DIR    = path.join(ML_ROOT, 'cameraCalibration');
// Task 7.3. generateEvidenceReport needs fundusQuadrants, which lives here.
const SEGMENTATION_DIR  = path.join(ML_ROOT, 'segmentation');
const MODELS_DIR        = path.join(ML_ROOT, 'models');

const MODEL_VERSION     = 'branchA_v1';
const MATLAB_EXE        = process.env.MATLAB_EXECUTABLE || 'matlab';
const TIMEOUT_MS        = parseInt(process.env.MATLAB_TIMEOUT_MS || '120000', 10);

// Grad-CAM output location comes from mediaPaths, NOT a local constant. It has
// to land under backend/media so the URL api-contracts.md returns
// (/media/cases/<id>/gradcam.png) actually resolves — this previously wrote to
// backend/explainability-outputs/, which is outside the static root, so the
// stored path was correct and the file was really there and the frontend could
// still never have loaded it.

/**
 * unavailable(code, message)
 *
 * An error tagged so gradingQueue can classify it as PERMANENT.
 *
 * "The interpreter could not be spawned" is not a transient failure. Retrying
 * in two seconds cannot make a missing executable exist, and the retry is not
 * free: since the Python stages run BEFORE MATLAB (the rule engine needs their
 * output), a MATLAB spawn failure previously cost a full Branch A run plus four
 * segmentation models on each of three attempts — roughly 35 s of model
 * inference to reach a conclusion available in milliseconds.
 *
 * Only SPAWN failures are permanent. A non-zero exit stays retryable: that can
 * be a licence-server hiccup or a locked file, which a retry genuinely fixes.
 */
function unavailable(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

// ── MATLAB bridge (shared with qualityGateClient pattern) ─────────────────────
function spawnMatlabBatch(expr) {
  return new Promise((resolve, reject) => {
    const proc = spawn(MATLAB_EXE, ['-batch', expr], {
      env: process.env,
      timeout: TIMEOUT_MS,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(
        `matlab -batch exited ${code}.\nstderr: ${stderr.trim()}`));
      resolve(stdout.trim());
    });
    proc.on('error', (err) => reject(unavailable('matlab_unavailable',
      `Failed to spawn MATLAB (set MATLAB_EXECUTABLE?): ${err.message}`)));
  });
}

const PYTHON_EXE = process.env.PYTHON_EXECUTABLE || 'python';
const BRANCH_A_INFER = path.join(ML_ROOT, 'inference', 'branchAInfer.py');
const SEG_INFER      = path.join(ML_ROOT, 'inference', 'segInfer.py');

// ── Branch A backend switch ─────────────────────────────────────────────────
// 'matlab' (DEFAULT as of 2026-09-19): branchAInferMatlab.m against the
//          persistent MATLAB session (ml-pipeline/inference/matlabSession/ --
//          REQUIRED to be running; there is no per-call cold-start fallback,
//          see callMatlabSession below). Flipped from 'python' only once both
//          gating conditions were met and measured, not assumed:
//            - correctness: 10/10 grade AND 10/10 conformal-tier agreement
//              with the python backend on 10 real IDRiD images, after
//              preprocessModel1.m's MATLAB port (SSIM 0.981) was removed in
//              favor of both backends calling the one Python preprocessing
//              function (branchAInfer.preprocess()) -- see
//              branchAInferMatlab.m's header and ml-pipeline/experiments/
//              compareInferenceBackends.js.
//            - latency: mean 3.3s/image against the persistent session vs
//              python's 6.3s (ml-pipeline/experiments/measureInferenceLatency.js)
//              -- matlab is now the FASTER backend, not merely acceptable.
// 'python': branchAInfer.py, the original path. Kept, not deleted -- set
//           INFERENCE_BACKEND=python to fall back to it (e.g. if the
//           persistent session is down and restarting it isn't an option
//           right now).
// Segmentation (segInfer.py) is UNCHANGED either way -- this switch is
// Branch A/classifier only.
const INFERENCE_BACKEND = (process.env.INFERENCE_BACKEND || 'matlab').toLowerCase();
if (!['python', 'matlab'].includes(INFERENCE_BACKEND)) {
  throw new Error(`INFERENCE_BACKEND must be 'python' or 'matlab', got '${INFERENCE_BACKEND}'`);
}
const PREPROCESS_TENSOR = path.join(ML_ROOT, 'inference', 'preprocessBranchATensor.py');
// branchAInferMatlab.m itself is no longer addpath'd/invoked per call from
// here -- the persistent session (matlabSession/runMatlabInferenceSession.m)
// addpaths and calls it once, at its own startup. See callMatlabSession below.

/**
 * runBranchAInference(imagePath)
 *
 * Grades one image with the real Branch A model. Returns the parsed JSON.
 *
 * Arguments cross as argv, not interpolated into a command string, so a
 * capture path containing a quote is inert rather than executable — the same
 * property the compiled quality gate gained in Task 8.1.
 */
function runBranchAInference(imagePath, gradcamPath) {
  return new Promise((resolve, reject) => {
    const args = [BRANCH_A_INFER, imagePath];
    if (gradcamPath) args.push('--gradcam', gradcamPath);
    const proc = spawn(PYTHON_EXE, args, {
      env: process.env,
      timeout: TIMEOUT_MS,
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        // branchAInfer.py documents its codes: 2 = bad arguments, 3 = inference
        // failed. Surfacing the number separates a deployment mistake from an
        // unreadable image.
        return reject(new Error(
          `Branch A inference exited ${code}.\nstderr: ${stderr.trim()}`));
      }
      const start = stdout.indexOf('{');
      if (start === -1) {
        return reject(new Error(`Branch A returned no JSON.\nstdout: ${stdout.slice(0, 300)}`));
      }
      try {
        resolve(JSON.parse(stdout.slice(start)));
      } catch (err) {
        reject(new Error(`Branch A JSON parse failed: ${err.message}`));
      }
    });

    proc.on('error', (err) => reject(unavailable('python_unavailable',
      `Failed to spawn Python (set PYTHON_EXECUTABLE?): ${err.message}`)));
  });
}

/**
 * preprocessBranchATensor(imagePath)
 *
 * Runs the ONE shared preprocessing step (branchAInfer.preprocess(), via
 * preprocessBranchATensor.py) and returns the path to the .mat tensor it
 * wrote. Both Branch A backends need this to see identical input; the
 * python backend does it in-process inside branchAInfer.py, the matlab
 * backend needs it as a separate step first since MATLAB no longer carries
 * its own preprocessing (see branchAInferMatlab.m's header for why that
 * port was removed rather than fixed).
 *
 * Caller owns cleanup of the returned path (see runBranchAInferenceMatlab).
 */
function preprocessBranchATensor(imagePath) {
  return new Promise((resolve, reject) => {
    const tensorPath = path.join(
      os.tmpdir(), `branchA_tensor_${Date.now()}_${Math.random().toString(36).slice(2)}.mat`);
    const proc = spawn(PYTHON_EXE, [PREPROCESS_TENSOR, imagePath, tensorPath], {
      env: process.env,
      timeout: TIMEOUT_MS,
    });
    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          `Branch A tensor preprocessing exited ${code}.\nstderr: ${stderr.trim()}`));
      }
      resolve(tensorPath);
    });
    proc.on('error', (err) => reject(unavailable('python_unavailable',
      `Failed to spawn Python for Branch A preprocessing (set PYTHON_EXECUTABLE?): ${err.message}`)));
  });
}

// ── Persistent MATLAB session (Part 2 of the MATLAB-backend latency fix) ───
// ml-pipeline/inference/matlabSession/{README.md,runMatlabInferenceSession.m,
// manageMatlabSession.ps1}. `matlab -batch` cold-starts in ~24s mean (10-image
// measurement, ml-pipeline/experiments/measureInferenceLatency.js) -- 3.9x
// Python's ~6.2s, almost entirely interpreter/toolbox/ONNX-package startup,
// not the predict() call itself. Spawning a fresh MATLAB process per case
// pays that every time; this session pays it once at startup and serves
// requests over a request/response directory instead.
//
// This REPLACES the per-call `matlab -batch` spawn for Branch A -- there is
// no fallback to a fresh process if the session isn't running (see
// callMatlabSession's timeout below). That is deliberate: silently falling
// back would reintroduce the exact 24s-per-case cost this exists to remove,
// and do it quietly.
const MATLAB_SESSION_DIR          = path.join(ML_ROOT, 'inference', 'matlabSession');
const MATLAB_SESSION_REQUEST_DIR  = path.join(MATLAB_SESSION_DIR, 'requests');
const MATLAB_SESSION_RESPONSE_DIR = path.join(MATLAB_SESSION_DIR, 'responses');
const MATLAB_SESSION_POLL_MS      = 50;
const MATLAB_SESSION_TIMEOUT_MS   = parseInt(process.env.MATLAB_SESSION_TIMEOUT_MS || '30000', 10);

/**
 * callMatlabSession(tensorPath, gradcamPath)
 *
 * Writes a request file the persistent session (see above) is polling for,
 * then polls for its matching response file. Both sides write temp-then-
 * rename, so neither ever observes a partially-written file.
 */
function callMatlabSession(tensorPath, gradcamPath) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(MATLAB_SESSION_REQUEST_DIR, { recursive: true });
    fs.mkdirSync(MATLAB_SESSION_RESPONSE_DIR, { recursive: true });

    const reqId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const reqPath = path.join(MATLAB_SESSION_REQUEST_DIR, `${reqId}.json`);
    const reqTmpPath = `${reqPath}.tmp`;
    const respPath = path.join(MATLAB_SESSION_RESPONSE_DIR, `${reqId}.json`);

    fs.writeFileSync(reqTmpPath, JSON.stringify({
      tensorPath, gradcamPath: gradcamPath || '',
    }));
    fs.renameSync(reqTmpPath, reqPath);

    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (fs.existsSync(respPath)) {
        clearInterval(poll);
        let body;
        try {
          body = JSON.parse(fs.readFileSync(respPath, 'utf8'));
        } catch (err) {
          fs.unlink(respPath, () => {});
          return reject(new Error(`Branch A (MATLAB session) response JSON parse failed: ${err.message}`));
        }
        fs.unlink(respPath, () => {});
        if (body && body.error) {
          return reject(new Error(`Branch A (MATLAB session) failed: ${body.error}`));
        }
        return resolve(body);
      }
      if (Date.now() - startedAt > MATLAB_SESSION_TIMEOUT_MS) {
        clearInterval(poll);
        return reject(unavailable('matlab_session_unavailable',
          `No response from the persistent MATLAB session within ${MATLAB_SESSION_TIMEOUT_MS}ms. `
          + 'Is it running? See ml-pipeline/inference/matlabSession/README.md '
          + '(start it with manageMatlabSession.ps1 start).'));
      }
    }, MATLAB_SESSION_POLL_MS);
  });
}

/**
 * runBranchAInferenceMatlab(imagePath, gradcamPath)
 *
 * The MATLAB-backend twin of runBranchAInference: same inputs, same resolved
 * JSON shape, same reject-on-failure contract (a Branch A failure must fail
 * the case -- there is no grade without it) -- mirrored field-for-field so
 * processCase() below does not need to know which backend produced `branchA`.
 *
 * Two steps, not one spawn: preprocessBranchATensor() (a fresh Python
 * process, every call -- preprocessing was deliberately NOT made part of the
 * persistent session, see matlabSession/README.md's last section) writes the
 * tensor, then callMatlabSession() hands it to the already-running MATLAB
 * session and waits for the response file.
 */
async function runBranchAInferenceMatlab(imagePath, gradcamPath) {
  const tensorPath = await preprocessBranchATensor(imagePath);
  try {
    return await callMatlabSession(tensorPath, gradcamPath);
  } finally {
    fs.unlink(tensorPath, () => {});   // best-effort; a leaked temp file is not worth failing the case over
  }
}

/**
 * runSegInference(imagePath, outdir)
 *
 * Phase 4: vessels, optic disc/fovea, and both lesion models (M2-M5), in one
 * Python process. Returns the parsed JSON, or NULL on any failure.
 *
 * NULL, NOT A THROW. Branch B is the SECOND opinion. If segmentation fails, the
 * right outcome is a case graded by Branch A alone with branch_agreement NULL —
 * which the schema, the API contract and the tier logic all already handle,
 * because that has been the normal state for the whole project so far. Throwing
 * would fail a case that the classifier graded perfectly well, turning a
 * degraded result into a lost one.
 *
 * The distinction that must not blur: NULL means "Branch B did not run", and
 * FALSE means "Branch B ran and disagreed". Only the second forces Tier C.
 */
function runSegInference(imagePath, outdir) {
  return new Promise((resolve) => {
    const args = [SEG_INFER, imagePath];
    if (outdir) args.push('--outdir', outdir);
    const proc = spawn(PYTHON_EXE, args, { env: process.env, timeout: TIMEOUT_MS });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        console.warn(`[gradingOrchestrator] segmentation exited ${code}; `
          + `Branch B unavailable. stderr: ${stderr.trim().slice(0, 300)}`);
        return resolve(null);
      }
      const start = stdout.indexOf('{');
      if (start === -1) {
        console.warn('[gradingOrchestrator] segmentation returned no JSON; '
          + 'Branch B unavailable');
        return resolve(null);
      }
      try {
        resolve(JSON.parse(stdout.slice(start)));
      } catch (err) {
        console.warn(`[gradingOrchestrator] segmentation JSON parse failed: ${err.message}`);
        resolve(null);
      }
    });

    proc.on('error', (err) => {
      console.warn(`[gradingOrchestrator] failed to spawn segmentation: ${err.message}`);
      resolve(null);
    });
  });
}

/**
 * matlabStructLiteral(scores)
 *
 * Renders the quality-score object as a MATLAB struct literal, or `[]` when
 * there are none.
 *
 * Only the six known numeric sub-scores are emitted, and each is coerced with
 * Number() and checked finite. This expression is interpolated into a command
 * line that MATLAB evaluates, so anything unvalidated reaching it would be
 * executed — a whitelist of numeric fields is the boundary that keeps a value
 * originating at a PHC from becoming code here.
 */
const SCORE_FIELDS = ['focusScore', 'illuminationScore', 'fovScore',
                      'coveragePercent', 'glareScore', 'motionScore',
                      'occlusionScore'];

function matlabStructLiteral(scores) {
  if (!scores || typeof scores !== 'object') return '[]';
  const parts = [];
  for (const key of SCORE_FIELDS) {
    const v = Number(scores[key]);
    if (Number.isFinite(v)) parts.push(`'${key}', ${v}`);
  }
  return parts.length ? `struct(${parts.join(', ')})` : '[]';
}

// ── Path escaping for MATLAB string literals ───────────────────────────────────
function toMatlabStr(p) {
  return p.replace(/\\/g, '/').replace(/'/g, "''");
}

// ── Conformal tier (temporary placeholder — Task 6.2 replaces this) ───────────
/**
 * assignTier(confidence, branchAgreement)
 *
 * @param {number} confidence      calibrated max probability
 * @param {boolean|null} branchAgreement  true, false, or null when Branch B
 *        has not run. NULL IS NOT FALSE — see below.
 *
 * BRANCH DISAGREEMENT OVERRIDES CONFIDENCE ENTIRELY (Task 5.2, design doc
 * §1.11). When the CNN and the rule engine reach different grades, the case
 * goes to full manual review no matter how confident either branch was — a
 * confident disagreement is MORE alarming than an unconfident one, not less,
 * because it means two independent methods are both sure and incompatible.
 *
 * null means Branch B has not run yet, which today is the normal case: the rule
 * engine needs lesion counts from Phase 4 segmentation. Treating null as
 * disagreement would force every case to Tier C and drown the review queue in
 * cases nothing has actually flagged.
 */
function assignTier(confidence, branchAgreement) {
  if (branchAgreement === false) return 'C';
  if (confidence > 0.9)  return 'A';
  if (confidence >= 0.6) return 'B';
  return 'C';
}

// ── Quality-forced override (design doc §6.8's "force-flagged poor-but-not-
// unusable capture" -> Tier C) ──────────────────────────────────────────────
/**
 * isCaptureUngradable(qualityScores)
 *
 * quality_scores was already being loaded and forwarded to MATLAB for
 * adaptiveEnhance's preprocessing (Task 2.8) but never converted to a
 * boolean or checked anywhere in the tier decision -- a case whose own
 * quality gate would have told the technician to retake the photo could
 * still sail through to Tier A on a confident-looking probability.
 *
 * Thresholds are NOT invented here: they are the same hard-failure branches
 * phc-local-app/backend/quality-gate-matlab/qualityGateMain.m already uses
 * to decide LOCAL 'retake' (that file's Step 4), using the one preset that
 * exists today (cameraPresets.json's 'default': focusThreshold 0.17,
 * illuminationThreshold 0.4 -- no per-camera overrides are defined yet, so
 * mirroring 'default' here is not an approximation of anything more precise).
 * The local gate's softer 'borderline' composite-score branch is
 * deliberately NOT reproduced -- borderline images are already handled by
 * adaptiveEnhance and are not what this override exists to catch.
 *
 * A case reaching here with a hard local-retake-equivalent score means one
 * of: the technician forced the capture through despite a warning, the local
 * gate was bypassed, or scores were computed but not acted on locally. Any of
 * those is exactly the "poor-but-not-unusable capture" the design doc's Tier
 * C row names -- no statistical guarantee about the classifier addresses it.
 *
 * Returns false (not ungradable) when quality_scores is null/absent --
 * captures from before this column existed, or synced without scores, fall
 * back to "no signal", not "forced C". See ml-pipeline/grading's
 * matlabStructLiteral for the same six field names.
 */
const QUALITY_RETAKE_THRESHOLDS = {
  minCoveragePercent:    0.5,   // qualityGateMain.m: fov.coveragePercent < 0.5
  maxGlareScore:         0.3,   // qualityGateMain.m: glareScore > 0.3
  maxMotionScore:        0.3,   // qualityGateMain.m: motionScore > 0.3
  illuminationThreshold: 0.4,   // cameraPresets.json 'default'.illuminationThreshold
  focusThreshold:        0.17,  // cameraPresets.json 'default'.focusThreshold
  maxOcclusionScore:     0.18,  // qualityGateMain.m: occlusionScore > 0.18
};

function isCaptureUngradable(qualityScores) {
  if (!qualityScores || typeof qualityScores !== 'object') return false;
  const t = QUALITY_RETAKE_THRESHOLDS;
  const finite = (v) => Number.isFinite(Number(v));
  const num = (v) => Number(v);

  if (finite(qualityScores.coveragePercent) && num(qualityScores.coveragePercent) < t.minCoveragePercent) return true;
  if (finite(qualityScores.glareScore) && num(qualityScores.glareScore) > t.maxGlareScore) return true;
  if (finite(qualityScores.motionScore) && num(qualityScores.motionScore) > t.maxMotionScore) return true;
  if (finite(qualityScores.illuminationScore) && num(qualityScores.illuminationScore) < t.illuminationThreshold) return true;
  if (finite(qualityScores.focusScore) && num(qualityScores.focusScore) < t.focusThreshold) return true;
  if (finite(qualityScores.occlusionScore) && num(qualityScores.occlusionScore) > t.maxOcclusionScore) return true;
  return false;
}

// ── Camera/site probation override (design doc §6.8's implicit "unfamiliar
// capture source" case; no case-count threshold is specified anywhere in the
// docs, so CAMERA_PROBATION_MIN_CASES below is a stated, tunable default, not
// a derived number) ──────────────────────────────────────────────────────────
/**
 * hasClearedCameraSiteProbation(phcId, cameraDeviceId, excludeCaseId)
 *
 * classifyCameraFamily.m already runs every case and flags a reported-vs-
 * detected mismatch (gradingOrchestrator.js's cameraMismatch handling below),
 * but that flag alone says nothing about whether THIS camera/site combination
 * has a track record yet -- an established camera can mismatch on a single
 * unusual photo without that being a systemic problem, while a mismatch on a
 * brand-new install is exactly the "unfamiliar input distribution" case a
 * conformal guarantee fitted on public datasets says nothing about.
 *
 * "Cleared probation" = this exact (phc_id, camera_device_id) pair has at
 * least CAMERA_PROBATION_MIN_CASES prior GRADED cases. Keyed on the pair, not
 * either alone: moving a known camera to a new site, or a new camera arriving
 * at a known site, both restart probation, because the failure mode this
 * guards against (unfamiliar capture characteristics) can come from either.
 *
 * No cameraDeviceId reported -> nothing to be "on probation" FOR -> treated
 * as cleared, so a missing worker-reported field doesn't itself block a case
 * (a null/absent report is a data-completeness issue, not evidence of an
 * unfamiliar camera).
 */
const CAMERA_PROBATION_MIN_CASES = 20;

async function hasClearedCameraSiteProbation(phcId, cameraDeviceId, excludeCaseId) {
  if (!cameraDeviceId) return true;
  const { rows } = await pool.query(`
    SELECT COUNT(*)::int AS n
      FROM cases c
      JOIN grading_results g ON g.case_id = c.case_id
     WHERE c.camera_device_id = $1
       AND c.phc_id IS NOT DISTINCT FROM $2
       AND c.case_id <> $3
  `, [cameraDeviceId, phcId, excludeCaseId]);
  return rows[0].n >= CAMERA_PROBATION_MIN_CASES;
}

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * processCase(caseId)
 *
 * @param {string} caseId — UUID of the case to grade.
 * @returns {Promise<Object>} summary of what was written to the DB.
 */
async function processCase(caseId) {
  // ── Step 1: fetch case row ─────────────────────────────────────────────────
  const caseRes = await pool.query(
    'SELECT * FROM cases WHERE case_id = $1', [caseId]);
  if (caseRes.rows.length === 0)
    throw new Error(`processCase: case '${caseId}' not found in cases table`);

  const caseRow   = caseRes.rows[0];
  const imagePath = caseRow.image_path;
  if (!imagePath)
    throw new Error(`processCase: case '${caseId}' has no image_path`);

  // ── Step 2: single MATLAB round-trip for the full pipeline ────────────────
  // All five MATLAB functions are chained in ONE matlab -batch call to avoid
  // per-call startup overhead (each startup costs ~3–8 s).
  const gradcamPath = mediaPaths.gradcamPath(caseId);   // creates the dir too

  // The PHC quality gate's sub-scores steer Task 2.8's adaptive enhancement.
  // Null for a case captured before they were transmitted, which the MATLAB
  // side treats as "no scores" and falls back to the default chain.
  const qualityScores = caseRow.quality_scores || null;

  const cameraDeviceId = caseRow.camera_device_id || '';

  // ── The two Python stages, in parallel ─────────────────────────────────────
  // Branch A (the classifier) and Phase 4 segmentation are independent, so they
  // run concurrently: each loads its own models and neither reads the other's
  // output. MATLAB then runs LAST, because the rule engine needs the lesion
  // counts and the agreement check needs Branch A's grade.
  //
  // Why Python at all: MATLAB's official PyTorch converter imports these
  // networks and computes the wrong numbers — 8-11% class agreement against the
  // model's own published logits, correlation -0.25, on identical input
  // tensors, while Python reproduces them to 0.0050 with 100% agreement. The
  // structure imports correctly, which is what makes it dangerous. Measured in
  // testImportedNetwork.m; re-run it if the converter is updated.
  //
  // Grad-CAM is produced inside the Branch A call rather than a second spawn:
  // interpreter start and model load dominate the cost.
  //
  // Promise.all and not allSettled: runSegInference never rejects, it resolves
  // NULL on failure, because Branch B is the second opinion and losing it must
  // degrade the result rather than fail the case. A Branch A failure DOES
  // reject, and should — without it there is no grade at all.
  //
  // Backend switch (INFERENCE_BACKEND=python|matlab, default python): both
  // functions resolve to the identical JSON shape, so nothing below this line
  // needs to know which one ran. Segmentation is unaffected either way.
  const runBranchA = INFERENCE_BACKEND === 'matlab'
    ? runBranchAInferenceMatlab
    : runBranchAInference;
  // Probation lookup runs alongside the two inference calls rather than
  // after them -- it only needs caseRow fields already in hand, and adding it
  // serially would tack a DB round-trip onto every case's latency for no
  // reason.
  const [branchA, segResult, cameraSiteProbationCleared] = await Promise.all([
    runBranchA(imagePath, gradcamPath),
    runSegInference(imagePath, mediaPaths.caseDir(caseId)),
    hasClearedCameraSiteProbation(caseRow.phc_id, cameraDeviceId, caseId),
  ]);

  if (!segResult) {
    console.warn(`[gradingOrchestrator] case ${caseId}: Branch B unavailable, `
      + 'grading on the classifier alone');
  }

  const expr = buildMatlabExpr(imagePath, gradcamPath, qualityScores,
                               cameraDeviceId, caseId, segResult,
                               branchA.drGradeCnn, branchA.gradcamMap);
  let mlResult;
  try {
    const raw = await spawnMatlabBatch(expr);

    // Parse JSON from stdout (may have MATLAB startup text before '{')
    const jsonStart = raw.indexOf('{');
    if (jsonStart === -1)
      throw new Error(`No JSON in MATLAB output.\nRaw:\n${raw}`);
    try {
      mlResult = JSON.parse(raw.slice(jsonStart));
    } catch (err) {
      throw new Error(`MATLAB JSON parse failed: ${err.message}\nRaw: ${raw.slice(jsonStart, jsonStart+300)}`);
    }
  } catch (err) {
    if (ALLOW_MATLAB_FALLBACK && err.code === 'matlab_unavailable') {
      console.warn(`[gradingOrchestrator] case ${caseId}: MATLAB is not installed on `
        + 'this machine — using the JS fallback (matlabFallback.js) for Branch B / '
        + 'evidence report / camera check. On a machine with MATLAB this code path '
        + 'is never taken.');
      mlResult = matlabFallback.runMatlabFallback({
        imagePath, segResult, branchAGrade: branchA.drGradeCnn,
      });
    } else {
      // Re-wrap for context but CARRY THE CODE. Without this the classification
      // above is lost at the boundary and every failure looks transient again —
      // the wrapper is exactly where a permanent error quietly becomes a
      // three-attempt one.
      throw unavailable(err.code,
        `Grading pipeline MATLAB call failed: ${err.message}`);
    }
  }

  const grade = branchA.drGradeCnn;
  const confidenceScore = branchA.confidenceScore;
  const referable = branchA.referable;

  if (branchA.calibrationWarning) {
    console.warn(`[gradingOrchestrator] case ${caseId}: ${branchA.calibrationWarning}`);
  }
  if (branchA.gradcamError) {
    console.warn(`[gradingOrchestrator] case ${caseId}: Grad-CAM failed: ${branchA.gradcamError}`);
  }
  // Design doc §6.9's safeguard. A heatmap sitting mostly outside the retinal
  // circle means the model keyed on camera artefacts rather than the eye, and
  // that is a reason for a human to look — not something to log quietly and
  // move past.
  if (branchA.gradcamWarning) {
    console.warn(`[gradingOrchestrator] case ${caseId}: ${branchA.gradcamWarning}`);
  }

  // Branch B (Tasks 5.1/5.2), live. The rule engine grades the lesion QUADRANT
  // COUNTS that Phase 4 segmentation produced, and branchesAgree compares its
  // grade with Branch A's.
  //
  // fromMatlab, not `?? null`: MATLAB's jsonencode renders an empty array as
  // JSON [], NOT as null. That arrives here as an empty JS array, which `??`
  // does not catch because [] is not nullish — and node-postgres then serialises
  // it as the Postgres ARRAY literal {}, so the insert dies with
  // `invalid input syntax for type boolean: "{}"`. MATLAB uses [] for both
  // "no grade" and "no opinion", which are exactly the cases this must map to
  // SQL NULL, so every value crossing that boundary goes through here.
  //
  // Inside fromMatlab it is `?? null` and not `|| null`, because a rule-engine
  // grade of 0 is a real result — "no DR by ICDR criteria" — and || would
  // discard Branch B's opinion on precisely the healthy eyes where agreement
  // matters most for clearing a case. `false` must survive for the same reason.
  const fromMatlab = (v) => (Array.isArray(v) && v.length === 0 ? null : (v ?? null));

  const ruleEngineGrade = fromMatlab(mlResult.ruleEngineGrade);
  const branchAgreement = fromMatlab(mlResult.branchAgreement);

  // v2-task item 6 ("feed M5's microaneurysm count into the grade-0-vs-1
  // decision"): investigated with real inference on the recovered held-out
  // IDRiD grade-1/grade-0 images, not implemented as an automatic grade
  // override -- see experiments/investigateM5Grade1.py's docstring for the
  // n=10 evidence. A naive "M5 red count >= redFloor => bump grade 0 to 1"
  // rule would have fixed at most 3/4 real grade-1 misses while
  // mis-escalating 3/6 true grade-0 images in that sample (spurious counts
  // of 6, 16, and a boundary 3, well above the "1-2" ruleEngineGrade.m's
  // redFloor was calibrated on). Silently rewriting dr_grade_cnn on a signal
  // that noisy was not a defensible trade.
  //
  // What M5's count already does, correctly: it feeds ruleEngineGrade.m,
  // whose grade is compared to Branch A's by branchesAgree() -- CNN=0 vs
  // rule-engine>=1 IS a disagreement there (`agree = gradeA == gradeB` for
  // the non-lower-bound case), so it already forces Tier C via the
  // branchAgreement check below. That is the safe version of "feed the count
  // into the decision": a human sees it, the pipeline does not silently
  // relabel a healthy eye on a spurious detection. This flag exists so that
  // specific boundary is distinguishable in logs from other disagreements,
  // for monitoring and any future, better-evidenced threshold change.
  const grade0Vs1Disagreement = branchAgreement === false
    && grade === 0 && Number.isInteger(ruleEngineGrade) && ruleEngineGrade >= 1;
  if (grade0Vs1Disagreement) {
    console.log(`[gradingOrchestrator] case ${caseId}: grade0Vs1Disagreement — `
      + `CNN said 0, rule engine (M5-fed) said ${ruleEngineGrade} — routed to Tier C, `
      + 'grade NOT auto-corrected (see investigateM5Grade1.py)');
  }

  // Task 6.3. A reported-vs-detected disagreement is ALWAYS logged. Whether it
  // also touches the tier depends on cameraSiteProbationCleared (see the
  // override chain below) — an established camera/site's occasional mismatch
  // stays a log line, same as before; the previous behaviour ("never changes
  // the grading") now only holds once this camera/site has a track record.
  const cameraProbationOverride = mlResult.cameraMismatch === true
    && !cameraSiteProbationCleared;
  if (mlResult.cameraMismatch) {
    console.warn(`[gradingOrchestrator] case ${caseId}: camera family mismatch — `
      + `reported '${cameraDeviceId}', image looks like '${mlResult.cameraFamily}'`
      + (cameraSiteProbationCleared ? '' : ' (camera/site still on probation)'));
  }

  // quality_scores was already loaded (above) and forwarded to MATLAB for
  // adaptiveEnhance's preprocessing, but until now nothing turned it into a
  // tier signal. isCaptureUngradable reuses qualityGateMain.m's own
  // hard-retake thresholds — see that function's header.
  const qualityForced = isCaptureUngradable(qualityScores);

  // ── Tier: real conformal boundaries now, not the placeholder thresholds ────
  // branchAInfer.py assigns A/B/C from the conformal prediction set fitted by
  // calibrateBranchA.m (Task 6.2). assignTier's hardcoded 0.9/0.6 cut-offs were
  // always documented as temporary and are now the fallback for when no
  // calibration file exists.
  //
  // The disagreement override stays HERE regardless, because it is the one
  // thing Python cannot know: Branch B runs in MATLAB, so only this function
  // sees both grades. A confident disagreement is more alarming than an
  // unconfident one, and it forces full manual review whatever the conformal
  // set says (design doc §1.11, §6.7).
  // A grade above the rule engine's ceiling has NO second opinion at all: the
  // rule engine cannot represent it, so branchesAgree correctly returns null
  // rather than a false agreement or a spurious disagreement. That leaves the
  // most consequential grade this system can produce — proliferative DR — as the
  // one case where the dual-branch safety net silently does not apply.
  //
  // So it is escalated explicitly, on its own stated reason, rather than by
  // pretending the branches disagreed. This is what Tanuj's cap was for: every
  // suspected grade 4 reaches an ophthalmologist. It matters here because NV
  // recall is 0.4444 — the branch most likely to be wrong about grade 4 is the
  // only branch that can assess it.
  const beyondRuleEngine =
    mlResult.ruleIsLowerBound === true &&
    Number.isInteger(fromMatlab(mlResult.ruleMaxGrade)) &&
    grade > fromMatlab(mlResult.ruleMaxGrade);

  // ── Override chain ──────────────────────────────────────────────────────
  // All four early checks are decided before the conformal tier is ever
  // consulted — none of them is a statement about classifier confidence, so
  // none of them should be answerable by one.
  //
  // Ordering is NOT arbitrary. The three checks that force an exact 'C'
  // (branch disagreement, beyond-rule-engine, quality-forced) all come before
  // the one check that only raises a FLOOR to 'B' (camera/site probation).
  // Checking the floor first would risk it short-circuiting the chain on a
  // case that also warranted a hard 'C' — e.g. a probation-camera image of a
  // confirmed grade 4 must still reach 'C', not get stuck at 'B' because the
  // probation check matched first. A floor can only ever raise A -> B; it
  // must never be able to pre-empt a real C.
  let tier;
  let tierReason;
  if (branchAgreement === false) {
    tier = 'C';
    tierReason = 'branches disagree';
  } else if (beyondRuleEngine) {
    tier = 'C';
    tierReason = `CNN grade ${grade} is above the rule engine's ceiling `
      + `(${mlResult.ruleMaxGrade}); no second opinion is possible`;
  } else if (qualityForced) {
    tier = 'C';
    tierReason = 'capture quality is below the local retake threshold '
      + '(qualityGateMain.m-equivalent hard failure) — no shortcut on an '
      + 'image the quality gate itself would have rejected';
  } else if (cameraProbationOverride) {
    tier = 'B';
    tierReason = `camera family mismatch on a camera/site with fewer than `
      + `${CAMERA_PROBATION_MIN_CASES} prior graded cases — not yet enough `
      + 'of a track record to auto-clear';
  } else if (branchA.conformalTier) {
    tier = branchA.conformalTier;
    tierReason = branchA.tierReason || 'conformal prediction set';
  } else {
    tier = assignTier(confidenceScore, branchAgreement);
    tierReason = 'uncalibrated fallback thresholds';
  }
  if (tier === 'C') {
    console.log(`[gradingOrchestrator] case ${caseId}: Tier C — ${tierReason}`);
  }

  // ── Step 3: INSERT INTO grading_results ────────────────────────────────────
  //
  // uncertainty_score (Task 6.1) is written from MC-dropout. It is NULL, never
  // 0, when the measurement did not happen: the ophthalmologist queue ranks
  // Tier C by it descending and falls back to (1 - confidence) while NULL, so
  // a 0 meaning "not measured" would read as "maximally certain" and sort a
  // never-sampled case to the wrong end of the queue.
  //
  // Note the comment sits ABOVE pool.query, not inside the template literal.
  // A JS comment inside the SQL string is sent to Postgres as SQL and every
  // case fails with a syntax error -- that has already happened here once.
  // fromMatlab, not `?? null`: the MATLAB backend's branchAInferMatlab.m
  // reports "not measured" as `[]` (MATLAB's empty-array idiom), and
  // jsonencode renders that as JSON `[]`, not `null` -- the same MATLAB/JS
  // mismatch `fromMatlab` was already built for below (ruleEngineGrade,
  // branchAgreement). `[]` is not nullish, so plain `?? null` would leave an
  // array here and the INSERT below would fail against a FLOAT column. The
  // Python backend's real `null` passes through fromMatlab unchanged.
  const uncertaintyScore = fromMatlab(branchA.uncertaintyScore);
  if (branchA.uncertaintyError) {
    console.warn(`[gradingOrchestrator] case ${caseId}: `
      + `MC-dropout failed: ${branchA.uncertaintyError}`);
  }

  await pool.query(`
    INSERT INTO grading_results
      (case_id, dr_grade_cnn, referable, confidence_score,
       conformal_tier, model_version, graded_at,
       dr_grade_rule_engine, branch_agreement, uncertainty_score)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, $9)
    ON CONFLICT (case_id) DO UPDATE SET
      dr_grade_cnn         = EXCLUDED.dr_grade_cnn,
      referable            = EXCLUDED.referable,
      confidence_score     = EXCLUDED.confidence_score,
      conformal_tier       = EXCLUDED.conformal_tier,
      model_version        = EXCLUDED.model_version,
      graded_at            = NOW(),
      dr_grade_rule_engine = EXCLUDED.dr_grade_rule_engine,
      branch_agreement     = EXCLUDED.branch_agreement,
      uncertainty_score    = EXCLUDED.uncertainty_score
  `, [caseId, grade, referable, confidenceScore, tier, MODEL_VERSION,
      ruleEngineGrade, branchAgreement, uncertaintyScore]);

  // ── Step 4: INSERT INTO explainability_outputs ─────────────────────────────
  // vessel_mask_path, lesion_red_path, lesion_bright_path stay NULL (Phase 3).
  //
  // gradcam_path is written only when Python actually produced an overlay. A
  // Grad-CAM failure does not fail the grade — the clinical output is already
  // computed — so the column falls back to NULL and the frontend renders "not
  // yet available" rather than a URL to a file that is not there.
  await pool.query(`
    INSERT INTO explainability_outputs
      (case_id, gradcam_path, evidence_summary_text,
       lesion_attention_consistency_score)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (case_id) DO UPDATE SET
      gradcam_path                       = EXCLUDED.gradcam_path,
      evidence_summary_text              = EXCLUDED.evidence_summary_text,
      lesion_attention_consistency_score = EXCLUDED.lesion_attention_consistency_score
  `, [caseId, branchA.gradcamPath ?? null, mlResult.evidenceSummaryText ?? null,
      fromMatlab(mlResult.lesionAttentionConsistency)]);

  // ── Step 4b: INSERT INTO segmentation_outputs ──────────────────────────────
  // This table has existed since the initial schema with exactly the columns
  // Phase 4 produces — lesion_counts, nv_suspicion_score, vessel_map_path,
  // optic_disc_x/y, fovea_x/y — and nothing had ever written to it. The
  // case-detail API SELECTs from it, so lesionCounts and nvSuspicionScore were
  // reaching the frontend as null on every case even once segmentation ran.
  //
  // Paths come from segInfer's own report of what it wrote, not from
  // reconstructing a filename here: a path built by guessing the convention is
  // a path that 404s the day one side of the convention changes.
  if (segResult) {
    const masks = segResult.masks || {};

    // nv_suspicion_score stays NULL, deliberately. neovascularizationSuspicion.m
    // exists but nothing runs it — segInfer produces a vessel mask and no NV
    // score, and the orchestrator passes 0 into the rule engine only so the
    // grade-4 branch stays shut. Writing that 0 here would claim the score was
    // MEASURED and came out at zero, which is a different statement from "no
    // detector ran". Unmeasured is NULL everywhere else in this project.
    await pool.query(`
      INSERT INTO segmentation_outputs
        (case_id, lesion_counts, nv_suspicion_score, vessel_map_path,
         lesion_masks_path, optic_disc_x, optic_disc_y, fovea_x, fovea_y)
      VALUES ($1, $2, NULL, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (case_id) DO UPDATE SET
        lesion_counts     = EXCLUDED.lesion_counts,
        vessel_map_path   = EXCLUDED.vessel_map_path,
        lesion_masks_path = EXCLUDED.lesion_masks_path,
        optic_disc_x      = EXCLUDED.optic_disc_x,
        optic_disc_y      = EXCLUDED.optic_disc_y,
        fovea_x           = EXCLUDED.fovea_x,
        fovea_y           = EXCLUDED.fovea_y
    `, [caseId,
        JSON.stringify({
          red: segResult.redPerQuadrant ?? null,
          bright: segResult.brightPerQuadrant ?? null,
          redTotal: segResult.redLesions?.count ?? null,
          brightTotal: segResult.brightLesions?.count ?? null,
          minAreaPx: segResult.redLesions?.minAreaFilter ?? null,
          // The counting procedure travels WITH the counts. These numbers are
          // only comparable to the ICDR thresholds because they were produced
          // the same way, and a reader six months from now cannot recover that
          // from four integers.
          procedure: segResult.countingProcedure ?? null,
        }),
        masks.vessel ?? null,
        // One column for both lesion masks: the schema predates there being two
        // models. Stored as JSON rather than picking one and dropping the other.
        JSON.stringify({ red: masks.red ?? null, bright: masks.bright ?? null }),
        segResult.opticDisc?.x ?? null, segResult.opticDisc?.y ?? null,
        segResult.fovea?.x ?? null, segResult.fovea?.y ?? null]);
  }

  // lesion_attention_consistency_score stays NULL on purpose (Task 7.1).
  // lesionAttentionConsistency is built and unit-tested, but it needs a lesion
  // MASK, and Tasks 4.2/4.3 produce none. Passing it an empty mask would return
  // NaN by design; writing a number here from anything else would be inventing
  // one. It activates the day the segmenter lands, with no change to this file
  // beyond adding the call.

  // ── Step 5: mark case as graded ────────────────────────────────────────────
  await pool.query(
    `UPDATE cases SET status = 'graded', camera_family_detected = $2
     WHERE case_id = $1`, [caseId, mlResult.cameraFamily ?? null]);

  console.log(`[gradingOrchestrator] case ${caseId}: grade=${grade}, `
    + `confidence=${confidenceScore.toFixed(4)}, tier=${tier}, `
    + `referable=${referable}`);

  return { caseId, grade, confidenceScore, referable, tier, gradcamPath: branchA.gradcamPath ?? null };
}

// ── MATLAB expression builder ──────────────────────────────────────────────────
/**
 * matlabVector(arr) — a 1x4 MATLAB literal, or [] when absent.
 *
 * [] and not zeros(1,4). An empty vector makes ruleEngineGrade refuse to run;
 * a vector of zeros is a positive claim that four quadrants were examined and
 * nothing was found. Not-measured and measured-zero are different clinical
 * statements and this project does not let them collapse.
 */
function matlabVector(arr) {
  if (!Array.isArray(arr) || arr.length !== 4) return '[]';
  if (!arr.every((v) => Number.isInteger(v) && v >= 0)) return '[]';
  return `[${arr.join(' ')}]`;
}

/**
 * matlabMatrix(rows) — an MxN MATLAB literal, or [] when absent/ragged.
 *
 * [] rather than zeros(): an all-zero Grad-CAM is a real and meaningful state
 * (no positive evidence survived the ReLU), so it must not be the value that
 * also means "no heatmap was produced".
 */
function matlabMatrix(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return '[]';
  const width = rows[0].length;
  if (!rows.every((r) => Array.isArray(r) && r.length === width
                         && r.every((v) => Number.isFinite(v)))) return '[]';
  return `[${rows.map((r) => r.join(' ')).join('; ')}]`;
}

function buildMatlabExpr(imagePath, gradcamPath, qualityScores, cameraDeviceId,
                         caseIdForReport, segResult, branchAGrade, gradcamMap) {
  const p  = toMatlabStr;
  const preDir   = p(PREPROCESSING_DIR);
  const gradDir  = p(GRADING_DIR);
  const calDir   = p(CALIBRATION_DIR);
  const expDir   = p(EXPLAINABILITY_DIR);
  const camDir   = p(CAMERA_CAL_DIR);
  const modDir   = p(MODELS_DIR);
  const imgPath  = p(imagePath);
  const gcPath   = p(gradcamPath);

  // Single chained script — addpath all dirs, then run the full pipeline.
  // Returns one JSON struct via disp(jsonencode(...)).
  //
  // NOTE: classifyBranchA loads branchA_v1.mat internally via persistent var.
  // gradCam also needs the net — we load it explicitly here rather than
  // exposing classifyBranchA's persistent variable (which MATLAB doesn't
  // allow from outside the function).
  return [
    `addpath('${preDir}');`,
    `addpath('${gradDir}');`,
    `addpath('${calDir}');`,
    `addpath('${expDir}');`,
    `addpath('${camDir}');`,
    // MODELS_DIR was computed as modDir above but never actually added to the
    // path -- harmless while classifyBranchA.m resolves branchA_v1.mat by an
    // absolute fullfile() path, but the ONNX-imported net also needs its
    // companion `+branchA_v1/` custom-layer package folder (models/) to be
    // resolvable, which only happens if this directory is on the path or is
    // the current folder. Without it the .mat loads "successfully" and
    // silently deserializes into a broken network that then errors on
    // predict() -- reproduced and documented in the model-handoff work.
    `addpath('${modDir}');`,

    // ── Preprocessing
    // preprocessForBranchA is THE chain — benGrahamCrop -> denoiseRetinal ->
    // adaptiveEnhance. It is called rather than the individual steps being
    // re-listed here on purpose: training must run the identical chain, and a
    // hand-written copy in two places is how train/serve skew starts. That skew
    // is silent — nothing errors, no test fails, the model is just worse for
    // reasons nobody can see (docs/model-handoff-guide.md §2).
    //
    // This replaced `illuminationNormalize(claheEnhance(benGrahamCrop(...)))`,
    // which is now wrong in two ways: it skips denoising, and CLAHE plus
    // illumination are folded into adaptiveEnhance.
    // Task 4.6: readFundusImage instead of imread, so a DICOM from a
    // clinical-grade camera is readable at all. Desktop fundus cameras export
    // the Ophthalmic Photography IOD, not JPEG; until now such a file could
    // not have been graded. Ordinary images take the identical imread path.
    `[img, imgMeta] = readFundusImage('${imgPath}');`,
    `qualityScores = ${matlabStructLiteral(qualityScores)};`,
    // The worker-reported device is passed in only for the CROSS-CHECK, never
    // to steer classification: the pixels are what the model actually sees, so
    // image evidence wins and a disagreement is reported rather than resolved
    // in favour of the paperwork (Task 6.3, design doc §9.4).
    // Task 4.6 note: a DICOM file names the device that took the photograph,
    // which is better evidence than the worker's dropdown. It is deliberately
    // NOT substituted for reportedDeviceId here. classifyCameraFamily matches
    // that value against a table of known device keys, and a free-text DICOM
    // string ("Topcon TRC-NW400") matches nothing — so substituting it would
    // silently SUPPRESS the Task 6.3 mismatch check rather than improve it,
    // turning a working cross-check into a no-op with no error anywhere.
    // Mapping manufacturer strings onto camera families needs real DICOM
    // samples from the cameras in question; until then the device is recorded
    // as evidence rather than acted on.
    `ppOpts = struct('reportedDeviceId', '${toMatlabStr(cameraDeviceId || '')}');`,
    // ── Task 6.3: camera family, called DIRECTLY ──────────────────────────
    // This used to run the whole preprocessForBranchA chain (crop, denoise,
    // adaptive enhance, camera profile) and then classifyBranchA on the result.
    // Every one of those outputs was DISCARDED: Branch A grades in Python, and
    // the orchestrator never read mlResult.grade, .calibratedProbs or
    // .confidenceScore. The only survivor was ppSteps.cameraFamily.
    //
    // So it ran the untrained MATLAB stub on every case, for seconds, to
    // produce a grade nothing consumed — and left a stub one careless edit away
    // from becoming load-bearing again.
    //
    // classifyCameraFamily is what actually produced the camera family inside
    // that chain, so it is called directly. Note this changes nothing about
    // Task 6.3's real status: the per-family calibration PROFILE was only ever
    // applied to those discarded pixels, so the family is detected and surfaced
    // as a mismatch signal, and no correction reaches the model. Reconnecting it
    // would feed the network an input distribution it was not trained on.
    `[cameraFamily, cameraDetail] = classifyCameraFamily(img, ppOpts.reportedDeviceId);`,

    // ── CNN classification (loads net via persistent var in classifyBranchA)

    // ── Temperature calibration

    // ── Grad-CAM (load net separately — can't access classifyBranchA's persistent)
    // NO GRAD-CAM HERE ANY MORE.
    //
    // gradCam() needs a network, and the only one MATLAB can load is the
    // untrained stub. The grade now comes from the real PyTorch model, so a
    // heatmap produced here would be explaining a DIFFERENT network than the
    // one that made the decision — a picture of what an untrained model looked
    // at, displayed beside a real grade. That is worse than no heatmap: it is
    // an explanation that is confidently unrelated to the prediction.
    //
    // gradcam_path is written as NULL until Grad-CAM runs against the real
    // model in Python, which is the next task. api-contracts.md already
    // requires the frontend to render a null overlay as "not yet available".

    // ── Task 7.3: the evidence report
    // Runs inside THIS MATLAB call rather than a second spawn. A separate
    // invocation would double the cost of the slowest step in the pipeline to
    // format a sentence, and the interpreter is already up with the paths added.
    //
    // No lesion counts exist yet (Tasks 4.2/4.3 are not built), so
    // generateEvidenceReport is given none and returns text that SAYS
    // segmentation has not been run. That is the intended behaviour, not a
    // placeholder: it never invents "0 microaneurysms", because zero-measured
    // and not-measured are different clinical claims. The moment the segmenter
    // lands, populate evidenceInputs here and the sentence becomes the real
    // lesion-level report with nothing else changing.
    `addpath('${p(SEGMENTATION_DIR)}');`,

    // ── Branch B (Tasks 5.1/5.2), live ────────────────────────────────────
    // Counts come from segInfer.py, computed in CROP-512 with a 10 px minimum
    // component area — the exact procedure the ICDR thresholds were calibrated
    // against (verifyRuleEngineCounts.py: 14/14 on sum(red), and the same
    // rule-engine grade on 14/14).
    //
    // Both vectors are [] when segmentation did not run, and ruleEngineGrade
    // then refuses rather than grading an eye nothing looked at.
    `redQ = ${matlabVector(segResult && segResult.redPerQuadrant)};`,
    `brightQ = ${matlabVector(segResult && segResult.brightPerQuadrant)};`,
    `nvScore = ${Number.isFinite(segResult && segResult.nvSuspicionScore)
      ? segResult.nvSuspicionScore : 0};`,
    `branchAGrade = ${Number.isInteger(branchAGrade) ? branchAGrade : '[]'};`,

    `ruleGrade = []; branchAgree = []; evidenceInputs = struct(); ruleIsLowerBound = false; ruleMaxGrade = [];`,
    `if numel(redQ) == 4 && numel(brightQ) == 4,`,   // trailing comma: the whole
    // expression is joined onto ONE line, and MATLAB needs a separator after an
    // if-condition there or it parses the next statement as part of the test.
    `  [ruleGrade, ruleEvidence] = ruleEngineGrade(redQ, brightQ, nvScore);`,
    `  evidenceInputs = struct('redByQuadrant', redQ, 'brightByQuadrant', brightQ, 'nvSuspicionScore', nvScore);`,
    // branchesAgree returns [] — NOT false — when either branch is missing.
    // false means "compared and disagreed" and forces mandatory review; []
    // means "Branch B did not run". Collapsing them would send every
    // segmentation failure to the review queue as though something was wrong
    // with the eye.
    `  branchAgree = branchesAgree(branchAGrade, ruleGrade, ruleEvidence.isLowerBound);`,
    `  ruleIsLowerBound = ruleEvidence.isLowerBound;`,
    `  ruleMaxGrade = ruleEvidence.maxGrade;`,
    // `end;` with the semicolon for the same one-line-join reason as the
    // if-condition above: `end [evidenceText, ...]` parses as indexing into
    // `end` and fails with "Unexpected '['".
    `end;`,

    // ── Task 7.1: lesion-attention consistency ────────────────────────────
    // The last always-NULL column. lesionAttentionConsistency has been built
    // and unit-tested since 2026-09-09 but never ran on a real case, because it
    // needs a lesion MASK and there was no segmenter. There is now.
    //
    // Everything arrives pre-aligned in Branch A's 384 frame: segInfer writes
    // the lesion union and the retinal ROI at that geometry, and the raw 12x12
    // CAM comes in as a literal. So the only thing done here is the upsample,
    // and no crop geometry is re-derived on this side — re-deriving it is how a
    // misaligned mask would score attention against the wrong pixels and still
    // return a perfectly plausible number.
    `camMap = ${matlabMatrix(gradcamMap)};`,
    `lesion384Path = '${toMatlabStr((segResult && segResult.masks && segResult.masks.lesion384) || '')}';`,
    `roi384Path = '${toMatlabStr((segResult && segResult.masks && segResult.masks.roi384) || '')}';`,
    `lesionAttention = [];`,
    `if ~isempty(camMap) && isfile(lesion384Path) && isfile(roi384Path),`,
    `  lesionMask = imread(lesion384Path) > 127;`,
    `  roiMask = imread(roi384Path) > 127;`,
    `  camFull = imresize(camMap, size(lesionMask), 'bilinear');`,
    `  lesionAttention = lesionAttentionConsistency(camFull, lesionMask, roiMask);`,
    `end;`,

    // ── Task 7.3: the evidence report, now with real lesion content ────────
    // With counts present this produces the lesion-level sentence; with none it
    // still says segmentation has not been run rather than inventing "0
    // microaneurysms", because zero-measured and not-measured are different
    // clinical claims.
    `[evidenceText, ~, ~] = generateEvidenceReport('${toMatlabStr(caseIdForReport)}', evidenceInputs);`,

    // ── Output JSON
    `out.evidenceSummaryText = evidenceText;`,
    // Task 4.6: recorded so a DICOM submission is traceable to the device and
    // eye the camera itself reported, rather than only to what a worker typed.
    `out.sourceFormat = imgMeta.format;`,
    `out.dicomDeviceModel = imgMeta.deviceModel;`,
    `out.imageLaterality = imgMeta.laterality;`,
    `out.cameraFamily = cameraFamily;`,
    `out.cameraMismatch = ~isempty(cameraDetail) && cameraDetail.mismatch;`,

    // Branch B. jsonencode maps an empty MATLAB array to JSON null, which is
    // exactly what the schema wants for "did not run" — so [] survives the
    // round trip as null and never arrives as 0 or false.
    `out.ruleEngineGrade = ruleGrade;`,
    `out.branchAgreement = branchAgree;`,
    `out.nvSuspicionScore = nvScore;`,
    `out.ruleIsLowerBound = ruleIsLowerBound;`,
    `out.ruleMaxGrade = ruleMaxGrade;`,
    `out.lesionAttentionConsistency = lesionAttention;`,
    `disp(jsonencode(out));`,
  ].join(' ');
}

// buildMatlabExpr is exported for testing: asserting on the EXPRESSION it
// actually generates is a real check, whereas grepping this file's source is
// not -- a comment quoting the old chain would fail such a grep while the
// generated code was perfectly correct.
module.exports = {
  processCase, assignTier, buildMatlabExpr,
  runBranchAInference, runBranchAInferenceMatlab, INFERENCE_BACKEND,
  isCaptureUngradable, hasClearedCameraSiteProbation, CAMERA_PROBATION_MIN_CASES,
};
