'use strict';

/**
 * verify_task36.js -- Task 3.6 Definition of Done
 *
 * Run:  node verify_task36.js
 *
 * "Confirming a referable case via the review endpoint results in a new
 *  referrals row and (with real Twilio credentials in .env) an actual SMS
 *  received on a test number."
 *
 * The second half needs credentials, which are not configured yet. This checks
 * everything up to the wire: the referral row, the notification record, the
 * message text, and every non-referable / non-sending branch.
 *
 * NOTHING HERE SENDS AN SMS. It asserts the opposite -- that with no
 * credentials the system records 'not_configured' and never claims a send. A
 * notification row falsely marked 'sent' would make a MISSED referral invisible
 * to the tracker built to catch missed referrals, so "did not lie about it" is
 * the property under test.
 */

const path = require('path');

const CENTRAL = path.resolve(__dirname, 'central-system', 'backend');
require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(__dirname, '.env') });

// Grading must not run; this test is about the review -> referral path.
process.env.MATLAB_EXECUTABLE = path.join(__dirname, '__no_matlab__.exe');
process.env.MATLAB_TIMEOUT_MS = '3000';

const app      = require(path.join(CENTRAL, 'server.js'));
const pool     = require(path.join(CENTRAL, 'db', 'pgClient'));
const referral = require(path.join(CENTRAL, 'services', 'referralNotificationService'));

const PORT = 5126;
const TAG  = `t36-${Math.random().toString(36).slice(2, 7)}`;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

async function seedCase(patientId, phcId, grade, language = 'en') {
  const c = await pool.query(`
    INSERT INTO cases (patient_id, phc_id, image_path, status, captured_at, questionnaire_data)
    VALUES ($1, $2, '/tmp/x.jpg', 'graded', now(), $3) RETURNING case_id`,
    [patientId, phcId, { language }]);
  const caseId = c.rows[0].case_id;
  await pool.query(`
    INSERT INTO grading_results (case_id, dr_grade_cnn, referable, confidence_score,
                                 conformal_tier, model_version, graded_at)
    VALUES ($1, $2, $3, 0.5, 'C', 'branchA_v1', now())`,
    [caseId, grade, grade >= 2]);
  return caseId;
}

