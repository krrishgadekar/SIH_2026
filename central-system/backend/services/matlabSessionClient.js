'use strict';

/**
 * matlabSessionClient.js -- the ONE implementation of the request/response file
 * protocol spoken by ml-pipeline/inference/matlabSession/runMatlabInferenceSession.m.
 *
 *   const { alive, call } = require('./matlabSessionClient');
 *   const body = await call({ tensorPath, gradcamPath }, { timeoutMs: 30_000 });
 *
 * Three callers had grown their own copy of this loop (Branch A inference, the
 * §O report, and now the per-case pipeline). They differed in small ways that
 * were bugs waiting to happen -- one reclaimed a timed-out request file and one
 * did not, so a slow session could still run work nobody was waiting for and
 * leave orphan responses behind. The protocol lives here now; callers keep only
 * their own payload shape and their own error wrapping.
 *
 * Both sides write temp-then-rename, so neither ever observes a partially
 * written file.
 */

const fs   = require('fs');
const path = require('path');

// Overridable for the same reason MATLAB_HEARTBEAT_PATH is: a real session on
// this machine is polling the live directory, so a test that wrote a request
// there would have it answered for real instead of exercising the protocol.
const SESSION_DIR  = process.env.MATLAB_SESSION_DIR
  || path.join(__dirname, '..', 'ml-pipeline', 'inference', 'matlabSession');
const REQUEST_DIR  = path.join(SESSION_DIR, 'requests');
const RESPONSE_DIR = path.join(SESSION_DIR, 'responses');
// Same override the supervisor honours, so a test can point both at its own
// file instead of a live session's (see matlabSessionSupervisor.js).
const HEARTBEAT = process.env.MATLAB_HEARTBEAT_PATH
  || path.join(SESSION_DIR, 'session.heartbeat');

const POLL_MS  = 50;
const STALE_MS = Number(process.env.MATLAB_HEARTBEAT_STALE_MS) > 0
  ? Number(process.env.MATLAB_HEARTBEAT_STALE_MS) : 30_000;

/**
 * alive() -- is a session loaded and still polling?
 *
 * The heartbeat, not the PID: a process that is up but wedged keeps its PID and
 * stops refreshing the file, which a PID check alone would miss. The session
 * writes it only once the networks are loaded, so "alive" also means "ready".
 */
function alive() {
  try { return Date.now() - fs.statSync(HEARTBEAT).mtimeMs < STALE_MS; } catch { return false; }
}

/**
 * call(payload, { timeoutMs, prefix }) -> Promise<object>
 *
 * Rejects with the session's own message when the response carries `error`, and
 * with a `matlab_session_timeout`-coded error when nothing answers in time.
 */
function call(payload, { timeoutMs = 30_000, prefix = 'req' } = {}) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(REQUEST_DIR, { recursive: true });
    fs.mkdirSync(RESPONSE_DIR, { recursive: true });

    const id = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const reqPath  = path.join(REQUEST_DIR, `${id}.json`);
    const respPath = path.join(RESPONSE_DIR, `${id}.json`);

    fs.writeFileSync(`${reqPath}.tmp`, JSON.stringify(payload));
    fs.renameSync(`${reqPath}.tmp`, reqPath);

    const startedAt = Date.now();
    const poll = setInterval(() => {
      if (fs.existsSync(respPath)) {
        clearInterval(poll);
        let body;
        try {
          body = JSON.parse(fs.readFileSync(respPath, 'utf8'));
        } catch (err) {
          fs.unlink(respPath, () => {});
          return reject(new Error(`MATLAB session response JSON parse failed: ${err.message}`));
        }
        fs.unlink(respPath, () => {});
        if (body && body.error) return reject(new Error(body.error));
        return resolve(body);
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(poll);
        // Take the request back. Left behind, a session that is merely slow (or
        // one that starts later) picks it up, runs work nobody is waiting for,
        // and leaves an orphan response file behind it.
        fs.unlink(reqPath, () => {});
        const err = new Error(
          `No response from the persistent MATLAB session within ${timeoutMs}ms. `
          + 'Is it running? See ml-pipeline/inference/matlabSession/README.md '
          + '(start it with manageMatlabSession.ps1 start).');
        err.code = 'matlab_session_timeout';
        return reject(err);
      }
    }, POLL_MS);
  });
}

module.exports = { alive, call, SESSION_DIR, REQUEST_DIR, RESPONSE_DIR, HEARTBEAT };
