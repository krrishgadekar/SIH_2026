'use strict';

/**
 * routes/phc.js
 *
 * Mounted at /api/v1/phc.
 *
 *   GET /api/v1/phc/:phcId/sync-status
 *     -> 200 { phcId, phcName, lastSyncAt, pendingCount }
 *
 * Backs the admin interface's "PHC Health" screen (design doc §5.3): which
 * sites are keeping up and which are silently falling behind.
 *
 * ── Read lastSyncAt and pendingCount together ───────────────────────────────
 * pendingCount is a number the PHC last REPORTED, not one this server computes.
 * The sync queue lives in that PHC's local SQLite and central has no view into
 * it. So the count is only true as of lastSyncAt — and the site whose backlog
 * is genuinely growing is exactly the offline one whose number is frozen at
 * whatever it was when it last made contact.
 *
 * That inverts the obvious reading: a PHC reporting pendingCount 0 with a
 * lastSyncAt three days old is a much bigger problem than one reporting 40
 * from a minute ago. Anything built on this endpoint should surface the
 * staleness, not just the count.
 */

const express = require('express');
const analytics = require('../services/analyticsAggregator');

const router = express.Router();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get('/:phcId/sync-status', async (req, res, next) => {
  const { phcId } = req.params;
  if (!UUID_RE.test(phcId)) {
    return res.status(404).json({
      error: 'phc_not_found', message: `No PHC site with id ${phcId}`,
    });
  }
  try {
    const status = await analytics.getPhcSyncStatus(phcId);
    if (!status) {
      return res.status(404).json({
        error: 'phc_not_found', message: `No PHC site with id ${phcId}`,
      });
    }
    res.json(status);
  } catch (err) { next(err); }
});

module.exports = router;
