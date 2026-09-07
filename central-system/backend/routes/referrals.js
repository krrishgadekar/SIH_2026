'use strict';

/**
 * routes/referrals.js
 *
 * Placeholder router (Task 0.1). Mounted at /api/v1/referrals.
 *
 * Endpoint this router owns, per docs/api-contracts.md ("Central API"):
 *
 *   PATCH /api/v1/referrals/:referralId
 *     Request:  { status, assignedWorker }
 *     Response: 200 -- the updated referral object, same shape as the list item
 *               in GET /api/v1/admin/referrals:
 *               { referralId, patientReference, status, assignedWorker, updatedAt }
 *
 * status progresses referred -> contacted -> attended, with 'lost' as the
 * terminal failure state (design doc §9.3). The whole point of this table is
 * making loss-to-follow-up visible, so 'lost' is a real outcome to record, not
 * an error condition to suppress.
 *
 * Remember to set updated_at = now() on every PATCH -- the admin tracker sorts
 * on it, and a stale timestamp makes a followed-up referral look abandoned.
 *
 * IMPLEMENTED BY: Task 3.6 / Task 3.7.
 */

const express = require('express');

const router = express.Router();

router.get('/__placeholder', (req, res) => {
  res.json({ router: 'referrals', implemented: false, implementedBy: 'Tasks 3.6 / 3.7' });
});

module.exports = router;
