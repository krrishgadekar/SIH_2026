# API & Data Contracts — Single Source of Truth

**Read this before writing any code that sends or receives data.** Both plans reference this file instead of re-describing shapes — if a task in either plan and this file ever disagree, this file wins and the task should be corrected.

**Global naming rule:** SQL columns are `snake_case` (matches the schema.sql files). Every JSON payload over HTTP — every request body, every response body — is `camelCase`. The translation between the two happens in the route handler, never in the database layer and never in a frontend component. If you're generating a route handler, it reads snake_case from the DB and returns camelCase JSON; if you're generating a DB insert, it takes camelCase from the parsed request and writes snake_case columns.

**Global ID rule:** all IDs are strings, never numbers, even where the DB uses an integer or UUID underneath. Locally-generated IDs (patients, captures) use the format `{PHC_CODE}-{base36 timestamp}-{4 random alphanumeric chars}`, e.g. `"PHC001-lz3k9f-a2x9"`. Centrally-generated IDs (cases, reviews, referrals) are standard UUIDv4 strings.

**Global date rule:** every timestamp field is an ISO 8601 string in UTC, e.g. `"2026-09-06T14:32:00.000Z"`. Never epoch numbers, never locale-formatted strings.

**Global enum rule:** every enum-like field (status, reason codes, categories) uses the exact lowercase snake_case string values listed below — nothing else, no synonyms, no title case. These strings are compared with `===` in the code that consumes them, so a mismatch (e.g. `"Blur"` instead of `"blur"`) silently breaks the UI mapping.

**Global patient-reference rule:** `patientReference` is `PT-` followed by **six** characters drawn from `ABCDEFGHJKLMNPQRTUVWXYZ2346789` — uppercase, with `0 O 1 I 5 S` deliberately excluded, e.g. `"PT-K3M9XQ"`. It is randomly assigned, never derived from `patientId`, and never reversible back to it. Earlier drafts of this file showed `"PT-4821"`; that four-digit form is **withdrawn**. Four digits is 9,000 values for a system specified at 100,000+ patients per year — the space is exhausted within weeks, and by the birthday bound collisions begin at roughly a hundred patients. The excluded glyphs are the ones that get misread when a reference is spoken between an ophthalmologist and a PHC, which is how a note lands on the wrong patient's record.

---

## Changelog

Kept because this file is the tie-breaker: when it changes, the code and both
plans have to be re-checked against it, and a silent edit makes that impossible.

**2026-09-09 — Task 7.3.** `evidenceSummaryText` is no longer `null`: it is always a non-empty string now that the report generator exists. Until lesion segmentation ships it states that segmentation has not been run rather than reporting zero lesions. `lesionAttentionConsistencyScore` stays `null` — Task 7.1 is built and tested but needs a lesion mask to score against.

**2026-09-09 — Tasks 8.2 and 8.3.** One behaviour change and one new endpoint group.

- **Breaking for any client that assumed it:** `POST /api/v1/cases` no longer grades before responding. Grading is queued (Task 8.3), so the case is **always** `"processing"` when the `201` returns. A client that read the case immediately after posting and expected a grade now gets nulls. Poll `GET /api/v1/cases/:caseId/status` — which is what that endpoint was always for. The request itself went from tens of seconds to milliseconds.
- Added the chunked/resumable upload group under `POST|GET /api/v1/cases/:captureRef/chunks…` (Task 8.2), for large images on links that cannot finish a single-shot POST.
- No change to the `status` enum: `"processing"` already means "not ready, keep polling", and queued-vs-grading is not a distinction any client can act on.

**2026-09-08 — reconciled against the implemented backend.** Every change below
came from building against this document and finding it under-specified rather
than wrong. Nothing documented here was reinterpreted; the additions fill gaps
that made an endpoint unbuildable as written.

