# PPT Audit 01 — Repo, Routes, Data, Jobs, Features

**Project:** NetraSetu (SIH 2026, PS 26038, MathWorks)
**Audited:** 2026-09-25, working tree at `SIH_2026/`
**Method:** Every item comes from code, config, migrations, logs, test runs, or read-only queries against the live central Postgres DB (`dr_screening_central`). Markdown docs were used only to spot claims to check. Numbers are copied exactly as they appear in the source. They are never rounded.

**Path shorthand:** `CB/` = `central-system/backend/`, `ML/` = `central-system/backend/ml-pipeline/`, `CF/` = `central-system/frontend/src/`, `PB/` = `phc-local-app/backend/`, `PF/` = `phc-local-app/frontend/src/`, `MOB/` = `phc-local-app/mobile/netrasetu/`. All other paths are relative to `SIH_2026/`.

### Tags

| Tag | Meaning |
|---|---|
| **CODE-VERIFIED** | Found in code, config, migration, log, or a result file |
| **DOC-ONLY** | Claimed in a markdown doc; no code or result backs it |
| **MOCK** | UI exists but the data is hardcoded or fabricated |
| **BEYOND-V4** | Exists in code, not in `docs/system-design-v4.md` |
| **V4-MISSING** | Specified in v4, absent from code or from the live path |
| **V4-STALE** | v4 states a status that the code now contradicts |

### Runtime switches that change what "works" means (checked in `.env` on this machine)

| Switch | Code default | `.env` value | Effect | Source |
|---|---|---|---|---|
| `AUTH_ENABLED` (central users) | `false` | **not set** | Every ophthalmologist and admin route is **open**. `requireAuth`/`requireRole` return `next()` | `CB/services/authConfig.js:49`, `CB/middleware/requireAuth.js:71`, `CB/middleware/requireRole.js:22` |
| `PHC_AUTH_ENABLED` (PHC device key) | `false` | `true` | Ingestion routes require `X-PHC-Api-Key` | `CB/middleware/requirePhcApiKey.js:52` |
| `LOCAL_AUTH_ENABLED` (PHC desktop technician) | `false` | **not set** | Desktop local API is **open** to token-less requests, logged as unattributed | `PB/services/localAuth.js:26`, `PB/middleware/requireTechnician.js:13` |
| `INFERENCE_BACKEND` | `matlab` | not set | Branch A runs in the persistent MATLAB session | `CB/services/gradingOrchestrator.js:183` |
| `BRANCH_A_MODEL_VERSION` | `branchA_v2c` | not set | v2c classifier | `ML/inference/branchAInfer.py:94`, `ML/inference/branchAInferMatlab.m:112` |
| `RED_LESION_MODEL_VERSION` | `v2` | not set | 3-class MA/HE model | `ML/inference/segInfer.py:114` |
| `SMS_DRY_RUN` | off unless `'1'` | `0` | Real Twilio send | `CB/services/referralNotificationService.js:52` |
| `TLS_KEY_PATH` / `TLS_CERT_PATH` | unset → HTTP | not set | Central serves **plain HTTP** | `CB/server.js:165-180` |
| `VITE_USE_MOCK_DATA` (both web apps) | **`true`** when unset | no `.env` in either frontend | Both web UIs start in mock mode | `CF/config.js:1-3`, `PF/config.js:1-3` |

---

## 1. Repository tree (2 levels)

```
SIH_2026/
├── .env / .env.example        shared config for both Node backends (secrets; gitignored)
├── README.md
├── central-system/            CENTRAL SITE (district server)
│   ├── backend/               Node/Express API :5000 + Postgres + grading orchestration
│   │   └── ml-pipeline/       ML + MATLAB code: Python inference, MATLAB grading/explainability,
│   │                          training, diagnostics, experiments, model weights, datasets
│   └── frontend/              React/Vite web app: ophthalmologist + district-admin portals
├── phc-local-app/             PRIMARY HEALTH CENTRE SIDE
│   ├── backend/               Node/Express local API :4000 + SQLite + MATLAB quality gate + sync + peer link
│   ├── frontend/              React/Vite desktop technician app
│   └── mobile/                Expo/React Native technician app (live code in netrasetu/; legacy src/ unused)
├── simulink-model/            Simulink/SimEvents district resource model + analytic queueing model
├── scripts/                   DB setup/migrations, seeding, key provisioning, cert gen, exports
├── docs/                      design docs (v3, v4), plans, API contracts, protocols, this audit
├── datasets/                  5 loose smoke-test fundus images + dataset README (real datasets under ML/datasets/)
├── demo_images/               4 images for the demo script
├── experimenting Frontend/    three.js 3D-eye intro prototype (not wired to any app)
├── test_sms.js, verify_*.js   root-level verification scripts (auth, health, ingestion, pipeline, TLS, parity…)
└── verify_mobile_quality_gate_parity.mjs   TS quality gate vs MATLAB parity harness
```

Second level, per requested area:

