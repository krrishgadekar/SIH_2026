'use strict';

/**
 * verify_task35.js -- Task 3.5 Definition of Done
 *
 * Run:  node verify_task35.js
 *
 * "The queue endpoint returns cases sorted correctly by the documented priority
 *  rule, and a review POST is immediately reflected in a follow-up GET of the
 *  same case's review history."
 *
 * No MATLAB needed: this seeds grading_results directly rather than running the
 * pipeline. That is deliberate beyond just unblocking the run — the ranking
 * rule has to be checked against KNOWN tier/confidence values, and real grading
 * output is currently stub noise that lands every case in Tier A, which is
 * exactly the one tier the queue excludes. Seeding is the only way to exercise
 * the ordering at all.
 *
 * The second half of the DoD names a "review history" GET that api-contracts.md
 * does not define (see the gap note there), so persistence is verified against
 * the database instead of an invented endpoint.
 */

const path = require('path');

const CENTRAL = path.resolve(__dirname, 'central-system', 'backend');
require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(__dirname, '.env') });

const app  = require(path.join(CENTRAL, 'server.js'));
const pool = require(path.join(CENTRAL, 'db', 'pgClient'));

const PORT = 5124;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

// tier, confidence -> what rank order we expect.
const FIXTURES = [
  { label: 'C, conf 0.20 (most uncertain)', tier: 'C', conf: 0.20, grade: 3 },
  { label: 'C, conf 0.45',                  tier: 'C', conf: 0.45, grade: 2 },
  { label: 'C, conf 0.55',                  tier: 'C', conf: 0.55, grade: 2 },
  { label: 'B, conf 0.62 (least confident)',tier: 'B', conf: 0.62, grade: 1 },
  { label: 'B, conf 0.75',                  tier: 'B', conf: 0.75, grade: 1 },
  { label: 'B, conf 0.88',                  tier: 'B', conf: 0.88, grade: 0 },
  { label: 'A, conf 0.97 (auto-clears)',    tier: 'A', conf: 0.97, grade: 0 },
];

async function seed() {
  const phc = await pool.query(
    "INSERT INTO phc_sites (name) VALUES ('PHC Verify35') RETURNING phc_id");
  const phcId = phc.rows[0].phc_id;

  const patientId = `PHC001-t35-${Math.random().toString(36).slice(2, 7)}`;
  await pool.query(`
    INSERT INTO patients (patient_id, name, age, contact_number, registered_at, patient_reference)
    VALUES ($1, 'Verify Task35', 60, '+919812345678', now(), $2)
  `, [patientId, `PT-VER${Math.random().toString(36).slice(2, 5).toUpperCase()}`]);

  await pool.query(`
    INSERT INTO model_versions (version_id, promoted) VALUES ('branchA_v1', false)
    ON CONFLICT (version_id) DO NOTHING`);

  const made = [];
  for (const f of FIXTURES) {
    const c = await pool.query(`
      INSERT INTO cases (patient_id, phc_id, image_path, status, captured_at)
      VALUES ($1, $2, '/tmp/none.jpg', 'graded', now())
      RETURNING case_id`, [patientId, phcId]);
    const caseId = c.rows[0].case_id;
    await pool.query(`
      INSERT INTO grading_results
        (case_id, dr_grade_cnn, referable, confidence_score, conformal_tier,
         model_version, graded_at)
      VALUES ($1, $2, $3, $4, $5, 'branchA_v1', now())
    `, [caseId, f.grade, f.grade >= 2, f.conf, f.tier]);
    made.push({ ...f, caseId });
  }
  return { phcId, patientId, made };
}

async function cleanup(patientId) {
  // grading_results / reviews / corrections cascade from cases.
  await pool.query('DELETE FROM cases WHERE patient_id = $1', [patientId]);
  await pool.query('DELETE FROM patients WHERE patient_id = $1', [patientId]);
  await pool.query("DELETE FROM phc_sites WHERE name = 'PHC Verify35'");
}