- `POST /api/v1/cases` gains optional `patientName`, `patientAge`, `patientContactNumber`, and `capturedAt`. **Without the first three, no case for a new patient can ever be stored** — see that endpoint's note.
- `patientReference` widened from four digits to six characters (above).
- Media URLs keep the uploaded file's real extension; `original.jpg` is an example, not a fixed name.
- Error bodies are `{ error, message }` on **every** failure path, including the ones this file previously showed with `error` alone.
- Documented the error responses for `POST /captures` and `POST /api/v1/cases`, which had none.
- Recorded which `GET /captures` lifecycle states are currently reachable.
- Noted that `GET /sync/status` reports `online: false` until the sync manager (Task 3.4) exists.
- Recorded `GET /patients` (local), which exists but was undocumented.
- Clarified `priorityRank` behaviour when Tier C exceeds 100 cases.

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
Response `400` if `contactNumber` missing: `{ "error": "contact_number_required", "message": "..." }`
Also `400 name_required`, `400 invalid_age` (must be an integer 0–130).

`contactNumber` is required because it is the only channel for delivering a result to a patient who has already gone home. A patient registered without one cannot be reached in the offline flow.

### `GET /patients/:patientId`
Response `200`: same shape as the POST response above.
Response `404`: `{ "error": "patient_not_found", "message": "..." }`

### `GET /patients`
Response `200`: array of the same object, most recently registered first, capped at 200.
Not part of the original contract; recorded 2026-09-08 because it is implemented and the Patient Lookup screen needs a list to search. The cap is deliberate — this table grows all season on modest PHC hardware.

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

`retakeCount` counts prior failed attempts **for this patient on the current UTC day**. It answers "which attempt is this, in this sitting" — a patient screened again months later starts at 0 rather than inheriting an old count.

Errors: `400 patient_id_required`, `400 image_required`, `400 invalid_image_type`, `404 patient_not_found`, `413 image_too_large` (25 MB), `503 quality_gate_failed`.

`503 quality_gate_failed` means the image **was saved** and the capture row exists, but the quality check could not run (typically MATLAB unavailable). The capture is recoverable and can be re-checked without recalling the patient — do not present it to the technician as a lost capture. The row stays in an internal `pending` state that is never returned as a `qualityStatus`.

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

`online` reflects the last actual heartbeat to the central server, held in memory rather than persisted: "is the network up right now" is true of the running process at this moment, and a restarted server must not report a state it has never observed. **Until the sync manager (Task 3.4) exists, this is always `false` with `lastSyncAttempt: null`** — nothing has tried to reach the server yet, so that is the honest answer rather than a placeholder. The technician uses this indicator to decide whether the patient can wait for a result, so an optimistic `true` that nothing verified is worse than `false`.

`pendingCount` counts `sync_queue` rows awaiting upload. Only captures whose quality status is `pass` or `borderline` are queued: a `retake` is about to be reshot, and uploading it would spend scarce rural bandwidth on an image that is already being replaced.

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

This is a **lifecycle** vocabulary and is not the same thing as `qualityStatus`: `qualityStatus` answers "was the photo usable", `status` answers "how far along is this case". Do not map one onto the other.

Only the first three are currently reachable. `result_pending` and `result_delivered` require knowing what the central server did with a case, and nothing local tracks that yet — the sync manager only records that the upload succeeded. A case awaiting a result therefore reports `synced`. Do **not** infer the later two from elapsed time; a fabricated status on a clinical screen is worse than a coarse one.

---

## Central API — `central-system/backend`, base URL `http://localhost:5000`

### `GET /health`
Response `200`: `{ "status": "ok" }`

### `POST /api/v1/cases`
Request: `multipart/form-data` with fields `patientId`, `phcId`, `captureIdRef`, `cameraDeviceId` (all strings), `image` (file), `questionnaireData` (JSON-stringified payload matching the patient questionnaire shape above), `captureMetadata` (JSON-stringified payload matching the capture-metadata shape above).

Plus these, added 2026-09-08:

| Field | Required | Why |
|---|---|---|
| `patientName` | when the patient is unknown centrally | see below |
| `patientAge` | when the patient is unknown centrally | see below |
| `patientContactNumber` | when the patient is unknown centrally | see below |
| `capturedAt` | should always be sent | ISO 8601 UTC, the local `captures.capturedAt` |

