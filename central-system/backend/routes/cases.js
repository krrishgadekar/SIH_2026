'use strict';

/**
 * routes/cases.js  (Task 3.3)
 *
 * Mounted at /api/v1/cases. Implements the "Central API" case endpoints from
 * docs/api-contracts.md:
 *
 *   POST /api/v1/cases                -> 201 { caseId, receivedAt }
 *   GET  /api/v1/cases/:caseId/status -> 200 { caseId, status }
 *   GET  /api/v1/cases/:caseId        -> 200 full case detail
 *
 *   POST /api/v1/cases/:caseId/review -> Task 3.5, not built here.
 *
 * ── CONTRACT GAP worth resolving before Task 3.4 ────────────────────────────
 * cases.patient_id is a foreign key to patients, so a patient must exist
 * centrally before any case referencing them can be stored. But there is no
 * central patient-creation endpoint in api-contracts.md, and POST /cases
 * carries no demographics — so as written, nothing can ever create the central
 * patient row, and every POST /cases for a new patient would fail.
 *
 * Handled here by accepting OPTIONAL patientName / patientAge /
 * patientContactNumber fields and registering the patient when they are
 * present. That is additive rather than a change to any documented shape, and
 * it keeps the sync manager buildable. contact_number in particular is not
 * bookkeeping — Task 3.6 sends the referral SMS to it, so a patient who
 * arrives without one cannot be told their result.
 *
 * api-contracts.md should be updated to record these three fields.
 */

const express = require('express');
const multer  = require('multer');

const ingestion = require('../services/ingestionService');
const { processCase } = require('../services/gradingOrchestrator');
const pool = require('../db/pgClient');

const router = express.Router();

// memoryStorage: ingestionService owns the media layout and names the file
// after the case_id the database generates, which is not known until the row is
// inserted. Letting multer write first would leave an orphan under a different
// name that nothing cleans up.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (/^image\//.test(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error(`Expected an image, got ${file.mimetype}`),
                     { code: 'NOT_AN_IMAGE' }));
  },
});

// Postgres rejects a malformed UUID with a 22P02 error rather than returning no
// rows, which would surface as a 500 on what is really a bad request. Checking
// the shape first turns those into a clean 404.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const notFound = (res, caseId) => res.status(404).json({
  error: 'case_not_found', message: `No case with id ${caseId}`,
});

// ── POST /api/v1/cases ───────────────────────────────────────────────────────
router.post('/', upload.single('image'), async (req, res, next) => {
  let caseId;
  try {
    const result = await ingestion.ingestCase({ ...req.body, imageFile: req.file });
    caseId = result.caseId;

    // Checkpoint version: grade synchronously so a POST followed immediately by
    // a GET returns real values (Task 3.3's Definition of Done). This makes the
    // request as slow as a MATLAB run — tens of seconds — which is exactly why
    // Task 8.3 replaces it with a job queue. Do not build anything that depends
    // on this being synchronous.
    try {
      await processCase(caseId);
    } catch (gradingErr) {
      // The case IS received and stored — the image is on disk and the row
      // exists — so this is still a 201. Marking it 'error' rather than leaving
      // it 'processing' distinguishes "failed, needs attention" from "still
      // working", which a poller cannot otherwise tell apart.
      console.error(`[cases] grading failed for ${caseId}:`, gradingErr.message);
      await pool.query("UPDATE cases SET status = 'error' WHERE case_id = $1", [caseId]);
    }

    res.status(201).json(result);
  } catch (err) {
    if (err.code === 'patient_not_found') {
      return res.status(404).json({ error: err.code, message: err.message });
    }
    if (err.status === 400 || err.code === 'invalid_json') {
      return res.status(400).json({ error: err.code || 'bad_request', message: err.message });
    }
    next(err);
  }
});

// ── GET /api/v1/cases/:caseId/status ─────────────────────────────────────────
// Declared before /:caseId so the literal '/status' suffix is matched by this
// route rather than being swallowed as part of the id parameter.
router.get('/:caseId/status', async (req, res, next) => {
  const { caseId } = req.params;
  if (!UUID_RE.test(caseId)) return notFound(res, caseId);
  try {
    const status = await ingestion.getCaseStatus(caseId);
    if (!status) return notFound(res, caseId);
    res.json(status);
  } catch (err) { next(err); }
});

// ── GET /api/v1/cases/:caseId ────────────────────────────────────────────────
router.get('/:caseId', async (req, res, next) => {
  const { caseId } = req.params;
  if (!UUID_RE.test(caseId)) return notFound(res, caseId);
  try {
    const detail = await ingestion.getCaseDetail(caseId);
    if (!detail) return notFound(res, caseId);
    res.json(detail);
  } catch (err) { next(err); }
});

// ── Upload errors ────────────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(tooBig ? 413 : 400).json({
      error: tooBig ? 'image_too_large' : 'upload_failed',
      message: tooBig ? 'Image exceeds the 25 MB limit.' : err.message,
    });
  }
  if (err && err.code === 'NOT_AN_IMAGE') {
    return res.status(400).json({ error: 'invalid_image_type', message: err.message });
  }
  next(err);
});

module.exports = router;
