'use strict';

/**
 * routes/captures.js
 *
 * Placeholder router (Task 0.1). Mounted at /captures by server.js.
 *
 * Endpoints this router owns, per docs/api-contracts.md ("Local API"):
 *
 *   POST /captures                             multipart: patientId, image, cameraDeviceId
 *     -> 201 { captureId, patientId, qualityStatus, qualityReason, retakeCount, capturedAt }
 *        qualityStatus is 'pass' | 'retake' | 'borderline'.
 *        qualityReason is null on 'pass', else exactly one of:
 *          'blur' | 'low_illumination' | 'insufficient_fov'
 *          | 'glare' | 'motion_artifact' | 'eyelash_occlusion'
 *        These six strings are mapped one-to-one to messages in
 *        QualityResultPanel.jsx -- free text here silently breaks the UI.
 *
 *   POST /captures/:captureId/questionnaire    -> 201 { responseId, captureId }
 *   POST /captures/:captureId/capture-metadata -> 201 { responseId, captureId }
 *   GET  /captures                             -> 200 [ { captureId, patientId,
 *                                                         patientName, status, capturedAt } ]
 *
 * IMPLEMENTED BY: Task 3.2, using multer for the multipart upload and calling
 * handleCapture() from Task 3.1.
 */

const express = require('express');

const router = express.Router();

// Placeholder for the Local Queue endpoint. Returns the right TYPE (an array)
// so a frontend wired up early does not crash, but it is empty because nothing
// reads the captures table yet -- Task 3.2 replaces this with the real query.
router.get('/', (req, res) => res.json([]));

module.exports = router;
