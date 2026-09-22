'use strict';

/**
 * routes/captures.js  (Task 3.2)
 *
 * Mounted at /captures. Implements the "Local API" capture endpoints from
 * docs/api-contracts.md:
 *
 *   POST /captures                             -> 201 capture + quality verdict
 *   POST /captures/:captureId/questionnaire    -> 201 { responseId, captureId }
 *   POST /captures/:captureId/capture-metadata -> 201 { responseId, captureId }
 *   GET  /captures                             -> 200 Local Queue rows
 *
 * On enum validation: every enum below is rejected rather than coerced or
 * stored as-given. These values are compared with === downstream (the quality
 * reason strings drive QualityResultPanel.jsx; the capture-metadata fields feed
 * the central camera-family cross-check), so a typo stored today surfaces as a
 * silently missing UI branch or a mismatched calibration profile much later,
 * with nothing pointing back to the capture that caused it.
 */

const express = require('express');
const multer  = require('multer');

const db                  = require('../db/localDb');
const { handleCapture }   = require('../services/captureHandler');
const { generateLocalId } = require('../services/ids');

const router = express.Router();

// memoryStorage, not diskStorage: captureHandler owns the storage layout and
// names the file after the captureId it mints. Letting multer write the file
// first would put a differently-named copy on disk that nothing cleans up.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },   // fundus images run 1-10 MB
  fileFilter(req, file, cb) {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error(`Expected an image, got ${file.mimetype}`),
                     { code: 'NOT_AN_IMAGE' }));
  },
});

// ── Contract enums (api-contracts.md) ────────────────────────────────────────
const YEARS_SINCE_DIAGNOSIS = ['lt1', '1to5', '5to10', 'gt10'];
const GLYCEMIC_CONTROL      = ['good', 'moderate', 'poor'];
const BLOOD_PRESSURE        = ['normal', 'high', 'unknown'];
const SYMPTOM_FIELDS        = ['blurredVision', 'floaters', 'suddenVisionChange', 'eyePain'];

const PUPIL_STATUS          = ['dilated', 'non_dilated', 'unknown'];
const LIGHTING_ENVIRONMENT  = ['indoor_clinic', 'outdoor_mobile', 'low_light'];
const OBSERVED_ISSUES       = ['glare', 'blink_or_moved', 'out_of_focus',
                               'media_opacity', 'eyelash_obstruction', 'none_noticed'];
const USABILITY_RATING      = ['clear', 'not_sure', 'clearly_unusable'];

const bad = (res, error, message) => res.status(400).json({ error, message });

/**
 * checkEnum(res, field, value, allowed)
 *
 * Returns true if the value is acceptable. Otherwise it writes the 400 response
 * and returns false, so callers read as:
 *
 *     if (!checkEnum(...)) return;
 *
 * Writing the response and reporting the failure in one call keeps the route
 * bodies flat instead of a ladder of nested ifs -- but it does mean the caller
 * must return immediately on false, or it will try to send a second response.
 */
function checkEnum(res, field, value, allowed, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (!required) return true;
    bad(res, 'missing_field', `${field} is required.`);
    return false;
  }
  if (!allowed.includes(value)) {
    bad(res, 'invalid_field',
      `${field} must be one of: ${allowed.join(', ')} — got '${value}'.`);
    return false;
  }
  return true;
}

function captureExists(captureId) {
  return !!db.prepare('SELECT capture_id FROM captures WHERE capture_id = ?').get(captureId);
}

// ── POST /captures ───────────────────────────────────────────────────────────
router.post('/', upload.single('image'), async (req, res, next) => {
  const { patientId, cameraDeviceId } = req.body || {};

  if (!patientId)  return bad(res, 'patient_id_required', 'patientId is required.');
  if (!req.file)   return bad(res, 'image_required', 'An image file is required.');

  try {
    const result = await handleCapture(
      patientId, req.file, cameraDeviceId || 'unknown');
    res.status(201).json(result);
  } catch (err) {
    // handleCapture signals these two by message prefix. Mapping them here
    // keeps the service free of HTTP concerns.
    if (err.message.includes('patient_not_found')) {
      return res.status(404).json({
        error: 'patient_not_found',
        message: `No patient with id ${patientId}`,
      });
    }
    if (err.message.startsWith('quality_gate_failed')) {
      // The capture row survives as 'pending' and the image is on disk, so this
      // is recoverable — say so, rather than implying the capture was lost.
      return res.status(503).json({
        error: 'quality_gate_failed',
        message: 'The image was saved but the quality check could not run. '
               + 'Check that MATLAB is available, then re-run the check.',
      });
    }
    next(err);
  }
});

