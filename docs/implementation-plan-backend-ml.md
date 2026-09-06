# Implementation Plan — Backend + ML Layer
## Owners: Tanuj & Saad (pair/split as you see fit — Kankshi joins specific tasks as Tanuj assigns)

This is written for the **full system** as specced in the design document, not just the internal-round demo. There's a clearly marked **CHECKPOINT** partway through — everything above it is what "a respectable version connected to the frontend" means for Sept 10. Everything below it continues afterward toward the fuller SIH-ready system. Don't skip ahead past the checkpoint line before finishing what's above it — the frontend team is depending on the API contract from Phase 3 existing by then, even in rough form.

Mock data is the frontend's fallback, not yours — your job is to make the real path exist and work, even in a thin version, by the checkpoint.

---

## Shared Repository Directory Structure

This is the full baseline. You'll only touch `phc-local-app/backend/`, `central-system/backend/`, `simulink-model/`, and `datasets/` — the rest belongs to the frontend track, shown here so you know what you're integrating with.

```
dr-screening-system/
├── README.md
├── docs/
│   ├── system-design-v3-final.md
│   ├── implementation-plan-backend-ml.md
│   ├── implementation-plan-frontend.md
│   ├── diagram-pipeline-layers.svg
│   └── diagram-phc-central-architecture.svg
│
├── phc-local-app/
│   ├── frontend/                          # frontend track owns this
│   └── backend/                           # YOU OWN THIS
│       ├── package.json
│       ├── server.js
│       ├── routes/
│       │   ├── captures.js
│       │   ├── patients.js
│       │   └── sync.js
│       ├── services/
│       │   ├── captureHandler.js
│       │   ├── qualityGateClient.js
│       │   └── syncManager.js
│       ├── db/
│       │   ├── schema.sql
│       │   └── localDb.js
│       └── quality-gate-matlab/
│           ├── qualityGateMain.m
│           ├── assessFocus.m
│           ├── assessIllumination.m
│           ├── assessFOV.m
│           ├── assessGlareMotionOcclusion.m
│           └── cameraPresets.json
│
├── central-system/
│   ├── frontend/                          # frontend track owns this
│   └── backend/                           # YOU OWN THIS
│       ├── package.json
│       ├── server.js
│       ├── routes/
│       │   ├── cases.js
│       │   ├── ophthalmologistQueue.js
│       │   ├── adminDashboard.js
│       │   └── referrals.js
│       ├── services/
│       │   ├── ingestionService.js
│       │   ├── gradingOrchestrator.js
│       │   ├── referralNotificationService.js
│       │   ├── continualLearningService.js
│       │   └── analyticsAggregator.js
│       ├── db/
│       │   ├── schema.sql
│       │   └── pgClient.js
│       └── ml-pipeline/
│           ├── preprocessing/
│           │   ├── claheEnhance.m
│           │   ├── illuminationNormalize.m
│           │   └── benGrahamCrop.m
│           ├── cameraCalibration/
│           │   ├── classifyCameraFamily.m
│           │   └── calibrationProfiles.json
│           ├── segmentation/
│           │   ├── opticDiscFovea.m
│           │   ├── vesselSegmentationUnet.m
│           │   ├── lesionSegmentationRedLesion.m
│           │   ├── lesionSegmentationBrightLesion.m
│           │   └── neovascularizationSuspicion.m
│           ├── grading/
│           │   ├── branchA_cnnClassifier.m
│           │   ├── branchB_ruleEngine.m
│           │   └── branchAgreementCheck.m
│           ├── calibration/
│           │   ├── temperatureScaling.m
│           │   ├── mcDropoutUncertainty.m
│           │   └── conformalTiering.m
│           ├── explainability/
│           │   ├── gradCam.m
│           │   ├── lesionAttentionConsistency.m
│           │   └── counterfactualOcclusionTest.m
│           ├── models/
│           │   └── README.md              # where trained .mat network files live (git-ignored if large)
│           └── training/
│               ├── trainBranchAClassifier.m
│               ├── trainVesselUnet.m
│               ├── trainLesionUnets.m
│               └── evaluateMetrics.m
│
├── simulink-model/                        # YOU OWN THIS
│   ├── districtScreeningSimEvents.slx
│   └── README.md
│
├── datasets/                              # YOU OWN THIS
│   ├── README.md                          # links to APTOS/IDRiD/DRIVE/Messidor-2, download instructions — not the data itself
│   └── .gitignore                         # ignore the actual image files, they don't belong in git
│
└── scripts/
    ├── setupLocalDb.js
    └── setupCentralDb.js
```