| Area | Folder | Purpose (one line) |
|---|---|---|
| Central backend | `CB/routes/` | 8 Express routers (auth, cases, ophthalmologist, admin, referrals, phc, patients, notifications) |
| | `CB/services/` | 28 services: ingestion, grading queue/orchestrator, supervisors, SMS, analytics, Simulink bridge, auth |
| | `CB/middleware/` | CORS, session auth, role check, PHC API key |
| | `CB/db/` | `pgClient.js` + 18 node-pg-migrate migrations |
| | `CB/config/` | `validatedCameras.json` (Tier-A camera allow-list) |
| | `CB/media/` | per-case images, masks, Grad-CAM PNGs (36 case dirs on disk) |
| ML pipeline | `ML/inference/` | Python: Branch A (`branchAInfer.py`), segmentation (`segInfer.py`), Grad-CAM, MC-dropout; MATLAB session + seg worker |
| | `ML/preprocessing/` | Ben Graham / CLAHE (Python canonical) + MATLAB readers (`readFundusImage.m`, DICOM) |
| | `ML/segmentation/` | MATLAB: quadrants, NV suspicion, Frangi vessels, OD/fovea helpers |
| | `ML/grading/` | MATLAB: `runCasePipeline.m`, `ruleEngineGrade.m` (Branch B), `branchesAgree.m`, `calculateUrgencyScore.m`, threshold optimiser |
| | `ML/calibration/` | MATLAB: temperature scaling, conformal calibrate/tiering, MC-dropout |
| | `ML/cameraCalibration/` | MATLAB: camera-family classifier + profile bank |
| | `ML/explainability/` | MATLAB: Grad-CAM, lesion-attention consistency, occlusion test, evidence text, PDF report |
| | `ML/training/` | Kaggle notebooks, U-Net training scripts, ONNX export, MATLAB import + parity checks |
| | `ML/models/` | `.pt`/`.onnx`/`.mat` weights, calibration JSONs, rule thresholds, generated ONNX→MATLAB packages |
| | `ML/diagnostics/`, `ML/experiments/` | evaluation scripts + result files (`diagnostics/out/`) and logs |
| | `ML/deploy/` | MATLAB Compiler entry points for central inference (not built) |
| | `ML/tests/` | conformal golden vectors, pytest + MATLAB tests |
| MATLAB (PHC) | `PB/quality-gate-matlab/` | 10 `.m` files: focus, illumination, FOV, glare/motion/occlusion, CLI, exe build (`dist/` empty) |
| Simulink | `simulink-model/` | `districtScreeningSimEvents.slx`, `netraSetuPipeline.slx`, builder/runner scripts, `calibration.json` |
| Central frontend | `CF/components/screens/` | 13 screens; `CF/api/` real client + `mockData.js`; `CF/i18n/` 7 languages |
| PHC desktop | `PB/routes`, `PB/services`, `PB/db` | local API, capture handler, quality-gate client + JS fallback, sync manager, peer sync, SQLite |
| | `PF/components/screens/` | 9 technician screens; `PF/api/` real client + `mockData.js` |
| Mobile | `MOB/screens` | 8 screens (Login, Pairing, Registration, Queue, Capture, LensCamera, CaseReport, Settings) |
| | `MOB/{db,sync,api,peer,lib/quality}` | expo-sqlite store, sync manager, central API, peer replication, TS quality gate |
| | `phc-local-app/mobile/test/` | node:test unit/sync/peer suites + Expo shims |
| Scripts | `scripts/` | `setupCentralDb.js`, `setupLocalDb.js`, `seedDemoUsers.js`, `seedTestCase.js`, `provisionPhcKey.js`, `generateDevCert.js`, `recordModelVersion.js`, `exportTrainingSet.js`, `exportSimCalibration.js`, `resetPostgresPassword.ps1` |
| | `PB/scripts/` | `technician.js` (create technician accounts), `peer.js` (pairing CLI) |
| Tests | see §7 | `PB/test/`, `phc-local-app/mobile/test/`, `ML/tests/`, MATLAB `test*.m`, root `verify_*` |
| Docs | `docs/` | `system-design-v4.md` (reference), v3, API contracts, ID spec, peer-sync protocol, plans, changelog |

---

## 2. Backend routes

### 2.1 Central backend (`CB/server.js`, port 5000)

Auth column: **PHC key** = `requirePhcApiKey` (enforced, since `PHC_AUTH_ENABLED=true`). **User(role)** = `requireAuth` + `requireRole`, which are **not enforced** on this machine because `AUTH_ENABLED` is unset. Every route below is **CODE-VERIFIED**.

