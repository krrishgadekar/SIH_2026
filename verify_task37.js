'use strict';

/**
 * verify_task37.js -- Task 3.7 Definition of Done
 *
 * Run:  node verify_task37.js
 *
 * "The response shape exactly matches api-contracts.md, with real (even if
 *  small) numbers reflecting actual rows in the database."
 *
 * So this seeds a KNOWN set of rows and checks the aggregates equal what those
 * rows imply -- an endpoint that returns a plausible-looking number computed
 * from the wrong rows would pass a shape-only check.
 *
 * No MATLAB required.
 */

const path = require('path');

const CENTRAL = path.resolve(__dirname, 'central-system', 'backend');
require(require.resolve('dotenv', { paths: [CENTRAL] }))
  .config({ path: path.resolve(__dirname, '.env') });

const app  = require(path.join(CENTRAL, 'server.js'));
const pool = require(path.join(CENTRAL, 'db', 'pgClient'));
const { REPORT_TZ } = require(path.join(CENTRAL, 'services', 'analyticsAggregator'));

const PORT = 5125;
const TAG  = `t37-${Math.random().toString(36).slice(2, 7)}`;

let failures = 0;
function check(label, ok, detail) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) { failures++; if (detail !== undefined) console.log(`        ${detail}`); }
}

async function seed() {
  const a = await pool.query(
    `INSERT INTO phc_sites (name, last_sync_at, pending_count)
     VALUES ($1, now(), 7) RETURNING phc_id`, [`PHC Alpha ${TAG}`]);
  const b = await pool.query(
    `INSERT INTO phc_sites (name) VALUES ($1) RETURNING phc_id`, [`PHC Beta ${TAG}`]);
  const phcA = a.rows[0].phc_id, phcB = b.rows[0].phc_id;

  const patientId = `PHC001-${TAG}`;
  await pool.query(`
    INSERT INTO patients (patient_id, name, age, contact_number, registered_at, patient_reference)
    VALUES ($1, 'Verify Task37', 55, '+919812345678', now(), $2)
  `, [patientId, `PT-T37${TAG.slice(-3).toUpperCase()}`]);

  // 3 cases today at Alpha, 1 today at Beta, and 1 that arrived YESTERDAY.
  // The yesterday row is the point: it must be excluded from casesToday, and a
  // naive COUNT(*) would silently include it.
  const mk = async (phcId, receivedAt) => {
    const c = await pool.query(`
      INSERT INTO cases (patient_id, phc_id, image_path, status, captured_at, received_at)
      VALUES ($1, $2, '/tmp/x.jpg', 'graded', now(), $3) RETURNING case_id`,
      [patientId, phcId, receivedAt]);
    return c.rows[0].case_id;
  };
  const today = new Date().toISOString();
  const caseIds = [];
  for (let i = 0; i < 3; i++) caseIds.push(await mk(phcA, today));
  caseIds.push(await mk(phcB, today));
  // Two days back, to stay clear of any timezone boundary.
  await mk(phcA, new Date(Date.now() - 2 * 86400000).toISOString());

  // Reviews: durations 20 and 40 -> average must be exactly 30.
  for (const [caseId, secs] of [[caseIds[0], 20], [caseIds[1], 40]]) {
    await pool.query(`
      INSERT INTO ophthalmologist_reviews (case_id, ophthalmologist_id, decision, review_duration_seconds)
      VALUES ($1, 'doc-1', 'confirm', $2)`, [caseId, secs]);
  }

  const ref = await pool.query(
    `INSERT INTO referrals (case_id, status) VALUES ($1, 'referred') RETURNING referral_id`,
    [caseIds[0]]);

  return { phcA, phcB, patientId, caseIds, referralId: ref.rows[0].referral_id };
}

async function cleanup(patientId) {
  await pool.query('DELETE FROM cases WHERE patient_id = $1', [patientId]);
  await pool.query('DELETE FROM patients WHERE patient_id = $1', [patientId]);
  await pool.query('DELETE FROM phc_sites WHERE name LIKE $1', [`%${TAG}`]);
}