**Why the patient fields exist.** `cases.patientId` references a central patient record, but this file defines **no central patient-creation endpoint**, and this request originally carried no demographics. So nothing could ever create that record, and every case for a not-yet-known patient would fail. Rather than invent a second endpoint, the sync manager sends the demographics alongside the first case for a patient; the server registers them if absent and ignores them otherwise. `patientContactNumber` is not bookkeeping — `POST /api/v1/cases/:caseId/review` triggers the referral SMS to exactly this number, so a patient stored without one cannot be told their result.

**Why `capturedAt` is separate from `receivedAt`.** This system is offline-first: a capture can sit in a PHC's sync queue for days before it reaches the server. `receivedAt` is when the server got it; `capturedAt` is when the patient was actually photographed. The ophthalmologist queue shows `capturedAt`, because that is the clinical fact. Treating `receivedAt` as a stand-in silently misdates every case that synced late — which is the normal case in the rural deployment this is built for. If omitted, the server falls back to its own clock, which is wrong for any delayed sync.

Response `201`: `{ "caseId": "a1b2c3d4-...", "receivedAt": "2026-09-06T09:15:00.000Z" }`

A `201` means the case was **stored**, not that it was graded. **Since Task 8.3 grading is queued, so a case is always `"processing"` when the POST returns** — clients must poll `GET /api/v1/cases/:caseId/status` and must not treat the `201` as meaning a grade exists. If grading later fails, the case stays stored and its status becomes `"error"`.

Errors: `400 image_required`, `400 invalid_image_type`, `400 invalid_json` (malformed `questionnaireData`/`captureMetadata`), `404 patient_not_found` (unknown patient and no demographics supplied), `413 image_too_large` (limit 25 MB).

### `GET /api/v1/cases/:caseId/status`
Response `200`: `{ "caseId": "string", "status": "processing" | "graded" | "error" }`

`"processing"` covers both *waiting for a worker* and *being graded*. That is deliberate: from outside they are the same fact — the answer is not ready, keep polling — and a fourth enum value would expose an internal distinction no client can act on. Both `"graded"` and `"error"` are terminal; nothing leaves either state without a new submission.

### Chunked / resumable upload — `POST|GET /api/v1/cases/:captureRef/chunks…`  *(Task 8.2)*

For images too large to transfer in one request on a poor link. Small images should keep using `POST /api/v1/cases`; chunking a 400 KB file spends extra round trips to save nothing, and round trips are the costly part on these links. The PHC sync manager switches over above `SYNC_CHUNK_THRESHOLD_BYTES` (default 2 MB).

`:captureRef` is the **PHC's own capture id** (`PHC001-lz3k9f-a2x9`), not a central UUID and not a server-issued token. A client that crashes mid-upload re-derives the session key from its own database row, so no resume state has to survive the crash. It must match `^[A-Za-z0-9_-]{1,64}$`.

**`POST /api/v1/cases/:captureRef/chunks/init`** — body is `application/json`: the same case fields as `POST /api/v1/cases` (`patientId`, `capturedAt`, `questionnaireData`, …) plus `totalChunks`, `totalBytes`, `sha256` (hex SHA-256 of the **whole** image), `filename`.
Response `201`: `{ captureRef, totalChunks, received: [int], missing: [int], resumed: bool, alreadyIngested: bool }`.
Calling it again with identical parameters **resumes**: chunks already held are kept and reported in `received`. Calling it with different parameters discards the old chunks, because they belong to a different file.

**`GET /api/v1/cases/:captureRef/chunks`** — Response `200`: `{ captureRef, totalChunks, totalBytes, sha256, received, missing, complete, caseId, createdAt }`. This is the resume primitive: ask what the server has, send only `missing`. `404 session_not_found` if there is no session.

**`POST /api/v1/cases/:captureRef/chunks/:index`** — `multipart/form-data` with the bytes in a `chunk` field and the chunk's own hex SHA-256 in a `sha256` field (or the `X-Chunk-Sha256` header). Response `200`: `{ index, bytes, sha256, received, totalChunks, missing }`.
Re-sending a chunk the server already holds is a **success**, not a conflict — after a dropped connection a client cannot know whether its last chunk arrived.

