'use strict';

/**
 * routes/cases.js
 *
 * Placeholder router (Task 0.1). Mounted at /api/v1/cases by server.js.
 *
 * Endpoints this router owns, per docs/api-contracts.md ("Central API"):
 *
 *   POST /api/v1/cases                  multipart: patientId, phcId, captureIdRef,
 *                                       cameraDeviceId, image, questionnaireData,
 *                                       captureMetadata
 *     -> 201 { caseId, receivedAt }
 *     Pass the PARSED questionnaireData / captureMetadata objects to pg, not the
 *     raw JSON strings from the multipart body -- pg converts a JS object to
 *     JSONB itself, and passing a string double-encodes it.
 *
 *   GET  /api/v1/cases/:caseId/status   -> 200 { caseId, status }
 *                                          status is 'processing' | 'graded' | 'error'
 *
 *   GET  /api/v1/cases/:caseId          -> 200 full case detail: a join across
 *                                          cases + grading_results +
 *                                          segmentation_outputs +
 *                                          explainability_outputs.
 *     Every not-yet-populated ML field must come back as an explicit null --
 *     never undefined, never a missing key, never a zero standing in for a real
 *     result. The frontend renders "not yet available" for null and would show a
 *     fabricated 0 otherwise.
 *
 *   POST /api/v1/cases/:caseId/review   -> 200 { reviewId }
 *     Inserts into ophthalmologist_reviews; on decision === 'override' also
 *     inserts into corrections (Task 3.5).
 *
 * IMPLEMENTED BY: Task 3.3 (ingestion + detail) and Task 3.5 (review).
 */

const express = require('express');

const router = express.Router();

router.get('/__placeholder', (req, res) => {
  res.json({ router: 'cases', implemented: false, implementedBy: 'Tasks 3.3 / 3.5' });
});

module.exports = router;
