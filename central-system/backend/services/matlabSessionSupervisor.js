'use strict';

/**
 * matlabSessionSupervisor.js -- keeps the persistent MATLAB inference session
 * alive (backend plan §E, design doc §10.7).
 *
 * With INFERENCE_BACKEND=matlab (the default) every case is graded through the
 * persistent session in ml-pipeline/inference/matlabSession/. That session does
 * not start with the backend and does not survive a reboot; when it is down,
 * every case fails with matlab_session_unavailable -- loudly, but with nobody
 * told. This closes that gap:
 *
 *   - every MATLAB_SUPERVISOR_INTERVAL_MS (30 s) it reads the session's
 *     heartbeat file, which runMatlabInferenceSession.m rewrites every 5 s from
 *     inside its poll loop. Fresh = loaded and polling. Stale or missing = dead
 *     OR wedged -- a PID check alone would call a hung process healthy.
 *   - not healthy -> restart through manageMatlabSession.ps1 (stop, which
 *     force-kills a wedged process, then start): the same documented interface
 *     an operator uses, not a second way of launching MATLAB.
 *   - after a restart it allows MATLAB_STARTUP_GRACE_MS for the five networks
 *     to load before judging again.
 *   - a restart that fails, or does not produce a heartbeat within the grace
 *     period, raises a system_alerts row (matlab_session_down), shown on System
 *     Health (§F). It is resolved automatically once the heartbeat returns.
 *   - at most MAX_RESTARTS restarts per RESTART_WINDOW_MS. Past that the
 *     supervisor stops restarting and reports 'down': something is wrong that
 *     restarting will not fix (missing model files, a licence problem) and a
 *     restart loop would only hide it. It keeps watching, so a manual fix is
 *     picked up on the next check.
 *
 * On boot, a session that is not running is simply started -- that is the
 * "auto-start with the backend" half of §E.
 *
 * Status, for System Health: 'healthy' | 'restarting' | 'down' | 'disabled'
 * ('disabled' when INFERENCE_BACKEND is not matlab, or
 * MATLAB_SUPERVISOR_ENABLED=false).
 *
 * Started from server.js's main block only, never on import: a test that
 * requires the app must not launch MATLAB.
 */

const fs            = require('fs');
const path          = require('path');
const { execFile }  = require('child_process');

const { raiseAlert, resolveAlert } = require('./systemAlerts');

const SESSION_DIR = path.join(__dirname, '..', 'ml-pipeline', 'inference', 'matlabSession');
const HEARTBEAT   = path.join(SESSION_DIR, 'session.heartbeat');
const MANAGER     = path.join(SESSION_DIR, 'manageMatlabSession.ps1');

const num = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

const INTERVAL_MS       = num('MATLAB_SUPERVISOR_INTERVAL_MS', 30_000);
const STALE_MS          = num('MATLAB_HEARTBEAT_STALE_MS', 30_000);
const STARTUP_GRACE_MS  = num('MATLAB_STARTUP_GRACE_MS', 240_000);
const MAX_RESTARTS      = num('MATLAB_MAX_RESTARTS', 3);
const RESTART_WINDOW_MS = num('MATLAB_RESTART_WINDOW_MS', 30 * 60_000);

const ALERT_KIND = 'matlab_session_down';

function enabled() {
  const backend = (process.env.INFERENCE_BACKEND || 'matlab').toLowerCase();
  const flag = process.env.MATLAB_SUPERVISOR_ENABLED;
  const off = flag !== undefined && flag !== '' && /^(0|false|no|off)$/i.test(flag.trim());
  return backend === 'matlab' && !off;
}

const state = {
  status: enabled() ? 'restarting' : 'disabled',
  lastHeartbeatAt: null,
  restartStartedAt: null,
  restartTimes: [],       // ms timestamps of restarts inside the window
  lastError: null,
};

let timer = null;
let checking = false;

/** Runs `manageMatlabSession.ps1 <cmd>`; resolves { ok, output }. Test seam. */
let runManager = (cmd) => new Promise((resolve) => {
  if (process.platform !== 'win32') {
    return resolve({ ok: false, output:
      'Automatic restart uses manageMatlabSession.ps1 and is only implemented on Windows.' });
  }
  execFile('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', MANAGER, cmd],
    { cwd: SESSION_DIR, env: process.env, timeout: 90_000, windowsHide: true },
    (err, stdout, stderr) => resolve({
      ok: !err, output: `${stdout || ''}${stderr || ''}`.trim() || (err && err.message) || '',
    }));
});