**`POST /api/v1/cases/:captureRef/chunks/complete`** — assembles in index order, verifies length and the whole-file SHA-256, ingests, and queues grading.
Response `201`: `{ caseId, receivedAt, duplicate: false }` — the same shape as `POST /api/v1/cases`, so the two paths are interchangeable.
Response `200`: `{ caseId, receivedAt, duplicate: true }` when the session was already completed. **Completion is idempotent**: a client that never saw the first response gets the original `caseId` back rather than creating a second case for one scan.

Errors: `400 invalid_capture_ref`, `400 invalid_field`, `400 invalid_image_type`, `400 empty_chunk`, `404 session_not_found`, `409 already_ingested` (a chunk sent after completion), `409 incomplete_upload` (completing with chunks missing — the body lists which), `413 chunk_too_large`, `413 image_too_large`, `422 chunk_checksum_mismatch` (resend that chunk), `422 checksum_mismatch` (the assembled whole is wrong; the session is discarded, start again), `422 size_mismatch`.

**Why two levels of checksum.** Reassembling an image from pieces that crossed a flaky link creates a failure single-shot upload does not have: a file that is the right length, decodes as a valid JPEG, and is subtly wrong — which would then be graded and reported to a clinician with nothing to indicate a problem. Per-chunk hashes catch damage at the chunk instead of after the whole transfer; the whole-file hash catches a *set* of individually-valid chunks that assemble wrong (a stale chunk from an earlier attempt). Nothing is ingested that cannot be shown to be exactly what the PHC captured.

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

`uncertaintyScore` is `null` until MC-Dropout ships (Phase 6). Until then ranking uses `1 - confidenceScore` in its place — same ordering, different scale. That substitute is used for **ordering only** and is never reported as an uncertainty value.

**When Tier C exceeds 100 cases**, Tier B does not start at 101 — it starts after the last Tier C rank. Anchoring B at 101 while C had already reached, say, 150 would interleave the two and place Tier B cases above Tier C ones, inverting the safety ordering the tiers exist to enforce. The 1–100 / 101–200 bands are the expected shape at normal volume, not a cap.

`capturedAt` is the capture time reported by the PHC, not the time the server received the case.

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
Every ML-derived field (`lesionCounts`, `nvSuspicionScore`, `drGradeRuleEngine`, `branchAgreement`, `uncertaintyScore`, `lesionAttentionConsistencyScore`) is `null` until its backing module ships — the frontend renders "not yet available" for `null`, never crashes on it and never shows a zero/empty value as if it were a real result.

**`evidenceSummaryText` is the exception, since Task 7.3 shipped: it is always a non-empty string.** Lesion segmentation (Tasks 4.2/4.3) does not exist yet, so today it reads:

> "Lesion segmentation has not been run for this case, so no lesion-level evidence is available. The grade shown is from the image classifier alone and has not been cross-checked against ICDR lesion criteria."

That is deliberate and is not a placeholder. It never says "0 microaneurysms" — zero-measured and not-measured are different clinical claims, and a clinician reading this field needs to know which one they are looking at. The example above shows the shape once lesion counts exist. The text is templated from stored counts, never generated prose, and the criterion it names comes from the same rule engine that produced `drGradeRuleEngine`, not from a second copy of the ICDR rules.

**The key must be present and its value `null`.** Not absent, not `undefined`. This is not pedantry: `JSON.stringify` silently drops `undefined` values, so a handler that returns `undefined` emits a response with the key missing entirely. A missing `lesionCounts` renders as blank; a `0` reads as a measured finding of no lesions. On a clinical screen those are three different claims and only one of them is true. Server-side tests must assert key **presence** separately from value.

`drGradeCnn`, `confidenceScore` and `conformalTier` are likewise `null` for a case that has not been graded yet, or whose grading failed — a case with `status: "error"` must not be indistinguishable from a graded one.

