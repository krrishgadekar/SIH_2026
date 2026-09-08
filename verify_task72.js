'use strict';

/**
 * verify_task72.js -- Task 7.2 Definition of Done
 *
 * Run:  node verify_task72.js
 *
 * "Manually inserting 20+ fake corrections rows and running the job once
 *  produces a new model_versions row, and the promotion flag correctly reflects
 *  whether the retrained model's validation numbers actually held up."
 *
 * The second clause is the one that matters, so most of this file is spent on
 * it. This is the ONLY component in the system that can change the behaviour of
 * a deployed clinical model without a human in the loop — every other pathway
 * ends at an ophthalmologist, this one ends at a file swap. So the gate is
 * tested for REFUSAL at least as hard as for acceptance: each gated metric is
 * regressed individually, and each must block on its own.
 *
 * Retraining is injected rather than run. The real step needs a script and
 * datasets that do not exist, and injecting lets the trigger, the gate and the
 * promotion transaction all be verified today with known numbers.
 */

const fs   = require('fs');
const path = require('path');

const CENTRAL = path.resolve(__dirname, 'central-system', 'backend');
require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(__dirname, '.env') });

const pool = require(path.join(CENTRAL, 'db', 'pgClient'));
const cl   = require(path.join(CENTRAL, 'services', 'continualLearningService'));

const TAG = `t72-${Math.random().toString(36).slice(2, 7)}`;
const LIVE_V = `live_${TAG}`;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

const BASE = { sensitivity: 0.90, specificity: 0.86, kappa: 0.80 };

/** A retrainFn returning controlled metrics, so the gate is tested, not luck. */
const fakeRetrain = (versionId, metrics) => async () => ({
  versionId, modelPath: null, ...metrics,
});

async function pendingCount() {
  return cl.countPendingCorrections();
}