async function main() {
  const server = app.listen(PORT);
  const BASE   = `http://localhost:${PORT}`;
  let patientId;

  try {
    const s = await seed();
    patientId = s.patientId;
    console.log(`\n[verify] report timezone: ${REPORT_TZ}`);
    console.log('[verify] seeded 4 cases today (3 Alpha, 1 Beta) + 1 two days ago');
    console.log('[verify] review durations 20s and 40s -> average must be 30\n');

    // ── GET /api/v1/admin/dashboard ────────────────────────────────────────
    console.log('--- GET /api/v1/admin/dashboard ---');
    const res  = await fetch(`${BASE}/api/v1/admin/dashboard`);
    const dash = await res.json();
    check('200 OK', res.status === 200);
    check('exactly the contract keys',
      Object.keys(dash).sort().join(',') ===
        'averageReviewTurnaroundSeconds,casesPerPhc,casesToday',
      Object.keys(dash).join(','));

    const mine = dash.casesPerPhc.filter((r) => (r.phcName || '').includes(TAG));
    console.table(mine);

    const alpha = mine.find((r) => r.phcName === `PHC Alpha ${TAG}`);
    const beta  = mine.find((r) => r.phcName === `PHC Beta ${TAG}`);

    check('casesPerPhc counts Alpha as 3 today (yesterday excluded)',
      alpha && alpha.count === 3, alpha && alpha.count);
    check('casesPerPhc counts Beta as 1', beta && beta.count === 1, beta && beta.count);
    check('casesPerPhc rows carry phcId and phcName',
      mine.every((r) => r.phcId && r.phcName) &&
      Object.keys(mine[0]).sort().join(',') === 'count,phcId,phcName',
      Object.keys(mine[0] || {}).join(','));

    check('casesToday counts today only, not all time',
      dash.casesToday >= 4, dash.casesToday);
    const sumPerPhc = dash.casesPerPhc.reduce((n, r) => n + r.count, 0);
    // If a null-PHC bucket were dropped these would diverge and an admin
    // comparing the two numbers would see an unexplained discrepancy.
    check('casesPerPhc sums exactly to casesToday',
      sumPerPhc === dash.casesToday, `${sumPerPhc} vs ${dash.casesToday}`);

    check('averageReviewTurnaroundSeconds is the real mean (30)',
      dash.averageReviewTurnaroundSeconds === 30, dash.averageReviewTurnaroundSeconds);
    check('averageReviewTurnaroundSeconds is a number, not a string',
      typeof dash.averageReviewTurnaroundSeconds === 'number');

    // ── GET /api/v1/admin/referrals ────────────────────────────────────────
    console.log('\n--- GET /api/v1/admin/referrals ---');
    const refs = await (await fetch(`${BASE}/api/v1/admin/referrals`)).json();
    const mineRef = refs.find((r) => r.referralId === s.referralId);
    check('returns an array', Array.isArray(refs));
    check('contains the seeded referral', !!mineRef);
    check('exactly the contract keys',
      mineRef && Object.keys(mineRef).sort().join(',') ===
        'assignedWorker,patientReference,referralId,status,updatedAt',
      mineRef && Object.keys(mineRef).join(','));
    check("status starts as 'referred'", mineRef && mineRef.status === 'referred');
    check('assignedWorker is null when unassigned', mineRef && mineRef.assignedWorker === null);
    check('exposes patientReference, never patientId',
      mineRef && mineRef.patientReference && !JSON.stringify(refs).includes(patientId));

    // ── PATCH /api/v1/referrals/:referralId ────────────────────────────────
    console.log('\n--- PATCH /api/v1/referrals/:referralId ---');
    const patch = async (body) => {
      const r = await fetch(`${BASE}/api/v1/referrals/${s.referralId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: r.status, body: await r.json() };
    };

    const before = mineRef.updatedAt;
    const p1 = await patch({ status: 'contacted', assignedWorker: 'ASHA-112' });
    check('200 OK', p1.status === 200, JSON.stringify(p1.body));
    check('returns the same shape as the list item',
      Object.keys(p1.body).sort().join(',') ===
        'assignedWorker,patientReference,referralId,status,updatedAt',
      Object.keys(p1.body).join(','));
    check("status updated to 'contacted'", p1.body.status === 'contacted', p1.body.status);
    check('assignedWorker updated', p1.body.assignedWorker === 'ASHA-112');
    check('updatedAt advanced (tracker sorts on it)',
      new Date(p1.body.updatedAt) >= new Date(before),
      `${before} -> ${p1.body.updatedAt}`);

    const p2 = await patch({ status: 'attended' });
    check('status-only update leaves assignedWorker intact',
      p2.body.assignedWorker === 'ASHA-112', p2.body.assignedWorker);

    const p3 = await patch({ status: 'lost' });
    check("'lost' is accepted as a real terminal outcome", p3.body.status === 'lost');

    const p4 = await patch({ status: 'nonsense' });
    check('400 on an invalid status', p4.status === 400 && p4.body.error === 'invalid_field',
      JSON.stringify(p4.body));
    const p5 = await patch({});
    check('400 when nothing was supplied to update', p5.status === 400, p5.status);

    const p6 = await fetch(
      `${BASE}/api/v1/referrals/00000000-0000-0000-0000-000000000000`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'contacted' }),
      });
    check('404 for an unknown referral', p6.status === 404, p6.status);

    // ── GET /api/v1/phc/:phcId/sync-status ─────────────────────────────────
    console.log('\n--- GET /api/v1/phc/:phcId/sync-status ---');
    const sync = await (await fetch(`${BASE}/api/v1/phc/${s.phcA}/sync-status`)).json();
    check('exactly the contract keys',
      Object.keys(sync).sort().join(',') === 'lastSyncAt,pendingCount,phcId,phcName',
      Object.keys(sync).join(','));
    check('pendingCount reflects what the PHC reported', sync.pendingCount === 7, sync.pendingCount);
    check('lastSyncAt is ISO 8601 UTC',
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(sync.lastSyncAt || ''), sync.lastSyncAt);

    const syncB = await (await fetch(`${BASE}/api/v1/phc/${s.phcB}/sync-status`)).json();
    check('lastSyncAt is null for a site that has never synced',
      syncB.lastSyncAt === null, syncB.lastSyncAt);
    check('pendingCount defaults to 0 for a site that has never synced',
      syncB.pendingCount === 0, syncB.pendingCount);

    const nf = await fetch(`${BASE}/api/v1/phc/00000000-0000-0000-0000-000000000000/sync-status`);
    check('404 for an unknown PHC', nf.status === 404, nf.status);

    console.log(`\n===== ${failures === 0 ? 'Task 3.7 DoD met' : `${failures} FAILURE(S)`} =====\n`);
    if (failures > 0) process.exitCode = 1;
  } finally {
    if (patientId) await cleanup(patientId);
    server.close();
    await pool.end();
  }
}

main();