| Method | Path | Auth / role | What it does | Calls |
|---|---|---|---|---|
| GET | `/health` | none | Dependency-free heartbeat the PHC sync managers poll | — |
| POST | `/api/v1/auth/login` | none (lockout on repeated failures) | bcrypt check → JWT session cookie + CSRF token | `CB/routes/auth.js:92`, `services/authTokens.js`, `users` table |
| GET | `/api/v1/auth/me` | session | Current user | `routes/auth.js:134` |
| POST | `/api/v1/auth/logout` | — | Clear cookie | `routes/auth.js:157` |
| POST | `/api/v1/cases` | PHC key | Ingest image + questionnaire + capture metadata; idempotent on `capture_id_ref`; enqueues grading | `services/ingestionService.js` → `gradingQueue.enqueue` → `gradingOrchestrator.processCase` |
| POST | `/api/v1/cases/summary` | PHC key | Lightweight case packet ahead of the image (case sits `awaiting_image`) | `ingestionService` |
| POST | `/api/v1/cases/:captureRef/chunks/init` | PHC key | Start resumable upload session | `services/chunkedUploadService.js` |
| GET | `/api/v1/cases/:captureRef/chunks` | PHC key | List received chunks (resume) | `chunkedUploadService` |
| POST | `/api/v1/cases/:captureRef/chunks/:index` | PHC key | Upload one chunk | `chunkedUploadService.putChunk` |
| POST | `/api/v1/cases/:captureRef/chunks/complete` | PHC key | Assemble + verify, then ingest + enqueue | `chunkedUploadService.completeSession` → `ingestionService` |
| GET | `/api/v1/cases/:caseId/status` | PHC key OR user | Processing status | `routes/cases.js:253` |
| GET | `/api/v1/cases/:caseId` | user (ophthalmologist, district_admin) | Full case detail (grades, tier, lesions, Grad-CAM URL, questionnaires, prior assessments); access-logged | `ingestionService.getCaseDetail`, `accessLog` |
| POST | `/api/v1/cases/:caseId/claim` | user (ophthalmologist) | Claim for review; 409 if another reviewer holds it (TTL `CLAIM_TTL_MINUTES`=30) | `routes/cases.js:482` |
| POST | `/api/v1/cases/:caseId/review` | user (ophthalmologist) | Confirm/override in one transaction. **Rejects plain confirm when branches disagree.** Writes review, correction, dataset label, referral + SMS | `routes/cases.js:282-470`; `datasetCollector.recordLabel`; `referralNotificationService.handleConfirmedReferral` |
| GET | `/api/v1/cases/:caseId/reviews` | user | Review history | `routes/cases.js:568` |
| GET | `/api/v1/cases/:caseId/report` | user | Generate/cache clinical-rationale PDF | `services/caseReport.js` → MATLAB `ML/explainability/generateReport.m` |
| GET | `/api/v1/ophthalmologist/queue` | user (ophthalmologist) | Review queue ordered by tier/uncertainty, with claim state | `routes/ophthalmologistQueue.js:34` |
| GET | `/api/v1/admin/dashboard` | user (district_admin) | Aggregate per-PHC stats | `services/analyticsAggregator.getDashboard` |
| GET | `/api/v1/admin/referrals` | district_admin | Referral tracker list | `analyticsAggregator.getReferrals` |
| GET | `/api/v1/admin/system-health` | district_admin | Silent PHCs, stuck jobs, MATLAB/seg session, unreviewed referable cases, open alerts | `services/systemHealth.getSystemHealth` |
| GET | `/api/v1/admin/resource-recommendations` | district_admin | Latest staffing recommendation | `services/resourceRecommendations.latest` |
| POST | `/api/v1/admin/resource-recommendations/refresh` | district_admin | Run model now | `resourceRecommendations.refresh` → MATLAB `simulink-model/referenceQueueingModel.m('recommend')` |
| GET | `/api/v1/admin/simulink-validation` | district_admin | Last SimEvents validation result | `services/simulinkValidation.latest` |
| POST | `/api/v1/admin/simulink-validation/refresh` | district_admin | Run validation now | `simulinkValidation.refresh` → MATLAB `runDistrictScreeningModel.m` |
| PATCH | `/api/v1/referrals/:referralId` | district_admin | Update status (referred / manual_follow_up / contacted / attended / lost) + `assignedWorker` | `routes/referrals.js:37` |
| GET | `/api/v1/phc/:phcId/sync-status` | district_admin | Last sync time + last reported pending count | `analyticsAggregator.getPhcSyncStatus` |
| GET | `/api/v1/phc/cases/:captureRef/report` | PHC key | Graded result for a PHC's own capture (mobile case-report screen) | `ingestionService.getCaseDetail` |
| GET | `/api/v1/phc/cases/:captureRef/gradcam` | PHC key | Grad-CAM PNG for that capture | `routes/phc.js:145` |
| GET | `/api/v1/patients/search` | PHC key | Fuzzy duplicate lookup by name/age/phone (masked phone) | `routes/patients.js:55` |
| POST | `/api/v1/notifications/sms-status` | Twilio request signature | Delivery receipt; failure flips referral to `manual_follow_up` | `routes/notifications.js:46` → `referralNotificationService.handleDeliveryReport` |
| GET | `/media/*` | `requireAuth` (open while AUTH off) | Static case images, masks, Grad-CAM, PDFs | `CB/server.js:97` |

**Against v4 §5.6:** all 16 v4 endpoints exist. One differs in shape: v4 has `POST /cases/{case_id}/chunks`, the code has `/cases/:captureRef/chunks/{init,:index,complete}` plus a GET. The **BEYOND-V4** routes are `/auth/me`, `/auth/logout`, `GET /cases/:id`, `/cases/:id/report`, the chunk GET, `/admin/*/refresh`, `/admin/simulink-validation`, `/phc/cases/:captureRef/report|gradcam`, and `/notifications/sms-status`.

### 2.2 PHC local backend (`PB/server.js`, port 4000)

Auth column: **tech** = `requireTechnician` (**not enforced** here because `LOCAL_AUTH_ENABLED` is unset). **sealed** = AES-256-GCM envelope under the phone's pairing key. Every route below is **CODE-VERIFIED**.

| Method | Path | Auth | What it does | Calls |
|---|---|---|---|---|
| GET | `/health` | none | Heartbeat | — |
| POST | `/auth/login` | none (lockout) | Technician login → bearer token | `PB/routes/auth.js:34`, `services/localAuth.js`, `services/passwords.js` |
| GET | `/auth/me` · POST `/auth/logout` | token | Session info / logout | `routes/auth.js:57,63` |
| POST | `/patients` | tech | Register patient (consent timestamp, contact number); collision-safe ID | `routes/patients.js:45`, `services/ids.js` |
| GET | `/patients/search` | tech | Offline fuzzy duplicate check (same shape as central) | `routes/patients.js:113` |
| GET | `/patients/:patientId` · GET `/patients` | tech (read-audited) | Patient lookup / list | `routes/patients.js:167,187` |
| POST | `/captures` | tech | Save image, run quality gate, create capture + sync-queue row | `services/captureHandler.js` → `qualityGateClient.runQualityGate` → compiled exe \| `matlab -batch qualityGateMain` \| `qualityGateFallback.js` |
| POST | `/captures/mobile` | tech | Same, forcing the `mobile_lens` camera preset | `routes/captures.js:146` |
| POST | `/captures/:captureId/questionnaire` | tech | Patient risk + symptom questionnaire | `routes/captures.js:175` |
| POST | `/captures/:captureId/capture-metadata` | tech | Capture-metadata questionnaire + eye laterality | `routes/captures.js:254` |
| GET | `/captures` | tech | Local queue rows | `routes/captures.js:319` |
| GET | `/sync/status` | tech | Online flag, pending count, last attempt | `routes/sync.js:25`, `services/syncState.js` |
| POST | `/peer/pair` | localhost tech OR `phc_admin` | Register a phone; returns QR payload with the pairing key | `routes/peer.js:71`, `services/peerCrypto.js` |
| GET | `/peer/devices` · POST `/peer/devices/:id/revoke` | tech / admin | List or revoke paired phones | `routes/peer.js:88,92` |
| POST | `/peer/hello`, `/peer/login` | sealed | Handshake; technician login over the LAN without a clear-text password | `routes/peer.js:159,167` |
| POST | `/peer/pull`, `/peer/push` | sealed + peer tech | Change-log replication desktop↔phone | `services/peerSync.js` |
| POST | `/peer/image/get`, `/peer/image/put` | sealed + peer tech | Image transfer with sha256 check | `routes/peer.js:193,200` |
| POST | `/peer/bundle` | tech | Import a sealed export bundle carried by USB/SD | `services/peerBundle.js` |