Stack: Node.js + Express for both backends (matches what the team already knows), SQLite for the local DB, PostgreSQL for the central DB, MATLAB for every file under `ml-pipeline/` and `quality-gate-matlab/`. Node talks to MATLAB either via the MATLAB Engine API for JavaScript/Node during development, or by shelling out to a compiled executable later (Phase 8 covers the switch).

---

## Phase 0 — Setup (do this together, first)

**Task 0.1 — Scaffold both backends**
- Files: `phc-local-app/backend/package.json`, `phc-local-app/backend/server.js`, `central-system/backend/package.json`, `central-system/backend/server.js`
- Build: two separate Express apps. Local one listens on a port like 4000, central one on 5000. Each just needs a `/health` route returning `{status: "ok"}` at this point — this is purely scaffolding so both servers boot.
- Connects to: nothing yet, but this is what `syncManager.js` (Task 3.4) will eventually talk to over HTTP, and what the frontend's `config.js` API base URLs (frontend track, Task 0.3) will point at.

**Task 0.2 — Local database schema**
- File: `phc-local-app/backend/db/schema.sql`
- Build: write the actual `CREATE TABLE` statements for `patients`, `captures`, `questionnaire_responses`, `capture_metadata_responses`, `sync_queue` — field lists are in the design doc §4.3. Use `TEXT` for IDs (locally generated, PHC-prefixed strings, not auto-increment integers, since these need to be globally unique once synced centrally).
- File: `phc-local-app/backend/db/localDb.js`
- Build: a small module that opens the SQLite file (e.g. via `better-sqlite3`), runs `schema.sql` on first start if tables don't exist, and exports simple `get`/`run`/`all` helpers.
- Connects to: every route under `phc-local-app/backend/routes/` will import this.

**Task 0.3 — Central database schema**
- File: `central-system/backend/db/schema.sql`
- Build: `CREATE TABLE` statements for `patients`, `cases`, `grading_results`, `segmentation_outputs`, `explainability_outputs`, `ophthalmologist_reviews`, `referrals`, `notifications`, `corrections`, `model_versions`, `phc_sites`, `users` — full field lists in design doc §5.5. Use UUID for primary keys (Postgres `gen_random_uuid()`).
- File: `central-system/backend/db/pgClient.js`
- Build: a `pg` connection pool module, plus a one-time init script (`scripts/setupCentralDb.js`) that runs `schema.sql` against a fresh database.
- Connects to: every route and service under `central-system/backend/`.

**Task 0.4 — Datasets folder**
- File: `datasets/README.md`
- Build: list the four dataset download links (APTOS 2019, IDRiD, DRIVE, Messidor-2) from the design doc §13, with a one-line note on what each is used for and where to unzip them locally (e.g. `datasets/aptos2019/`, `datasets/idrid/segmentation/`, `datasets/idrid/grading/`, `datasets/idrid/localization/`, `datasets/drive/`, `datasets/messidor2/`). Add these subfolder names to `datasets/.gitignore` so the actual images never get committed.

---

## Phase 1 — Local Quality Gate (MATLAB)

