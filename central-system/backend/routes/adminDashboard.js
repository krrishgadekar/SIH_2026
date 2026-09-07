'use strict';

/**
 * routes/adminDashboard.js  (Task 3.7)
 *
 * Mounted at /api/v1/admin.
 *
 *   GET /api/v1/admin/dashboard -> { casesToday, casesPerPhc, averageReviewTurnaroundSeconds }
 *   GET /api/v1/admin/referrals -> [ { referralId, patientReference, status,
 *                                      assignedWorker, updatedAt } ]
 *
 * Thin by intent: the SQL lives in services/analyticsAggregator.js so the
 * queries can be read and changed in one place, and so the timezone handling in
 * "cases today" is not buried in a route handler.
 *
 * Aggregate-only (design doc §1.6). No per-case detail and no per-case push
 * belongs on these endpoints.
 */

const express = require('express');
const analytics = require('../services/analyticsAggregator');

const router = express.Router();

router.get('/dashboard', async (req, res, next) => {
  try {
    res.json(await analytics.getDashboard());
  } catch (err) { next(err); }
});

router.get('/referrals', async (req, res, next) => {
  try {
    res.json(await analytics.getReferrals());
  } catch (err) { next(err); }
});

module.exports = router;