function heartbeatAgeMs() {
  try {
    const { mtimeMs } = fs.statSync(HEARTBEAT);
    state.lastHeartbeatAt = new Date(mtimeMs).toISOString();
    return Date.now() - mtimeMs;
  } catch {
    return Infinity;
  }
}

async function markDown(message) {
  state.status = 'down';
  state.lastError = message;
  console.error(`[matlabSupervisor] DOWN: ${message}`);
  await raiseAlert(ALERT_KIND, '', message);
}

async function restart(reason) {
  const now = Date.now();
  state.restartTimes = state.restartTimes.filter((t) => now - t < RESTART_WINDOW_MS);
  if (state.restartTimes.length >= MAX_RESTARTS) {
    if (state.status !== 'down') {
      await markDown(`${reason} Gave up after ${MAX_RESTARTS} restarts in ` +
        `${Math.round(RESTART_WINDOW_MS / 60_000)} min -- check ` +
        'ml-pipeline/inference/matlabSession/session.log and session.stderr.log ' +
        '(missing models/*.mat files, or a licence problem, will not be fixed by restarting).');
    }
    return;
  }

  state.restartTimes.push(now);
  state.status = 'restarting';
  state.restartStartedAt = now;
  console.warn(`[matlabSupervisor] ${reason} Restarting the MATLAB session ` +
    `(attempt ${state.restartTimes.length}/${MAX_RESTARTS}).`);

  // stop first: it is a no-op when nothing runs, and force-kills a process that
  // is alive but no longer heart-beating, which `start` alone would refuse to
  // replace ("Already running").
  await runManager('stop');
  const started = await runManager('start');
  if (!started.ok) {
    await markDown(`Restart command failed: ${started.output.slice(0, 500)}`);
  }
}

/** One supervision pass. Exported for tests; never throws. */
async function checkOnce() {
  if (!enabled()) { state.status = 'disabled'; return state.status; }
  if (checking) return state.status;
  checking = true;
  try {
    const age = heartbeatAgeMs();

    if (age <= STALE_MS) {
      if (state.status !== 'healthy') {
        console.log('[matlabSupervisor] MATLAB session is healthy.');
        await resolveAlert(ALERT_KIND);
      }
      state.status = 'healthy';
      state.lastError = null;
      state.restartTimes = [];
      return state.status;
    }

    const inGrace = state.status === 'restarting' && state.restartStartedAt &&
      Date.now() - state.restartStartedAt < STARTUP_GRACE_MS;
    if (inGrace) return state.status;   // networks still loading

    let reason;
    if (state.status === 'restarting' && state.restartStartedAt) {
      reason = `No heartbeat within ${Math.round(STARTUP_GRACE_MS / 1000)}s of a restart.`;
      await raiseAlert(ALERT_KIND, '', reason);
    } else if (age === Infinity) {
      reason = 'MATLAB session is not running.';
    } else {
      reason = `MATLAB session heartbeat is ${Math.round(age / 1000)}s old (hung or crashed).`;
    }
    await restart(reason);
    return state.status;
  } catch (err) {
    state.lastError = err.message;
    console.error(`[matlabSupervisor] check failed: ${err.message}`);
    return state.status;
  } finally {
    checking = false;
  }
}

function start() {
  if (timer || !enabled()) {
    if (!enabled()) console.log('[matlabSupervisor] disabled (INFERENCE_BACKEND is not matlab, ' +
      'or MATLAB_SUPERVISOR_ENABLED=false).');
    return;
  }
  // Treat boot like "never started": a missing heartbeat means start it now,
  // without raising an alert for what is just a cold start.
  state.status = 'unknown';
  checkOnce();
  timer = setInterval(checkOnce, INTERVAL_MS);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

/** For GET /api/v1/admin/system-health. */
function getStatus() {
  return {
    status: state.status === 'unknown' ? 'restarting' : state.status,
    lastHeartbeatAt: state.lastHeartbeatAt,
    restartsInWindow: state.restartTimes.length,
    lastError: state.lastError,
  };
}

/** Test seams. */
function _setManager(fn) { const prev = runManager; runManager = fn; return prev; }
function _reset(status = 'unknown') {
  state.status = status; state.lastHeartbeatAt = null; state.restartStartedAt = null;
  state.restartTimes = []; state.lastError = null;
}

module.exports = {
  start, stop, checkOnce, getStatus, _setManager, _reset,
  HEARTBEAT, ALERT_KIND,
};
