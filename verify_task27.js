'use strict';

/**
 * verify_task27.js -- Task 2.7 Definition of Done
 *
 * Run:  node verify_task27.js
 *
 * Prerequisites (in order):
 *   node scripts/setupCentralDb.js --reset
 *   node scripts/seedTestCase.js
 *   MATLAB stub present at ml-pipeline/models/branchA_v1.mat
 *     (build it with: matlab -batch "run('.../training/createStubBranchA.m')")
 *
 * Calls processCase() on the seeded case, then reads back grading_results,
 * explainability_outputs and cases.status to confirm what actually landed.
 *
 * WHAT THIS DOES AND DOES NOT PROVE
 *   The Branch A model is currently an UNTRAINED stub, so the grade and
 *   confidence values are noise. This check verifies ORCHESTRATION only: that
 *   the right values reach the right columns in the right order, with NULLs
 *   where later phases have not filled things in. The sanity checks below are
 *   deliberately range/consistency checks, never assertions about a specific
 *   grade -- a check that pinned an exact grade would just be asserting the
 *   stub's random initialisation.
 */

const fs   = require('fs');
const path = require('path');

// Config comes from the repo-root .env -- nothing is hardcoded here, so this
// file cannot drift from the real config the servers use.
//
// This script lives at the repo root, which has no node_modules of its own, so
// dotenv is resolved from the backend that depends on it. Loading it HERE
// rather than relying on pgClient's own .env load matters: gradingOrchestrator
// reads MATLAB_EXECUTABLE at module scope, so the variables have to be in
// process.env before that require runs, not after.
const CENTRAL_BACKEND = path.resolve(__dirname, 'central-system', 'backend');
require(require.resolve('dotenv', { paths: [CENTRAL_BACKEND] }))
  .config({ path: path.resolve(__dirname, '.env') });

const { processCase } = require('./central-system/backend/services/gradingOrchestrator');
const pool            = require('./central-system/backend/db/pgClient');

const CASE_ID_FILE = path.resolve(__dirname, 'test_case_id.txt');

function readCaseId() {
  if (!fs.existsSync(CASE_ID_FILE)) {
    throw new Error(
      `${path.basename(CASE_ID_FILE)} not found. Run: node scripts/seedTestCase.js`);
  }
  // Strip a UTF-8 BOM if one is present -- the previous file had one, and it
  // silently corrupts the UUID when passed to Postgres.
  return fs.readFileSync(CASE_ID_FILE, 'utf8').replace(/^﻿/, '').trim();
}

const check = (label, ok) =>
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);

async function main() {
  const caseId = readCaseId();

  console.log(`\n[verify] processCase("${caseId}")`);
  console.log('[verify] First MATLAB call includes boot + 90 MB model load; allow several minutes.\n');

  const t0 = Date.now();
  let result;
  try {
    result = await processCase(caseId);
  } catch (err) {
    console.error('\n[verify] processCase FAILED:', err.message);
    await pool.end();
    process.exitCode = 1;
    return;
  }
  console.log(`\n[verify] completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('[verify] return value:', JSON.stringify(result, null, 2));

  const { rows: [gr] } = await pool.query(`
    SELECT dr_grade_cnn, referable, confidence_score, conformal_tier,
           model_version, graded_at,
           dr_grade_rule_engine, branch_agreement, uncertainty_score
    FROM grading_results WHERE case_id = $1`, [caseId]);

  const { rows: [ex] } = await pool.query(`
    SELECT gradcam_path, lesion_attention_consistency_score, evidence_summary_text
    FROM explainability_outputs WHERE case_id = $1`, [caseId]);

  const { rows: [seg] } = await pool.query(
    'SELECT * FROM segmentation_outputs WHERE case_id = $1', [caseId]);

  const { rows: [cs] } = await pool.query(
    'SELECT status FROM cases WHERE case_id = $1', [caseId]);

  console.log('\n==== grading_results ====');        console.table([gr]);
  console.log('==== explainability_outputs ====');   console.table([ex]);
  console.log('==== cases.status ====');             console.table([cs]);

  if (!gr || !ex) {
    console.error('[verify] FAILED: expected rows missing.');
    await pool.end();
    process.exitCode = 1;
    return;
  }

  console.log('\n--- Phase 2 values written ---');
  check('dr_grade_cnn in 0..4',
    Number.isInteger(gr.dr_grade_cnn) && gr.dr_grade_cnn >= 0 && gr.dr_grade_cnn <= 4);
  check('confidence_score in [0,1]',
    gr.confidence_score >= 0 && gr.confidence_score <= 1);
  check('conformal_tier in {A,B,C}',
    ['A', 'B', 'C'].includes(gr.conformal_tier));
  check('referable === (grade >= 2)',
    gr.referable === (gr.dr_grade_cnn >= 2));
  check('tier matches the confidence threshold rule',
    gr.conformal_tier === (gr.confidence_score > 0.9 ? 'A'
                         : gr.confidence_score >= 0.6 ? 'B' : 'C'));
  check('model_version recorded', gr.model_version === 'branchA_v1');
  check('graded_at set', gr.graded_at instanceof Date);
  check('cases.status === graded', cs.status === 'graded');

  console.log('\n--- Grad-CAM artefact ---');
  check('gradcam_path recorded', !!ex.gradcam_path);
  check('gradcam PNG exists on disk',
    !!ex.gradcam_path && fs.existsSync(ex.gradcam_path));
  if (ex.gradcam_path && fs.existsSync(ex.gradcam_path)) {
    console.log(`        ${ex.gradcam_path} (${(fs.statSync(ex.gradcam_path).size / 1024).toFixed(0)} KB)`);
  }

  console.log('\n--- Later-phase columns must still be NULL ---');
  check('dr_grade_rule_engine NULL (Phase 5)', gr.dr_grade_rule_engine === null);
  check('branch_agreement NULL (Phase 5)',     gr.branch_agreement === null);
  check('uncertainty_score NULL (Phase 6)',    gr.uncertainty_score === null);
  check('lesion_attention_consistency_score NULL (Phase 7)',
    ex.lesion_attention_consistency_score === null);
  check('evidence_summary_text NULL (Phase 7)', ex.evidence_summary_text === null);
  check('no segmentation_outputs row yet (Phase 4)', seg === undefined);

  await pool.end();
}

main();
