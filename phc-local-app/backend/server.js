'use strict';

/**
 * server.js -- PHC local application backend (Task 0.1)
 *
 * Runs ON the Primary Health Centre machine, on localhost:4000. Must be fully
 * functional with zero connectivity (design doc §10): capture, quality gate,
 * both questionnaires and local queueing all work offline, and the sync manager
 * opportunistically drains the queue when the network returns.
 *
 * Endpoint shapes are defined in docs/api-contracts.md, "Local API". The route
 * bodies themselves are filled in by Task 3.2 -- this file only wires them up.
 */

// Load the repo-root .env explicitly. A bare .config() resolves relative to the
// process's cwd, so it would silently find nothing when the server is started
// from anywhere other than this directory -- and the variable that goes missing
// is MATLAB_EXECUTABLE, which makes every capture fail at the quality gate.
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const express = require('express');

const patientsRouter = require('./routes/patients');
const capturesRouter = require('./routes/captures');
const syncRouter     = require('./routes/sync');

const PORT = parseInt(process.env.PORT || '4000', 10);

const app = express();

app.use(express.json());

// Requiring the DB module creates local.sqlite and applies schema.sql. Done at
// startup rather than lazily on first request so that a broken schema fails the
// server immediately, instead of surfacing mid-capture with a patient waiting.
require('./db/localDb');

app.use('/patients', patientsRouter);
app.use('/captures', capturesRouter);
app.use('/sync',     syncRouter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Offline-first: the sync manager drains the queue opportunistically in the
// background. Started only when this file is run as a server, never on a bare
// require -- otherwise importing the app in a test would silently start
// uploading real captures to whatever CENTRAL_URL happens to point at.
if (require.main === module && process.env.SYNC_DISABLED !== '1') {
  require('./services/syncManager').start();
}

// ── Error handling ───────────────────────────────────────────────────────────
// api-contracts.md: every non-2xx body is { error, message } -- never a bare
// string, never an HTML error page. The frontend switches on .error and only
// displays .message, so both fields have to be present on every failure path.

app.use((req, res) => {
  res.status(404).json({
    error: 'not_found',
    message: `No route matches ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, req, res, next) => {   // eslint-disable-line no-unused-vars
  console.error('[local] Unhandled error:', err);
  res.status(500).json({
    error: 'internal_error',
    message: err.message || 'Unexpected server error',
  });
});

if (require.main === module) {
  app.listen(PORT, () => console.log(`local backend on ${PORT}`));
}

module.exports = app;