// ── POST /captures/:captureId/questionnaire ──────────────────────────────────
// Patient symptom + risk answers (design doc §9.1) — about the PATIENT.
router.post('/:captureId/questionnaire', (req, res) => {
  const { captureId } = req.params;
  const { riskFactors, symptoms, language } = req.body || {};

  if (!captureExists(captureId)) {
    return res.status(404).json({
      error: 'capture_not_found', message: `No capture with id ${captureId}`,
    });
  }
  if (!riskFactors || typeof riskFactors !== 'object') {
    return bad(res, 'missing_field', 'riskFactors object is required.');
  }
  if (!symptoms || typeof symptoms !== 'object') {
    return bad(res, 'missing_field', 'symptoms object is required.');
  }

  if (!checkEnum(res, 'riskFactors.yearsSinceDiagnosis',
                 riskFactors.yearsSinceDiagnosis, YEARS_SINCE_DIAGNOSIS)) return;
  if (!checkEnum(res, 'riskFactors.glycemicControl',
                 riskFactors.glycemicControl, GLYCEMIC_CONTROL)) return;
  if (!checkEnum(res, 'riskFactors.bloodPressure',
                 riskFactors.bloodPressure, BLOOD_PRESSURE)) return;

  // pregnant is boolean | null — null meaning not applicable / not asked, which
  // is a genuinely different answer from false and must stay distinguishable.
  const pregnant = riskFactors.pregnant;
  if (pregnant !== null && pregnant !== undefined && typeof pregnant !== 'boolean') {
    return bad(res, 'invalid_field',
      'riskFactors.pregnant must be true, false, or null (null = not applicable).');
  }

  for (const field of SYMPTOM_FIELDS) {
    if (typeof symptoms[field] !== 'boolean') {
      return bad(res, 'invalid_field', `symptoms.${field} must be a boolean.`);
    }
  }

  const responseId = generateLocalId();

  db.prepare(`
    INSERT INTO questionnaire_responses
      (response_id, capture_id, risk_factor_fields, symptom_fields, language, recorded_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    responseId,
    captureId,
    // The columns are TEXT, so the nested objects are stringified here. The
    // central side stores the same payloads as real JSONB.
    JSON.stringify({
      yearsSinceDiagnosis: riskFactors.yearsSinceDiagnosis,
      glycemicControl:     riskFactors.glycemicControl,
      bloodPressure:       riskFactors.bloodPressure,
      pregnant:            pregnant === undefined ? null : pregnant,
    }),
    JSON.stringify(Object.fromEntries(SYMPTOM_FIELDS.map((f) => [f, symptoms[f]]))),
    language || null,
    new Date().toISOString(),
  );

  res.status(201).json({ responseId, captureId });
});

// ── POST /captures/:captureId/capture-metadata ───────────────────────────────
// Capture-context answers (design doc §9.6) — about the PHOTO, not the patient.
// Kept a separate endpoint and a separate table from the questionnaire above,
// deliberately (design doc §1.10): merging "how is the patient" with "how is
// this photo" would confuse both what is asked and how each answer is used.
router.post('/:captureId/capture-metadata', (req, res) => {
  const { captureId } = req.params;
  const {
    cameraDeviceReported, pupilStatus, lightingEnvironment,
    observedIssues, workerUsabilityRating, eyeLaterality,
  } = req.body || {};

  if (!captureExists(captureId)) {
    return res.status(404).json({
      error: 'capture_not_found', message: `No capture with id ${captureId}`,
    });
  }

  if (!checkEnum(res, 'pupilStatus', pupilStatus, PUPIL_STATUS)) return;
  if (!checkEnum(res, 'lightingEnvironment', lightingEnvironment, LIGHTING_ENVIRONMENT)) return;
  if (!checkEnum(res, 'workerUsabilityRating', workerUsabilityRating, USABILITY_RATING)) return;
  // Design doc §10.4: DR is graded per eye, so every capture is tagged left or
  // right. Optional at the API only so older clients keep working; the capture
  // screen already asks the technician for it.
  if (eyeLaterality !== undefined && eyeLaterality !== null &&
      !['left', 'right'].includes(eyeLaterality)) {
    return bad(res, 'invalid_field', "eyeLaterality must be 'left' or 'right'.");
  }

  if (!Array.isArray(observedIssues)) {
    return bad(res, 'invalid_field', 'observedIssues must be an array.');
  }
  for (const issue of observedIssues) {
    if (!OBSERVED_ISSUES.includes(issue)) {
      return bad(res, 'invalid_field',
        `observedIssues entries must be one of: ${OBSERVED_ISSUES.join(', ')} — got '${issue}'.`);
    }
  }
  // "none_noticed" alongside an actual observed issue is a contradiction, and
  // the contract says so explicitly. Storing it would make the technician's
  // answer unusable as the cross-check it exists to be (design doc §9.6).
  if (observedIssues.includes('none_noticed') && observedIssues.length > 1) {
    return bad(res, 'invalid_field',
      "observedIssues: 'none_noticed' must be the only element when present.");
  }

  const responseId = generateLocalId();

  db.prepare(`
    INSERT INTO capture_metadata_responses
      (response_id, capture_id, camera_device_reported, pupil_status,
       lighting_environment, observed_issues, worker_usability_rating, recorded_at,
       eye_laterality)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    responseId, captureId,
    cameraDeviceReported || null,
    pupilStatus, lightingEnvironment,
    JSON.stringify(observedIssues),
    workerUsabilityRating,
    new Date().toISOString(),
    eyeLaterality || null,
  );

  res.status(201).json({ responseId, captureId });
});

