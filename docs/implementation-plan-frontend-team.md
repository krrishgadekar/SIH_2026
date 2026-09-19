# Frontend Implementation Plan — Parth, Vedant, Krrish
## NetraSetu, National Round — derived from system-design-v4.md

**Scope:** You own the entire frontend — both client applications: the desktop web app (`phc-local-app/frontend/`) and the Expo mobile app (`phc-local-app/mobile/`). This plan covers *functional* requirements only — what each screen must collect, call, and do. It does not prescribe colors, layout, spacing, or visual polish; those decisions belong to Krrish's own judgment as you build. Kankshi has a separate plan covering specific UI/UX bugs and polish items — where a task on her list overlaps a file you're also touching, coordinate directly rather than both editing it independently.

**The mobile app is a second implementation of the desktop app's spec (§4.4), not a new design.** Wherever this plan says "same as desktop," that's not a suggestion — it's the actual requirement in `system-design-v4.md`.

---

## 0. Already built — do not rebuild any of this

**Desktop:**
- Patient registration form (name, age, contact number).
- Capture screen's core flow (trigger, preview, retake/accept), talking to the real local backend for the quality gate.
- Capture Metadata form already has all 4 real fields: eye laterality (`CaptureMetadataForm.jsx:41-56`), camera device (`:62`), pupil dilation (`:78`), observed issues (`:91`). **Do not rebuild this form — it's correct and complete.**
- Local SQLite persistence, chunked/resumable sync.

**Mobile:**
- Navigation shell, theming, the `useCamera` hook, and the `AsyncStorage`-based persistence *pattern* (not the single-blob storage technology itself — see §5) are fine to keep.
- The `ScreeningSession` object with an explicit `syncStatus` field and a `useQueueActions()` hook exposing `pendingItems`/`processedItems`/`syncedItems` as derived views (`hooks/useQueue.ts`) — this is a genuinely good abstraction, cleaner than the desktop's own queue-reading pattern. Keep it; consider it worth eventually porting *to* desktop, not just kept on mobile.
- The patient symptom questionnaire's field coverage — mobile currently collects diabetesDuration, glycemicControl, bloodPressure, pregnancy, and 4 symptom checkboxes. This is *more complete* than the desktop app's current 3-field version. Don't strip anything out; desktop needs to catch up to mobile here, not the reverse (§2 below).

---

## 1. Desktop — Remove the ngrok Shortcut

`CaptureScreen.jsx` currently imports `ML_API_ENDPOINT` (`:8`) and calls it directly (`:100`) for an on-screen "AI Severity Prediction," pointed at `https://unpadded-slick-pushiness.ngrok-free.dev/predict`. This must be removed entirely — no severity or diagnostic output is shown on this screen before central grading has happened (§1.3). The screen's only job after this change: get a usable image to the real local Quality-Gate Engine (`api/localApiClient.js`, which is already correctly wired — `CaptureScreen.jsx:74`). Delete the `ML_API_ENDPOINT` import and the fetch call; delete the on-screen prediction display element entirely.

---

## 2. Desktop — Complete the Patient Symptom Questionnaire (§9.1)

