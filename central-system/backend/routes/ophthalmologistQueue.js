'use strict';

/**
 * routes/ophthalmologistQueue.js  (Task 3.5)
 *
 * Mounted at /api/v1/ophthalmologist.
 *
 *   GET /api/v1/ophthalmologist/queue -> 200 [ queue rows, priorityRank ascending ]
 *
 * ── The ranking rule, and why it is computed in SQL ─────────────────────────
 * api-contracts.md, checkpoint version:
 *   Tier C ranked 1-100 by uncertaintyScore DESCENDING  (most uncertain first)
 *   Tier B ranked 101-200 by confidenceScore ASCENDING  (least confident first)
 *   Tier A never appears — it auto-clears and skips this queue entirely.
 *
 * Both orderings put the case the model is least sure about at the top, which
 * is the entire point: reviewer time is the scarce resource in this system, so
 * it goes where the model is weakest, not where the disease is worst.
 *
 * ROW_NUMBER() in SQL rather than sorting in JS, because the ranks must be
 * assigned over the WHOLE queue. Ranking a page of results in JS would give the
 * first row of page 2 a priorityRank of 1.
 */

const express = require('express');
const pool    = require('../db/pgClient');
const cfg         = require('../services/authConfig');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { logAccess } = require('../services/accessLog');

const router = express.Router();

router.get('/queue', requireAuth, requireRole('ophthalmologist'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      WITH ranked AS (
        SELECT
          c.case_id,
          p.patient_reference,
          site.name AS phc_name,
          c.captured_at,
          COALESCE(c.eye_laterality_detected, c.eye_laterality_reported) AS eye_laterality,
          g.claimed_by,
          g.claimed_at,
          u.name AS claimed_by_name,
          g.dr_grade_cnn,
          g.dr_grade_rule_engine,
          g.branch_agreement,
          g.confidence_score,
          g.conformal_tier,
          -- uncertainty_score is NULL until Phase 6 ships, so (1 - confidence)
          -- stands in for it. Same ordering, different scale -- it is a
          -- placeholder for RANKING only and is never reported as uncertainty.
          COALESCE(g.uncertainty_score, 1 - g.confidence_score) AS uncertainty_rank_key,
          ROW_NUMBER() OVER (
            PARTITION BY g.conformal_tier
            ORDER BY
              CASE WHEN g.conformal_tier = 'C'
                   THEN COALESCE(g.uncertainty_score, 1 - g.confidence_score)
              END DESC NULLS LAST,
              CASE WHEN g.conformal_tier = 'B'
                   THEN g.confidence_score
              END ASC NULLS LAST,
              c.case_id                              -- deterministic tie-break
          ) AS tier_rank
        FROM cases c
        JOIN      patients        p    ON p.patient_id = c.patient_id
        JOIN      grading_results g    ON g.case_id    = c.case_id
        LEFT JOIN phc_sites       site ON site.phc_id  = c.phc_id
        LEFT JOIN users           u    ON u.user_id    = g.claimed_by
        -- <> 'A' would also drop NULL tiers, but saying so explicitly documents
        -- that an ungraded case has no tier and belongs in neither bucket.
        WHERE g.conformal_tier IS NOT NULL AND g.conformal_tier <> 'A'
          -- A case that has been reviewed is DONE and must leave the queue.
          -- Without this it stayed forever: the queue grew without bound and a
          -- reviewer could not tell outstanding work from finished work. Review
          -- history stays available at GET /cases/:caseId/reviews.
          AND NOT EXISTS (
            SELECT 1 FROM ophthalmologist_reviews r WHERE r.case_id = c.case_id)
      ),
      c_count AS (SELECT COUNT(*) AS n FROM ranked WHERE conformal_tier = 'C')
      SELECT ranked.*,
             claimed_at > now() - make_interval(mins => $1) AS claim_live,
             CASE
               WHEN conformal_tier = 'C' THEN tier_rank
               -- Tier B starts at 101 per the contract. GREATEST guards the
               -- case of more than 100 Tier C rows: without it, B would start
               -- at 101 while C had already reached 150, and the ranks would
               -- interleave -- putting a Tier B case above a Tier C one, which
               -- inverts the entire safety ordering.
               ELSE GREATEST(100, (SELECT n FROM c_count)) + tier_rank
             END AS priority_rank
      FROM ranked
      ORDER BY priority_rank ASC
    `, [cfg.CLAIM_TTL_MINUTES]);

    await logAccess(req.user?.userId, 'view_queue', 'review_queue');

    res.json(rows.map((r) => ({
      caseId:            r.case_id,
      patientReference:  r.patient_reference ?? null,
      phcName:           r.phc_name ?? null,
      capturedAt:        r.captured_at ? r.captured_at.toISOString() : null,
      // design doc §5.2: each row shows the eye, and whether someone else is
      // already reviewing this case (§10.8), so the UI can show it before the
      // reviewer opens a case they cannot act on.
      eyeLaterality:     r.eye_laterality ?? null,
      claimedBy:         r.claim_live
        ? { userId: r.claimed_by, name: r.claimed_by_name ?? null }
        : null,
      claimedAt:         r.claim_live ? r.claimed_at.toISOString() : null,
      drGradeCnn:        r.dr_grade_cnn ?? null,
      // null until Branch B ships in Phase 5. The frontend must handle null
      // here from day one, not once Branch B lands.
      drGradeRuleEngine: r.dr_grade_rule_engine ?? null,
      branchAgreement:   r.branch_agreement ?? null,
      confidenceScore:   r.confidence_score ?? null,
      conformalTier:     r.conformal_tier,
      priorityRank:      Number(r.priority_rank),
    })));
  } catch (err) { next(err); }
});

module.exports = router;
