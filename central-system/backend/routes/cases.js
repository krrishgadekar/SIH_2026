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
const { handleConfirmedReferral } = require('../services/referralNotificationService');
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

// ── POST /api/v1/cases/:caseId/review  (Task 3.5) ────────────────────────────
const DECISIONS = ['confirm', 'override'];
const OVERRIDE_CATEGORIES = ['artifact_misread', 'lesion_missed',
                             'wrong_severity', 'image_quality_issue'];

router.post('/:caseId/review', async (req, res, next) => {
  const { caseId } = req.params;
  const {
    ophthalmologistId, decision,
    overrideReasonCategory, overrideReasonText, reviewDurationSeconds,
  } = req.body || {};

  if (!UUID_RE.test(caseId)) return notFound(res, caseId);

  if (!DECISIONS.includes(decision)) {
    return res.status(400).json({
      error: 'invalid_field',
      message: `decision must be one of: ${DECISIONS.join(', ')}.`,
    });
  }

  // A confirm carries no reason; an override must carry one of the four
  // categories. The database enforces this too (override_requires_category),
  // but a CHECK violation surfaces as a 500 — catching it here gives the
  // reviewer an actionable 400 instead.
  if (decision === 'confirm' && overrideReasonCategory) {
    return res.status(400).json({
      error: 'invalid_field',
      message: "overrideReasonCategory must be null when decision is 'confirm'.",
    });
  }
  if (decision === 'override' && !OVERRIDE_CATEGORIES.includes(overrideReasonCategory)) {
    return res.status(400).json({
      error: 'invalid_field',
      message: `overrideReasonCategory must be one of: ${OVERRIDE_CATEGORIES.join(', ')}.`,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const exists = await client.query('SELECT 1 FROM cases WHERE case_id = $1', [caseId]);
    if (!exists.rows.length) {
      await client.query('ROLLBACK');
      return notFound(res, caseId);
    }

    const inserted = await client.query(`
      INSERT INTO ophthalmologist_reviews
        (case_id, ophthalmologist_id, decision,
         override_reason_category, override_reason_text, review_duration_seconds)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING review_id
    `, [caseId, ophthalmologistId || null, decision,
        decision === 'override' ? overrideReasonCategory : null,
        overrideReasonText || null,
        Number.isInteger(reviewDurationSeconds) ? reviewDurationSeconds : null]);

    const reviewId = inserted.rows[0].review_id;

    // An override is a labelled correction: the ophthalmologist has told us the
    // model was wrong AND why. That is the training signal the continual
    // learning loop consumes (design doc §6.11), so it is recorded in the same
    // transaction as the review — a review whose correction row failed to write
    // would be silently lost from retraining, and nothing downstream would ever
    // notice the gap.
    if (decision === 'override') {
      await client.query(
        'INSERT INTO corrections (case_id, review_id) VALUES ($1, $2)', [caseId, reviewId]);
    }

    await client.query('COMMIT');

    // ── Task 3.6: referral + patient SMS ──────────────────────────────────
    // AFTER the commit, never inside the transaction. An SMS cannot be rolled
    // back, so it must not be sent from a transaction that might still abort —
    // that would tell a patient to seek care for a review that was never
    // recorded.
    //
    // Failures here do NOT fail the request. The review is already committed
    // and is the clinical record; returning 500 would tell the ophthalmologist
    // their decision was lost when it was not, and they would enter it twice.
    let referral = null;
    try {
      referral = await handleConfirmedReferral(caseId, {
        // Only meaningful on an override — see the note in the service. The
        // contract has no field for it yet; accepted here when supplied.
        correctedGrade: Number.isInteger(req.body?.correctedGrade)
          ? req.body.correctedGrade : undefined,
      });
    } catch (err) {
      console.error(`[cases] referral handling failed for ${caseId}:`, err.message);
    }

    // referralId is surfaced so the reviewer's UI can confirm a referral was
    // raised; smsStatus is deliberately explicit rather than a boolean, because
    // "not configured" and "failed" are very different from "not referable".
    res.json({
      reviewId,
      referralId: referral?.referralId ?? null,
      smsStatus:  referral?.sms?.status ?? null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
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
