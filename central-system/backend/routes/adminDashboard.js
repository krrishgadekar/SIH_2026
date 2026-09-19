'use strict';

/**
 * routes/adminDashboard.js  (Task 3.7)
 *
 * Mounted at /api/v1/admin.
 *
 *   GET /api/v1/admin/dashboard -> { casesToday, casesPerPhc, averageReviewTurnaroundSeconds }
 *   GET /api/v1/admin/referrals -> [ { referralId, patientReference, status,
 *                                      assignedWorker, updatedAt } ]
 *   GET /api/v1/admin/system-health -> { silentPhcs, stuckJobs, matlabSessionStatus,
 *                                        unreviewedCases, ... }  (backend plan §F)
 *   GET  /api/v1/admin/resource-recommendations          latest model output (§G)
 *   POST /api/v1/admin/resource-recommendations/refresh  re-run the model now
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
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { logAccess } = require('../services/accessLog');
const { getSystemHealth } = require('../services/systemHealth');
const resourceModel = require('../services/resourceRecommendations');

const router = express.Router();

// District-admin only (§A.7). Every route in this file is admin-facing.
const adminOnly = [requireAuth, requireRole('district_admin')];

router.get('/dashboard', adminOnly, async (req, res, next) => {
  try {
    const body = await analytics.getDashboard();
    await logAccess(req.user?.userId, 'view_dashboard', 'dashboard');
    res.json(body);
  } catch (err) { next(err); }
});

router.get('/referrals', adminOnly, async (req, res, next) => {
  try {
    const body = await analytics.getReferrals();
    await logAccess(req.user?.userId, 'view_referrals', 'referral_list');
    res.json(body);
  } catch (err) { next(err); }
});

router.get('/system-health', adminOnly, async (req, res, next) => {
  try {
    const body = await getSystemHealth();
    await logAccess(req.user?.userId, 'view_system_health', 'system_health');
    res.json(body);
  } catch (err) { next(err); }
});

// §G. 404 until the model has run once -- the daily job, or the refresh below.
// A 404 rather than an empty 200: the panel must be able to say "no
// recommendation yet" instead of rendering blanks as if they were an answer.
router.get('/resource-recommendations', adminOnly, async (req, res, next) => {
  try {
    const body = await resourceModel.latest();
    if (!body) {
      return res.status(404).json({
        error: 'recommendations_not_generated',
        message: 'The resource model has not run yet. POST /api/v1/admin/' +
                 'resource-recommendations/refresh, or wait for the daily run.',
      });
    }
    res.json(body);
  } catch (err) { next(err); }
});

// Runs the model now and returns the new row. Takes tens of seconds (a MATLAB
// start plus the simulations); concurrent calls share one run.
router.post('/resource-recommendations/refresh', adminOnly, async (req, res, next) => {
  try {
    const body = await resourceModel.refresh();
    await logAccess(req.user?.userId, 'refresh_resource_model', 'resource_recommendations');
    res.json(body);
  } catch (err) {
    res.status(502).json({ error: 'resource_model_failed', message: err.message });
  }
});

module.exports = router;
