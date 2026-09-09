'use strict';

/**
 * gradingOrchestrator.js
 *
 * Chains the full Phase 2 ML pipeline for one case and persists the results.
 *
 * Call: await processCase(caseId)
 *
 * Pipeline (single MATLAB round-trip):
 *   imread → benGrahamCrop → claheEnhance → illuminationNormalize
 *     → classifyBranchA → applyTemperature → gradCam
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
    proc.on('error', (err) => reject(new Error(
      `Failed to spawn MATLAB (set MATLAB_EXECUTABLE?): ${err.message}`)));
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

  const expr = buildMatlabExpr(imagePath, gradcamPath, qualityScores, cameraDeviceId, caseId);
  let raw;
  try {
    raw = await spawnMatlabBatch(expr);
  } catch (err) {
    throw new Error(`Grading pipeline MATLAB call failed: ${err.message}`);
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

  const { grade, confidenceScore } = mlResult;
  const referable = grade >= 2;

  // Branch B (Task 5.1) grades from lesion QUADRANT COUNTS, which come from
  // Phase 4 segmentation. That is not built, so no counts exist and the rule
  // engine cannot run — both stay null rather than being guessed at.
  //
  // TO ACTIVATE, once Tasks 4.2/4.3 land: have the MATLAB chain return
  // lesionCounts and nvSuspicionScore, then
  //   ruleEngineGrade = mlResult.ruleEngineGrade;
  //   branchAgreement = mlResult.branchAgreement;
  // Nothing else here changes — the columns, the tier override and the writes
  // below are already wired for it.
  const ruleEngineGrade = mlResult.ruleEngineGrade ?? null;
  const branchAgreement = mlResult.branchAgreement ?? null;

  // Task 6.3. A reported-vs-detected disagreement is logged rather than
  // suppressed: it can mean an unusual capture, a mislabelled device, or a
  // camera swapped without the config being updated. It never changes the
  // grading — it is a signal for a human, not an input to the model.
  if (mlResult.cameraMismatch) {
    console.warn(`[gradingOrchestrator] case ${caseId}: camera family mismatch — `
      + `reported '${cameraDeviceId}', image looks like '${mlResult.cameraFamily}'`);
  }

  const tier = assignTier(confidenceScore, branchAgreement);

  // ── Step 3: INSERT INTO grading_results ────────────────────────────────────
  // uncertainty_score stays NULL until Phase 6 (MC-Dropout).
  await pool.query(`
    INSERT INTO grading_results
      (case_id, dr_grade_cnn, referable, confidence_score,
       conformal_tier, model_version, graded_at,
       dr_grade_rule_engine, branch_agreement)
    VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8)
    ON CONFLICT (case_id) DO UPDATE SET
      dr_grade_cnn         = EXCLUDED.dr_grade_cnn,
      referable            = EXCLUDED.referable,
      confidence_score     = EXCLUDED.confidence_score,
      conformal_tier       = EXCLUDED.conformal_tier,
      model_version        = EXCLUDED.model_version,
      graded_at            = NOW(),
      dr_grade_rule_engine = EXCLUDED.dr_grade_rule_engine,
      branch_agreement     = EXCLUDED.branch_agreement
  `, [caseId, grade, referable, confidenceScore, tier, MODEL_VERSION,
      ruleEngineGrade, branchAgreement]);

  // ── Step 4: INSERT INTO explainability_outputs ─────────────────────────────
  // vessel_mask_path, lesion_red_path, lesion_bright_path stay NULL (Phase 3).
  await pool.query(`
    INSERT INTO explainability_outputs (case_id, gradcam_path, evidence_summary_text)
    VALUES ($1, $2, $3)
    ON CONFLICT (case_id) DO UPDATE SET
      gradcam_path          = EXCLUDED.gradcam_path,
      evidence_summary_text = EXCLUDED.evidence_summary_text
  `, [caseId, gradcamPath, mlResult.evidenceSummaryText ?? null]);

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

  return { caseId, grade, confidenceScore, referable, tier, gradcamPath };
}

// ── MATLAB expression builder ──────────────────────────────────────────────────
function buildMatlabExpr(imagePath, gradcamPath, qualityScores, cameraDeviceId, caseIdForReport) {
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
    `[preprocessed, ppSteps] = preprocessForBranchA(img, qualityScores, ppOpts);`,

    // ── CNN classification (loads net via persistent var in classifyBranchA)
    `cnnResult = classifyBranchA(preprocessed);`,

    // ── Temperature calibration
    `tempData = load('${modDir}/temperature_v1.mat', 'T');`,
    `calibratedProbs = applyTemperature(cnnResult.probabilities, tempData.T);`,
    `[confidenceScore, gradeIdx1] = max(calibratedProbs);`,  // 1-indexed
    `calibGrade = gradeIdx1 - 1;`,                           // 0-indexed DR grade

    // ── Grad-CAM (load net separately — can't access classifyBranchA's persistent)
    `netData = load('${modDir}/branchA_v1.mat', 'net');`,
    `gradCam(netData.net, preprocessed, gradeIdx1, '${gcPath}');`,

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
    `evidenceInputs = struct();`,
    `[evidenceText, ~, ~] = generateEvidenceReport('${toMatlabStr(caseIdForReport)}', evidenceInputs);`,

    // ── Output JSON
    `out.evidenceSummaryText = evidenceText;`,
    `out.grade = calibGrade;`,
    `out.confidenceScore = double(confidenceScore);`,
    `out.calibratedProbs = calibratedProbs;`,
    `out.gradcamPath = '${gcPath}';`,
    // Task 4.6: recorded so a DICOM submission is traceable to the device and
    // eye the camera itself reported, rather than only to what a worker typed.
    `out.sourceFormat = imgMeta.format;`,
    `out.dicomDeviceModel = imgMeta.deviceModel;`,
    `out.imageLaterality = imgMeta.laterality;`,
    `out.cameraFamily = ppSteps.cameraFamily;`,
    `out.cameraMismatch = ~isempty(ppSteps.cameraDetail) && ppSteps.cameraDetail.mismatch;`,
    `disp(jsonencode(out));`,
  ].join(' ');
}

// buildMatlabExpr is exported for testing: asserting on the EXPRESSION it
// actually generates is a real check, whereas grepping this file's source is
// not -- a comment quoting the old chain would fail such a grep while the
// generated code was perfectly correct.
module.exports = { processCase, assignTier, buildMatlabExpr };