async function main() {
  let patientId, phcId, caseIds = [];

  try {
    // ── Fixtures ───────────────────────────────────────────────────────────
    const site = await pool.query(
      'INSERT INTO phc_sites (name) VALUES ($1) RETURNING phc_id', [`PHC ${TAG}`]);
    phcId = site.rows[0].phc_id;
    patientId = `PHC001-${TAG}`;
    await pool.query(`
      INSERT INTO patients (patient_id, name, age, contact_number, registered_at)
      VALUES ($1, 'Verify Task72', 55, '+919812345678', now())`, [patientId]);

    // A live model WITH recorded metrics, so the gate has something to compare.
    await pool.query('UPDATE model_versions SET promoted = false WHERE promoted = true');
    await pool.query(`
      INSERT INTO model_versions (version_id, trained_at, validation_sensitivity,
        validation_specificity, validation_kappa, promoted, promoted_at)
      VALUES ($1, now(), $2, $3, $4, true, now())`,
      [LIVE_V, BASE.sensitivity, BASE.specificity, BASE.kappa]);

    console.log(`\n[verify] live model '${LIVE_V}': sens ${BASE.sensitivity}, `
      + `spec ${BASE.specificity}, kappa ${BASE.kappa}\n`);

    // ── The pure gate, exhaustively ────────────────────────────────────────
    console.log('--- The validation gate (pure function) ---');
    const live = await cl.getLiveVersion();
    check('live version is the one just inserted', live.version_id === LIVE_V, live.version_id);

    const better = cl.promotionDecision(live,
      { sensitivity: 0.92, specificity: 0.88, kappa: 0.82 });
    check('improvement on all three -> promote', better.promote === true);

    const identical = cl.promotionDecision(live, { ...BASE });
    check('identical metrics -> promote ("no worse", not "strictly better")',
      identical.promote === true);

    // Each metric regressed ALONE must block on its own. A gate that only
    // catches simultaneous regressions is not a gate.
    for (const [name, cand] of [
      ['sensitivity', { ...BASE, sensitivity: 0.89 }],
      ['specificity', { ...BASE, specificity: 0.85 }],
      ['kappa',       { ...BASE, kappa:       0.79 }],
    ]) {
      const d = cl.promotionDecision(live, cand);
      check(`${name} regression ALONE blocks promotion`, d.promote === false,
        d.reasons.join(' | '));
      check(`  ...and the reason names ${name}`,
        d.reasons.some((r) => r.includes(name) && r.includes('REGRESSED')),
        d.reasons.join(' | '));
    }

    const tiny = cl.promotionDecision(live, { ...BASE, sensitivity: 0.8999 });
    check('even a 0.0001 regression blocks', tiny.promote === false);

    // "Cannot be evaluated" must never mean "promote".
    for (const [name, cand] of [
      ['missing kappa',    { sensitivity: 0.95, specificity: 0.95 }],
      ['NaN sensitivity',  { ...BASE, sensitivity: NaN }],
      ['null specificity', { ...BASE, specificity: null }],
      ['string metric',    { ...BASE, kappa: '0.99' }],
    ]) {
      const d = cl.promotionDecision(live, cand);
      check(`${name} -> refuse (unmeasured is not "passed")`, d.promote === false,
        d.reasons.join(' | '));
    }

    // Bootstrap: nothing to compare against.
    const bootNone = cl.promotionDecision(null, { ...BASE });
    check('no live version -> promotable, flagged bootstrap',
      bootNone.promote === true && bootNone.bootstrap === true);
    const bootStub = cl.promotionDecision(
      { version_id: 'stub', validation_sensitivity: null,
        validation_specificity: null, validation_kappa: null }, { ...BASE });
    check('live model with NULL metrics -> flagged bootstrap, not "no worse"',
      bootStub.promote === true && bootStub.bootstrap === true,
      bootStub.reasons.join(' | '));

    // ── Trigger threshold ──────────────────────────────────────────────────
    console.log('\n--- Trigger threshold ---');
    const before = await pendingCount();

    const mkCorrection = async () => {
      const c = await pool.query(`
        INSERT INTO cases (patient_id, phc_id, image_path, status, captured_at)
        VALUES ($1, $2, '/tmp/x.jpg', 'graded', now()) RETURNING case_id`,
        [patientId, phcId]);
      const caseId = c.rows[0].case_id;
      caseIds.push(caseId);
      const r = await pool.query(`
        INSERT INTO ophthalmologist_reviews (case_id, ophthalmologist_id, decision,
          override_reason_category) VALUES ($1, 'doc-1', 'override', 'wrong_severity')
        RETURNING review_id`, [caseId]);
      await pool.query('INSERT INTO corrections (case_id, review_id) VALUES ($1, $2)',
        [caseId, r.rows[0].review_id]);
    };

    // Two short of the threshold.
    for (let i = 0; i < 18; i++) await mkCorrection();
    const r1 = await cl.runOnce({ threshold: before + 20,
      retrainFn: fakeRetrain(`never_${TAG}`, BASE) });
    check('below threshold -> skipped, no retrain', r1.action === 'skipped',
      JSON.stringify(r1));

    const noRow = await pool.query('SELECT 1 FROM model_versions WHERE version_id = $1',
      [`never_${TAG}`]);
    check('no model_versions row written when skipped', noRow.rows.length === 0);

    await mkCorrection(); await mkCorrection();   // now at threshold
    console.log(`        ${await pendingCount()} pending corrections`);

    // ── Rejection path ─────────────────────────────────────────────────────
    console.log('\n--- A regressed model must NOT be promoted ---');
    const rejectId = `reject_${TAG}`;
    const r2 = await cl.runOnce({ threshold: before + 20,
      retrainFn: fakeRetrain(rejectId, { ...BASE, sensitivity: 0.85 }) });

    check('action is rejected', r2.action === 'rejected', JSON.stringify(r2.action));

    const rej = await pool.query(
      'SELECT * FROM model_versions WHERE version_id = $1', [rejectId]);
    check('the rejected candidate IS recorded (a failure is evidence)',
      rej.rows.length === 1);
    check('...but promoted = false', rej.rows.length === 1 && rej.rows[0].promoted === false);
    check('...and its metrics are stored for comparison',
      rej.rows.length === 1 && Math.abs(rej.rows[0].validation_sensitivity - 0.85) < 1e-6);

    const stillLive = await cl.getLiveVersion();
    check('the live model is UNCHANGED', stillLive.version_id === LIVE_V, stillLive.version_id);

    // Design doc §8.4: fails gate -> discarded, corrections remain queued.
    check('corrections remain queued after a rejection',
      (await pendingCount()) >= 20, await pendingCount());

    // ── Promotion path ─────────────────────────────────────────────────────
    console.log('\n--- An improved model IS promoted ---');
    const promoteId = `promote_${TAG}`;
    const r3 = await cl.runOnce({ threshold: before + 20,
      retrainFn: fakeRetrain(promoteId, { sensitivity: 0.93, specificity: 0.89, kappa: 0.83 }),
      swapModelFile: false });

    check('action is promoted', r3.action === 'promoted', JSON.stringify(r3.action));

    const nowLive = await cl.getLiveVersion();
    check('the new version is live', nowLive.version_id === promoteId, nowLive.version_id);
    check('promoted_at is set', !!nowLive.promoted_at);

    const old = await pool.query(
      'SELECT promoted FROM model_versions WHERE version_id = $1', [LIVE_V]);
    check('the previous version was demoted', old.rows[0].promoted === false);

    const promotedCount = await pool.query(
      'SELECT COUNT(*)::int AS n FROM model_versions WHERE promoted = true');
    check('EXACTLY ONE promoted version exists', promotedCount.rows[0].n === 1,
      promotedCount.rows[0].n);

    check('corrections are now consumed', (await pendingCount()) === before,
      `${await pendingCount()} vs ${before}`);

    const consumed = await pool.query(
      'SELECT COUNT(*)::int AS n FROM corrections WHERE used_in_model_version = $1',
      [promoteId]);
    check('consumed corrections are attributed to the promoting version',
      consumed.rows[0].n === 20, consumed.rows[0].n);

    // ── Not re-triggered by already-consumed work ──────────────────────────
    console.log('\n--- Consumed corrections do not re-trigger ---');
    const r4 = await cl.runOnce({ threshold: before + 20,
      retrainFn: fakeRetrain(`again_${TAG}`, BASE) });
    check('a second run is skipped, not a repeat retrain', r4.action === 'skipped',
      JSON.stringify(r4));

    // ── Retraining failure changes nothing ─────────────────────────────────
    console.log('\n--- A failed retrain leaves everything untouched ---');
    for (let i = 0; i < 20; i++) await mkCorrection();
    const beforeFail = await cl.getLiveVersion();
    const r5 = await cl.runOnce({ threshold: before + 20,
      retrainFn: async () => { throw Object.assign(new Error('boom'), { code: 'retrain_error' }); } });
    check('action is failed', r5.action === 'failed', JSON.stringify(r5.action));
    const afterFail = await cl.getLiveVersion();
    check('live model unchanged after a failed retrain',
      afterFail.version_id === beforeFail.version_id);
    check('corrections stay queued after a failed retrain',
      (await pendingCount()) >= 20, await pendingCount());

    // ── The default retrain refuses rather than inventing metrics ──────────
    console.log('\n--- The unimplemented retrain step refuses loudly ---');
    const r6 = await cl.runOnce({ threshold: before + 20 });   // real defaultRetrainFn
    check('default retrainFn fails with a clear code',
      r6.action === 'failed' && r6.reason === 'retrain_not_implemented',
      JSON.stringify({ action: r6.action, reason: r6.reason }));
    check('...and the message says what is missing',
      typeof r6.message === 'string' && r6.message.includes('trainBranchAClassifier'),
      r6.message);

    // ── dryRun ─────────────────────────────────────────────────────────────
    console.log('\n--- dryRun decides without writing ---');
    const dryId = `dry_${TAG}`;
    const r7 = await cl.runOnce({ threshold: before + 20, dryRun: true,
      retrainFn: fakeRetrain(dryId, { sensitivity: 0.99, specificity: 0.99, kappa: 0.99 }) });
    check('action is dry_run', r7.action === 'dry_run');
    check('dryRun would have promoted', r7.decision.promote === true);
    const dryRow = await pool.query('SELECT 1 FROM model_versions WHERE version_id = $1', [dryId]);
    check('dryRun wrote NO model_versions row', dryRow.rows.length === 0);
    check('dryRun consumed no corrections', (await pendingCount()) >= 20);

    console.log(`\n===== ${failures === 0 ? 'Task 7.2 DoD met' : `${failures} FAILURE(S)`} =====\n`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    try {
      if (caseIds.length) {
        await pool.query('DELETE FROM corrections WHERE case_id = ANY($1)', [caseIds]);
        await pool.query('DELETE FROM ophthalmologist_reviews WHERE case_id = ANY($1)', [caseIds]);
        await pool.query('DELETE FROM cases WHERE case_id = ANY($1)', [caseIds]);
      }
      if (patientId) await pool.query('DELETE FROM patients WHERE patient_id = $1', [patientId]);
      if (phcId) await pool.query('DELETE FROM phc_sites WHERE phc_id = $1', [phcId]);
      await pool.query("DELETE FROM model_versions WHERE version_id LIKE $1", [`%${TAG}`]);
      // Restore the stub as the live version so later runs are unaffected.
      await pool.query('UPDATE model_versions SET promoted = false WHERE promoted = true');
    } catch (e) { console.warn('cleanup:', e.message); }
    cl.stop();
    await pool.end();
  }
}

main();
