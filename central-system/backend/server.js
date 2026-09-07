'use strict';

/**
 * server.js -- Central system backend (Task 0.1)
 *
 * The cloud side, on port 5000. Receives cases from every PHC's sync manager,
 * runs the grading pipeline, and serves the ophthalmologist and district-admin
 * interfaces.
 *
 * Endpoint shapes are defined in docs/api-contracts.md, "Central API". The
 * route bodies are filled in by Tasks 3.3, 3.5 and 3.7 -- this file only wires
 * them up.
 */

require('dotenv').config();

const path    = require('path');
const express = require('express');

const casesRouter              = require('./routes/cases');
const ophthalmologistQueueRouter = require('./routes/ophthalmologistQueue');
const adminDashboardRouter     = require('./routes/adminDashboard');
const referralsRouter          = require('./routes/referrals');

const PORT = parseInt(process.env.PORT || '5000', 10);

const app = express();

app.use(express.json());

// GET /health is what the PHC sync manager polls as its network heartbeat
// before every transmission attempt (design doc §4.2), so it must stay
// dependency-free: no DB query, no MATLAB call. A health check that touches
// Postgres would report "offline" during a transient DB blip and stall every
// PHC's queue for reasons unrelated to reachability.
app.get('/health', (req, res) => res.json({ status: 'ok' }));

app.use('/api/v1/cases',           casesRouter);
app.use('/api/v1/ophthalmologist', ophthalmologistQueueRouter);
app.use('/api/v1/admin',           adminDashboardRouter);
app.use('/api/v1/referrals',       referralsRouter);

// Case media (fundus images, Grad-CAM overlays). api-contracts.md's case-detail
// response returns imageUrl / gradCamOverlayUrl as paths under /media, so those
// paths have to actually resolve to files.
app.use('/media', express.static(path.join(__dirname, 'media')));

// ── Error handling ───────────────────────────────────────────────────────────
// api-contracts.md: every non-2xx body is { error, message }.

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `No route matches ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
  console.error('[central] Unhandled error:', err);
  res.status(500).json({
    error: 'internal_error',
    message: err.message || 'Unexpected server error',
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`central backend on ${PORT}`));
}

module.exports = app;