Every `/peer/*` route is **BEYOND-V4**.

### 2.3 Mobile → central (no local server; direct HTTPS/HTTP to central)

`MOB/api/central.ts`: `GET /health`, `POST /api/v1/cases/summary`, `POST /api/v1/cases`, the chunk `init` / `:index` / `complete` routes, `GET /cases/:id/status`, `GET /phc/cases/:captureRef/report`, `GET /phc/cases/:captureRef/gradcam`. **CODE-VERIFIED.**

---

## 3. Data stores

### 3.1 Central Postgres (`CB/db/migrations/0001…0018`, applied by node-pg-migrate via `scripts/setupCentralDb.js`) — CODE-VERIFIED

Live row counts are read-only `count(*)` queries run 2026-09-25. All graded rows date from 2026-09-10.

| Table | Purpose | Key fields | Rows |
|---|---|---|---|
| `phc_sites` | PHC registry | `phc_id`, `name`, `last_sync_at`, `last_contact_at`, `pending_count`, `api_key_hash` | 1 |
| `patients` | Central patient mirror | `patient_id`, `patient_reference`, `name`, `age`, `contact_number`, `consent_given_at`, `registered_at` | 35 |
| `cases` | One per eye capture | `case_id`, `patient_id`, `phc_id`, `capture_id_ref` (**UNIQUE**, idempotency), `status`, `camera_device_id`, `camera_family_detected`, `eye_laterality_reported/_detected`, `image_path`, `questionnaire_data`, `capture_metadata`, `quality_scores`, `source_format`, `dicom_device_model`, `processing_started_at`, `failure_code/_reason/failed_at` | 36 (35 graded, 1 error) |
| `grading_results` | Dual-branch output + routing | `dr_grade_cnn`, `dr_grade_rule_engine`, `branch_agreement`, `referable`, `confidence_score`, `uncertainty_score`, `conformal_tier`, `tier_reason`, `model_version` (FK), `claimed_by`, `claimed_at`, `urgency_score/_factor/_inputs` | 35 (tier B 27, C 8, A 0; all `branchA_v1`) |
| `segmentation_outputs` | Lesions / landmarks | `lesion_counts` (JSON: red/bright/ma/he per quadrant + procedure), `nv_suspicion_score`, `vessel_map_path`, `lesion_masks_path`, `optic_disc_x/y`, `fovea_x/y`, `fovea_unreliable` | 0 non-null NV scores |
| `explainability_outputs` | XAI artefacts | `gradcam_path`, `evidence_summary_text`, `lesion_attention_consistency_score`, `rationale_report_path` | 0 rows with a PDF path |
| `ophthalmologist_reviews` | Decisions | `decision`, `override_reason_category/_text`, `corrected_grade`, `review_duration_seconds`, `ophthalmologist_id` | 17 (confirm 10, override 7) |
| `corrections` | Continual-learning feed | `case_id`, `review_id`, `used_in_model_version` | 7 |
| `dataset_labels` | **BEYOND-V4.** Labelled training examples from reviews | `label_grade`, `label_source`, `model_grade`, `image_sha256`, `consent_given_at`, `export_batch` | 0 |
| `referrals` | Follow-up tracker | `status` ∈ {referred, manual_follow_up, contacted, attended, lost}, `assigned_worker` | 16 (all `referred`) |
| `notifications` | SMS log | `channel`, `message_type`, `status`, `provider_message_id`, `error_detail` | 16 (all `dry_run`) |
| `model_versions` | Promotion registry | `version_id`, `validation_sensitivity/_specificity/_kappa`, `promoted` | 4 (v1, v2a, v2b, v2c; v1 and v2c promoted) |
| `users` | Central logins | `email`, `role` ∈ {ophthalmologist, district_admin}, `password_hash`, `is_active` | 2 |
| `access_log` | Audit trail | `user_id`, `action`, `resource_type`, `resource_id` | 7 |
| `grading_recoveries` | **BEYOND-V4.** Watchdog re-queues | `case_id`, `source`, `recovered_at` | 0 |
| `system_alerts` | **BEYOND-V4.** Open/resolved health alerts | `kind`, `subject`, `occurrences`, `resolved_at` | 1 (`seg_worker_down`) |
| `resource_recommendations` | **BEYOND-V4** as a table. Staffing model output | `min_ophthalmologists_routine/_camp`, `bottleneck`, `recommendation`, `params`, `model` | 0 |

