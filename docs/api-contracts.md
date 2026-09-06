# API & Data Contracts — Single Source of Truth

**Read this before writing any code that sends or receives data.** Both plans reference this file instead of re-describing shapes — if a task in either plan and this file ever disagree, this file wins and the task should be corrected.

**Global naming rule:** SQL columns are `snake_case` (matches the schema.sql files). Every JSON payload over HTTP — every request body, every response body — is `camelCase`. The translation between the two happens in the route handler, never in the database layer and never in a frontend component. If you're generating a route handler, it reads snake_case from the DB and returns camelCase JSON; if you're generating a DB insert, it takes camelCase from the parsed request and writes snake_case columns.

**Global ID rule:** all IDs are strings, never numbers, even where the DB uses an integer or UUID underneath. Locally-generated IDs (patients, captures) use the format `{PHC_CODE}-{base36 timestamp}-{4 random alphanumeric chars}`, e.g. `"PHC001-lz3k9f-a2x9"`. Centrally-generated IDs (cases, reviews, referrals) are standard UUIDv4 strings.

**Global date rule:** every timestamp field is an ISO 8601 string in UTC, e.g. `"2026-09-06T14:32:00.000Z"`. Never epoch numbers, never locale-formatted strings.

**Global enum rule:** every enum-like field (status, reason codes, categories) uses the exact lowercase snake_case string values listed below — nothing else, no synonyms, no title case. These strings are compared with `===` in the code that consumes them, so a mismatch (e.g. `"Blur"` instead of `"blur"`) silently breaks the UI mapping.

---

## Local API — `phc-local-app/backend`, base URL `http://localhost:4000`

### `POST /patients`
Request:
```json
{ "name": "Sunita Devi", "age": 54, "contactNumber": "+919812345678" }
```
Response `201`:
```json
{ "patientId": "PHC001-lz3k9f-a2x9", "name": "Sunita Devi", "age": 54, "contactNumber": "+919812345678", "registeredAt": "2026-09-06T09:00:00.000Z" }
```
Response `400` if `contactNumber` missing: `{ "error": "contact_number_required" }`

### `GET /patients/:patientId`
Response `200`: same shape as the POST response above.
Response `404`: `{ "error": "patient_not_found" }`

### `POST /captures`
Request: `multipart/form-data` with fields `patientId` (string), `image` (file), `cameraDeviceId` (string — one of the keys in `cameraPresets.json`, or `"unknown"`).
Response `201`:
```json
{
  "captureId": "PHC001-lz4a2b-c7f1",
  "patientId": "PHC001-lz3k9f-a2x9",
  "qualityStatus": "pass",
  "qualityReason": null,
  "retakeCount": 0,
  "capturedAt": "2026-09-06T09:05:00.000Z"
}
```
`qualityStatus` is exactly one of `"pass" | "retake" | "borderline"`.
`qualityReason` is `null` when `qualityStatus` is `"pass"`; otherwise exactly one of: `"blur" | "low_illumination" | "insufficient_fov" | "glare" | "motion_artifact" | "eyelash_occlusion"`. These six strings are fixed — the frontend's `QualityResultPanel.jsx` maps each one to its own human-readable message, so the quality gate must return one of these exact values, never free text.

### `POST /captures/:captureId/questionnaire` (patient symptom + risk)
Request:
```json
{
  "riskFactors": {
    "yearsSinceDiagnosis": "lt1",
    "glycemicControl": "moderate",
    "bloodPressure": "high",
    "pregnant": false
  },
  "symptoms": {
    "blurredVision": true,
    "floaters": false,
    "suddenVisionChange": false,
    "eyePain": false
  },
  "language": "hi"
}
```
`yearsSinceDiagnosis` ∈ `"lt1" | "1to5" | "5to10" | "gt10"`. `glycemicControl` ∈ `"good" | "moderate" | "poor"`. `bloodPressure` ∈ `"normal" | "high" | "unknown"`. `pregnant` is `boolean | null` (null = not applicable/not asked).
Response `201`: `{ "responseId": "string", "captureId": "string" }`

### `POST /captures/:captureId/capture-metadata`
Request:
```json
{
  "cameraDeviceReported": "forus_3nethra_v2",
  "pupilStatus": "dilated",
  "lightingEnvironment": "indoor_clinic",
  "observedIssues": ["none_noticed"],
  "workerUsabilityRating": "clear"
}
```
`pupilStatus` ∈ `"dilated" | "non_dilated" | "unknown"`. `lightingEnvironment` ∈ `"indoor_clinic" | "outdoor_mobile" | "low_light"`. `observedIssues` is an array containing zero or more of: `"glare" | "blink_or_moved" | "out_of_focus" | "media_opacity" | "eyelash_obstruction" | "none_noticed"` (if `"none_noticed"` is present, it should be the only element). `workerUsabilityRating` ∈ `"clear" | "not_sure" | "clearly_unusable"`.
Response `201`: `{ "responseId": "string", "captureId": "string" }`

### `GET /sync/status`
Response `200`: `{ "online": true, "pendingCount": 3, "lastSyncAttempt": "2026-09-06T09:10:00.000Z" }` — `lastSyncAttempt` is `null` if no attempt has ever been made.

### `GET /captures` (for the Local Queue table)
Response `200`: array of
```json
{
  "captureId": "PHC001-lz4a2b-c7f1",
  "patientId": "PHC001-lz3k9f-a2x9",
  "patientName": "Sunita Devi",
  "status": "quality_passed",
  "capturedAt": "2026-09-06T09:05:00.000Z"
}
```
`status` ∈ `"captured" | "quality_passed" | "synced" | "result_pending" | "result_delivered"`.

---

## Central API — `central-system/backend`, base URL `http://localhost:5000`

