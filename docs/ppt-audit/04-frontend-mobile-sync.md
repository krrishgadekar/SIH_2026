# 04 — Front-ends, mobile app, PHC↔phone sync: verified inventory

**For:** NetraSetu national-round PPT (SIH 2026, PS 26038).
**Audited:** 2026-09-25 against the working tree of `SIH_2026/` (HEAD `7dcf3b1` plus the uncommitted changes `git status` lists: mobile rebuild, peer sync, local auth).
**Method:** I read the source for every screen and every endpoint it calls, queried the live central Postgres and PHC SQLite read-only, and ran the three test suites that use throwaway databases. I did not open any UI in a browser or on a phone, so "renders X" means the code renders X. All paths are relative to `SIH_2026/`.

### Tags

| Tag | Meaning |
|---|---|
| **CODE-VERIFIED** | Found in code, and wired end to end to a real backend or data source. |
| **MOCK** | The UI exists, but the data it shows is hardcoded, or it falls back to hardcoded data in the current configuration. |
| **DOC-ONLY** | Claimed in a doc (changelog, protocol doc or v4) and not found in code, or not re-verified by me. |
| **BEYOND-V4** | Exists in code but not in `docs/system-design-v4.md`. |
| **V4-MISSING** | Specified in v4 but missing from the code, or only partly there. |

### Live-data snapshot, used for every "today" number below

- **Central Postgres** at 2026-09-25 13:09:50 +05:30: `cases` 41, `grading_results` 40 (tier B=32, C=8, **A=0**), `ophthalmologist_reviews` 17 (confirm 10, override 7), `referrals` 16 (all `referred`), `resource_recommendations` **0**, `phc_sites` 1 (PHC Kharadi), `system_alerts` 1 (`seg_worker_down`), `users` 2. Earlier in the session the counts were 36 cases and 35 grading results. The newest case arrived at 13:06:09, so the central backend is live and still receiving cases. Quote these counts as a snapshot.
- **Pending cases in the real review queue** (distinct, tier B/C, not yet reviewed): **24**. Of the 40 graded cases, 7 have `branch_agreement = false` and 31 have `null`.
- **PHC local SQLite** (`phc-local-app/backend/db/local.sqlite`): patients 42, captures 42 (pass 25, borderline 11, retake 6), sync_queue 36 (all `synced`), questionnaire_responses 14, capture_metadata_responses 14. The `peer_devices` table **does not exist yet** in the live file: the PHC backend has not been restarted since the peer-sync code was added, so no phone has been paired on this machine.
- **Services:** central `:5000/health` → `{"status":"ok"}`. The PHC local backend on `:4000` was **not running**.

---

## 0. Read this before building slides

1. **Both web front-ends run in MOCK mode by default.** `central-system/frontend/src/config.js:1-3` and `phc-local-app/frontend/src/config.js:1-3` set `USE_MOCK_DATA = true` unless `VITE_USE_MOCK_DATA` is the string `false`. Neither frontend folder has a `.env`, and neither `vite.config.js` sets `envDir`, so a plain `npm run dev` gives the mock demo. To show real data, start them with `VITE_USE_MOCK_DATA=false`.
2. **Even in real mode, most web calls fall back to mock data on any error, and nothing on screen says so.** On the central side that covers the queue (including an *empty* queue), case detail, claim, reviews, submit review, system health, resource recommendations and Simulink validation (`central-system/frontend/src/api/centralApiClient.js`). On the PHC desktop it covers patients, registration, queue and sync status (`phc-local-app/frontend/src/api/localApiClient.js`). This contradicts v4 §1.22 and §11. **The mobile app has no mock mode** (`mobile/netrasetu/config/index.ts:10-12`).
3. **Numbers on screen that must never go on a slide as results:** Dashboard "MODEL ACCURACY 94.6%" (`mockData.js:227`), "AVG. CONFIDENCE 92.4%", "IMAGES REJECTED 38", "TOTAL PROCESSED 1,284", the whole grade-distribution donut, the Simulink "AGREE" table (71.0 vs 68.4 and so on), and "Reviewer pool 72% utilised". All of these are hardcoded in `central-system/frontend/src/api/mockData.js`.
4. **The last step of PHC desktop capture is broken at HEAD.** `CaptureScreen.jsx:201` and `:213` reference `questionnaire`, which is never declared in that file (the questionnaire moved to registration in commit `6cae4fc`). So "SAVE & SYNC TO SERVER →" throws a ReferenceError, shows `alert('Failed to save capture data')` and never navigates. I verified this by reading the code, not in a browser. The image still reaches central, because it was already queued for sync when it passed the quality gate. It arrives without a questionnaire and without capture metadata.
5. **The mobile app is the most complete and most honest front-end.** It has real quality-gate scores, best-effort handling after 3 retakes, duplicate check, fuzzy search, required metadata, summary-first sync, a result pull-back and no mock fallbacks. It **has never been run on a physical device** (changelog 1.4: "not run on a device (no Android SDK here)"). What was verified is the type-check, the Android bundle and the Node test harness.
6. **The fundus-lens capture is BEYOND-V4, and v4 explicitly rejects it for this round** (§1.21, and §16 "Explicitly rejected: a phone-camera or phone-plus-lens live-capture path"). If it goes on a slide, either update v4 or present it as a prototype.
7. **Every case in the system goes through review, because Tier A cannot occur from any front-end.** The only camera validated for auto-clear is `topcon_trc_nw400` (`central-system/backend/config/validatedCameras.json`, marked "DEMO SEED -- NOT A REAL VALIDATION"). None of the front-end camera dropdowns offer it, and the live DB has 0 Tier A cases.
8. **Central login is fake.** Any username with a password of 4 or more characters logs in (`central-system/frontend/src/components/screens/LoginScreen.jsx:71-74, 95-98`), and `AUTH_ENABLED` is off. The backend has real bcrypt/JWT auth (`routes/auth.js`), but the web app never calls it.
9. **Delete the stale code before judges browse the repo.** `phc-local-app/mobile/src/` is the old app: not imported anywhere, and still containing ngrok references in `src/api/client.ts` and `src/config/api.ts`. `phc-local-app/frontend/src/config.js:6` still exports the ngrok `ML_API_ENDPOINT` (unused in source). The committed `phc-local-app/frontend/dist/` bundle (built 2026-09-10) still contains the ngrok URL.

---

## 1. Every screen and route

### 1.1 Central frontend (`central-system/frontend`, React + Vite, routes in `src/App.jsx`)

Routing is guarded only by `localStorage['netra_user_role']`, set by the login screen. There is no server session.