async function main() {
  const server = app.listen(PORT);
  const BASE   = `http://localhost:${PORT}`;
  let patientId;

  try {
    const seeded = await seed();
    patientId = seeded.patientId;
    const mine = new Set(seeded.made.map((m) => m.caseId));

    // ── GET /api/v1/ophthalmologist/queue ──────────────────────────────────
    console.log('\n--- GET /api/v1/ophthalmologist/queue ---');
    const res  = await fetch(`${BASE}/api/v1/ophthalmologist/queue`);
    const all  = await res.json();
    check('200 OK', res.status === 200);
    check('returns an array', Array.isArray(all));

    const rows = all.filter((r) => mine.has(r.caseId));
    console.table(rows.map((r) => ({
      tier: r.conformalTier, confidence: r.confidenceScore,
      rank: r.priorityRank, phc: r.phcName,
    })));

    check('exactly the contract keys',
      rows.length > 0 && Object.keys(rows[0]).sort().join(',') ===
        ['caseId', 'patientReference', 'phcName', 'capturedAt', 'drGradeCnn',
         'drGradeRuleEngine', 'branchAgreement', 'confidenceScore',
         'conformalTier', 'priorityRank'].sort().join(','),
      rows.length ? Object.keys(rows[0]).join(',') : 'no rows');

    check('Tier A is excluded (it auto-clears)',
      !rows.some((r) => r.conformalTier === 'A'),
      rows.map((r) => r.conformalTier).join(','));
    check('all 6 non-A fixtures present', rows.length === 6, rows.length);

    // Ordering
    const ranks = rows.map((r) => r.priorityRank);
    check('response is sorted ascending by priorityRank',
      ranks.every((v, i) => i === 0 || ranks[i - 1] <= v), ranks.join(','));

    const cRows = rows.filter((r) => r.conformalTier === 'C');
    const bRows = rows.filter((r) => r.conformalTier === 'B');

    check('every Tier C outranks every Tier B',
      Math.max(...cRows.map((r) => r.priorityRank)) <
      Math.min(...bRows.map((r) => r.priorityRank)),
      `C max ${Math.max(...cRows.map((r) => r.priorityRank))}, ` +
      `B min ${Math.min(...bRows.map((r) => r.priorityRank))}`);

    // Tier C by uncertainty DESC == confidence ASC (uncertainty = 1 - conf)
    const cConf = cRows.sort((a, b) => a.priorityRank - b.priorityRank)
                       .map((r) => r.confidenceScore);
    check('Tier C ordered most-uncertain first (confidence ascending)',
      cConf.every((v, i) => i === 0 || cConf[i - 1] <= v), cConf.join(' < '));

    const bConf = bRows.sort((a, b) => a.priorityRank - b.priorityRank)
                       .map((r) => r.confidenceScore);
    check('Tier B ordered least-confident first (confidence ascending)',
      bConf.every((v, i) => i === 0 || bConf[i - 1] <= v), bConf.join(' < '));

    check('Tier C ranks start at 1', Math.min(...cRows.map((r) => r.priorityRank)) === 1);
    check('Tier B ranks start at 101', Math.min(...bRows.map((r) => r.priorityRank)) === 101);

    check('drGradeRuleEngine is null (Branch B not built)',
      rows.every((r) => r.drGradeRuleEngine === null));
    check('branchAgreement is null (Branch B not built)',
      rows.every((r) => r.branchAgreement === null));
    check('phcName is joined in', rows.every((r) => r.phcName === 'PHC Verify35'),
      rows[0] && rows[0].phcName);
    check('capturedAt is an ISO 8601 UTC string',
      rows.every((r) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.capturedAt || '')),
      rows[0] && rows[0].capturedAt);
    check('patientReference is exposed, not patientId',
      rows.every((r) => r.patientReference && !JSON.stringify(r).includes(patientId)));

    // ── POST review: confirm ───────────────────────────────────────────────
    console.log('\n--- POST /api/v1/cases/:caseId/review ---');
    const target = cRows[0].caseId;

    const confirmRes = await fetch(`${BASE}/api/v1/cases/${target}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ophthalmologistId: 'doc-1', decision: 'confirm',
        overrideReasonCategory: null, reviewDurationSeconds: 24,
      }),
    });
    const confirmBody = await confirmRes.json();
    check('200 on confirm', confirmRes.status === 200, JSON.stringify(confirmBody));
    check('returns { reviewId }',
      Object.keys(confirmBody).join(',') === 'reviewId', Object.keys(confirmBody).join(','));

    // ── POST review: override ──────────────────────────────────────────────
    const overrideRes = await fetch(`${BASE}/api/v1/cases/${target}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ophthalmologistId: 'doc-1', decision: 'override',
        overrideReasonCategory: 'wrong_severity',
        overrideReasonText: 'Grade 3 lesions visible superior-temporal.',
        reviewDurationSeconds: 41,
      }),
    });
    const overrideBody = await overrideRes.json();
    check('200 on override', overrideRes.status === 200, JSON.stringify(overrideBody));

    // ── Persistence (no review-history endpoint exists to GET) ─────────────
    console.log('\n--- Persisted, and an override creates a correction ---');
    const reviews = await pool.query(
      'SELECT * FROM ophthalmologist_reviews WHERE case_id = $1 ORDER BY reviewed_at', [target]);
    check('both reviews persisted', reviews.rows.length === 2, reviews.rows.length);
    check('confirm stored with a null reason category',
      reviews.rows.some((r) => r.decision === 'confirm' && r.override_reason_category === null));
    check('override stored with its category and text',
      reviews.rows.some((r) => r.decision === 'override' &&
        r.override_reason_category === 'wrong_severity' && !!r.override_reason_text));
    check('reviewDurationSeconds persisted',
      reviews.rows.some((r) => r.review_duration_seconds === 24));

    const corr = await pool.query('SELECT * FROM corrections WHERE case_id = $1', [target]);
    check('override created exactly one corrections row', corr.rows.length === 1, corr.rows.length);
    check('correction links back to the override review',
      corr.rows.length === 1 &&
      reviews.rows.some((r) => r.review_id === corr.rows[0].review_id &&
                               r.decision === 'override'));
    check('a confirm creates NO correction (nothing to learn from)',
      corr.rows.length === 1);

    // ── Validation ─────────────────────────────────────────────────────────
    console.log('\n--- Review validation ---');
    const cases = [
      ['bad decision', { decision: 'maybe' }],
      ['override with no category', { decision: 'override' }],
      ['override with an invalid category',
        { decision: 'override', overrideReasonCategory: 'not_a_category' }],
      ['confirm carrying a category',
        { decision: 'confirm', overrideReasonCategory: 'wrong_severity' }],
    ];
    for (const [label, body] of cases) {
      const r = await fetch(`${BASE}/api/v1/cases/${target}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const b = await r.json();
      check(`400 on ${label}`, r.status === 400 && b.error === 'invalid_field',
        `${r.status} ${JSON.stringify(b)}`);
    }

    const nf = await fetch(
      `${BASE}/api/v1/cases/00000000-0000-0000-0000-000000000000/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision: 'confirm' }),
      });
    check('404 reviewing an unknown case', nf.status === 404, nf.status);

    console.log(`\n===== ${failures === 0 ? 'Task 3.5 DoD met' : `${failures} FAILURE(S)`} =====\n`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    if (patientId) await cleanup(patientId);
    // closeAllConnections() BEFORE close(). Node's fetch (undici) keeps sockets
    // alive, and server.close() only stops NEW connections -- it waits
    // indefinitely for existing keep-alive sockets to drain. Without this the
    // script prints its full results and then hangs forever, leaving an
    // orphaned process holding the port. That looks like a test still running
    // long after it has actually passed.
    server.closeAllConnections();
    server.close();
    await pool.end();
  }
}

main();
