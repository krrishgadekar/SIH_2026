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
 * Branch A moved to Python because MATLAB's official PyTorch converter imports
 * the network and computes the wrong numbers — 8-11% agreement with the
 * model's own published logits, correlation -0.25, while Python reproduces
 * them exactly. That is a measured technical constraint, not a preference; see
 * ml-pipeline/testImportedNetwork.m, which re-runs the check in one command.
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
const pool       = require('../db/pgClient');
const mediaPaths = require('./mediaPaths');

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
  const [branchA, segResult] = await Promise.all([
    runBranchAInference(imagePath, gradcamPath),
    runSegInference(imagePath, mediaPaths.caseDir(caseId)),
  ]);

  if (!segResult) {
    console.warn(`[gradingOrchestrator] case ${caseId}: Branch B unavailable, `
      + 'grading on the classifier alone');
  }

  const expr = buildMatlabExpr(imagePath, gradcamPath, qualityScores,
                               cameraDeviceId, caseId, segResult,
                               branchA.drGradeCnn, branchA.gradcamMap);
  let raw;
  try {
    raw = await spawnMatlabBatch(expr);
  } catch (err) {
    // Re-wrap for context but CARRY THE CODE. Without this the classification
    // above is lost at the boundary and every failure looks transient again —
    // the wrapper is exactly where a permanent error quietly becomes a
    // three-attempt one.
    throw unavailable(err.code,
      `Grading pipeline MATLAB call failed: ${err.message}`);
  }

  // Parse JSON from stdout (may have MATLAB startup text before '{')
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1)
    throw new Error(`No JSON in MATLAB output.\nRaw:\n${raw}`);
  let mlResult;
  try {
    mlResult = JSON.parse(raw.slice(jsonStart));
  } catch (err) {
    throw new Error(`MATLAB JSON parse failed: ${err.message}\nRaw: ${raw.slice(jsonStart, jsonStart+300)}`);
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

  // Task 6.3. A reported-vs-detected disagreement is logged rather than
  // suppressed: it can mean an unusual capture, a mislabelled device, or a
  // camera swapped without the config being updated. It never changes the
  // grading — it is a signal for a human, not an input to the model.
  if (mlResult.cameraMismatch) {
    console.warn(`[gradingOrchestrator] case ${caseId}: camera family mismatch — `
      + `reported '${cameraDeviceId}', image looks like '${mlResult.cameraFamily}'`);
  }

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

  let tier;
  let tierReason;
  if (branchAgreement === false) {
    tier = 'C';
    tierReason = 'branches disagree';
  } else if (beyondRuleEngine) {
    tier = 'C';
    tierReason = `CNN grade ${grade} is above the rule engine's ceiling `
      + `(${mlResult.ruleMaxGrade}); no second opinion is possible`;
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
  const uncertaintyScore = branchA.uncertaintyScore ?? null;
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
module.exports = { processCase, assignTier, buildMatlabExpr };