| Route | Screen and file | What it shows | Key interactions | Data source | Tags |
|---|---|---|---|---|---|
| `/` | Login, `components/screens/LoginScreen.jsx` | Two role cards (OPHTHALMOLOGIST, DISTRICT ADMIN) and a username/password card | Role pick, then submit. Accepts `admin/admin123`, `doctor/doctor123`, **or any password of 4+ characters**. The card stats "6 cases pending" and "42 cases today" are hardcoded. | None. `/api/v1/auth/login` exists (`backend/routes/auth.js:92`) and is never called. | **MOCK**; **V4-MISSING** (§5.1, §11.1 real login) |
| (all pages) | Header, `components/layout/CentralHeader.jsx` | Logo, a ticking "console" line, role nav, language select, SETTINGS/profile, logout | Profile edit and password change only show a toast (`:65-82`). The console strings are hardcoded, e.g. `'SYNC STATUS: ALL NODES CONNECTED'` and `'ML PIPELINE v4.2 CONNECTED'` (`:15-30`). The profile defaults to "Dr. Krrish Gadekar" (`App.jsx:52-64`). | Hardcoded | **MOCK** |
| `/ophth/queue` | Review queue, `ReviewQueuePage.jsx` | Table with columns #, CAPTURED (relative time + NEW badge), PATIENT REF, PHC, TIER, SEVERITY, CNN GRADE, RULE ENGINE, AGREEMENT, CONFIDENCE bar, URGENCY *, plus the urgency caveat footnote | Search, filters and sort (§2g), a 5 s poll, and an "i" guidance modal. Clicking a row opens the case. | `GET /api/v1/ophthalmologist/queue` (real; mock fallback on error or empty) | **CODE-VERIFIED** in real mode; see §2 for gaps |
| `/ophth/case/:caseId` | Case detail, `CaseDetailPage.jsx` + `GradCamOverlay.jsx`, `BranchComparisonPanel.jsx`, `LesionEvidencePanel.jsx`, `DecisionControls.jsx`, `CaseHistoryTimeline.jsx` | Top bar (case ID, severity badge, mismatch badge), fundus image with a Grad-CAM toggle, CONFIDENCE / UNCERTAINTY / LESION-ATTENTION CONSISTENCY bars, CNN vs rule-engine panel, four lesion counts, NV suspicion score, AI evidence summary, a patient/capture context grid, decision controls, and the patient history timeline | Claim on open, Grad-CAM toggle, confirm/override, keyboard shortcuts, history toggle with diff view | `GET /api/v1/cases/:id`, `POST …/claim`, `GET …/reviews`, `POST …/review` (all real, each with a mock fallback) | **CODE-VERIFIED** with defects, see §2. The context grid shows **"Krrish" / "20 YEARS"** for every real case, because the real detail response has no `patientName`/`patientAge` (`CaseDetailPage.jsx:200, 206`; `backend/services/ingestionService.js:540-652`) → **MOCK** leak |
| `/admin/dashboard` | `DashboardPage.jsx` | 8 stat tiles, weekly trend line, cases-by-PHC bar, DR-grade donut and table | 3-state sort on the grade table | **Always** `mockAdminDashboard`: `getAdminDashboard()` never calls the network (`centralApiClient.js:223-226`) | **MOCK** |
| `/admin/referrals` | `ReferralTrackerPage.jsx` | Referral rows, status pipeline counts, SMS-failed "manual follow-up" highlight, lost-to-follow-up rows first | Search; PHC, grade and status filters; an "advance status" button | GET is real (`/api/v1/admin/referrals`, no fallback). **Updates are MOCK**: `updateReferral()` only edits the in-memory mock array (`centralApiClient.js:247-259`), although `PATCH /api/v1/referrals/:id` exists | GET **CODE-VERIFIED**; write **MOCK**; see §6 |
| `/admin/phc-health` | `PhcHealthPage.jsx` | Consolidated system-health alert banner, 4 check tiles (silent PHCs, stuck jobs, MATLAB session, unreviewed over 48 h), PHC sync table | Status filter chips, 3-state sort | Health: `GET /api/v1/admin/system-health` (real, mock fallback). PHC table: **always mock** (`getPhcSyncStatuses`, `centralApiClient.js:261-264`) | Mixed, see §6 |
| `/admin/resources` | `ResourceRecommendationsPanel.jsx` | Bottleneck banner and recommendation text, 4 staffing tiles, "modelled vs observed" inputs, Simulink SimEvents co-validation table | RUN ON-DEMAND SIMULATION, RE-RUN SIMULINK VALIDATION | Real endpoints with mock fallback. **Today both fall back to mock**: 0 recommendation rows, no validation file. | **MOCK** today; **BEYOND-V4** for the validation card |
| — | `FieldOpsPage.jsx` ("PHC OVERSIGHT") | — | — | Not routed; uses its own `mockPhcData` | Dead code |

### 1.2 PHC desktop app (`phc-local-app/frontend`, React + Vite, routes in `src/App.jsx`)

| Route | Screen and file | What it shows | Key interactions | Data source | Tags |
|---|---|---|---|---|---|
| `/` | Login, `LoginScreen.jsx` | Technician auth card; password pre-filled `tech123` (`:13`) | Real mode: `POST /auth/login` on the local backend, and the bearer token is stored and sent on every call (`localApiClient.js:19-51`). Mock mode: `krrish` or `technician` / `tech123`, or any password of 4+ characters (`:52-54`). | Real in real mode. `LOCAL_AUTH_ENABLED` defaults to false (changelog 5.3; `services/localAuth.js`). | **CODE-VERIFIED** (real mode; changelog 5.4: "real mode not exercised") |
| (all pages) | Header, `layout/Header.jsx` + `shared/LanguageSelector.jsx` | Online/offline dot and pending count; 7-language select; nav (Register, Queue) | 10 s poll | `GET /sync/status` (real). On failure it falls back to **mock `{online:true, pendingCount:2}`** (`localApiClient.js:274-291`, `mockData.js:154-158`), so the header shows ONLINE while the backend is down. | **CODE-VERIFIED**, with a **MOCK** fallback that violates v4 §1.22 |
| `/register` | `PatientRegistrationForm.jsx` | 01 Patient info (type, ABHA, visit no., title, names, gender, DOB→age, marital status, blood group), 02 Address (address, state, pincode, district, occupation, contact, alt phone), 03 questionnaire (known diabetic, years since Dx, glycemic control, BP incl. "Low", pregnancy if age < 55, 4 symptoms), verbal consent checkbox "DPDP ACT SEC 9.7" | CLEAR ALL; INITIATE CAPTURE → `/capture?patientId=…` | `POST /patients` (real). **The backend stores only name, age, contact and consentGivenAt** (`backend/routes/patients.js:45-101`); the questionnaire and demographics are dropped. On failure it invents `PHC001-XXXXXX-NEW1` (`localApiClient.js:101-109`). The form is **pre-filled with a demo patient**, "Mrs Sunita K. Devi" (`:73-107`). | **CODE-VERIFIED** (UI + POST); **V4-MISSING**: no duplicate check is called although `GET /patients/search` exists (`routes/patients.js:113`); no HbA1c field |
| `/capture` | `CaptureScreen.jsx` + `QualityResultPanel.jsx`, `CaptureMetadataForm.jsx`, `RetinalImageViewer.jsx` | Stepper: 1 CAPTURE → 2 QUALITY GATE → 3 METADATA & SYNC | Step 1: pick a JPG/PNG file, or "LOAD SAMPLE RETINAL SCAN". Step 2: RUN QUALITY CHECK → `POST /captures`, then RETAKE, ACCEPT, or (on fail) "OVERRIDE QUALITY GATE & PROCEED ANYWAY". Step 3: eye, camera, pupil-dilation toggle and issue chips, then SAVE & SYNC. | Verdict: real. **Displayed scores: MOCK.** The backend returns no sub-scores (`captureHandler.js:252-259`), so the panel always shows 94/88/86/98 % with "CONTRAST = lowest" (`QualityResultPanel.jsx:11-67`). With the backend down, a scenario from `mockAiPredictions` is shown as a real verdict. | Mixed. **SAVE & SYNC is broken** (§0.4). Metadata payload hardcodes `lightingEnvironment:'indoor_clinic'` and `workerUsabilityRating:'clear'`, and drops all 4 chip values, which match no contract enum, so it always sends `['none_noticed']`. It **omits `eyeLaterality`** (`CaptureScreen.jsx:183-192`). The quality check runs before the camera is chosen, so the preset is always `unknown`/default. |
| `/queue` | `LocalQueueTable.jsx` + `DiagnosticResultModal.jsx` | Captures with a 5-stage pipeline indicator | VIEW RESULT (enabled only for `result_delivered`) | `GET /captures` (real) returns only `captured` / `quality_passed` / `synced` (`routes/captures.js:355-363`), so VIEW RESULT is **never reachable in real mode**. In mock mode the modal shows a hardcoded "MILD NPDR" with confidence 0.924 (`LocalQueueTable.jsx:220`, `mockData.js:12-60`). | Queue **CODE-VERIFIED**; result modal **MOCK**; **V4-MISSING** (§4.1 Result-Pending/Delivered on desktop) |

### 1.3 Mobile app (`phc-local-app/mobile`, Expo SDK 57 / RN 0.86; `App.tsx` → `netrasetu/Root.tsx`)

The navigator is in `netrasetu/navigation/AppNavigator.tsx`. Logged-out stack: Login, Pairing. Logged-in stack: Main (bottom tabs Register and Queue), Capture, LensCamera (full-screen modal), CaseReport (modal), Settings, Pairing. Every screen reads its own SQLite (`netrasetu/db/*`). Network traffic goes only to central and the paired PHC PC.

