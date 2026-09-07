'use strict';

/**
 * routes/adminDashboard.js
 *
 * Placeholder router (Task 0.1). Mounted at /api/v1/admin.
 *
 * Endpoints this router owns, per docs/api-contracts.md ("Central API"):
 *
 *   GET /api/v1/admin/dashboard  -> 200 { casesToday, casesPerPhc, averageReviewTurnaroundSeconds }
 *       casesToday                     COUNT(*) FROM cases WHERE received_at::date = CURRENT_DATE
 *       casesPerPhc                    GROUP BY phc_id joined to phc_sites for the name
 *       averageReviewTurnaroundSeconds AVG(review_duration_seconds) FROM ophthalmologist_reviews
 *
 *   GET /api/v1/admin/referrals  -> 200 [ { referralId, patientReference, status,
 *                                           assignedWorker, updatedAt } ]
 *
 * This view is aggregate-first by design (design doc §1.6): a district admin
 * needs to see where the system is backed up, not a per-patient feed. Do not add
 * per-case push notifications here.
 *
 * IMPLEMENTED BY: Task 3.7, with the queries living in
 * services/analyticsAggregator.js rather than inline in the route.
 */

const express = require('express');

const router = express.Router();

router.get('/dashboard', (req, res) => {
  res.json({ casesToday: 0, casesPerPhc: [], averageReviewTurnaroundSeconds: null });
});

router.get('/referrals', (req, res) => res.json([]));

module.exports = router;