async function main() {
  const server = app.listen(PORT);
  const BASE   = `http://localhost:${PORT}`;
  const patientId = `PHC001-${TAG}`;
  let phcId;

  const review = async (caseId, body) => {
    const r = await fetch(`${BASE}/api/v1/cases/${caseId}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  const notifsFor = async (caseId) =>
    (await pool.query('SELECT * FROM notifications WHERE case_id = $1 ORDER BY sent_at', [caseId])).rows;
  const referralsFor = async (caseId) =>
    (await pool.query('SELECT * FROM referrals WHERE case_id = $1', [caseId])).rows;

  try {
    const site = await pool.query(
      'INSERT INTO phc_sites (name) VALUES ($1) RETURNING phc_id', [`PHC ${TAG}`]);
    phcId = site.rows[0].phc_id;
    await pool.query(`
      INSERT INTO patients (patient_id, name, age, contact_number, registered_at)
      VALUES ($1, 'Verify Task36', 62, '+919812345678', now())`, [patientId]);
    await pool.query(`INSERT INTO model_versions (version_id, promoted)
      VALUES ('branchA_v1', false) ON CONFLICT DO NOTHING`);

    console.log(`\n[verify] Twilio configured: ${referral.isConfigured()}`);
    console.log('[verify] no SMS will be sent by this test\n');

    // ── Message content: the safety-critical part ──────────────────────────
    console.log('--- Message content (design doc §1.5, §3.6) ---');
    const msg = referral.buildMessage({ language: 'en', phcName: 'PHC Kharadi' });
    console.log(`        "${msg}"`);

    const banned = ['diabetic', 'retinopathy', 'diabetes', 'grade', 'severe',
                    'positive', 'disease', 'diagnos'];
    const hits = banned.filter((w) => msg.toLowerCase().includes(w));
    check('message names no condition, grade or diagnosis',
      hits.length === 0, `found: ${hits.join(', ')}`);
    check('message tells the patient what to DO (a referral instruction)',
      /visit|follow-up/i.test(msg));
    check('unknown language falls back to English',
      referral.buildMessage({ language: 'xx', phcName: 'P' }) ===
      referral.buildMessage({ language: 'en', phcName: 'P' }));
    check('Hindi template exists and differs from English',
      referral.TEMPLATES.hi && referral.TEMPLATES.hi !== referral.TEMPLATES.en);

    // ── Referable + confirm -> referral raised, SMS recorded honestly ──────
    console.log('\n--- Referable case, decision = confirm ---');
    const referableCase = await seedCase(patientId, phcId, 3);
    const r1 = await review(referableCase, {
      ophthalmologistId: 'doc-1', decision: 'confirm', reviewDurationSeconds: 22,
    });
    check('200 OK', r1.status === 200, JSON.stringify(r1.body));
    check('response carries referralId', !!r1.body.referralId, JSON.stringify(r1.body));
    check("smsStatus is 'not_configured' (no credentials present)",
      r1.body.smsStatus === 'not_configured', r1.body.smsStatus);

    const refs1 = await referralsFor(referableCase);
    check('exactly one referrals row created', refs1.length === 1, refs1.length);
    check("referral status starts 'referred'", refs1[0].status === 'referred');

    const n1 = await notifsFor(referableCase);
    check('one notification recorded', n1.length === 1, n1.length);
    check("notification status is 'not_configured', NOT 'sent'",
      n1[0].status === 'not_configured', n1[0].status);
    check('no provider_message_id, since nothing was sent',
      n1[0].provider_message_id === null);
    check("channel 'sms', message_type 'positive'",
      n1[0].channel === 'sms' && n1[0].message_type === 'positive');

    // ── Non-referable -> no referral, no SMS ───────────────────────────────
    console.log('\n--- Non-referable case (grade 1): case closes, no SMS ---');
    const mildCase = await seedCase(patientId, phcId, 1);
    const r2 = await review(mildCase, { ophthalmologistId: 'doc-1', decision: 'confirm' });
    check('200 OK', r2.status === 200);
    check('no referral raised', r2.body.referralId === null, r2.body.referralId);
    check("smsStatus is 'not_referable'", r2.body.smsStatus === 'not_referable',
      r2.body.smsStatus);
    check('no referrals row', (await referralsFor(mildCase)).length === 0);
    check('no notification row', (await notifsFor(mildCase)).length === 0);

    // ── Override without a corrected grade -> refuses to guess ─────────────
    console.log('\n--- Override with no correctedGrade: must NOT send ---');
    const overrideCase = await seedCase(patientId, phcId, 3);
    const r3 = await review(overrideCase, {
      ophthalmologistId: 'doc-1', decision: 'override',
      overrideReasonCategory: 'wrong_severity',
    });
    check('200 OK (the review itself still succeeds)', r3.status === 200);
    check("smsStatus is 'override_without_grade'",
      r3.body.smsStatus === 'override_without_grade', r3.body.smsStatus);
    check('no referral raised on an ungradeable override',
      (await referralsFor(overrideCase)).length === 0);

    // ── Override WITH a corrected grade ────────────────────────────────────
    console.log('\n--- Override with correctedGrade = 3 ---');
    const overrideGraded = await seedCase(patientId, phcId, 0);
    const r4 = await review(overrideGraded, {
      ophthalmologistId: 'doc-1', decision: 'override',
      overrideReasonCategory: 'lesion_missed', correctedGrade: 3,
    });
    check("referral raised from the ophthalmologist's grade, not the model's",
      !!r4.body.referralId, JSON.stringify(r4.body));
    check("smsStatus is 'not_configured'", r4.body.smsStatus === 'not_configured');

    console.log('\n--- Override with correctedGrade = 1 (downgraded to non-referable) ---');
    const overrideDown = await seedCase(patientId, phcId, 3);
    const r5 = await review(overrideDown, {
      ophthalmologistId: 'doc-1', decision: 'override',
      overrideReasonCategory: 'artifact_misread', correctedGrade: 1,
    });
    check('no referral when the reviewer downgrades below referable',
      r5.body.referralId === null && r5.body.smsStatus === 'not_referable',
      JSON.stringify(r5.body));

    // ── Idempotence: reviewing twice must not re-refer or re-send ──────────
    console.log('\n--- Reviewing the same case twice ---');
    const r6 = await review(referableCase, {
      ophthalmologistId: 'doc-2', decision: 'confirm',
    });
    check('second review succeeds', r6.status === 200);
    check("smsStatus is 'already_sent'", r6.body.smsStatus === 'already_sent',
      r6.body.smsStatus);
    check('still exactly one referrals row',
      (await referralsFor(referableCase)).length === 1);
    check('no second notification — the patient is not messaged twice',
      (await notifsFor(referableCase)).length === 1);

    // ── Safety rule: no review on record means no referral ─────────────────
    console.log('\n--- Safety: no ophthalmologist review on record ---');
    const unreviewed = await seedCase(patientId, phcId, 4);
    const direct = await referral.handleConfirmedReferral(unreviewed);
    check('service refuses to act without a recorded human decision',
      direct.sms.status === 'no_review_on_record' && direct.referralId === null,
      JSON.stringify(direct.sms));
    check('no referral row created', (await referralsFor(unreviewed)).length === 0);

    console.log(`\n===== ${failures === 0 ? 'Task 3.6 DoD met (up to the wire)' : `${failures} FAILURE(S)`} =====`);
    console.log('      Live send still needs TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN /');
    console.log('      TWILIO_FROM in .env, then one manual test to a real number.\n');
    if (failures > 0) process.exitCode = 1;
  } finally {
    try {
      const ids = (await pool.query('SELECT case_id FROM cases WHERE patient_id = $1',
        [patientId])).rows.map((r) => r.case_id);
      if (ids.length) {
        await pool.query('DELETE FROM notifications WHERE case_id = ANY($1)', [ids]);
        await pool.query('DELETE FROM referrals WHERE case_id = ANY($1)', [ids]);
      }
      await pool.query('DELETE FROM cases WHERE patient_id = $1', [patientId]);
      await pool.query('DELETE FROM patients WHERE patient_id = $1', [patientId]);
      if (phcId) await pool.query('DELETE FROM phc_sites WHERE phc_id = $1', [phcId]);
    } catch (e) { console.warn('cleanup:', e.message); }
    server.closeAllConnections();
    server.close();
    await pool.end();
  }
}

main();