| Screen | File | What it shows | Key interactions | Backend | Tags |
|---|---|---|---|---|---|
| Login | `screens/LoginScreen.tsx`, `auth/AuthContext.tsx` | Technician auth card | If paired and the PC is reachable: login over the sealed `/peer/login`, then an offline PBKDF2 verifier is cached. If the PC is unreachable: verify against that cache. Dev builds that are not paired accept `EXPO_PUBLIC_TECHNICIANS` or the demo `technician/tech123` (`AuthContext.tsx:9-15, 89-120`). | PHC PC `/peer/login` | **CODE-VERIFIED** (`test:peer` #2, #4, run today); offline verifier **BEYOND-V4** |
| Pairing | `screens/PairingScreen.tsx`, `peer/pairing.ts` | Link status; QR scanner (expo-camera barcode) or a paste box | Scan the QR printed by `npm run peer -- pair "<name>"`; a sealed `/peer/hello` must succeed before the pairing is kept | PHC PC `/peer/hello` | **CODE-VERIFIED**; **BEYOND-V4** |
| Register (tab) | `screens/RegistrationScreen.tsx`, `db/patients.ts`, `lib/fuzzy.ts` | The same 4 sections as desktop. Starts empty. BP limited to the 3 contract values. Optional HbA1c (4–20 %). | "Find existing patient" search; automatic fuzzy duplicate check (Levenshtein on the name, last 10 digits of the phone, age) before an ID is minted; a confirmed match re-uses the ID (REVISIT banner). Every questionnaire item is required. Contact must be a valid 10-digit number. Consent is required and timestamped. | Local SQLite only | **CODE-VERIFIED**; meets v4 §10.3 / §9.1 / §9.7 |
| Capture | `screens/CaptureScreen.tsx` | Stepper 1 CAPTURE → 2 QUALITY GATE → 3 METADATA & SYNC | IMPORT FROM GALLERY, CAPTURE WITH FUNDUS LENS, LOAD SAMPLE; run the on-device check; retake, accept or best effort; required metadata; SAVE & SYNC | On-device gate; local SQLite; triggers sync | **CODE-VERIFIED** (see §3) |
| LensCamera | `screens/LensCameraScreen.tsx` | Full-screen back camera with pupil-guide overlay | Torch toggle (on by default), zoom ±5 %, tap to refocus, shutter, review (RETAKE / USE THIS IMAGE) | None (device camera) | **CODE-VERIFIED** as code, **never run on a device** (changelog 1.4); **BEYOND-V4, contradicts v4 §1.21 / §16** |
| Queue (tab) | `screens/QueueScreen.tsx`, `components/StageIndicator.tsx` | One card per capture: ID, patient, time, 5-dot stage, action; storage-pressure notice; SYNC NOW | Tap to open the report; RETRY on rejected uploads | Local SQLite, updated from central status polling | **CODE-VERIFIED** |
| CaseReport | `screens/CaseReportScreen.tsx` | Local quality report (always available); central report when online: CNN and rule-engine grades, tier text + tier reason, ophthalmologist confirmation line, Grad-CAM, failure code if grading failed | SHARE CLINICAL SLIP (expo-print → PDF → share sheet) | `GET /api/v1/phc/cases/:captureRef/report` and `…/gradcam` (`central-system/backend/routes/phc.js:86, 145`) | **CODE-VERIFIED**; the endpoints and the slip are **BEYOND-V4** (not in v4 §5.6) |
| Settings | `screens/SettingsScreen.tsx` | Central URL, PHC API key (stored in the OS keystore), site code, PHC name | TEST CONNECTION, RESET, SAVE | Central `/health` | **CODE-VERIFIED** |
| Header / menu | `components/AppHeader.tsx` | Status line built from real sync state (`OFFLINE · n CASE(S) SAVED ON DEVICE`, `CENTRAL SERVER UNREACHABLE · RETRYING`), sync chip, menu sheet (connection, PC link, last syncs, language grid, high-contrast toggle, SYNC NOW, PHC PC LINK, EXPORT BUNDLE, IMPORT BUNDLE, logout) | — | — | **CODE-VERIFIED**; high-contrast and bundles **BEYOND-V4** |

Legacy tree: `phc-local-app/mobile/src/` (HomeScreen, HistoryScreen, ProcessingScreen, ResultScreen and others) is **not imported** by `App.tsx`. It is dead code and still contains `mockData.ts` and ngrok references.

---

## 2. Ophthalmologist portal specifics

### a. Severity badge logic — CODE-VERIFIED
- `ReviewQueuePage.jsx:37-51` and `CaseDetailPage.jsx:30-44` use **Branch A's `drGradeCnn` only**: grade 0 → `LOW` (green), 1–2 → `MID` (amber), 3–4 → `HIGH` (red), anything else → `UNKNOWN`. It ignores the rule-engine grade. Grade 2 is referable under v4 §5.5 but shows as MID.
- Confidence bar (`ReviewQueuePage.jsx:95-106`): below 70 % red, below 85 % amber, otherwise green. Case-detail bar thresholds: above 0.85 green, above 0.7 amber (`CaseDetailPage.jsx:170`). Lesion-attention consistency bar: above 0.6 green (`:180`).
- Row styling: a crimson left border when `branchAgreement === false`, and a green tint plus a pulsing `NEW` badge for 5 minutes after capture (`:112, 468-490`).
- NV suspicion badge (`LesionEvidencePanel.jsx`): above 0.5 HIGH, above 0.3 MODERATE, otherwise LOW; "NOT YET AVAILABLE" when null.

### b. Confirm / override flow — CODE-VERIFIED, with defects
1. Opening a case calls `getCaseDetail`, `claimCase` and `getReviews` in parallel, and the timer starts (`CaseDetailPage.jsx:59-74`).
2. CONFIRM ("AI Grade N is correct") is **disabled when `branchAgreement === false`** (`DecisionControls.jsx:125`), in line with v4 §10.9. OVERRIDE opens a reason select with 4 categories (`artifact_misread`, `lesion_missed`, `wrong_severity`, `image_quality_issue`), a corrected-grade select (0–4) and optional notes.
3. The submit button needs a reason category for an override. **It does not need a corrected grade** (`:219`).
4. Submit posts `{decision, overrideReasonCategory, overrideReasonText, correctedGrade, reviewDurationSeconds, ophthalmologistId:'OPHTH-001'}`. Then a success overlay appears and the page redirects to the queue after 1.5 s.
5. The backend enforces §10.9: on a disagreement case, a `confirm` or an override without an integer `correctedGrade` gets **400 `explicit_grade_required`** (`backend/routes/cases.js:370-382`). Overrides also write a `corrections` row in the same transaction (`:400-410`).
6. **Defect: a failure looks like a success.** `submitReview` catches any error, including that 400, and returns a fabricated `reviewId` (`centralApiClient.js:215-219`). The UI then shows "✓ CLINICAL DECISION AUDITED & SIGNED" for a review the backend rejected.
7. **Defect: the claim does nothing in real mode.** The web app has no session, so `POST /claim` returns 401 (`cases.js:485-490`). `claimCase` swallows it as success (`centralApiClient.js:124-128`). The "CASE CLAIMED" banner can only appear in mock mode, where it fires at random 20 % of the time (`:109-115`). Because `_fetch` errors carry no `status`, a real 409 would not trigger the banner either. The backend claim logic itself is real (30-minute TTL, `authConfig.js:77`).

### c. Keyboard shortcuts — CODE-VERIFIED, BEYOND-V4 (`DecisionControls.jsx:21-48`)
- `C` = confirm, `O` = override, `Enter` = submit (when a decision is selected), `Ctrl+Enter` = submit while typing in a field. All are ignored while `claimedBy` is set.
- **Bypass:** `C` is not blocked on disagreement cases, although the CONFIRM button is, and `Enter` submits an override that has no reason category. The backend rejects the first; combined with defect 6, the UI still shows success.

### d. Prior review / correction history — CODE-VERIFIED (partly)
- `GET /api/v1/cases/:id/reviews` (`cases.js:568-601`, newest first). The UI shows the newest entry as "⚠ PRIOR REVIEW EXISTS … Any new submission will be recorded as a correction", and the submit label becomes "SUBMIT CORRECTION" (`DecisionControls.jsx:112-118, 223`).
- **Shape mismatch:** the backend returns `reviewer: {userId, name}`, but the UI reads `priorReview.reviewerName` → "reviewed by undefined" in real mode.
- "Correction" exists only in the UI: the backend simply inserts another `ophthalmologist_reviews` row.
- The real queue **excludes already-reviewed cases** (`ophthalmologistQueue.js`, `NOT EXISTS … ophthalmologist_reviews`), so a reviewed case can only be reopened by its URL. Mock mode invents a prior review for a random 20 % of cases (`centralApiClient.js:137-148`).

### e. SLA timer and audit — CODE-VERIFIED; audit wording partly MOCK
- The live timer ticks every 1 s in the header "● REVIEW SLA: mm:ss / <30s TARGET". The badge reads "SLA AUDIT PASS" under 30 s and "EXTENDED REVIEW" otherwise, but always with the green `badge--pass` class (`DecisionControls.jsx:12-19, 92-101`).
- Recorded duration: `CaseDetailPage.jsx:76-81` sends `reviewDurationSeconds` measured from page open, overriding the component's own counter. It is stored in `ophthalmologist_reviews.review_duration_seconds` (`cases.js:384-395`). This satisfies v4 §5.2 "open-to-decision timer".
- Audit log: the backend writes `access_log` for `view_queue`, `view_case`, `view_reviews`, `view_report`, dashboard and referrals (`logAccess` calls in the routes). With auth off, `user_id` is null.
- The success text "Audit log recorded by … 'Dr. Krrish Gadekar'" is a **hardcoded string** (`DecisionControls.jsx:212`).

### f. Patient timeline — MOCK in the parts that look impressive
- "▶ SHOW PATIENT HISTORY (n prior)" opens `CaseHistoryTimeline.jsx`. Each visit shows a **synthetic SVG fundus** (not the real image), the grade and its label, a status badge, a mini referral tracker (REFERRED → CONTACTED → SCHEDULED → SEEN), and lesion counts with a DIFF VIEW (+/−).
- The real backend's `priorAssessments` contain only `{caseId, gradedAt, drGradeCnn}`, at most 10 (`ingestionService.js:525-535, 648-652`). In real mode, status, referral tracker and lesion diff render empty ("NO LESION DATA"). Those three appear only with mock data.
- It is not per-eye. **V4-MISSING (partial)** against §5.2's "grade-over-time trend strip, per eye".

### g. Filters — CODE-VERIFIED (`ReviewQueuePage.jsx:162-282, 340-438`)
- Free-text search (patient name or reference, PHC, case ID), a PHC dropdown built from the rows, a CNN-grade dropdown (0–4), tier checkboxes A/B/C, status buttons ALL / CONFIRMED / OVERRIDDEN / PENDING, and RESET.
- Every column except patient and PHC sorts. **The default sort is newest-first by capture time, not priority** (`:142-148`, deliberately for demos; clicking `#` gives the backend's priority rank). Backend rank: Tier C 1–100 by uncertainty descending, then Tier B 101–200 by confidence ascending (`ophthalmologistQueue.js:10-17`).
- **Defect:** `tierFilter` is missing from the `useMemo` dependency list (`:226`), so a tier checkbox only takes effect on the next 5 s poll.
- The status buttons only mean something in mock mode, because the real rows have no `reviewStatus`.
- Not shown although the backend returns them: `eyeLaterality` and `claimedBy` per row → **V4-MISSING** (§5.2 requires both in the row).

### h. Language selector
- **Central:** the header offers **English, हिंदी (hi), मराठी (mr)** only (`CentralHeader.jsx:118-120`). Seven locale files are bundled, but only en (102 keys), hi (101) and mr (101) contain `central.*` keys. The bn, pa, ta and te files contain only PHC-app keys, 0 central keys. Most case-detail and decision text is hardcoded English and not translated.
- **PHC desktop:** 7 selectable languages: English, हिंदी, मराठी, తెలుగు, தமிழ், ਪੰਜਾਬੀ, বাংলা (`shared/LanguageSelector.jsx:5-11`). en has 109 keys, each of the other six has 86. Registration, capture and quality-panel text is mostly hardcoded English.
- **Mobile:** the same 7 languages, with the desktop locale files copied verbatim (`netrasetu/i18n/index.ts`). Mobile-only strings are English only. The choice is persisted in the SQLite `kv` table.

### i. Other case-detail facts
- **Grad-CAM:** real mode layers the real PNG (`gradCamOverlayUrl`, served from `/media`) over the fundus image, with an on/off toggle. The **opacity slider and the JET / CONTOURS / CENTROIDS modes exist only in the synthetic canvas fallback**, whose hotspots are hardcoded (`GradCamOverlay.jsx:166-237`). If the real image fails to load, the synthetic retina is swapped in silently (`:326-340`).
- **Not surfaced, although the backend returns them:** conformal tier on the detail page, `tierReason`, `eyeLaterality` (and DICOM source or mismatch), `foveaUnreliable`, `modelVersion`, `failureCode`/`status`, and the **clinical-rationale PDF**. `GET /api/v1/cases/:id/report` exists (`cases.js:542-566`), but the web app has no button for it → **V4-MISSING** (§5.2, §6.9 in the UI).

---

## 3. Mobile app: capture flow, on-device quality, offline, backend

### 3.1 Lens-attached capture, step by step (CODE-VERIFIED as code; not run on a device; BEYOND-V4)
1. **Register** the patient, or pick an existing one through search or the duplicate prompt. Capture opens with `patientId`.
2. **CAPTURE WITH FUNDUS LENS** navigates to `LensCamera` (`CaptureScreen.tsx:229`).
3. **Permission:** if the camera is not granted, the screen shows "CAMERA ACCESS NEEDED" with ALLOW / CANCEL (`LensCameraScreen.tsx:41-51`). The purpose string in `app.json` reads "uses the camera with an attached fundus lens to photograph the retina".
4. **Live view** (`:92-145`): `CameraView facing="back"`, **torch on by default** (the phone light is the illumination source), zoom in 5 % steps from 0 to 100 %, and **tap anywhere to refocus** (autofocus toggled off and on). An SVG guide shows a pupil circle (r = 34 on a 100-unit box), a crosshair and a centre ring. Hint: "Optic disc inside the circle · dim room · tap the preview to refocus".
5. **Shutter:** `takePictureAsync({quality:1, exif:false})` (`:59-71`).
6. **Review:** shows the image with its width × height and "the quality gate runs on the next screen"; ↺ RETAKE or USE THIS IMAGE →.
7. **Back in Capture:** `source='lens'`, and the camera is locked to `mobile_lens` ("Phone + attached fundus lens") (`CaptureScreen.tsx:76-82`).
8. **RUN QUALITY CHECK:** the image is copied into app storage under the new capture ID and the on-device gate runs with preset `mobile_lens` (§3.2). The capture row is recorded straight away, so a failed attempt counts towards the retake limit.
9. **Quality panel:** pass, borderline or retake with a reason, composite score, the six sub-scores against the preset limits, and "Analysed on this device at W×H px · preset". Retake loops back to step 2. **After 3 failed attempts**, MARK BEST EFFORT — PROCEED AS UNGRADABLE appears, plus a referral hint when the questionnaire shows elevated risk (`components/QualityResultPanel.tsx:64, 133-145`; `config/index.ts` `maxRetakesBeforeBestEffort: 3`).
10. **Metadata** (all fields required): eye L/R, camera, pupil (dilated / not dilated / unknown), lighting (indoor clinic / outdoor-camp / low light), observed issues (glare, blinked/moved, out of focus, media opacity, eyelash/eyelid, none noticed), usability rating (clear / not sure / unusable) (`components/CaptureMetadataForm.tsx`).
11. **SAVE & SYNC:** the questionnaire (taken from the patient record) and the metadata are queued with a priority tier: 0 for a red-flag symptom or best effort, 1 for elevated risk or a borderline image, 2 for routine (`lib/questionnaire.ts:65-74`). A sync pass is triggered, a toast says whether the case is uploading or saved offline, and the app goes to the Queue.

The gallery route is the same from step 7 on: `expo-image-picker` asks for photo-library permission, `source='gallery'`, and the camera is chosen by the technician. The in-app instructions describe moving the image from the fundus camera to the phone "by the camera's own export (Wi-Fi, USB or SD card)" (`i18n/mobile.en.ts`). LOAD SAMPLE uses `assets/demo/sample_fundus.jpg`.

### 3.2 On-device quality checks — CODE-VERIFIED
- **Implementation:** `netrasetu/lib/quality/qualityGate.ts` is a port of the MATLAB gate (`phc-local-app/backend/quality-gate-matlab/qualityGateMain.m` and its `assess*.m` helpers), **not** of the desktop JS fallback. That fallback now always answers `retake / MATLAB_UNAVAILABLE` (`backend/services/qualityGateFallback.js:250-270`).
- **Pipeline:** EXIF orientation and HEIC decoding via `expo-image-manipulator` → lossless PNG → `fast-png` decode → greyscale with MATLAB's `rgb2gray` weights. Analysis is at full resolution up to **4600 px** on the long side (`runQualityGate.ts`).
- **Checks, in MATLAB's priority order:** field of view → glare → motion → illumination → focus, then a composite "borderline" catch-all. Reason codes: `blur`, `low_illumination`, `insufficient_fov`, `glare`, `motion_artifact`, `eyelash_occlusion`.
- **Presets** (`cameraPresets.json`, copied verbatim): `default` has focus ≥ 0.17 and illumination ≥ 0.40; `mobile_lens` has focus ≥ 0.12 and illumination ≥ 0.30. Any other camera ID uses `default`.
- **Failure handling:** any exception shows "QUALITY CHECK COULD NOT RUN … No quality result exists"; it never turns into a pass (`CaptureScreen.tsx:244-250`).
- **MATLAB parity:** the changelog claims **35/35** (17 images × 2 presets, sub-scores within 1e-11, occlusion within 2.4e-3). **DOC-ONLY for this audit:** I did not re-run `npm run test:parity` because it needs MATLAB. The mobile unit suite, which includes preset-fallback tests, passed **23/23** today.
- **V4-MISSING:** v4 §4.1 / §6.1 name nine factors. Colour balance, excessive border and a separate contrast measure do not exist in the MATLAB gate or its port.

### 3.3 Offline behaviour — CODE-VERIFIED
- **Storage:** everything is saved locally first in `expo-sqlite`. Tables are `kv`, `patients`, `captures`, `questionnaire_responses`, `capture_metadata_responses`, `sync_queue`, `change_log`, `sync_ctx` and `peer_images_sent`, with append-only migrations keyed on `PRAGMA user_version` (`netrasetu/db/database.ts`). Images live in `documents/captures/`.
- **Sync loop** (`netrasetu/sync/syncManager.ts`): every **15 s**, on network regain (`expo-network` listener) and when the app returns to the foreground. Up to 8 items per pass. Order is priority tier, then age. States: unknown / offline / no_server / online, shown in the header.
- **Upload order:** summary packet first (`POST /api/v1/cases/summary`), then the image. Images over **2 MB** go through the chunked, resumable path (1 MB chunks: `chunks/init`, `/:index`, `/complete`); smaller ones use one `POST /api/v1/cases`. The capture ID is the idempotency key throughout. A case counts as "synced" only after central answers 201 or a duplicate 200.
- **Errors:** a 4xx stops that item and shows it for RETRY. Transient failures back off and retry.
- **After upload:** the app polls `GET /api/v1/cases/:caseId/status` until the case is `graded` or `error`, and the queue then moves to RESULT READY.
- **Storage pressure:** warns under **500 MB** free disk or at **≥ 150** queued items (`config/index.ts` POLICY; `lib/storage.ts:51-55`).
- **Login offline:** a cached PBKDF2-SHA256 verifier, set on the first successful login through the PC (`auth/offlineCredentials.ts`).
- **Tests:** `npm run test:sync` (9/9 against the real central, per the changelog) is **DOC-ONLY here**. I did not re-run it because it writes test cases into the live central DB.

### 3.4 Which backend it calls
- **Central** directly, for all clinical data (`netrasetu/api/central.ts`). Base URL: `EXPO_PUBLIC_CENTRAL_API_URL`, set to `http://10.10.217.0:5000` in `mobile/.env`, or the in-app default `http://10.0.2.2:5000`. Header: `X-PHC-Api-Key`. Endpoints: `/health`, `/api/v1/cases/summary`, `/api/v1/cases`, the three chunk endpoints, `/api/v1/cases/:caseId/status`, `/api/v1/phc/cases/:captureRef/report`, `/api/v1/phc/cases/:captureRef/gradcam`.
- **PHC PC** (optional): only the sealed `/peer/*` routes, for replication and login (§4). The mobile app **does not** use the PHC local `/captures` API or `/captures/mobile`.
- **No external inference service.** The only ngrok traces are in the dead `mobile/src/` tree.

---

## 4. PHC desktop ↔ mobile synchronisation — CODE-VERIFIED, BEYOND-V4

v4 has no phone↔PC sync. §9.5 describes only a single camp relay device, and §16 rejects a general mesh. The protocol is written up in `docs/peer-sync-protocol.md`. I checked it against `phc-local-app/backend/routes/peer.js`, `services/peerSync.js`, `services/peerCrypto.js`, `services/peerBundle.js`, `scripts/peer.js`, and on the phone `netrasetu/peer/*` and `netrasetu/sync/syncManager.ts`.

**Test run today:** `npm run test:peer` → **12/12 pass**. It runs the real phone code against a real local-backend process on a temporary DB and port, with central unreachable. It covers envelope interop, sealed login, keystore, offline login, PC→phone replication, PC ownership, a simulated **power cut** (PC killed and restarted), post-outage convergence, central-case-ID propagation, no echo, a USB bundle both ways, and refusal of a bundle addressed to another phone.

| Aspect | What the code does | Where |
|---|---|---|
| Transport | HTTP on the PHC LAN or the phone's hotspot, to the PC's local backend on port 4000. The phone is always the client (Expo cannot host a server). Every body after pairing is an **AES-256-GCM envelope** with a fresh 96-bit IV. The AAD binds device, method, path, timestamp and nonce. The nonce is single-use (kept 2 × skew = **30 min**) and the clock window is **±15 min** (`hello` is exempt). Responses are sealed against the request nonce. With no network, an **encrypted bundle file** travels by USB cable or SD card. | `routes/peer.js:33-42, 105-135`; `peer/peerCrypto.ts` (@noble) ↔ `services/peerCrypto.js` (node:crypto) |
| Pairing | `npm run peer -- pair "<name>"` prints a QR code `{kind:'netrasetu-pair', v:1, deviceId, key, pcDeviceId, urls, phcCode, phcName}` with a fresh 256-bit key. The phone scans or pastes it, and keeps it only after a sealed `hello` succeeds. The key is stored in the OS keystore (`expo-secure-store`). `POST /peer/pair` is allowed only from localhost or a logged-in PHC admin. Revoke with `npm run peer -- revoke <id>`. | `routes/peer.js:55-92`; `peer/pairing.ts`; `lib/secrets.ts` |
| Direction | **Two-way.** `POST /peer/pull` (PC → phone, pages of **300**) and `POST /peer/push` (phone → PC), plus `/peer/image/get` and `/peer/image/put` (SHA-256 checked). The phone runs one replication pass inside every sync cycle (`syncManager.ts` `pcPass` → `replicateWithPc`). | `routes/peer.js:176-212`; `peer/replicate.ts` |
| What syncs | Patients (including demographics JSON, questionnaire JSON and consent), captures (verdict, scores, eye, source, best-effort flag, image bytes + SHA-256), questionnaire responses, capture-metadata responses, and sync-queue state (`pending < summary_sent < synced`, `awaiting_image < processing < graded/error`, central case ID). A capture travels only once it has a verdict. | `services/peerSync.js:36-70` (`toWire`); `peer/replicate.ts` |
| Change feed | SQLite triggers write a `change_log` on insert or update of the five tables. `sync_ctx.origin` tags applied records so a peer never gets its own changes back ("no echo"). | `db/localDb.js`; `netrasetu/db/database.ts` (migration v2) |
| Conflict handling | **Patient:** last writer wins on `updatedAt`; a tie goes to the larger origin ID; `consent_given_at` is never overwritten once set (`COALESCE`). **Capture, questionnaire, metadata:** immutable (`INSERT OR IGNORE`). **Sync state:** monotonic rank, never moves backwards. **Image before record:** a capture whose image is missing throws `image_missing` and rolls back the whole batch. | `services/peerSync.js:109-205` |
| Upload ownership | The device that took the capture uploads it (`sync_queue.owner_device`). The other device takes over only after **`PEER_TAKEOVER_MS`, default 6 h**, of silence from the owner. A double upload would be harmless because central de-duplicates on the capture ID. | `services/peerSync.js:30, 252-258`; `services/syncManager.js:320-327` |
| Offline queueing | Each side keeps its own SQLite queue and uploads to central when it can. PC: every **10 s** (`SYNC_INTERVAL_MS`), with a `/health` heartbeat before each attempt. Phone: every 15 s. Replication resumes from the cursor after an outage. | `backend/services/syncManager.js:40-110, 395-416` |
| Identifiers | Both devices use one format, `{PHC_CODE}-{monotonic base36 ms}-{8 chars CSPRNG, rejection-sampled}`, e.g. `PHC001-mtuss3yg-a2x9k7qp`. Older 4-character suffixes are still accepted. Desktop and phone share a PHC code; device IDs are `pc-…` and `ph-…`. | `backend/services/ids.js`; `mobile/netrasetu/lib/ids.ts`; `docs/id-format-spec.md` |
| Auth around it | Technician accounts live on the PC (scrypt; session token stored as SHA-256; 12 h; lockout after 10 failures): `npm run technician -- add …`. `/peer/*` is always authenticated by the device key. The technician token is required on pull, push and image calls when `LOCAL_AUTH_ENABLED=true`. | `services/localAuth.js`, `routes/auth.js`, `middleware/requireTechnician.js` (all uncommitted) |
| Desktop UI for any of this | **None.** Pairing, import and export are CLI-only on the PC (`npm run peer -- pair / devices / revoke / import / export`). | `backend/scripts/peer.js` |
| Status on this machine | Not provisioned: the live `local.sqlite` has no `peer_devices` table, and the PHC backend was not running during the audit. | live DB check |

---

## 5. PHC desktop input handler

### 5.1 Camera types
- Dropdown on desktop and mobile (`phc-local-app/frontend/src/api/mockData.js:160-165`; `mobile/netrasetu/components/CaptureMetadataForm.tsx:20-26`): `forus_3nethra_v2` (Forus 3Nethra v2), `remidio_fop` (Remidio FOP), `generic_fundus`, `unknown`. Mobile adds `mobile_lens` ("Phone + attached fundus lens"), which is set automatically for lens captures.
- **Only two quality presets exist**, `default` and `mobile_lens` (`quality-gate-matlab/cameraPresets.json`). Forus, Remidio and generic all get `default`.
- Central's Tier A allow-list contains only `topcon_trc_nw400` (demo seed), which none of these lists offer (see §0.7).

### 5.2 Input routes into the PHC local backend (`phc-local-app/backend`)

| Route | Accepts | Caller | Tags |
|---|---|---|---|
| `POST /captures` | multipart `image` + `patientId` + `cameraDeviceId`. Must be `image/*` MIME, ≤ 25 MB, extension `.jpg .jpeg .png .tif .tiff .bmp` (`routes/captures.js:34-42`; `services/captureHandler.js:52`). The image is written to `storage/`, the row is inserted as `pending`, then the MATLAB gate runs. Pass or borderline is queued for sync in the same transaction. | Desktop web capture screen, which uses a file picker (`accept="image/png, image/jpeg, image/jpg"`). The "LIVE FEED" label is cosmetic. | **CODE-VERIFIED** |
| `POST /captures/mobile` | Same as above, with the camera forced to `mobile_lens` | **No app calls it.** Only `verify_mobile_lens.js` at the repo root. | **CODE-VERIFIED** endpoint, unused; **BEYOND-V4** |
| `/peer/push` + `/peer/image/put` | Sealed records and images from a paired phone over the LAN | Mobile app | **CODE-VERIFIED**; **BEYOND-V4** |
| `POST /peer/bundle`, or `npm run peer -- import <file>` | Encrypted bundle file carried by USB or SD | Operator, from a phone's "EXPORT BUNDLE" | **CODE-VERIFIED** (test:peer #11); **BEYOND-V4** |

**Direct camera integration (SDK or driver): not found. V4-MISSING** (§4.2 "interfaces with the fundus camera directly"; §13 "Camera SDK/driver"). Desktop "capture" means uploading a file.

**Quality-gate tiers on the desktop:** the compiled exe (`QUALITY_GATE_EXE`) is **not built**: `quality-gate-matlab/dist/` is empty, and the changelog §9.1 says build 3 was stopped for lack of memory. Next comes `matlab -batch`, which works on this machine (MATLAB at `D:\`). The third tier, the JS fallback, is **deliberately disabled** and always returns `retake / MATLAB_UNAVAILABLE`. That contradicts v4 §4.2 ("three-tier fallback … stays exactly as-is"). The desktop now effectively needs MATLAB.

### 5.3 "Mobile-cord" route — what actually exists
- **No live cable data path in code.** No USB tethering, ADB or MTP handling, and no desktop route that reads from a phone plugged in by cable.
- What exists instead:
  1. Fundus camera → phone by the camera's own export (Wi-Fi, USB or SD), then gallery import. This is an OS-level step, only described in the in-app instructions.
  2. Phone → PC with an **encrypted bundle file over a USB cable** (menu EXPORT BUNDLE → Android share sheet → file → `npm run peer -- import`), and PC → phone with `npm run peer -- export <deviceId> <file>` → menu IMPORT BUNDLE.
  3. Phone ↔ PC replication over LAN or hotspot.
- If the PPT says "mobile-cord route", it should mean (2).

### 5.4 DICOM handling
- **PHC desktop: none.** `.dcm` is not an allowed extension, multer requires `image/*`, and the gate uses `imread`. `ingestionService.js:31-35` says so: "Central only — the PHC quality gate still uses imread, so a DICOM cannot yet complete the capture->sync path end to end."
- **Mobile: none.** `expo-image-picker` returns images only.
- **Central: CODE-VERIFIED in the backend.** `ml-pipeline/preprocessing/readFundusImage.m` reads DICOM with the Medical Imaging Toolbox (`medicalImage`) and returns `format`, `deviceModel` (Manufacturer + ManufacturerModelName), `laterality` (ImageLaterality), `acquiredAt`, `modality` and `pixelSpacing`. Its header lists three uses: (1) cameras such as Topcon, Zeiss and Canon export DICOM, not JPEG; (2) it provides the device model for the camera cross-check; (3) it provides the eye.
  - Ingestion allows `.dcm` (`ingestionService.js:36`; `chunkedUploadService.js:70`).
  - Results are stored in `source_format`, `dicom_device_model` and `eye_laterality_detected` (migration `0016_capture_source_provenance.sql`; `gradingOrchestrator.js:1116-1126`).
  - The API exposes `sourceFormat`, `dicomDeviceModel`, `eyeLateralitySource` (`'dicom'` or `'technician'`) and `eyeLateralityMismatch` (`ingestionService.js:586-617`).
  - A test script exists: `ml-pipeline/preprocessing/testReadFundusDicom.m`. I did not run it.
- **Gaps:** the single-shot `POST /api/v1/cases` multer filter requires `image/*` (`routes/cases.js:90`), so a DICOM sent as `application/dicom` is rejected on that path; only the chunked path accepts it by extension. **No front-end can submit a DICOM or display the DICOM fields.** v4 lists DICOM as Tier 2 roadmap (§16 item 13), so: **V4 item, implemented central-only, not reachable end to end.**

---

## 6. District admin dashboard: every panel and its data source

| Page / panel | What it renders | Frontend call | Backend endpoint (exists?) | What renders **today** | Tag |
|---|---|---|---|---|---|
| **Dashboard** — CASES TODAY, THIS WEEK, TOTAL PROCESSED, AVG REVIEW TIME | 42 / 187 / 1,284 / 27 s, with deltas "+12% from yesterday", "+8% WoW", "-3s from last week" (hardcoded strings, `DashboardPage.jsx:302-311`) | `getAdminDashboard()`, which **never calls the network** | `GET /api/v1/admin/dashboard` exists but returns only `{casesToday, casesPerPhc, averageReviewTurnaroundSeconds}` (`services/analyticsAggregator.js:33-75`) | Mock | **MOCK** (v4 §5.3 dashboard **V4-MISSING** in the UI) |
| Dashboard — MODEL ACCURACY, OVERRIDE RATE, IMAGES REJECTED, AVG CONFIDENCE | 94.6 %, 8.3 %, 38, 92.4 % | same | No backend equivalent | Mock | **MOCK. Never use as a result.** |
| Dashboard — weekly trend, cases by PHC, grade donut and table | W31–W36; 4 PHCs; 1,284 cases split 312/445/298/156/73 | same | Only per-PHC counts exist on the backend | Mock | **MOCK** |
| **Referral Tracker** — list, pipeline counts, SMS-failed rows, lost first | Status config: referred → contacted → attended; lost; `manual_follow_up` ("MANUAL FOLLOW-UP (SMS FAILED)") | `getReferrals()` (real mode: no fallback) | `GET /api/v1/admin/referrals`. Real rows carry only `referralId, patientReference, status, assignedWorker, updatedAt` (`analyticsAggregator.js:148-156`), so the PHC, grade, phone and failure-reason columns are blank. | Live DB: 16 referrals, all `referred` | **CODE-VERIFIED** (read) |
| Referral — advance status button | Moves to the next status and auto-assigns `ASHA-112` when unassigned | `updateReferral()`, which edits the mock array only | `PATCH /api/v1/referrals/:referralId` exists (`routes/referrals.js:37`) and is not called | Not persisted | **MOCK**; **V4-MISSING** (write path of §5.3) |
| **PHC & System Health** — alert banner | "CRITICAL SYSTEM HEALTH EXCEPTION", N alerts (falls back to "2" if missing, `PhcHealthPage.jsx:187`) | `getSystemHealth()` (real, mock fallback) | `GET /api/v1/admin/system-health` → `{silentPhcs, stuckJobs, failed…, matlabSessionStatus, matlabSession, unreviewedCases, alerts}` (`services/systemHealth.js:139-165`). Thresholds: silent PHC **48 h**, stuck job **15 min**, unreviewed referable **48 h** (`:30-32`). | Real: 1 open alert, `seg_worker_down` ("No heartbeat within 90s of a restart"), with an **empty subject** | **CODE-VERIFIED** |
| System Health — 4 tiles | SILENT PHCs (>48 h), STUCK PIPELINE JOBS, MATLAB SESSION STATUS, SLA AGING (>48 h unreviewed) | same | same; backed by `gradingWatchdog.js`, `matlabSessionSupervisor.js`, `segWorkerSupervisor.js` (started in `server.js:151-154`) | Real values; but the MATLAB tile always says "**0 Restarts**" and the SLA tile says "**1 case breach warning**" whenever the count is above 0 (hardcoded, `:253, 265`) | **CODE-VERIFIED** with MOCK text |
| PHC table — status, name, ID, last sync, pending, total screened, health | 7 PHCs (Kharadi … Khed), 2 offline | `getPhcSyncStatuses()`, **mock only** | `GET /api/v1/phc/:phcId/sync-status` (district_admin) exists and is unused. Live DB has 1 PHC. | Mock | **MOCK** |
| **Resource Planning** — bottleneck banner, recommendation text, ROUTINE / CAMP staffing, P95 wait, pool utilisation, "modelled vs observed" inputs | e.g. "Reviewer pool is the constraint (72% utilised, p95 wait 72 min). Add ophthalmologists: 1 -> 2." | `getResourceRecommendations()` (real, mock fallback) | `GET /api/v1/admin/resource-recommendations` answers **404 until the model has run once** (`routes/adminDashboard.js:68-82`). The model is `referenceQueueingModel('recommend', …)` in MATLAB (`services/resourceRecommendations.js:118`), scheduled **daily at 02:30** (`RESOURCE_MODEL_CRON`, `:44`; started at `server.js:156`). | **Mock**: the live `resource_recommendations` table has **0 rows**, so 404, so the mock renders silently. "Shortage: +1" and "Annual volume in 50 camp days" are hardcoded (`:163, 175`). | Endpoint **CODE-VERIFIED**; display **MOCK** today |
| Resource — ⚡ RUN ON-DEMAND SIMULATION | Re-runs the model | `POST …/resource-recommendations/refresh` (35 s client timeout) | exists (`adminDashboard.js:84-97`) | On failure it shows the mock with a new timestamp **and a success toast** "completed (2.0s run time)" (`ResourceRecommendationsPanel.jsx:29-41`; `centralApiClient.js:281-298`) | **CODE-VERIFIED** endpoint; the failure path is **MOCK** |
| Resource — SIMULINK SIMEVENTS (.SLX) CO-VALIDATION table + RE-RUN | 4 checks (auto-clear share, reviewer utilisation, mean wait, queue p95 depth): SimEvents vs reference vs tolerance vs AGREE/DIVERGED | `getSimulinkValidation()` / `refreshSimulinkValidation()` (60 s client timeout) | `GET/POST /api/v1/admin/simulink-validation[/refresh]`. It reads `simulink-model/out/last-validation.json` (`services/simulinkValidation.js:51-53, 95`) and runs weekly (`server.js:159`). | **Mock**: `simulink-model/out/` does not exist on this machine, so 404, so `mockSimulinkValidation` (all AGREE). Failed refreshes also say "AGREE". | **MOCK** today; **BEYOND-V4** (not in v4 §5.6) |

**Simulink-driven recommendations, stated honestly:** the pipeline that runs the MATLAB reference queueing model and checks it against the SimEvents `.slx` is wired end to end in the backend. On this machine neither has ever produced a stored result, so everything the Resource page shows today is hardcoded. Run `POST /api/v1/admin/resource-recommendations/refresh` and `/simulink-validation/refresh` (MATLAB required) before any screenshot, and check that the page's "Last computed" time changes. The model inputs and results themselves are for the Simulink audit doc to cover.

---

## 7. Best 8 screens to screenshot

For the web apps, set `VITE_USE_MOCK_DATA=false`, have central (`:5000`) running, and check in DevTools that no `[centralApi] … falling back to mock` warning appears on the page you capture.

| # | Screen | Route or path | Suggested state | Why / caveat |
|---|---|---|---|---|
| 1 | Ophthalmologist review queue | `/ophth/queue` | Real mode with the 24 live pending cases. Sort by `#` (priority) rather than the default newest-first. Make sure a crimson-bordered **⚠ DISAGREE** row and the URGENCY footnote are visible. | Shows dual-branch grading, tiers and honest caveats. Do not click the status filter buttons, which are meaningless in real mode. |
| 2 | Case detail, Grad-CAM on, branch mismatch | `/ophth/case/320f3652-dc0f-4b5d-9f72-a318d4ddd792` (Tier C, CNN 3 vs rule 2, disagree, no review yet, has Grad-CAM). Alternatives: `a9da1db2-790b-49ff-ad9e-80240f3f9963` (CNN 1 vs rule 2), `3326f5ad-bc59-4781-bc42-c4ecbfc683c1` (CNN 1 vs rule 0). | Toggle ✦ GRAD-CAM ON; the top bar shows "⚠ BRANCH MISMATCH". | Crop out the PATIENT / CAPTURE CONTEXT grid, which shows "Krrish / 20 YEARS" for every real case. |
| 3 | Decision controls on a disagreement case | same page, scrolled to CLINICAL DECISION & SAFETY AUDIT | Press `O`; CONFIRM greyed out; pick reason "Wrong Severity" and corrected grade; SLA timer below 30 s | Shows §10.9 enforcement and the timer. Don't submit on camera: a rejected submit still shows success (§2b). |
| 4 | Mobile quality gate result | Mobile → Capture step 2 | A **real** borderline or retake result showing the six sub-scores and "Analysed on this device at W×H px · preset". Ideally the 3rd failure with **MARK BEST EFFORT** visible. | The honest quality UI. Use this rather than the desktop panel, whose scores are fabricated. Needs a device or emulator, which has never been done yet. |
| 5 | Mobile fundus-lens camera | Mobile → Capture → CAPTURE WITH FUNDUS LENS | Guide circle, LIGHT ON, zoom row | **BEYOND-V4, and v4 rejects it.** Label it "prototype, not validated" unless v4 is updated. |
| 6 | Mobile case report | Mobile → Queue → a RESULT READY case | Central grade, tier text, "CONFIRMED BY OPHTHALMOLOGIST" line, Grad-CAM | Shows the loop closing back to the PHC. The case must have been uploaded from the phone and reviewed. |
| 7 | PHC & System Health | `/admin/phc-health` | Real mode; capture the **top half only** (alert banner + 4 tiles) | The PHC table below is mock (7 fake PHCs). The live alert has an empty subject line, so consider resolving it or filling the subject first. |
| 8 | Resource Planning (Simulink) | `/admin/resources` | **Only after** successful `POST …/resource-recommendations/refresh` and `…/simulink-validation/refresh` | Today it renders mock. If the refresh fails, the page still shows success, so check "Last computed" and the backend log. |

**Alternates:** PHC desktop registration `/register` with the consent block (clear the demo pre-fill first); mobile menu sheet showing PHC PC LINK + EXPORT BUNDLE (for the offline-sync story); mobile Queue showing the offline banner and 5-dot stages; Referral Tracker (real rows lack PHC and grade, so it looks sparse).

**Avoid:** the Dashboard (fully mock, with a fabricated accuracy figure), the desktop quality panel (fabricated scores), the desktop result modal (hardcoded "Mild NPDR"), and anything with `VITE_USE_MOCK_DATA` unset.

---

## 8. Cross-check against `docs/system-design-v4.md`

### BEYOND-V4 (in code, not in v4)
- Mobile **fundus-lens live capture**, `mobile_lens` preset and `POST /captures/mobile`. **v4 explicitly rejects this for this round** (§1.21, §16).
- **Desktop ↔ phone peer sync:** AES-256-GCM sealed channel, QR pairing, change feed, merge rules, upload ownership with 6 h takeover, encrypted USB/SD bundles, device revoke.
- **PHC-side technician auth** details: scrypt, bearer sessions, lockout, the phone's offline PBKDF2 verifier, OS-keystore secrets. v4 §11.1 asks only for "a login in every application".
- PHC report endpoints `GET /api/v1/phc/cases/:captureRef/report` and `…/gradcam`, the mobile CaseReport, and the **shareable clinical slip PDF** (expo-print).
- **Triage urgency score** column and caveat in the queue (from a model trained on synthetic data; shown as a hint only).
- **Keyboard shortcuts** (C / O / Enter / Ctrl+Enter).
- **Simulink co-validation panel** and `/admin/simulink-validation` endpoints.
- Registration extras: ABHA ID, visit number, full demographics and address (desktop and mobile), and HbA1c (mobile).
- Mobile high-contrast (dark) mode; 7-language UI on the PHC apps.
- Grad-CAM opacity and modes (synthetic fallback only).

### V4-MISSING (in v4, missing or partial in the front-end code)
| v4 § | Requirement | State |
|---|---|---|
| §5.1, §11.1 | Real login on the central web app | Fake login; `AUTH_ENABLED` off |
| §1.22, §11 | No front-end fabricates a result in place of a failure | Central and desktop web apps fall back to mock everywhere; mobile complies |
| §5.2 | Queue rows show eye and who has claimed the case | Backend returns both; the UI shows neither |
| §5.2, §10.8 | Claiming blocks a second reviewer | Backend real; UI swallows the 401 and has no session |
| §10.9 | Explicit grade on disagreement | Backend enforces it; the UI hides the button but the `C` key bypasses it, and a rejected submit shows success |
| §5.2, §6.9 | Downloadable clinical-rationale PDF on case detail | Backend `GET /cases/:id/report` exists; no UI |
| §5.2 | Per-patient, per-eye grade trend | Grade and date only in real mode; not per eye |
| §5.3 | Dashboard from real aggregates | Always mock |
| §5.3 | Referral tracker updates | Read is real; write is mock |
| §5.3 | PHC sync health from the real endpoint | Mock table |
| §4.1, §10.3 | Duplicate check at registration (desktop) | `/patients/search` exists; desktop UI doesn't call it (mobile does) |
| §4.1, §10.2 | Best-effort ungradable after 3 retakes (desktop) | Desktop has an unbounded "override quality gate" instead (mobile complies) |
| §4.1 | Real metrics, or "not available" (desktop) | Desktop shows fabricated 94/88/86/98 % |
| §9.1, §9.6 | Both questionnaires reach central (desktop) | Registration questionnaire is dropped by `POST /patients`; the capture submit crashes; live PHC DB has 14 questionnaires for 36 synced cases |
| §10.4 | Every capture tagged by eye (desktop) | Eye picked in the UI but never sent |
| §4.2, §9.2 | Summary packet before the image (desktop) | Not in the PC sync manager (mobile has it) |
| §4.1, §10.1 | Storage-pressure indicator (desktop) | Not found (mobile has it) |
| §4.1 | Result-Pending / Result-Delivered stages (desktop) | Not reachable in real mode (mobile reaches them) |
| §4.2 | Three-tier quality-gate fallback | Exe not built; JS tier disabled (always retake) |
| §4.2 | Direct camera integration (desktop) | File upload only |
| §4.2, §10.1 | Manual export-queue-to-drive | Only the phone-addressed encrypted bundle CLI |
| §9.5 | Camp-mode relay device | Not found |
| §6.1 | Nine quality factors | Six (no colour balance, excessive border or contrast) |
| §16 #13 | DICOM input | Central backend only; no front-end path |

---

## 9. Evidence log (what I ran or queried, with exact output)

| Check | Command or query | Result |
|---|---|---|
| PHC local backend tests (auth, peer, TLS) | `cd phc-local-app/backend && npm test` | `# tests 24 # pass 24 # fail 0` (duration_ms 8241.9924) |
| Mobile unit tests | `cd phc-local-app/mobile && npm test` | `# tests 23 # pass 23 # fail 0` (duration_ms 15047.0729) |
| Phone ↔ PC power-cut integration | `cd phc-local-app/mobile && npm run test:peer` | `# tests 12 # pass 12 # fail 0` |
| Not re-run (DOC-ONLY here) | `npm run test:sync` (writes to live central), `npm run test:parity` (needs MATLAB), `verify_backend_auth.js`, `verify_tls.js`, `verify_mobile_lens.js` | Changelog claims 9/9, 35/35, ALL PASSED, 12/12, and not run |
| Central DB snapshot | psql read-only, 2026-09-25 13:09:50 +05:30 | see header |
| PHC SQLite snapshot | better-sqlite3 `readonly:true` on `db/local.sqlite` | see header |
| Simulink outputs | `ls simulink-model/out` | No such directory |
| Desktop gate exe | `ls phc-local-app/backend/quality-gate-matlab/dist` | empty |
| Built web bundles | `central-system/frontend/dist/assets/index-VoEZftDT.js` (2026-09-10), `phc-local-app/frontend/dist/assets/index-dSRhJQRQ.js` (2026-09-10) | Stale; the PHC bundle contains `https://unpadded-slick-pushiness.n…` (ngrok) |