v4 schema fields check: all present. The v4 `cases.eye` field is implemented as `eye_laterality_reported`. v4's "real migration tooling is a genuine gap" is **V4-STALE**: 18 migrations with up/down.

### 3.2 PHC desktop SQLite (`PB/db/schema.sql` + `PB/db/localDb.js`) — CODE-VERIFIED

| Table | Purpose | Key fields |
|---|---|---|
| `patients` | Local registry | `patient_id` (`{PHC}-{base36}-{8}`), `name`, `age`, `contact_number`, `consent_given_at`, `duplicate_of`, `demographics_json`, `questionnaire_json`, `origin_device` |
| `captures` | Per-eye image | `capture_id`, `eye`, `camera_device_id`, `source`, `quality_status`, `quality_reason`, `quality_scores`, `retake_count`, `best_effort`, `image_sha256` |
| `questionnaire_responses` | Patient risk/symptoms | `risk_factor_fields`, `symptom_fields`, `language` |
| `capture_metadata_responses` | About the photo | `camera_device_reported`, `pupil_status`, `lighting_environment`, `observed_issues`, `worker_usability_rating`, `eye_laterality` |
| `sync_queue` | Upload queue | `status`, `priority` (high = borderline), `chunks_sent/_total`, `central_case_id`, `central_status`, `owner_device` |
| `technicians`, `sessions` | **BEYOND-V4** as tables. Local login | `username`, `role`, `password_hash`; `token_hash`, `expires_at` |
| `access_log` | Local audit | `user_id`, `action`, `entity_type`, `entity_id` |
| `peer_devices` | **BEYOND-V4.** Paired phones | `device_id`, `key_b64`, `revoked_at` |
| `change_log`, `sync_ctx`, `kv` | **BEYOND-V4.** Replication cursor / settings | `seq`, `tbl`, `pk`, `origin` |

### 3.3 Mobile expo-sqlite (`MOB/db/database.ts`) — CODE-VERIFIED

Tables: `patients`, `captures`, `questionnaire_responses`, `capture_metadata_responses`, `sync_queue` (with `priority_tier`, `state`, `summary_sent_at`, `uploaded_at`, `attempts`, `next_attempt_at`, `last_error_code`), `change_log`, `sync_ctx`, `peer_images_sent`, `kv`. This is the per-record structured store v4 §4.4 asked for.

### 3.4 File stores

- `CB/media/cases/<caseId>/` holds images, masks and `gradcam.png` (36 on disk). There are **0 `report.pdf` files**.
- Chunk staging lives in `CB/media/chunks/`.
- `ML/models/` holds the weights.

---

## 4. Background jobs, crons, supervisors, workers

| Job | Where started | Schedule | What it does | Status |
|---|---|---|---|---|
| Grading queue workers | `CB/server.js:130` (on import) | continuous; `GRADING_CONCURRENCY`=1, `GRADING_MAX_ATTEMPTS`=3, retry base 2000 ms | In-process queue: Python Branch A + segmentation in parallel, then MATLAB `runCasePipeline.m`, then DB writes | CODE-VERIFIED (`CB/services/gradingQueue.js`) |
| Stranded-case recovery | `CB/server.js:142` | once at boot | Re-enqueues cases left `processing` | CODE-VERIFIED |
| Grading watchdog | `CB/server.js:150` | every 90 s (`GRADING_WATCHDOG_INTERVAL_MS`); min age 120 s; max 3 recoveries | Re-enqueues stuck cases, logs `grading_recoveries`, escalates past the limit | CODE-VERIFIED. v4 §17 "only at restart" is **V4-STALE** |
| MATLAB session supervisor | `CB/server.js:151` | every 30 s; heartbeat stale 30 s; startup grace 240 s; ≤3 restarts / 30 min | Keeps the persistent MATLAB inference session alive; raises a `system_alerts` row on failure | CODE-VERIFIED (`matlabSessionSupervisor.js`) |
| Segmentation worker supervisor | `CB/server.js:154` | every 30 s; startup grace 90 s; ≤3 restarts / 30 min | Same, for the Python M2–M5 worker (`ML/inference/segSession/runSegWorker.py`) | CODE-VERIFIED, **BEYOND-V4** |
| Persistent MATLAB inference session | spawned by supervisor | long-running | Serves Branch A, seg nets and the case pipeline (`ML/inference/matlabSession/runMatlabInferenceSession.m`). Log shows 18 OK Branch A requests, median 894 ms | CODE-VERIFIED |
| Resource model | `CB/server.js:156` | daily cron `30 2 * * *` (`RESOURCE_MODEL_CRON`) | MATLAB `referenceQueueingModel('recommend')` → `resource_recommendations` | CODE-VERIFIED; **0 rows ever written** |
| SimEvents validation | `CB/server.js:159` | weekly cron `0 3 * * 0` | MATLAB `runDistrictScreeningModel.m` → `simulink-model/out/last-validation.json` | CODE-VERIFIED as code. **Never produced output** (`out/` absent). SimEvents is not installed on this machine (`D:\toolbox\simevents` absent) |
| Continual learning | **not started anywhere** | would be daily `0 2 * * *`, threshold 20 corrections | Promotion gate exists; `retrainBranchA.m` does not exist, so it throws `retrain_not_implemented` | **V4-MISSING** (`CB/services/continualLearningService.js:165-178`) |
| Chunk-session sweep | **not scheduled** | would be TTL 7 days | `chunkedUploadService.sweepStale()` exists and is never called | CODE-VERIFIED as function; not wired |
| PHC desktop sync manager | `PB/server.js:73` | every 10 s (`SYNC_INTERVAL_MS`) | Heartbeat → upload queue (high priority first, then oldest); chunked above 2 MB; polls central status | CODE-VERIFIED (`PB/services/syncManager.js`) |
| Mobile sync manager | app start | every 15 s + on app-foreground + on network-up | Summary-first, then full or chunked upload with backoff | CODE-VERIFIED (`MOB/sync/syncManager.ts:97-101`, `MOB/config/index.ts:63`) |
| Mobile ↔ desktop peer replication | on demand / pairing | — | Pull/push change log + images over sealed LAN link | CODE-VERIFIED, **BEYOND-V4** (`MOB/peer/replicate.ts`) |

