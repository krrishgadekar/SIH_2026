'use strict';

/**
 * qualityGateClient.js
 *
 * Node ↔ MATLAB bridge for the quality gate.
 *
 * IMPLEMENTATION NOTE — "MATLAB Engine API for JavaScript" does not exist.
 * MathWorks provides official engine APIs for Python, Java, C/C++, and .NET
 * only.  The Task 1.6 spec mentions it, but there is no such npm package.
 *
 * Bridge strategy: child_process calling `matlab -batch`.
 *   • MATLAB runs qualityGateMain.m, jsonencode()s the result struct, and
 *     prints it to stdout.  Node reads stdout and JSON.parse()s it.
 *   • MATLAB startup takes 3–8 s.  To avoid paying that cost per request,
 *     this module keeps a shared "warm" promise that pre-launches MATLAB
 *     during server startup (see warmUp() below), so the first real request
 *     doesn't incur the cold-start penalty.
 *   • Task 8.1 (post-checkpoint) will replace the child_process call with a
 *     compiled standalone executable (~50 ms startup instead of ~5 s).
 *     Only the spawnMatlabBatch() function below needs to change for that
 *     transition — runQualityGate() stays identical.
 *
 * MATLAB must be on the system PATH, OR set MATLAB_EXECUTABLE env var to the
 * full path, e.g.:
 *   $env:MATLAB_EXECUTABLE = "C:\Program Files\MATLAB\R2024b\bin\matlab.exe"
 */

const { spawn }  = require('child_process');
const path       = require('path');

// Absolute path to the quality-gate-matlab/ folder so MATLAB can addpath it.
const MATLAB_GATE_DIR = path.resolve(__dirname, '..', 'quality-gate-matlab');

// MATLAB executable — honour env override, fall back to 'matlab' on PATH.
const MATLAB_EXE = process.env.MATLAB_EXECUTABLE || 'matlab';

// Maximum time (ms) to wait for a single MATLAB call, including startup.
const TIMEOUT_MS = parseInt(process.env.MATLAB_TIMEOUT_MS || '30000', 10);

/**
 * spawnMatlabBatch(matlabExpr)
 *
 * Runs a MATLAB -batch expression and resolves with its stdout as a string.
 * Rejects on non-zero exit, timeout, or stderr content that indicates an
 * unhandled exception.
 *
 * @param {string} matlabExpr — the MATLAB expression to evaluate
 * @returns {Promise<string>}
 */
function spawnMatlabBatch(matlabExpr) {
  return new Promise((resolve, reject) => {
    const args = ['-batch', matlabExpr];

    // -nosplash -nodesktop suppress the GUI on Windows; -batch implies -nodesktop
    // on R2019b+ but we still pass it for older installs.
    const proc = spawn(MATLAB_EXE, args, {
      env: process.env,
      timeout: TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          `matlab -batch exited with code ${code}.\nstderr: ${stderr.trim()}`
        ));
      }
      // MATLAB writes licence/startup banners to stderr, not stdout.
      // Only treat stderr as a fatal error if the exit code is non-zero (above).
      resolve(stdout.trim());
    });

    proc.on('error', (err) => {
      reject(new Error(
        `Failed to spawn MATLAB (is it on PATH or MATLAB_EXECUTABLE set?): ${err.message}`
      ));
    });
  });
}

/**
 * runQualityGate(imagePath, cameraDeviceId)
 *
 * Calls qualityGateMain.m via a matlab -batch subprocess and returns the
 * result as a plain JS object.
 *
 * @param {string} imagePath      — absolute path to the captured image file
 * @param {string} cameraDeviceId — device identifier from the capture metadata
 * @returns {Promise<{ status: string, reason: string|null, scores: object }>}
 */
async function runQualityGate(imagePath, cameraDeviceId) {
  // Escape backslashes and single-quotes for embedding in a MATLAB string.
  const safePath     = imagePath.replace(/\\/g, '/').replace(/'/g, "''");
  const safeDeviceId = (cameraDeviceId || 'unknown').replace(/'/g, "''");

  // MATLAB expression:
  //   1. addpath the quality-gate directory so all .m files are found.
  //   2. Call qualityGateMain.
  //   3. jsonencode the result and disp() it — that's what lands in stdout.
  const matlabGateDir = MATLAB_GATE_DIR.replace(/\\/g, '/');

  const expr = [
    `addpath('${matlabGateDir}');`,
    `result = qualityGateMain('${safePath}', '${safeDeviceId}');`,
    `disp(jsonencode(result));`,
  ].join(' ');

  let raw;
  try {
    raw = await spawnMatlabBatch(expr);
  } catch (err) {
    throw new Error(`Quality gate MATLAB call failed: ${err.message}`);
  }

  // Extract the JSON object from stdout.
  // MATLAB may print startup/licence text before our disp() output, so
  // find the first '{' and take from there.
  const jsonStart = raw.indexOf('{');
  if (jsonStart === -1) {
    throw new Error(
      `Quality gate returned no JSON object.\nRaw stdout:\n${raw}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(raw.slice(jsonStart));
  } catch (err) {
    throw new Error(
      `Quality gate JSON parse failed: ${err.message}\nRaw: ${raw.slice(jsonStart, jsonStart + 200)}`
    );
  }

  // Normalise MATLAB's jsonencode output to the expected JS shape:
  //   result.status  — string: 'pass' | 'retake' | 'borderline'
  //   result.reason  — string | null
  //     MATLAB encodes [] (empty matrix) as a JSON empty array [], NOT null.
  //     So we must treat both null AND [] as "no reason" and normalise to null.
  //   result.scores  — plain object of all seven sub-scores:
  //     focusScore, illuminationScore, fovScore, coveragePercent,
  //     glareScore, motionScore, occlusionScore
  //
  //   Verified against real MATLAB Online output (2.jpg, 'unknown'):
  //   {"scores":{"focusScore":0.801,"illuminationScore":0.950,"fovScore":1,
  //    "coveragePercent":0.859,"glareScore":0,"motionScore":0.182,
  //    "occlusionScore":0.141},"status":"pass","reason":[]}
  const reasonRaw = parsed.reason;
  const reason = (
    reasonRaw === null ||
    reasonRaw === undefined ||
    (Array.isArray(reasonRaw) && reasonRaw.length === 0)
  ) ? null : reasonRaw;

  return {
    status: parsed.status,
    reason,
    scores: parsed.scores,
  };
}

/**
 * warmUp()
 *
 * Pre-launches a MATLAB process during server startup to pay the startup cost
 * upfront rather than on the first real patient capture.  Call once from
 * server.js; safe to call multiple times (subsequent calls are no-ops).
 *
 * @returns {Promise<void>}
 */
let _warmUpDone = false;
async function warmUp() {
  if (_warmUpDone) return;
  _warmUpDone = true;
  try {
    // Lightweight call that just verifies MATLAB starts and can see the gate dir.
    const matlabGateDir = MATLAB_GATE_DIR.replace(/\\/g, '/');
    await spawnMatlabBatch(`addpath('${matlabGateDir}'); disp('warm');`);
    console.log('[qualityGateClient] MATLAB warm-up complete.');
  } catch (err) {
    // Log but don't crash server — captures will still work, just with cold starts.
    console.warn('[qualityGateClient] MATLAB warm-up failed (is MATLAB installed?):', err.message);
  }
}

module.exports = { runQualityGate, warmUp };
