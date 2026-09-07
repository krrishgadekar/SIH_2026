'use strict';

/**
 * routes/sync.js
 *
 * Placeholder router (Task 0.1). Mounted at /sync by server.js.
 *
 * Endpoints this router owns, per docs/api-contracts.md ("Local API"):
 *
 *   GET /sync/status -> 200 { online, pendingCount, lastSyncAttempt }
 *                       lastSyncAttempt is null if no attempt has ever been made.
 *
 * IMPLEMENTED BY: Task 3.2, counting sync_queue rows WHERE status = 'pending'
 * and reading the last attempt timestamp written by syncManager.js (Task 3.4).
 *
 * The Sync Status indicator is always visible in the local UI (design doc §4.1),
 * so this endpoint is polled continuously -- keep it a cheap COUNT, not a join.
 */

const express = require('express');

const router = express.Router();

// Placeholder. Reports offline with nothing pending, which is the honest answer
// before syncManager.js exists -- no sync has been attempted, so there is no
// last attempt to report and nothing has been queued.
router.get('/status', (req, res) => {
  res.json({ online: false, pendingCount: 0, lastSyncAttempt: null });
});

module.exports = router;