**Task 1.1 — Basic quality heuristics**
- Files: `phc-local-app/backend/quality-gate-matlab/assessFocus.m`, `assessIllumination.m`, `assessFOV.m`
- Build: three MATLAB functions, each taking an image matrix and returning a 0–1 score. `assessFocus.m` uses Laplacian variance (`fspecial('laplacian')` + `imfilter`, then variance of the result — low variance means blurry). `assessIllumination.m` checks mean/std of pixel intensity against a target range. `assessFOV.m` checks whether a large-enough circular retinal region is present (basic thresholding + `regionprops` on the binarized image to estimate coverage).
- Connects to: `qualityGateMain.m` (next task) calls all three and combines them.

**Task 1.2 — Quality gate main entry point**
- File: `phc-local-app/backend/quality-gate-matlab/qualityGateMain.m`
- Build: a function `qualityGateMain(imagePath, cameraDeviceId)` that loads the image, loads the matching preset from `cameraPresets.json` (fall back to a default preset if the device isn't recognized), runs the three assessment functions, computes a composite score, and returns a struct: `{status: 'pass'|'retake'|'borderline', reason: string, scores: struct}`. Status is `retake` if any critical factor fails outright (e.g. FOV coverage below ~50%); `borderline` if the composite score is in a middle band; `pass` otherwise.
- File: `phc-local-app/backend/quality-gate-matlab/cameraPresets.json`
- Build: a JSON file with per-device-name threshold overrides — start with one `"default"` entry, add real presets once you know which camera models are actually in play.
- Connects to: `qualityGateClient.js` (Task 1.3) calls this from Node.

**Task 1.3 — Node ↔ MATLAB bridge**
- File: `phc-local-app/backend/services/qualityGateClient.js`
- Build: for now, use the MATLAB Engine API for JavaScript (`npm install --save node-matlab-engine` or MathWorks' official Node engine package) to call `qualityGateMain` directly from a running MATLAB session — this is much faster to set up than compiling a standalone executable, and is fine for the demo. Export a single async function `runQualityGate(imagePath, cameraDeviceId)` that returns the same struct `qualityGateMain.m` produces.
- Connects to: `captureHandler.js` (Task 3.1) calls this right after a photo is captured.
- Note: packaging this as a true standalone MATLAB Compiler executable (so the PHC machine doesn't need MATLAB installed at all) is a **post-checkpoint task (Task 8.1)** — don't spend checkpoint-week time on it.

**Task 1.4 — Expand quality factors**
- Files: new `phc-local-app/backend/quality-gate-matlab/assessGlareMotionOcclusion.m`
- Build: add glare (large saturated bright region detection), motion-blur-specific check (directional blur via a motion-blur kernel comparison, distinct from plain focus blur), and eyelash/eyelid occlusion (dark irregular region intruding from the image edge). Feed these into `qualityGateMain.m`'s composite score alongside the Phase 1 factors.
- Connects to: extends `qualityGateMain.m` from Task 1.2 — update its scores struct to include these.

---

## Phase 2 — Central ML Pipeline, Core Path

**Task 2.1 — Preprocessing**
- File: `central-system/backend/ml-pipeline/preprocessing/claheEnhance.m`
- Build: MATLAB function applying `adapthisteq` to the luminance/green channel.
- File: `central-system/backend/ml-pipeline/preprocessing/illuminationNormalize.m`
- Build: homomorphic filtering or large-kernel background subtraction for uneven lighting.
- File: `central-system/backend/ml-pipeline/preprocessing/benGrahamCrop.m`
- Build: circular retinal-region crop + Gaussian-blur background subtraction (the standard APTOS-winning-solutions preprocessing step).
- Connects to: called in sequence by `gradingOrchestrator.js` (Task 2.6) before any model runs.

**Task 2.2 — Branch A training data prep**
- File: `central-system/backend/ml-pipeline/training/trainBranchAClassifier.m` (this file will hold both prep and training logic)
- Build: load APTOS 2019 + IDRiD grading subset images, apply Ben Graham preprocessing, resize to your chosen input size (384–512px), split 70/15/15 stratified by grade (design doc §13). Cache the processed tensors so you don't reprocess on every run.
- Connects to: dataset paths from `datasets/aptos2019/` and `datasets/idrid/grading/` (Task 0.4).

**Task 2.3 — Branch A model training**
- Same file: `central-system/backend/ml-pipeline/training/trainBranchAClassifier.m`
- Build: transfer-learn ResNet-50 or EfficientNet (`imagePretrainedNetwork` / `trainnet` in Deep Learning Toolbox) on the prepped data. Use an ordinal-aware loss (a weighted cross-entropy where the weight scales with |predicted grade − true grade|, not plain categorical cross-entropy) plus class weighting for the severe-grade imbalance (design doc §6.7). Save the trained network to `central-system/backend/ml-pipeline/models/branchA_v1.mat`.
- Connects to: `branchA_cnnClassifier.m` (Task 2.4) loads this saved model for inference.

**Task 2.4 — Branch A inference wrapper**
- File: `central-system/backend/ml-pipeline/grading/branchA_cnnClassifier.m`
- Build: a function `classifyBranchA(preprocessedImage)` that loads `branchA_v1.mat` (cache the loaded network across calls, don't reload per request) and returns `{grade: 0-4, probabilities: [5 floats]}`.
- Connects to: called by `gradingOrchestrator.js`.

**Task 2.5 — Basic calibration**
- File: `central-system/backend/ml-pipeline/calibration/temperatureScaling.m`
- Build: fit a single temperature parameter on the validation split's logits (minimize NLL — Statistics and Machine Learning Toolbox has what you need for the optimization), save it alongside the model. At inference, divide logits by this temperature before softmax.
- Connects to: called right after `branchA_cnnClassifier.m` in the orchestrator.

**Task 2.6 — Grad-CAM (basic)**
- File: `central-system/backend/ml-pipeline/explainability/gradCam.m`
- Build: use Deep Learning Toolbox's built-in `gradCAM` function against the trained Branch A network, return a heatmap image path.
- Connects to: called by the orchestrator, output path gets stored in `explainability_outputs.gradcam_path`.

**Task 2.7 — Grading orchestrator**
- File: `central-system/backend/services/gradingOrchestrator.js`
- Build: a function `processCase(caseId)` that: loads the case's image path from the `cases` table, calls preprocessing (Task 2.1) → Branch A (Task 2.4) → temperature scaling (Task 2.5) → Grad-CAM (Task 2.6), then writes a row into `grading_results` and `explainability_outputs`. Call MATLAB the same way as Task 1.3 (Engine API), or via a single MATLAB script that chains all the steps and returns one JSON blob to keep the Node↔MATLAB boundary simple.
- Connects to: this is the center of the whole backend — `ingestionService.js` (Task 3.2) triggers it after a case arrives.

---

## Phase 3 — Backend Services & Wiring

**Task 3.1 — Local capture handler**
- File: `phc-local-app/backend/services/captureHandler.js`
- Build: a function that receives the raw image (from the frontend's capture screen upload), saves it to local disk, inserts a row into `captures`, then immediately calls `qualityGateClient.js` (Task 1.3) and updates the row's `quality_status`/`quality_reason`.
- Connects to: called from `routes/captures.js`, which the frontend's capture screen POSTs to.

**Task 3.2 — Local routes**
- Files: `phc-local-app/backend/routes/captures.js`, `patients.js`, `sync.js`
- Build: `POST /captures` (calls Task 3.1), `POST /patients` (insert into `patients`), `GET /patients/:id`, `POST /captures/:id/questionnaire` (writes to `questionnaire_responses`), `POST /captures/:id/capture-metadata` (writes to `capture_metadata_responses`), `GET /sync/status` (returns pending count from `sync_queue`).
- Connects to: this is the exact API contract the frontend's `localApiClient.js` (frontend track) needs — share this list with Vedant/Krrish as soon as it's stable, even before it's fully implemented, so they can build their mock data to match the same shape.

**Task 3.3 — Central ingestion**
- File: `central-system/backend/services/ingestionService.js`
- File: `central-system/backend/routes/cases.js`
- Build: `POST /api/v1/cases` receiving image + patient questionnaire + capture-metadata questionnaire, storing the image, inserting into `cases`, then calling `gradingOrchestrator.processCase()` (Task 2.7) — for the checkpoint version this can be a direct synchronous call; a proper job queue is a post-checkpoint improvement (Task 8.3).
- Connects to: this is what the local `syncManager.js` (Task 3.4) POSTs to.

**Task 3.4 — Sync manager**
- File: `phc-local-app/backend/services/syncManager.js`
- Build: check network reachability (a simple periodic fetch to the central `/health` endpoint), and if reachable, POST any `sync_queue` rows with status `pending` to the central `/api/v1/cases` endpoint; on success mark `synced`, on failure leave `pending` for retry. Chunked upload for large images under poor bandwidth is a **post-checkpoint task (Task 8.4)** — for the checkpoint, a single-shot upload is fine.
- Connects to: reads from local `sync_queue` table, writes to central `cases` table via HTTP.

**Task 3.5 — Ophthalmologist queue + review endpoints**
- File: `central-system/backend/routes/ophthalmologistQueue.js`
- Build: `GET /api/v1/ophthalmologist/queue` (join `cases` + `grading_results`, filter to referable/uncertain, order by priority), `POST /api/v1/cases/:id/review` (insert into `ophthalmologist_reviews`, and if it's an override, insert into `corrections`).
- Connects to: this is the exact contract the ophthalmologist frontend needs — share early, same as Task 3.2.

**Task 3.6 — Referral & notification service**
- File: `central-system/backend/services/referralNotificationService.js`
- Build: after a review is confirmed (Task 3.5), if referable, insert a `referrals` row (status `referred`) and send the patient SMS via Twilio (you've used Twilio before — reuse that setup), insert a `notifications` row.
- Connects to: triggered from the review endpoint; reads patient contact number from `patients`.

**Task 3.7 — Admin dashboard endpoints (basic)**
- File: `central-system/backend/routes/adminDashboard.js`, `central-system/backend/services/analyticsAggregator.js`
- Build: `GET /api/v1/admin/dashboard` returning simple counts (cases today per PHC, average review time) computed with plain SQL aggregate queries — no need for anything fancier at this stage.
- Connects to: admin frontend's dashboard page.

---

## ✅ CHECKPOINT — Sept 10 internal round target

If everything above this line works end to end — capture → local quality gate → sync → central grading (Branch A + calibration + Grad-CAM) → ophthalmologist review → referral SMS → basic admin numbers — that **is** "a respectable version of the backend + ML ready and connected to the frontend." Don't feel behind if segmentation, Branch B, and Simulink aren't done yet; they're explicitly below the line for a reason. If you're ahead of schedule, pull from Phase 4 next, in the order it's written — that's the priority order.

---

## Phase 4 — Segmentation

**Task 4.1 — Vessel segmentation**
- File: `central-system/backend/ml-pipeline/segmentation/vesselSegmentationUnet.m`, training logic in `central-system/backend/ml-pipeline/training/trainVesselUnet.m`
- Build: train a U-Net (`unet` + `trainnet`/`trainNetwork`, Deep Learning Toolbox) on DRIVE's 40 images with heavy augmentation (rotation, flip, elastic deformation). Save to `models/vessel_unet_v1.mat`. The inference function returns a binary vessel mask.
- Connects to: output feeds Task 4.2 (vessel-mask pruning for microaneurysm candidates) and Task 4.4 (NV suspicion score).

**Task 4.2 — Red-lesion segmentation (microaneurysms, hemorrhages)**
- File: `central-system/backend/ml-pipeline/segmentation/lesionSegmentationRedLesion.m`, training in `trainLesionUnets.m`
- Build: U-Net trained on IDRiD's 81-image segmentation subset (microaneurysm + hemorrhage masks only). Prune candidates that fall entirely within the vessel mask (Task 4.1) before finalizing. Use transfer learning from the vessel model's encoder weights, since 81 images alone is too small to train from scratch (design doc §16). Output: lesion mask + quadrant-mapped counts (divide the image into 4 quadrants relative to the optic disc–fovea axis from Task 4.5, count lesions per quadrant).
- Connects to: quadrant counts feed `branchB_ruleEngine.m` (Task 5.1) directly.

**Task 4.3 — Bright-lesion segmentation (exudates, cotton-wool spots)**
- File: `central-system/backend/ml-pipeline/segmentation/lesionSegmentationBrightLesion.m`
- Build: separate U-Net, same IDRiD subset (hard/soft exudate masks), with optic-disc masking applied first (exclude the optic disc region from candidates to avoid confusing its natural brightness with an exudate).
- Connects to: same as Task 4.2 — quadrant counts feed the rule engine.

**Task 4.4 — Neovascularization suspicion score**
- File: `central-system/backend/ml-pipeline/segmentation/neovascularizationSuspicion.m`
- Build: NOT a segmentation model. Compute vessel density, branching complexity, and tortuosity from the vessel mask (Task 4.1), restricted to a ring around the optic disc and major arcades. Combine into a single 0–1 suspicion score via a simple weighted formula — no training data exists to justify anything fancier (design doc §1.12). Output feeds `grading_results` and, if high, forces Branch B toward grade 4 regardless of what Branch A says.
- Connects to: `branchB_ruleEngine.m`.

**Task 4.5 — Optic disc / fovea localization**
- File: `central-system/backend/ml-pipeline/segmentation/opticDiscFovea.m`
- Build: classical CV first pass (`imfindcircles` for the bright, roughly-circular optic disc region), refined by a small regression CNN fine-tuned on IDRiD's 516-image localization subset for sub-pixel-accurate centers. Fovea estimated from its typical position relative to the optic disc plus the vessel arcade geometry.
- Connects to: gives the quadrant-mapping axis that Tasks 4.2 and 4.3 need.

---

## Phase 5 — Dual-Branch Grading

**Task 5.1 — Rule engine (Branch B)**
- File: `central-system/backend/ml-pipeline/grading/branchB_ruleEngine.m`
- Build: plain MATLAB function, no toolbox dependency — literally encode the ICDR/ETDRS criteria from design doc §6.7 as `if`/`switch` logic over the quadrant lesion counts (Tasks 4.2, 4.3) and the NV suspicion score (Task 4.4): no lesions → grade 0; microaneurysms only → grade 1; microaneurysms plus other lesions but short of severe criteria → grade 2; the 4-2-1 rule (>20 hemorrhages in all 4 quadrants, OR venous beading in ≥2 quadrants, OR IRMA in ≥1 quadrant) → grade 3; NV suspicion above threshold → grade 4. Write this as a small, isolated, easily unit-testable function — it's the easiest thing in the whole ML layer to write a test suite for, so do it.
- Connects to: output compared against Branch A in Task 5.2.

**Task 5.2 — Branch agreement check**
- File: `central-system/backend/ml-pipeline/grading/branchAgreementCheck.m`
- Build: compare Branch A's and Branch B's grades. Agreement → proceed to normal tiering (Task 6.1). Disagreement → force `conformal_tier = 'C'` regardless of confidence, and set `branch_agreement = false` in `grading_results`.
- Connects to: called by `gradingOrchestrator.js`, right after both branches run — update the orchestrator to call Branch B and this check alongside what Phase 2 already built.

---

## Phase 6 — Calibration Upgrades

**Task 6.1 — MC Dropout uncertainty**
- File: `central-system/backend/ml-pipeline/calibration/mcDropoutUncertainty.m`
- Build: run Branch A's forward pass 10–20 times with dropout layers active, compute variance across the runs as the uncertainty score.
- Connects to: feeds conformal tiering (Task 6.2) and `grading_results.uncertainty_score`.

**Task 6.2 — Conformal prediction tiers**
- File: `central-system/backend/ml-pipeline/calibration/conformalTiering.m`
- Build: split-conformal calibration — hold out a calibration fold, compute the quantile of nonconformity scores needed for your target NPV/PPV guarantee (Statistics and Machine Learning Toolbox's quantile functions), then at inference assign Tier A/B/C per design doc §6.8's table.
- Connects to: this is what actually sets `grading_results.conformal_tier`, replacing the placeholder threshold logic from the checkpoint version.

**Task 6.3 — Camera-fingerprint calibration**
- File: `central-system/backend/ml-pipeline/cameraCalibration/classifyCameraFamily.m`, `calibrationProfiles.json`
- Build: classify camera family from vignetting shape/aspect ratio/color-channel gain ratios, cross-check against the worker-reported `camera_device_id` from the capture-metadata questionnaire, apply the matching profile's enhancement parameters in `claheEnhance.m` (Task 2.1). Log a mismatch flag when detected ≠ reported.
- Connects to: runs right after preprocessing starts, feeds back into the same preprocessing step with adjusted parameters.

---

## Phase 7 — Explainability Safeguards & Continual Learning

**Task 7.1 — Grad-CAM safeguards**
- Files: `central-system/backend/ml-pipeline/explainability/lesionAttentionConsistency.m`, `counterfactualOcclusionTest.m`
- Build: `lesionAttentionConsistency.m` computes overlap between Grad-CAM's heatmap energy and the lesion masks (Tasks 4.2/4.3) — a simple IoU-style score, restricted to the retinal ROI. `counterfactualOcclusionTest.m` masks the top lesion region and reruns Branch A, checking the predicted probability actually drops — run this offline during validation, not per-request in production.
- Connects to: consistency score gets stored in `explainability_outputs.lesion_attention_consistency_score` and shown on the ophthalmologist's case detail screen.

**Task 7.2 — Continual learning service**
- File: `central-system/backend/services/continualLearningService.js`
- Build: a scheduled job (cron-style) that checks the `corrections` table for new entries since the last run, and once a threshold is hit, kicks off a retraining pass (a MATLAB script variant of `trainBranchAClassifier.m` that fine-tunes from the current checkpoint using original data + weighted corrections), evaluates the result against the held-out validation set, and only writes a new `model_versions` row with `promoted = true` if it doesn't regress on sensitivity/specificity/kappa.
- Connects to: reads `corrections`, writes `model_versions`, and — if promoted — updates which `.mat` file `branchA_cnnClassifier.m` loads.

---

## Phase 8 — Deployment Hardening

**Task 8.1 — MATLAB Compiler packaging for the local quality gate**
- Build: package `qualityGateMain.m` as a standalone executable via MATLAB Compiler + MATLAB Runtime, so the PHC machine doesn't need a MATLAB license. Swap `qualityGateClient.js` (Task 1.3) from calling the Engine API to shelling out to the compiled executable.

**Task 8.2 — Chunked/resumable sync upload**
- Update `syncManager.js` (Task 3.4) and add `POST /api/v1/cases/:id/chunks` to `central-system/backend/routes/cases.js` for large-image transfer under poor bandwidth.

**Task 8.3 — Proper job queue for grading**
- Replace the synchronous call in `ingestionService.js` (Task 3.3) with a real queue (e.g. a simple in-memory or Redis-backed job queue) so central grading doesn't block the ingestion request under load.

**Task 8.4 — Simulink district model**
- File: `simulink-model/districtScreeningSimEvents.slx`
- Build: the discrete-event model from design doc §7 — entity generator for patient arrivals, a queue/server pair for network transmission, a resource pool for ophthalmologist review capacity. Wire its output into `analyticsAggregator.js`'s resource-recommendation numbers.
