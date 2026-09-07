'use strict';

/**
 * routes/ophthalmologistQueue.js
 *
 * Placeholder router (Task 0.1). Mounted at /api/v1/ophthalmologist.
 *
 * Endpoint this router owns, per docs/api-contracts.md ("Central API"):
 *
 *   GET /api/v1/ophthalmologist/queue -> 200 [ { caseId, patientReference, phcName,
 *                                                capturedAt, drGradeCnn,
 *                                                drGradeRuleEngine, branchAgreement,
 *                                                confidenceScore, conformalTier,
 *                                                priorityRank } ]
 *
 * Three things this endpoint has to get right (Task 3.5):
 *
 *   1. WHERE conformal_tier != 'A'. Tier A auto-clears and never appears here.
 *   2. Ranking: Tier C ranked 1-100 by uncertaintyScore DESCENDING, then Tier B
 *      ranked 101-200 by confidenceScore ASCENDING. Sorted ascending by
 *      priorityRank, so rank 1 is reviewed first. uncertainty_score is NULL
 *      until Phase 6, so use (1 - confidence_score) as its stand-in for now.
 *   3. patientReference, never the raw patientId -- an ophthalmologist's screen
 *      may be visible to people who should not see patient identifiers.
 *
 * drGradeRuleEngine and branchAgreement are null until Branch B ships in Phase 5.
 * That is not a temporary inconvenience to code around: the frontend has to
 * handle null here from day one.
 *
 * IMPLEMENTED BY: Task 3.5.
 */

const express = require('express');

const router = express.Router();

router.get('/queue', (req, res) => res.json([]));

module.exports = router;