### `GET /health`
Response `200`: `{ "status": "ok" }`

### `POST /api/v1/cases`
Request: `multipart/form-data` with fields `patientId`, `phcId`, `captureIdRef`, `cameraDeviceId` (all strings), `image` (file), `questionnaireData` (JSON-stringified payload matching the patient questionnaire shape above), `captureMetadata` (JSON-stringified payload matching the capture-metadata shape above).
Response `201`: `{ "caseId": "a1b2c3d4-...", "receivedAt": "2026-09-06T09:15:00.000Z" }`

### `GET /api/v1/cases/:caseId/status`
Response `200`: `{ "caseId": "string", "status": "processing" | "graded" | "error" }`

### `GET /api/v1/ophthalmologist/queue`
Response `200`: array of
```json
{
  "caseId": "a1b2c3d4-...",
  "patientReference": "PT-4821",
  "phcName": "PHC Kharadi",
  "capturedAt": "2026-09-06T09:05:00.000Z",
  "drGradeCnn": 2,
  "drGradeRuleEngine": 3,
  "branchAgreement": false,
  "confidenceScore": 0.81,
  "conformalTier": "C",
  "priorityRank": 1
}
```
`patientReference` is a display-safe identifier, never the raw `patientId` used internally (keep patient-identifying strings out of anything an ophthalmologist's screen might be seen displaying by someone else). `drGradeRuleEngine` and `branchAgreement` are `null` until Branch B is built (post-checkpoint) — the frontend must handle `null` here from day one, not just once Branch B ships. `conformalTier` ∈ `"A" | "B" | "C"` — Tier A never appears in this list since it auto-clears. Sorted ascending by `priorityRank` (1 = review first). Checkpoint-version ranking: Tier C cases ranked 1–100 by `uncertaintyScore` descending, Tier B cases ranked 101–200 by `confidenceScore` ascending.

### `GET /api/v1/cases/:caseId` (full case detail)
Response `200`:
```json
{
  "caseId": "a1b2c3d4-...",
  "patientReference": "PT-4821",
  "imageUrl": "/media/cases/a1b2c3d4/original.jpg",
  "gradCamOverlayUrl": "/media/cases/a1b2c3d4/gradcam.png",
  "lesionCounts": { "microaneurysms": 6, "hemorrhages": 2, "hardExudates": 0, "softExudates": 0 },
  "nvSuspicionScore": 0.12,
  "evidenceSummaryText": "6 microaneurysms (superior-temporal: 3, inferior-nasal: 3), 2 dot hemorrhages. Severe-NPDR criteria not met.",
  "drGradeCnn": 2,
  "drGradeRuleEngine": 3,
  "branchAgreement": false,
  "confidenceScore": 0.81,
  "uncertaintyScore": 0.34,
  "conformalTier": "C",
  "lesionAttentionConsistencyScore": 0.71,
  "questionnaireData": { "riskFactors": { "...": "..." }, "symptoms": { "...": "..." }, "language": "hi" },
  "captureMetadata": { "cameraDeviceReported": "forus_3nethra_v2", "pupilStatus": "dilated", "lightingEnvironment": "indoor_clinic", "observedIssues": ["none_noticed"], "workerUsabilityRating": "clear" },
  "priorAssessments": [ { "caseId": "prev-case-id", "gradedAt": "2026-06-01T10:00:00.000Z", "drGradeCnn": 1 } ]
}
```
Every ML-derived field (`lesionCounts`, `nvSuspicionScore`, `evidenceSummaryText`, `drGradeRuleEngine`, `branchAgreement`, `uncertaintyScore`, `lesionAttentionConsistencyScore`) is `null` until its backing module ships — the frontend renders "not yet available" for `null`, never crashes on it and never shows a zero/empty value as if it were a real result.

### `POST /api/v1/cases/:caseId/review`
Request:
```json
{
  "ophthalmologistId": "string",
  "decision": "override",
  "overrideReasonCategory": "wrong_severity",
  "overrideReasonText": "Grade 3 lesions visible superior-temporal, model under-called it.",
  "reviewDurationSeconds": 24
}
```
`decision` ∈ `"confirm" | "override"`. `overrideReasonCategory` is `null` when `decision` is `"confirm"`, otherwise one of: `"artifact_misread" | "lesion_missed" | "wrong_severity" | "image_quality_issue"`. `overrideReasonText` is optional free text, `null` if not provided.
Response `200`: `{ "reviewId": "string" }`

### `GET /api/v1/admin/dashboard`
Response `200`:
```json
{
  "casesToday": 42,
  "casesPerPhc": [ { "phcId": "string", "phcName": "PHC Kharadi", "count": 18 } ],
  "averageReviewTurnaroundSeconds": 27
}
```

### `GET /api/v1/admin/referrals`
Response `200`: array of
```json
{ "referralId": "string", "patientReference": "PT-4821", "status": "referred", "assignedWorker": null, "updatedAt": "2026-09-06T09:20:00.000Z" }
```
`status` ∈ `"referred" | "contacted" | "attended" | "lost"`.

### `PATCH /api/v1/referrals/:referralId`
Request: `{ "status": "contacted", "assignedWorker": "ASHA-112" }`
Response `200`: the updated referral object, same shape as the list item above.

### `GET /api/v1/phc/:phcId/sync-status`
Response `200`: `{ "phcId": "string", "phcName": "PHC Kharadi", "lastSyncAt": "2026-09-06T08:00:00.000Z", "pendingCount": 5 }`

---

## Error shape (applies to every endpoint above)
Any non-2xx response body is always: `{ "error": "snake_case_error_code", "message": "human-readable string" }` — never a bare string, never an HTML error page. Frontend error handling should read `.error` for logic and `.message` only for display.