---

## 5. User-facing features by actor

"Code" means the logic exists. The UI column notes when a web screen shows MOCK data by default or on failure.

### 5.1 PHC technician — desktop app (`phc-local-app/frontend` + `PB`)

| Feature | Status |
|---|---|
| Login | CODE-VERIFIED when `VITE_USE_MOCK_DATA=false` (`PF/components/screens/LoginScreen.jsx:29`); **MOCK** in the default mode; backend not enforcing (`LOCAL_AUTH_ENABLED` unset) |
| Patient registration: name, age, contact, verbal-consent timestamp | CODE-VERIFIED; the consent checkbox **defaults to checked** (`PatientRegistrationForm.jsx:106`) |
| Fuzzy duplicate check at registration | CODE-VERIFIED (backend `PB/routes/patients.js:113`) |
| Collision-safe IDs `{PHC}-{base36}-{8}` | CODE-VERIFIED (`PB/services/ids.js`) |
| Patient questionnaire (duration, glycemic control, BP, pregnancy, 4 symptoms) | CODE-VERIFIED. v4 roadmap item 17 ("desktop catching up") is **V4-STALE** |
| Image capture/import + left/right eye tag | CODE-VERIFIED (`captures.js:270-275`) |
| Local quality gate: blur, low illumination, insufficient FOV, glare, motion, eyelash occlusion, composite borderline | CODE-VERIFIED. **Compiled-exe tier not built** (`PB/quality-gate-matlab/dist/` empty); runs via `matlab -batch` or the JS fallback |
| Quality result panel | **MOCK** when the backend is absent or returns no metrics: fabricated 0.94 / 0.88 / 0.86 / 0.98 (`PF/components/screens/CaptureScreen.jsx:89-110`) |
| Capture-metadata questionnaire | CODE-VERIFIED |
| Local queue + sync status | CODE-VERIFIED with **MOCK fallback** on any error (`PF/api/localApiClient.js:68,268,288`) |
| Result modal in queue | **MOCK** fallback: `mockAiPredictions.pass` (`LocalQueueTable.jsx:220`) |
| Offline store-and-forward, chunked resumable upload, priority ordering | CODE-VERIFIED |
| Summary-first packet | **V4-MISSING** on desktop (mobile only) |
| Storage-pressure warning | **V4-MISSING** on desktop (mobile only) |
| Best-effort / ungradable after retakes | Backend column `captures.best_effort` exists. **No desktop UI found** |
| Pair a phone (QR), USB/SD bundle import | CODE-VERIFIED, **BEYOND-V4** |
| 7 UI languages (bn, en, hi, mr, pa, ta, te) | CODE-VERIFIED |

### 5.2 PHC technician — mobile app (`MOB/`, entry `phc-local-app/mobile/App.tsx`)

| Feature | Status |
|---|---|
| Online login + offline cached credentials | CODE-VERIFIED (`MOB/auth/offlineCredentials.ts`) |
| Registration with contact number, consent, duplicate check, shared ID scheme | CODE-VERIFIED (`MOB/screens/RegistrationScreen.tsx`, `MOB/lib/ids.ts`, `MOB/lib/fuzzy.ts`) |
| Gallery import of a fundus-camera image | CODE-VERIFIED (`MOB/screens/CaptureScreen.tsx:101`) |
| **Phone + clip-on fundus-lens live capture** (torch, zoom, tap-focus, guide ring) | CODE-VERIFIED as code; **BEYOND-V4** and contradicts v4 §1.21 / §16 "explicitly rejected" (`MOB/screens/LensCameraScreen.tsx`) |
| On-device TS quality gate (port of MATLAB) | CODE-VERIFIED; parity test 17 images × 2 presets ALL PASSED (`verify_mobile_quality_gate_parity.mjs`) |
| Best-effort ungradable → mandatory Tier C notice | CODE-VERIFIED (`CaptureScreen.tsx:278`) |
| Both questionnaires | CODE-VERIFIED (`MOB/lib/questionnaire.ts`, `MOB/components/CaptureMetadataForm.tsx`) |
| Structured expo-sqlite queue; storage-pressure warning | CODE-VERIFIED (`MOB/db/`, `MOB/lib/storage.ts`) |
| Direct-to-central sync, summary-first + chunked | CODE-VERIFIED (`MOB/api/central.ts:117,168`) |
| Case report screen with Grad-CAM (from central `/phc/cases/...`) | CODE-VERIFIED, **BEYOND-V4** |
| Pairing + LAN replication with desktop | CODE-VERIFIED, **BEYOND-V4** |
| Legacy `phc-local-app/mobile/src/` (old ngrok app with mock fallback) | Dead code, not imported by `App.tsx` |

### 5.3 Ophthalmologist — central web (`CF/`)

