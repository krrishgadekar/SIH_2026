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

const path = require('path');

// Explicit path: a bare .config() resolves against the process cwd, so starting
// the server from the repo root rather than this directory would silently load
// nothing -- taking DATABASE_URL and MATLAB_EXECUTABLE with it.
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const express = require('express');

const gradingQueue             = require('./services/gradingQueue');

const casesRouter              = require('./routes/cases');
const ophthalmologistQueueRouter = require('./routes/ophthalmologistQueue');
const adminDashboardRouter     = require('./routes/adminDashboard');
const referralsRouter          = require('./routes/referrals');
const phcRouter                = require('./routes/phc');

const PORT = parseInt(process.env.PORT || '5000', 10);

const app = express();

// CORS first, before json parsing and before every route, so it also covers
// /media (mask and Grad-CAM images the frontend fetches) and so a preflight
// OPTIONS is answered without being dragged through the body parser.
app.use(require('./middleware/cors')());

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
app.use('/api/v1/phc',             phcRouter);

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

// Task 8.3. Workers start on IMPORT, not just when this file is run directly.
// Several verification scripts require this module and call app.listen()
// themselves; if starting the queue lived only in the block below, those would
// enqueue cases that no worker ever picks up and sit on 'processing' forever —
// a hang with no error, which is the least debuggable failure available.
// Starting here costs nothing until something is actually enqueued.
gradingQueue.start();

if (require.main === module) {
  // Re-enqueue anything a previous run left mid-flight. The queue is in memory,
  // so without this a restart would strand every unfinished case on
  // 'processing' permanently: no retry, no error, no log line — a scan that
  // looks like it is about to be graded and never is. The database is the queue
  // of record; recovery is what makes that true.
  //
  // Deliberately NOT at import: recovery sweeps every stranded case in the
  // database, which is right when the server boots and wrong when a test
  // imports the app — that test would start grading unrelated real backlog.
  gradingQueue.recoverStranded().catch((err) =>
    console.error('[central] stranded-case recovery failed:', err.message));

  const server = app.listen(PORT, () => console.log(`central backend on ${PORT}`));

  // Let a case that is mid-MATLAB finish rather than killing it half-written.
  // Anything still queued stays 'processing' in the database and is picked up
  // by the next boot's recoverStranded().
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, async () => {
      console.log(`[central] ${signal} — draining the grading queue`);
      await gradingQueue.stop({ drain: true });
      server.close(() => process.exit(0));
    });
  }
}

module.exports = app;
