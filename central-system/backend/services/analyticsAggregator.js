'use strict';

/**
 * analyticsAggregator.js  (Task 3.7)
 *
 * Aggregate metrics for the district admin interface.
 *
 * Aggregate-first by design (design doc §1.6): an admin managing a whole
 * district needs to see where the system is backed up and where resources
 * should move — not a feed of individual patients. Nothing here returns
 * per-case detail, and no per-case push exists. Keep it that way.
 *
 * ── Why there is a report timezone ──────────────────────────────────────────
 * "Cases today" has to mean today *where the district is*. received_at is a
 * TIMESTAMPTZ, and casting it with `::date` resolves in the server's session
 * timezone — so a server running UTC would roll the day over at 05:30 local
 * time in India. Every morning's first few hours of screening would be counted
 * against the previous day, and the number an admin checks at 9am would be
 * quietly wrong. The conversion is explicit here for that reason.
 */

const pool = require('../db/pgClient');

// Override per deployment. Default matches the target deployment region rather
// than UTC, because UTC is the answer that is wrong in a way nobody notices.
const REPORT_TZ = process.env.REPORT_TIMEZONE || 'Asia/Kolkata';

/**
 * getDashboard()
 *
 * -> { casesToday, casesPerPhc, averageReviewTurnaroundSeconds }
 */
async function getDashboard() {
  const [today, perPhc, turnaround] = await Promise.all([
    pool.query(`
      SELECT COUNT(*)::int AS n
      FROM cases
      WHERE (received_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
    `, [REPORT_TZ]),

    // LEFT JOIN, and cases with no phc_id are kept as a null-PHC bucket rather
    // than dropped. If they were dropped, the casesPerPhc counts would not sum
    // to casesToday, and an admin comparing the two numbers would be looking at
    // a discrepancy with no explanation. Better to show an unattributed bucket.
    pool.query(`
      SELECT c.phc_id, s.name AS phc_name, COUNT(*)::int AS n
      FROM cases c
      LEFT JOIN phc_sites s ON s.phc_id = c.phc_id
      WHERE (c.received_at AT TIME ZONE $1)::date = (now() AT TIME ZONE $1)::date
      GROUP BY c.phc_id, s.name
      ORDER BY n DESC, s.name NULLS LAST
    `, [REPORT_TZ]),

    pool.query(`
      SELECT AVG(review_duration_seconds)::float AS avg_seconds
      FROM ophthalmologist_reviews
      WHERE review_duration_seconds IS NOT NULL
    `),
  ]);

  const avg = turnaround.rows[0].avg_seconds;

  return {
    casesToday: today.rows[0].n,
    casesPerPhc: perPhc.rows.map((r) => ({
      phcId:   r.phc_id ?? null,
      phcName: r.phc_name ?? null,   // null = cases that arrived without a PHC id
      count:   r.n,
    })),
    // null, not 0, when nothing has been reviewed. A 0 here would claim reviews
    // are completing instantly — the opposite of "no data" — and this figure is
    // read as a service-level number.
    averageReviewTurnaroundSeconds: avg === null ? null : Math.round(avg),
  };
}

/**
 * getReferrals()
 *
 * -> [ { referralId, patientReference, status, assignedWorker, updatedAt } ]
 *
 * patientReference, never patientId: this list is the follow-up worklist and
 * gets handed to ASHA workers, so it must not carry the internal identifier.
 */
async function getReferrals() {
  const { rows } = await pool.query(`
    SELECT r.referral_id, r.status, r.assigned_worker, r.updated_at,
           p.patient_reference
    FROM referrals r
    JOIN cases    c ON c.case_id    = r.case_id
    JOIN patients p ON p.patient_id = c.patient_id
    ORDER BY r.updated_at DESC
  `);
  return rows.map(toReferral);
}

/** Update a referral's tracking state. Returns null if it does not exist. */
async function updateReferral(referralId, { status, assignedWorker }) {
  const { rows } = await pool.query(`
    UPDATE referrals r
    SET status          = COALESCE($2, r.status),
        -- Distinguish "not supplied" from "cleared". undefined leaves the
        -- worker unchanged; an explicit null unassigns them, which is a real
        -- action when a worker leaves or a case is reassigned.
        assigned_worker = CASE WHEN $4 THEN $3 ELSE r.assigned_worker END,
        updated_at      = now()
    FROM cases c, patients p
    WHERE r.referral_id = $1
      AND c.case_id    = r.case_id
      AND p.patient_id = c.patient_id
    RETURNING r.referral_id, r.status, r.assigned_worker, r.updated_at,
              p.patient_reference
  `, [referralId, status ?? null, assignedWorker ?? null,
      assignedWorker !== undefined]);

  return rows.length ? toReferral(rows[0]) : null;
}

/**
 * getPhcSyncStatus(phcId)
 *
 * -> { phcId, phcName, lastSyncAt, pendingCount } | null
 *
 * pendingCount is REPORTED BY the PHC, not computed here: the sync queue lives
 * in the PHC's local SQLite and the central server has no visibility into it.
 * The value is therefore only accurate as of lastSyncAt — and a PHC that is
 * offline right now is exactly the one whose real backlog is growing while this
 * number stays frozen. Read the pair together, never pendingCount alone.
 */
async function getPhcSyncStatus(phcId) {
  const { rows } = await pool.query(
    'SELECT phc_id, name, last_sync_at, pending_count FROM phc_sites WHERE phc_id = $1',
    [phcId]);
  if (!rows.length) return null;
  const r = rows[0];
  return {
    phcId:        r.phc_id,
    phcName:      r.name,
    lastSyncAt:   r.last_sync_at ? r.last_sync_at.toISOString() : null,
    pendingCount: r.pending_count ?? 0,
  };
}

function toReferral(r) {
  return {
    referralId:       r.referral_id,
    patientReference: r.patient_reference ?? null,
    status:           r.status,
    assignedWorker:   r.assigned_worker ?? null,
    updatedAt:        r.updated_at.toISOString(),
  };
}

module.exports = {
  getDashboard, getReferrals, updateReferral, getPhcSyncStatus, REPORT_TZ,
};
