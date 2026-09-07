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

// ── Path constants ────────────────────────────────────────────────────────────
const ML_ROOT          = path.resolve(__dirname, '..', 'ml-pipeline');
const PREPROCESSING_DIR = path.join(ML_ROOT, 'preprocessing');
const GRADING_DIR       = path.join(ML_ROOT, 'grading');
const CALIBRATION_DIR   = path.join(ML_ROOT, 'calibration');
const EXPLAINABILITY_DIR= path.join(ML_ROOT, 'explainability');
const MODELS_DIR        = path.join(ML_ROOT, 'models');
const GRADCAM_OUT_DIR   = path.resolve(__dirname, '..', 'explainability-outputs');

const MODEL_VERSION     = 'branchA_v1';
const MATLAB_EXE        = process.env.MATLAB_EXECUTABLE || 'matlab';
const TIMEOUT_MS        = parseInt(process.env.MATLAB_TIMEOUT_MS || '120000', 10);

// Ensure Grad-CAM output directory exists at module load time
fs.mkdirSync(GRADCAM_OUT_DIR, { recursive: true });

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

// ── Path escaping for MATLAB string literals ───────────────────────────────────
function toMatlabStr(p) {
  return p.replace(/\\/g, '/').replace(/'/g, "''");
}

// ── Conformal tier (temporary placeholder — Task 6.2 replaces this) ───────────
function confidenceToTier(conf) {
  if (conf > 0.9) return 'A';
  if (conf >= 0.6) return 'B';
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
  const gradcamPath = path.join(GRADCAM_OUT_DIR, `${caseId}.png`);

  const expr = buildMatlabExpr(imagePath, gradcamPath);
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
  const tier      = confidenceToTier(confidenceScore);

  // ── Step 3: INSERT INTO grading_results ────────────────────────────────────
  // dr_grade_rule_engine, branch_agreement, uncertainty_score stay NULL
  // (Phases 4–6 fill them in without schema changes).
  await pool.query(`
    INSERT INTO grading_results
      (case_id, dr_grade_cnn, referable, confidence_score,
       conformal_tier, model_version, graded_at)
    VALUES ($1, $2, $3, $4, $5, $6, NOW())
    ON CONFLICT (case_id) DO UPDATE SET
      dr_grade_cnn     = EXCLUDED.dr_grade_cnn,
      referable        = EXCLUDED.referable,
      confidence_score = EXCLUDED.confidence_score,
      conformal_tier   = EXCLUDED.conformal_tier,
      model_version    = EXCLUDED.model_version,
      graded_at        = NOW()
  `, [caseId, grade, referable, confidenceScore, tier, MODEL_VERSION]);

  // ── Step 4: INSERT INTO explainability_outputs ─────────────────────────────
  // vessel_mask_path, lesion_red_path, lesion_bright_path stay NULL (Phase 3).
  await pool.query(`
    INSERT INTO explainability_outputs (case_id, gradcam_path)
    VALUES ($1, $2)
    ON CONFLICT (case_id) DO UPDATE SET
      gradcam_path = EXCLUDED.gradcam_path
  `, [caseId, gradcamPath]);

  // ── Step 5: mark case as graded ────────────────────────────────────────────
  await pool.query(
    `UPDATE cases SET status = 'graded' WHERE case_id = $1`, [caseId]);

  console.log(`[gradingOrchestrator] case ${caseId}: grade=${grade}, `
    + `confidence=${confidenceScore.toFixed(4)}, tier=${tier}, `
    + `referable=${referable}`);

  return { caseId, grade, confidenceScore, referable, tier, gradcamPath };
}

// ── MATLAB expression builder ──────────────────────────────────────────────────
function buildMatlabExpr(imagePath, gradcamPath) {
  const p  = toMatlabStr;
  const preDir   = p(PREPROCESSING_DIR);
  const gradDir  = p(GRADING_DIR);
  const calDir   = p(CALIBRATION_DIR);
  const expDir   = p(EXPLAINABILITY_DIR);
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

    // ── Preprocessing
    `img = imread('${imgPath}');`,
    `preprocessed = illuminationNormalize(claheEnhance(benGrahamCrop(img, 512)));`,

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

    // ── Output JSON
    `out.grade = calibGrade;`,
    `out.confidenceScore = double(confidenceScore);`,
    `out.calibratedProbs = calibratedProbs;`,
    `out.gradcamPath = '${gcPath}';`,
    `disp(jsonencode(out));`,
  ].join(' ');
}

module.exports = { processCase };