| Feature | Status |
|---|---|
| Login | **MOCK**: any non-empty username/password is accepted; never calls `/api/v1/auth/login`; hardcoded profile (`CF/App.jsx:70-98`) |
| Review queue (tier, grades, agreement, claim, filters/sorting) | CODE-VERIFIED against the real API **only when `VITE_USE_MOCK_DATA=false`**. Default is **MOCK**, and it falls back to **MOCK** on error **or an empty queue** (`CF/api/centralApiClient.js:36-72`) |
| Case detail: fundus + Grad-CAM toggle | Real image when `imageUrl` exists; otherwise **MOCK** synthetic lesions/hotspots (`GradCamOverlay.jsx:117-185`) |
| Four-category lesion panel (MA, HE, hard exudates, soft exudates null) | CODE-VERIFIED (backend `CB/services/lesionCounts.js`) |
| Branch A vs Branch B side-by-side + disagreement flag | CODE-VERIFIED (`BranchComparisonPanel.jsx`) |
| Claim on open, 409 lock display | CODE-VERIFIED (`CaseDetailPage.jsx:65`, `routes/cases.js:482`) |
| Confirm / override with reason + corrected grade; confirm blocked on disagreement | CODE-VERIFIED in UI (`DecisionControls.jsx:125`) and server (`routes/cases.js:374`). But `submitReview` returns a **MOCK** success if the call fails (`centralApiClient.js:216`) |
| Review timer → `review_duration_seconds` | CODE-VERIFIED; 17 team-test reviews in DB (confirm avg 46.2000000000000000 s, override avg 70.1428571428571429 s) |
| Keyboard shortcuts (C / O / Ctrl+Enter) | CODE-VERIFIED, **BEYOND-V4** (`DecisionControls.jsx:21-48`) |
| Case history / prior assessments | Backend CODE-VERIFIED (`ingestionService.js:648`); UI renders it with an illustrative SVG fundus |
| Clinical-rationale PDF | Backend CODE-VERIFIED; **no UI button**; 0 PDFs generated |
| Urgency score (queue tie-break after tier, `CB/routes/ophthalmologistQueue.js:52-67`) | CODE-VERIFIED as code; 0 non-null values in DB; **BEYOND-V4** (synthetic-trained, `ML/grading/calculateUrgencyScore.m`) |

### 5.4 District admin — central web

| Feature | Status |
|---|---|
| Dashboard (screenings per PHC, turnaround) | **MOCK always**: `getAdminDashboard()` never calls the API (`centralApiClient.js:223-226`). Backend `/admin/dashboard` is CODE-VERIFIED but unused |
| System health (silent PHC 48 h, stuck job 15 min, MATLAB/seg session, unreviewed referable 48 h) | Backend CODE-VERIFIED (`CB/services/systemHealth.js:30-32`); UI real with **MOCK fallback** |
| PHC sync-status table | **MOCK always** (`getPhcSyncStatuses`, `centralApiClient.js:261-264`) |
| Referral tracker list | Real when mock is off, otherwise **MOCK** |
| Referral status update / assign ASHA worker | **MOCK always** in the UI (`updateReferral` never sends the PATCH, `centralApiClient.js:247-259`). Backend PATCH CODE-VERIFIED |
| Resource recommendations + Simulink validation (view / refresh) | UI real with **MOCK fallback**; backend CODE-VERIFIED; **no real output exists yet** |
| `FieldOpsPage.jsx` | Not routed (dead) |

### 5.5 ASHA / community health worker

| Feature | Status |
|---|---|
| Assigned-worker field on referrals | CODE-VERIFIED (`referrals.assigned_worker`, `PATCH /referrals/:id`) |
| ASHA's own login / interface | Not built (v4 §18 leaves this open) |
| Auto-route to `manual_follow_up` on SMS failure | CODE-VERIFIED (`referralNotificationService.js:260`); never exercised in the DB (all 16 referrals are `referred`) |

### 5.6 Patient / SMS

| Feature | Status |
|---|---|
| Verbal-consent timestamp at registration | CODE-VERIFIED (`patients.consent_given_at`) |
| SMS only after ophthalmologist confirmation of a referable case | CODE-VERIFIED (`routes/cases.js` review → `handleConfirmedReferral`) |
| Twilio live send | CODE-VERIFIED (`SMS_DRY_RUN=0`). **All 16 notifications in the DB are `dry_run`** |
| Delivery receipts (signed webhook) | CODE-VERIFIED; needs a public URL (`TWILIO_STATUS_CALLBACK_URL` is commented out in `.env`) |
| In-person result on the phone (mobile case report) | CODE-VERIFIED, **BEYOND-V4** |

### 5.7 System behaviours no one clicks (automated)

- **Tier routing** (`decideTier`, `CB/services/gradingOrchestrator.js:488-560`), all CODE-VERIFIED:
  - Forced to C: branch disagreement, CNN grade 4, quality-forced.
  - Floor A→B: camera mismatch on probation (<20 cases), fovea unreliable, eye-laterality mismatch (**BEYOND-V4**), unvalidated camera (**BEYOND-V4**; the only allow-list entry is `"DEMO SEED -- NOT A REAL VALIDATION"`, which makes it **MOCK**).
- **Fovea peak-confidence gate** (0.37): CODE-VERIFIED (`ML/inference/segInfer.py:86`). v4 roadmap "not yet built" is **V4-STALE**.
- **Idempotent ingestion** on `capture_id_ref`: CODE-VERIFIED (migration 0005).
- **DICOM input**: CODE-VERIFIED (`ML/preprocessing/readFundusImage.m`). A v4 roadmap item, now built.

---

## 6. BEYOND-V4 and V4-MISSING

### 6.1 BEYOND-V4 (in code, not in v4)