// ── GET /captures ────────────────────────────────────────────────────────────
// The Local Queue table: today's patients, so the technician can confirm
// nothing was missed (design doc §4.1).
router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.capture_id, c.patient_id, p.name AS patient_name,
           c.quality_status, c.captured_at, q.status AS sync_status
    FROM captures c
    JOIN patients p ON p.patient_id = c.patient_id
    LEFT JOIN sync_queue q ON q.capture_id = c.capture_id
    ORDER BY c.captured_at DESC
    LIMIT 500
  `).all();

  res.json(rows.map((r) => ({
    captureId:   r.capture_id,
    patientId:   r.patient_id,
    patientName: r.patient_name,
    status:      lifecycleStatus(r),
    capturedAt:  r.captured_at,
  })));
});

/**
 * lifecycleStatus(row)
 *
 * captures.quality_status and the contract's Local Queue `status` are two
 * different vocabularies and must not be confused. quality_status answers "was
 * the photo usable" (pass/retake/borderline, plus the internal 'pending');
 * `status` answers "how far along is this case"
 * (captured -> quality_passed -> synced -> result_pending -> result_delivered).
 *
 * Only the first three are reachable today. result_pending and
 * result_delivered require knowing what the central server did with the case,
 * and nothing local tracks that yet -- the sync manager (Task 3.4) only records
 * that the upload succeeded. Returning 'synced' for a case that is actually
 * awaiting a result is the honest answer for now; do NOT fake the later two by
 * guessing from elapsed time.
 */
function lifecycleStatus(row) {
  if (row.sync_status === 'synced') return 'synced';
  if (row.quality_status === 'pass' || row.quality_status === 'borderline') {
    return 'quality_passed';
  }
  // 'retake' and the internal 'pending' both mean: an image exists, but this
  // case has not cleared the gate and is not going anywhere yet.
  return 'captured';
}

// ── Multer / upload errors ───────────────────────────────────────────────────
// Without this, a too-large upload escapes as Express's default HTML error
// page, which violates the contract's "never an HTML error page" rule at
// exactly the moment the frontend most needs a parseable .error.
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'image_too_large' : 'upload_failed',
      message: tooBig ? 'Image exceeds the 25 MB limit.' : err.message,
    });
  }
  if (err && err.code === 'NOT_AN_IMAGE') {
    return bad(res, 'invalid_image_type', err.message);
  }
  next(err);
});

module.exports = router;