`PatientQuestionnaireForm.jsx:6-10` currently only has state for `knownDiabetic`, `yearsSinceDiagnosis`, `bloodPressure`. Add the missing fields, matching the field set §9.1 defines (and matching what mobile's `QuestionnaireScreen.tsx` already collects, as a working reference for the field shapes): `glycemicControl` (good/moderate/poor), `pregnancy` (conditional — only shown/asked when relevant), and four symptom toggles: `blurredVision`, `floaters`, `suddenVisionChange`, `eyePain`. No free text, no skip button (§9.1 explicitly disallows a skip option on either front-end — see §3 for the corresponding mobile fix).

---

## 3. Mobile — Remove the "Skip" Button

`QuestionnaireScreen.tsx:171-178` has a "SKIP — GO DIRECTLY TO ANALYSIS" button that calls the same continue handler with an empty/partial questionnaire. Remove this control entirely. §9.1 is explicit: no skip option on either front-end, because a nudge signal that can always be skipped stops being a reliable signal. This is a design requirement, not a preference — the questionnaire must be completed before the capture can proceed.

---

## 4. Mobile — Rebuild the API Layer Against the Real Backend

This is the largest single task in this plan. Confirmed current state: **zero code paths in the mobile app reach the real central backend.** `src/api/client.ts:441` posts to `${API_BASE_URL}${UPLOAD_ENDPOINT}` = the same ngrok endpoint as the desktop shortcut, using a single-field multipart body matching a FastAPI contract that has nothing to do with `api-contracts.md`.

1. Rewrite `src/api/client.ts` and `src/api/endpoints.ts` to call the real endpoints from `system-design-v4.md` §5.6: `POST /api/v1/auth/login`, `POST /api/v1/cases`, `POST /api/v1/cases/summary`, `POST /api/v1/cases/{case_id}/chunks`, `GET /api/v1/cases/{case_id}/status`, `GET /api/v1/patients/search`. Match the request/response shapes in `api-contracts.md`, not `types/screening.ts`'s current FastAPI-shaped fields.
2. **`types/screening.ts` needs a full rewrite of its field names**, not adjustment. Every field currently in there — `severity.code`, `referableDR.isReferable`, `confidence.mcDropoutPasses`, etc. — is specific to the abandoned external service and doesn't match `grading_results`/case-detail response shapes at all. Rebuild these types from `api-contracts.md` directly.
3. `client.ts:208-335` is a full second, commented-out copy of `uploadImageForScreening`, superseded by the working version at `:336-617`. Delete the dead copy while you're in this file — don't let a future edit accidentally uncomment and reintroduce it.
4. **Four screens read `ScreeningResult` fields directly and need updating for the new types**: `ResultScreen.tsx`, `ExplainabilityScreen.tsx`, `ReportScreen.tsx`, `QualityResultScreen.tsx`. These aren't just import-path changes — the actual field names they read will change.

---

## 5. Mobile — Remove the Silent Fake-Success-on-Failure Fallback

**Read this section even if you read nothing else in this plan.** Confirmed current state: on *any* failure — network error, non-2xx response, timeout — `client.ts:588-616` falls back to mock data and returns a normal-looking success. This is not a missing feature; it's actively dangerous. A technician using this app today cannot tell a real result from a fabricated one, and neither can a patient told the outcome.

Remove this fallback entirely. On any failure, the app must either (a) surface a visible error to the technician, or (b) genuinely queue the attempt for retry (consistent with the sync-queue behavior elsewhere in the app) — never silently substitute a plausible-looking result (§1.22 states this as a system-wide rule, not a one-off fix). This is not optional and should be the first change made to this file, before any of the rewrite work in §4.

---

## 6. Mobile — Local Persistence: Replace the Single Blob

Confirmed current state: the entire queue is one `AsyncStorage` blob under a single key (`@retina_saarthi_queue`), written whole on every change (`context/QueueContext.tsx:96`). This works at a handful of items and becomes slow and fragile exactly when it matters most — during an extended outage with dozens or hundreds of cases queued (§10.1, §4.4).

Replace with `expo-sqlite`, giving per-record queries and safe partial writes, matching the desktop app's SQLite schema shape (§4.3): `patients`, `captures`, `questionnaire_responses`, `capture_metadata_responses`, `sync_queue` tables — not necessarily identical column-for-column to the desktop's SQLite file, but the same *guarantees*: durable per-record storage, queryable by urgency tier and age for sync prioritization, and genuine support for a storage-pressure warning.

**Keep the `ScreeningSession`/`syncStatus`/derived-views abstraction pattern** (§0) — you're changing the storage backend underneath it, not the shape the rest of the app interacts with.

---

## 7. Mobile — ID Generation

Confirmed current state: mobile generates capture IDs as `` `RS-${Date.now()}-${randomSuffix}` `` (`utils/dateHelpers.ts:48`) — an incompatible format, and generates **no patient ID at all**; `PatientInfo` just has a free-text `referenceId` the user types in.

You need the exact same ID format the desktop app uses (§10.6): `{PHC_CODE}-{base36 timestamp}-{4-char random}`, for **both** patient IDs and capture IDs — mobile currently has neither in the correct format. Saad will publish the exact spec (his backend plan, §N) rather than you reverse-engineering `ids.js` — wait for that, or ask him directly if you reach this task first. The two things you'll need to replace when porting the logic: `crypto.randomBytes()` → `expo-crypto`'s equivalent, and `process.env.PHC_CODE` → an `EXPO_PUBLIC_PHC_CODE` env var or an app-configuration value.

Add real patient-ID generation to `PatientRegistrationScreen.tsx` (currently absent) — a patient record needs a real generated ID, not a user-typed reference string.

---

## 8. Mobile — Capture Metadata Questionnaire (New Screen)

Confirmed current state: this questionnaire does not exist on mobile at all — no field for camera device, pupil dilation, lighting, observed issues, or worker usability anywhere in `types/screening.ts` or any screen.

Build it, matching §9.6 exactly (same fields as the desktop's already-correct `CaptureMetadataForm.jsx` — use that as your reference for field shapes and options, not a UI reference): camera device model (tap: fixed device list), pupil status (dilated/non-dilated/unknown), lighting environment (indoor clinic/outdoor mobile/low light), observed-issues checklist (glare, patient blinked or moved, out of focus, possible media opacity, eyelash-eyelid obstruction, none noticed — multi-select), worker's overall usability rating (clear/not sure/clearly unusable). Its "camera device" field records which dedicated fundus camera produced the source image being imported — same meaning as on desktop, even though mobile's capture method is gallery import (§1.21), not live capture.

---

## 9. Mobile — Required Fields Currently Missing

1. **Contact number.** `PatientInfo` currently has no contact-number field, only an optional free-text reference. The central schema requires `contact_number NOT NULL`. Add it as a required field on the registration screen.
2. **Eye laterality.** Confirmed absent — no field in `PatientInfo`, `QuestionnaireData`, or `ScreeningSession`, and no UI control anywhere. Add a left/right selector to the capture flow (§10.4) — every capture must be tagged.
3. **Consent.** Confirmed absent (and it's also absent on desktop — see §10). Add a verbal-consent confirmation checkbox to the registration screen, timestamped on check (§9.7).

---

## 10. Desktop — Add Consent Capture

Also confirmed absent on desktop. Add the same verbal-consent confirmation control to `PatientRegistrationForm.jsx` that mobile is getting in §9 — a checkbox the technician checks confirming verbal consent was obtained, timestamped when checked, sent to the backend as `consentGivenAt` (Saad's backend plan accepts and stores this field — see his §M).

---

## 11. Mobile — Local Quality Gate (Coordinate With Backend)

Confirmed current state: there is no local quality gate on mobile at all — quality assessment is bundled into the same remote `/predict` call that returns the DR grade (`types/screening.ts:37-42`, `client.ts:75-88` remaps the FastAPI vocabulary after the fact). This violates the core edge/cloud split (§1.2): quality gating must happen locally, instantly, before the questionnaires — not as a side effect of a remote grading call.

The actual quality-heuristic math needs to be ported from the desktop's existing JS-only fallback tier (`qualityGateFallback.js`) — but this file's only real dependency, `sharp` (a native libvips addon), has no Expo/Hermes equivalent and no polyfill path. This is a genuine rewrite of the pixel-math against `expo-image-manipulator` (or a WASM image library if that proves easier), not an adapter shim around the existing file. Get the exact heuristic formulas (focus/blur, illumination, contrast, FOV, glare, etc.) from Saad or from reading `qualityGateFallback.js` directly as a reference for *what to compute*, even though you can't reuse its code as-is. Build this as a new module inside the mobile app, called on the gallery-imported image before the questionnaires are shown.

---

## 12. Both Apps — Review Claiming and Mandatory Disagreement Resolution

These affect the Ophthalmologist Interface (central system, not the PHC apps) — confirm with the team who's building the central web frontend if that's a separate codebase from `phc-local-app/frontend/`. If it's in your scope:

1. **Claiming (§10.8):** opening a case in Case Detail should call `POST /api/v1/cases/{case_id}/claim` (Saad's new endpoint, §B.2 of his plan). If it returns 409, show who currently holds the case and disable the decision controls rather than letting the reviewer proceed as if they hold it.
2. **Mandatory resolution on disagreement (§10.9):** when `branch_agreement === false`, the "Confirm" button must not be present or must not be clickable — the only path forward is selecting an explicit grade via "Override." Don't implement this as a warning dialog on top of an otherwise-available Confirm button; the action itself must be unavailable.

---

## 13. Sync Status Semantics (Both Apps)

On mobile, "synced" currently means "the ngrok call returned a 2xx," not "the central backend accepted this case." Once §4's rewrite lands, make sure the sync-status field genuinely reflects central acceptance — check the real response from `POST /api/v1/cases`, not just that the HTTP request didn't error. This should already be closer to correct on desktop; verify it there too rather than assuming.

---

## 14. Ophthalmologist Interface — Review History Is Missing, Confirmed a Real Bug

Confirmed by direct component inspection, not a guess: `DecisionControls.jsx` and `CaseDetailPage.jsx` never check whether a case has already been reviewed. `DecisionControls.jsx`'s state always initializes blank regardless of the case data — reopening an already-decided case shows a fresh, empty confirm/override form with no indication a decision was ever recorded. Separately, the override reason and category *are* correctly captured and sent on submission (`DecisionControls.jsx:53-66`), but nothing anywhere displays them back — the post-submit screen shows only a generic "CLINICAL DECISION AUDITED & SIGNED" message with a hardcoded reviewer name and an elapsed-time readout, no reference to what was actually decided.

This is a real functional gap, not cosmetic: a system that markets itself on audit logging currently has no UI path to see the audit it claims to keep.

1. On Case Detail load, call `GET /api/v1/cases/{case_id}/reviews` (Saad's plan, §B.3) and check whether a prior review exists. If one does, render it (decision, reason category, reason text, reviewer, timestamp) and either disable the confirm/override form entirely or make clear that submitting again is a correction to an existing decision, not a first one — this is a real design decision to make with the team, not something to guess at silently.
2. On a new submission, the success confirmation should reflect what was actually submitted (the corrected grade, the reason category chosen) rather than a fully generic message — at minimum, don't display a hardcoded reviewer name; use the authenticated reviewer's real identity once §12/Saad's auth work lands.

## 15. Ophthalmologist Interface — Search and Filtering Are Already Real, Don't Rebuild

Confirmed: `ReviewQueuePage.jsx` already has working tier/disagreement filtering, a PHC-name dropdown, a grade filter, free-text search across patient name/reference/PHC name, and sortability by tier — all genuinely applied, not declared-but-unused. If this reads as missing or hard to find in practice, that's very likely a discoverability/visual issue (worth flagging to Kankshi to make more prominent), not a missing feature — confirm which it is before anyone spends time rebuilding search that already works.

---

## Summary — What Blocks What

| This task | Needs, from someone else | Can you start without it? |
|---|---|---|
| §6 mobile SQLite | Nothing external | Yes, start anytime |
| §7 mobile ID generation | Saad's published ID-format spec | Can start the Expo-crypto/env plumbing now; needs his exact spec to finish |
| §9.3 / §10 consent | Saad accepting `consentGivenAt` field | Build the UI now; backend write path lands independently |
| §12 claiming / disagreement | Saad's `POST /claim` endpoint | Build the UI logic against the documented contract now; wire the real call once his endpoint exists |
| §5 remove fake-success | Nothing — do this first, before anything else in §4 |