1. **Phone + fundus-lens live capture** on mobile (`MOB/screens/LensCameraScreen.tsx`, `PB/routes/captures.js:146`, `mobile_lens` quality preset). This contradicts v4 §1.21 and §16.
2. Desktop↔phone **peer replication** over the LAN with QR pairing and AES-256-GCM, plus sealed USB/SD bundles (`PB/routes/peer.js`, `PB/services/peer*.js`, `MOB/peer/*`, `docs/peer-sync-protocol.md`).
3. Mobile **case-report screen** and PHC-key result endpoints `/api/v1/phc/cases/:captureRef/report|gradcam`.
4. Mobile **offline credential cache**; desktop technician accounts and sessions (`PB/scripts/technician.js`).
5. **Unvalidated-camera Tier A floor** + `CB/config/validatedCameras.json` (demo seed only).
6. **Eye-laterality cross-check** against DICOM `ImageLaterality`; `source_format` / `dicom_device_model` provenance (migrations 0009, 0016).
7. **Triage urgency score**: forest trained on synthetic data, Shapley top factor, used only as a review-queue tie-break (`ML/grading/calculateUrgencyScore.m`, migration 0018, `CB/routes/ophthalmologistQueue.js:67`).
8. **Segmentation worker + its supervisor**; MATLAB-served segmentation with PyTorch parity (`ML/diagnostics/out/seg_backend_parity.txt`).
9. **`system_alerts`**, **`grading_recoveries`** and **`dataset_labels`** tables; `scripts/exportTrainingSet.js` corpus export.
10. **`tier_reason`** stored per case; `grade0Vs1Disagreement` log flag.
11. **Rule-engine thresholds keyed by red-lesion model version** (`ML/models/rule_thresholds_by_red_version.json`, `ML/grading/optimizeRuleThresholds.m`).
12. **EyePACS in training** (v2b, v2c) and DRIVE for vessel evaluation. v4 §14 lists neither.
13. **Messidor-2 site-recalibration and shift-stress experiments** (`ML/experiments/messidor2*.py`).
14. **Simulink additions**: full-pipeline model `simulink-model/netraSetuPipeline.slx`, analytic `referenceQueueingModel.m` (the daily recommendation engine), `monteCarloQueueing.m`, `sweepDistrictScenarios.m`, `calibration.json` exported from live data (`scripts/exportSimCalibration.js`).
15. **Central MATLAB Compiler entry points** (`ML/deploy/netraSetuCaseMain.m`, `netraSetuInferMain.m`, `buildCaseChain.m`). v4 calls this step "unstarted"; the code is started but not built.
16. **Admin endpoints** `/resource-recommendations/refresh`, `/simulink-validation` (+refresh); Twilio webhook `/notifications/sms-status`.
17. **Keyboard shortcuts** in review; **7-language i18n** across all three front-ends.
18. **`experimenting Frontend/`**: three.js 3D-eye intro prototype.
19. **Automated tests.** I ran 24/24 `PB/test/auth-peer.test.js`, 23/23 `phc-local-app/mobile/test/unit.test.mjs`, and the 35-check TS↔MATLAB quality-gate parity. v4 §17 "zero automated tests" is **V4-STALE**.

### 6.2 V4-MISSING (in v4, absent from code or from the live path)

1. **Real login in the central web UI.** Backend auth exists; the UI is MOCK and `AUTH_ENABLED` is unset. Desktop `LOCAL_AUTH_ENABLED` is also unset (§1.3/§11.1).
2. **No-fabricated-results rule (§1.22).** Violated by both web apps' mock fallbacks (§5.1, §5.3).
3. **Admin dashboard, PHC sync status and referral update wired to the backend** (always MOCK in the UI).
4. **Encryption at rest** (AES-256 on DB and images). Not found. **TLS** code exists but is not configured.
5. **Compiled quality-gate executable** (MATLAB Compiler + Runtime tier). `PB/quality-gate-matlab/dist/` is empty.
6. **MATLAB Compiler packaging of central inference**: entry points only (v4 already says not done).
7. **Continual-learning retraining**: no `retrainBranchA.m`, and the service is never started.
8. **Symptom/risk fusion as a confidence adjustment** (§6.10). Not found; questionnaire data feeds only the urgency score (a queue tie-break).
9. **Venous-beading and IRMA detectors.** The rule engine accepts them but nothing produces them, so the 4-2-1 rule is partial.
10. **NV suspicion score as a live signal.** Computed but deliberately disabled after AUC 0.2863 on IDRiD-test and 0.3793 on Messidor-2 (`ML/experiments/nv_validation_run.log`).
11. **Per-domain vessel threshold** (fixed 0.5 at `ML/inference/segInfer.py:322`) and **Frangi filter in the live path** (`ML/segmentation/vesselSegmentationFrangi.m` exists but is not called).
12. **Grad-CAM++.** Only Grad-CAM was found.
13. **Quality factors** contrast, colour balance and excessive black border as distinct reasons (6 of v4's 9 are implemented).
14. **Clinical-rationale PDF in the reviewer UI.** Backend only; never generated (0 files, 0 DB paths).
15. **Desktop summary-first packet and storage-pressure indicator** (mobile has both).
16. **Desktop best-effort / ungradable UI.** Column only.
17. **Camp relay device** (§9.5). The peer link is desktop↔phone within a PHC, not a multi-station relay.
18. **Periodic Simulink output.** The cron is wired but has never produced a recommendation or validation file, and SimEvents is not installed on this machine.
19. **Docker/CI.** None found.
20. **ASHA-facing interface.** Left open in v4 §18; not built.
21. **Clinician plausibility rating and a real review-time study.** `ML/experiments/explainability_results.json` says both are "NOT MEASURED" / "NOT DONE".

**DOC-ONLY items relevant to this file:**
- Soft-exudate Dice 0.076 appears only in docs.
- The claim that the MATLAB session is faster than Python for Branch A has no saved Python timing to compare against.
- The "ML Layer Final Report 2026-09-21", cited in code comments, is not in the repo.