`imageUrl` and `gradCamOverlayUrl` are paths under `/media`, or `null` when the file does not exist. `original.jpg` in the example is illustrative: the uploaded file's real extension is preserved, so a PNG upload is served as `original.png`. Naming a PNG `.jpg` would be a file whose extension lies about its contents. Both URLs are served by the central server as static files; a URL returned here is expected to resolve, so treat a 404 on one as a bug rather than an empty state.

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
Response `200`: `{ "reviewId": "string", "referralId": "string|null", "smsStatus": "string|null" }`

`referralId` is non-null when this decision raised a referral. `smsStatus` is deliberately a string rather than a boolean, because the interesting states are not "sent / not sent":

| `smsStatus` | meaning |
|---|---|
| `sent` | delivered to Twilio, `providerMessageId` recorded |
| `not_configured` | Twilio credentials absent — **nothing was sent** |
| `dry_run` | `SMS_DRY_RUN=1`; message composed and logged, not sent |
| `failed` | Twilio rejected it; the referral still stands |
| `not_referable` | grade < 2, so no referral and no message (design doc §8.1) |
| `already_sent` | this case was referred by an earlier review; not re-sent |
| `override_without_grade` | see `correctedGrade` below |
| `no_review_on_record` | refused — no human decision exists for this case |

**Optional request field `correctedGrade` (integer 0–4), added 2026-09-08.** On `"confirm"` the model's grade stands and referability follows from it. On `"override"` the ophthalmologist has said the model was wrong — but this contract has no field for *what the grade actually is*, so the system cannot tell whether the case is still referable. Without `correctedGrade` an override returns `override_without_grade` and **no SMS is sent**: telling a patient to seek care for a finding the reviewer may have just ruled out is worse than sending nothing, since the admin referral tracker still shows the case either way. Supply it whenever the decision is an override.

Errors: `400 invalid_field` (bad `decision`; a category supplied on a `confirm`; a category missing or invalid on an `override`), `404 case_not_found`.

An `"override"` also writes a `corrections` row in the same transaction — that pairing of "the model was wrong" with "and here is why" is the training signal the continual-learning loop consumes, so a review whose correction failed to record would be lost from retraining with nothing downstream noticing.

> **Gap, unresolved.** There is no endpoint to read a case's review history, but the design doc's Case Detail screen specifies a per-patient audit trail. Something like `GET /api/v1/cases/:caseId/reviews` is needed. It is deliberately **not** invented here — the frontend track should specify the shape it actually needs first, rather than the backend guessing and both sides building to different assumptions.

### `GET /api/v1/admin/dashboard`
`casesToday` and `casesPerPhc` are both scoped to **today in the district's local timezone** (`REPORT_TIMEZONE`, default `Asia/Kolkata`), not UTC. A UTC day boundary would roll over at 05:30 local time in India, counting each morning's first hours of screening against the previous day — wrong in a way nobody notices. The two figures always reconcile: `casesPerPhc` counts sum exactly to `casesToday`, and cases that arrived without a `phcId` appear as a bucket with `phcId: null` rather than being dropped.
`averageReviewTurnaroundSeconds` is `null` — not `0` — when nothing has been reviewed. A `0` would read as reviews completing instantly, which is the opposite of "no data".

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
Response `404`: `{ "error": "phc_not_found", "message": "..." }`

**Read `lastSyncAt` and `pendingCount` together — `pendingCount` alone is misleading.** The sync queue lives in that PHC's local SQLite; central has no view into it, so this is the number the PHC last *reported*, true only as of `lastSyncAt`. The site whose backlog is genuinely growing is exactly the offline one whose count is frozen at whatever it was when it last made contact. A PHC reporting `pendingCount: 0` with a three-day-old `lastSyncAt` is a far bigger problem than one reporting `40` from a minute ago. Any UI built on this must surface the staleness, not just the count. `lastSyncAt` is `null` and `pendingCount` is `0` for a site that has never synced.

---

## Error shape (applies to every endpoint above)
Any non-2xx response body is always: `{ "error": "snake_case_error_code", "message": "human-readable string" }` — never a bare string, never an HTML error page. Frontend error handling should read `.error` for logic and `.message` only for display.
