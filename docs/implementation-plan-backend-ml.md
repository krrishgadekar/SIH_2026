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

## Problem-statement coverage map

*Added 2026-09-08 after auditing the repo against the PS. Keep this current —
it is the only place the five numbered PS requirements are traceable to tasks,
and four of the rows below existed as requirements with no task at all until
this audit.*

| PS requirement | Tasks | State |
|---|---|---|
| **1.** Quality assessment (focus, illumination, FOV) | 1.1–1.5 | ✅ done |
| **1.** Recapture feedback for ungradeable | 1.5, 3.1, 3.2 | ✅ done |
| **1.** CLAHE + illumination normalization | 2.1 | ✅ done |
| **1.** Denoising | **2.1b** | ❌ was missing entirely |
| **1.** *Adaptive* enhancement for borderline | **2.8** | ❌ borderline detected, then ignored |
| **2.** Optic disc / fovea localization | 4.5 | ⬜ not started |
| **2.** Vessel segmentation | 4.1 | ⬜ not started |
| **2.** Microaneurysm detection (**sub-pixel**) | 4.2 | ⬜ not started |
| **2.** Exudate segmentation | 4.3 | ⬜ not started |
| **2.** Hemorrhage *classification* (distinct from MA) | 4.2 | ⬜ not started |
| **2.** Neovascularization | 4.4 | ⬜ deliberate deviation — see task |
| **3.** ICDR 0–4 grading | 2.2–2.4 | ⚠️ architecture only; model is an untrained stub |
| **3.** >90% sens / >85% spec, referable | **9.1** | ❌ no harness existed to measure it |
| **4.** Grad-CAM | 2.6 | ✅ built (meaningless until a real model lands) |
| **4.** Lesion-level evidence vs clinical criteria | 5.1, 7.1 | ⬜ needs Phase 4 |
| **4.** Calibrated confidence | 2.5, 6.2 | ⚠️ math verified, T=1 placeholder |
| **4.** Automated annotated reports | **7.3** | ❌ column existed, nothing wrote to it |
| **4.** <30 s ophthalmologist validation | **9.4** | ❌ never measured |
| **5.** Simulink workflow simulation | **3.8** | ⬜ moved up from 8.4; blocked on Task 0.0 |
| *Expected solution:* outperforms any single technique | **9.2** | ❌ nothing built to compare against |
| *Expected solution:* validation vs published benchmarks | 9.1, 9.3 | ❌ not started |
| *Tools:* Computer Vision, Medical Imaging toolboxes | **4.6** | ❌ zero usage; both licensed, not installed |

**Bold** task numbers were added or moved by this audit. They were named
requirements with nowhere to land — the kind of gap that stays invisible until
the demo, because nothing fails when a task that does not exist is not done.

---

## ⚠️ Task 0.0 — Install the missing MATLAB products (BLOCKING)

Checked on the dev machine (MATLAB R2026a, 2026-09-08). Five products the
problem statement names as required tools are **licensed but not installed**:

| Product | Installed | Licensed | Blocks |
|---|---|---|---|
| Simulink | ❌ | ✅ | Task 3.8 — PS requirement 5, a separately graded deliverable |
| SimEvents | ❌ | ✅ | Task 3.8 |
| Computer Vision Toolbox | ❌ | ✅ | Phase 4 segmentation |
| Medical Imaging Toolbox | ❌ | ✅ | Phase 4 segmentation |
| Statistics and Machine Learning Toolbox | ❌ | ✅ | Task 6.2 conformal quantiles |
| Deep Learning Toolbox Model for ResNet-50 | ❌ | n/a | Tasks 2.2/2.3 transfer learning |

`licensed = 1, installed = 0` for all five — this is a **download, not a
procurement problem**. Install via the MATLAB installer / Add-On Explorer.
Verify afterwards with:

```
matlab -batch "ver"
```

Two consequences if this is left undone:

1. **Task 3.8 (Simulink) cannot start at all.** It is 1 of the PS's 5 numbered
   requirements and is listed again in the expected-solution bullets.
2. **Transfer learning is impossible without the ResNet-50 support package.**
   `imagePretrainedNetwork("resnet50")` errors without it. The current
   `branchA_v1.mat` stub works around this with `Weights="none"` (random
   weights), which is fine for plumbing and useless for training — see
   `docs/model-handoff-guide.md` §0.

Two of these products (Computer Vision, Medical Imaging) currently have **zero
usage anywhere in the codebase**. They are named tools in the PS, so find a
genuine use in Phase 4 rather than a decorative one — see Task 4.6.

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

**Task 2.1b — Denoising** *(added 2026-09-08 — was missing)*
- File: `central-system/backend/ml-pipeline/preprocessing/denoiseRetinal.m`
- **Why this exists:** PS requirement 1 names three enhancement steps —
  "CLAHE, illumination normalization, **denoising**". Task 2.1 built the first
  two and no denoising step existed anywhere in the codebase. This closes a
  named requirement gap, not a nice-to-have.
- Build: `function outImg = denoiseRetinal(img, method)`. Default to
  edge-preserving denoising that does **not** erase microaneurysms — they are
  a few pixels across and are exactly what a naive Gaussian or median filter
  destroys. Prefer `imdiffusefilt` (anisotropic diffusion) or `imnlmfilt`
  (non-local means), both Image Processing Toolbox, over `medfilt2`.
- **Ordering matters:** denoise BEFORE `claheEnhance`, since CLAHE amplifies
  whatever noise survives. The chain becomes
  `benGrahamCrop → denoiseRetinal → claheEnhance → illuminationNormalize`.
  Changing the chain changes what the model sees, so if Branch A has already
  been trained on the old chain, it must be retrained — coordinate with whoever
  owns training before merging this (`docs/model-handoff-guide.md` §2).
- **Definition of Done:** on a known lesion-bearing IDRiD image, run the lesion
  count before and after denoising and confirm microaneurysm-scale structures
  survive. A denoiser that improves apparent image quality while removing the
  smallest lesions is a net loss for this system — verify, don't assume.
- Connects to: `gradingOrchestrator.js`, and the training preprocessing chain.

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

**Task 2.8 — Adaptive enhancement for borderline images** *(added 2026-09-08 — was missing)*
- File: `central-system/backend/ml-pipeline/preprocessing/adaptiveEnhance.m`
- **Why this exists:** PS requirement 1 says "apply adaptive enhancement …
  **for borderline images**". Today the quality gate correctly labels an image
  `borderline`, the design doc calls that state "borderline-enhanced" — and
  then `gradingOrchestrator.js` runs the **identical** preprocessing chain for
  `pass` and `borderline` alike. The word "adaptive" is currently
  unimplemented: borderline is detected and then ignored. This is a real
  behavioural gap, not a documentation one.
- Build: `function outImg = adaptiveEnhance(img, qualityScores)` — take the
  sub-score struct the quality gate already computes (`focusScore`,
  `illuminationScore`, `fovScore`, `glareScore`, `motionScore`,
  `occlusionScore`; these are computed and currently used only for logging) and
  vary the enhancement by which dimension is weak:
  - low `illuminationScore` → stronger illumination normalization, higher CLAHE
    clip limit;
  - low `focusScore` → mild unsharp masking (`imsharpen`) before CLAHE;
  - high `glareScore` → attenuate saturated regions before contrast boosting,
    so CLAHE does not amplify the glare itself.
- **Plumbing prerequisite:** the sub-scores currently die at the PHC — they are
  logged by `captureHandler.js` and never transmitted. They must be carried
  through `POST /api/v1/cases` and stored (add a `quality_scores JSONB` column
  to `cases`) before this function has anything to switch on. Do that first;
  otherwise this task silently has no input.
- **Definition of Done:** the same borderline image processed with and without
  adaptive enhancement produces visibly different output, and the difference is
  in the dimension the gate flagged — not a global change applied regardless.
- Connects to: `gradingOrchestrator.js`, branching on `cases.quality_status`.

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

**Task 3.8 — Simulink district screening model** *(moved 2026-09-08 from Task 8.4 — PULLED FORWARD)*
- Files: `simulink-model/districtScreeningSimEvents.slx`,
  `simulink-model/buildDistrictScreeningModel.m`,
  `simulink-model/README.md`
- **Why this moved.** It was Task 8.4 — dead last, below the checkpoint, behind
  segmentation, dual-branch grading, calibration, explainability safeguards and
  continual learning. But it is **PS requirement 5 of 5**, and it is named a
  second time in the expected-solution bullets ("a Simulink model optimizing
  screening resource allocation"). Scheduling a fifth of the graded problem
  last means it is the thing that silently dies if anything slips.
  It also **has no dependency on the ML pipeline whatsoever** — its inputs are
  arrival rates, bandwidth tiers and reviewer capacity, all modelled
  assumptions (design doc §7). So it is the one major deliverable that can be
  built fully in parallel, by someone else, while the model trains. There is no
  reason for it to be last except that it was written last.
- **BLOCKED BY Task 0.0** — Simulink and SimEvents are licensed but not
  installed. Nothing here can run until they are.
- Build: SimEvents discrete-event model per design doc §7 —
  - Entity Generator: patient image arrivals, rate configurable per PHC.
  - Queue + Server pair: network transmission, service time a function of
    bandwidth (model the poor-connectivity tiers explicitly — that is the
    rural-deployment point the PS is asking about).
  - Priority Queue + Resource Pool: ophthalmologist review, ~30 s service time
    for Tier B and several minutes for Tier C, with **Tier C pre-empting
    Tier B** on the same reviewer pool.
  - Scale to the PS's stated figure: a district program serving **100,000+
    patients annually**. Report where the bottleneck lands at that volume.
- Build it with a **committed build script** (`buildDistrictScreeningModel.m`,
  using `new_system` / `add_block` / `add_line`), not only by hand in the GUI.
  A `.slx` is an opaque binary: it cannot be meaningfully diffed or code
  reviewed, and merge conflicts on it are unresolvable. The script is the
  reviewable source of truth; the `.slx` is a build artifact.
- Outputs: queue length over time, average wait, bottleneck location, and a
  plain-language resource recommendation, exported to `.mat`/`.csv` for
  `analyticsAggregator.js` to read into the admin Resource Recommendations panel.
- **Definition of Done:** the model runs across at least two contrasting
  scenarios (e.g. 3 PHCs / 1 ophthalmologist vs 10 PHCs / 2 ophthalmologists)
  and the recommendation changes accordingly. A model that emits the same
  advice regardless of input is not a model.
- **Say so explicitly in the demo:** bandwidth and sync-timing parameters are
  modelled assumptions, not measured field data (design doc §16).

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
- **Sub-pixel microaneurysm centroids — REQUIRED, not optional** *(clarified 2026-09-08)*.
  The PS names "sub-pixel microaneurysm detection" twice, including in its
  closing line ("this problem demands clinical validation rigor, sub-pixel
  microaneurysm detection, and clinically meaningful explainability"). A U-Net
  mask is pixel-resolution by construction, so the mask alone does **not**
  satisfy this. Add an explicit refinement step: for each connected component
  in the red-lesion mask, compute an intensity-weighted centroid (first-order
  image moments over the local patch) to get a fractional-pixel `(x, y)`.
  Store the sub-pixel coordinates, not just the counts.
- **Separate microaneurysms from hemorrhages in the output** *(clarified 2026-09-08)*.
  The PS lists "microaneurysm detection" and "hemorrhage classification" as two
  distinct deliverables. Training one combined red-lesion class is still the
  right call given 81 images (design doc §6.6), but the two must be
  **distinguishable in the output** or a named requirement looks unmet. Split
  them post-hoc by connected-component area and circularity — microaneurysms
  are small and round, dot/blot hemorrhages larger and more irregular — and
  report `lesion_counts` with separate `microaneurysms` and `hemorrhages` keys,
  as `api-contracts.md` already specifies. Be honest in the writeup that the
  split is a morphological rule applied after a single-class segmentation, not
  two independently trained and validated detectors.
- **Definition of Done additions:** FROC curve (sensitivity vs false positives
  per image) for microaneurysm detection — that is the convention this
  literature uses, and a Dice score alone will be read as evasive.
- Connects to: quadrant counts feed `branchB_ruleEngine.m` (Task 5.1) directly.

**Task 4.3 — Bright-lesion segmentation (exudates, cotton-wool spots)**
- File: `central-system/backend/ml-pipeline/segmentation/lesionSegmentationBrightLesion.m`
- Build: separate U-Net, same IDRiD subset (hard/soft exudate masks), with optic-disc masking applied first (exclude the optic disc region from candidates to avoid confusing its natural brightness with an exudate).
- Connects to: same as Task 4.2 — quadrant counts feed the rule engine.

**Task 4.4 — Neovascularization suspicion score**
- File: `central-system/backend/ml-pipeline/segmentation/neovascularizationSuspicion.m`
- Build: NOT a segmentation model. Compute vessel density, branching complexity, and tortuosity from the vessel mask (Task 4.1), restricted to a ring around the optic disc and major arcades. Combine into a single 0–1 suspicion score via a simple weighted formula — no training data exists to justify anything fancier (design doc §1.12). Output feeds `grading_results` and, if high, forces Branch B toward grade 4 regardless of what Branch A says.
- **Deliberate deviation from the PS wording — argue it, do not hide it** *(flagged 2026-09-08)*.
  The PS says "neovascularization **detection**". This task delivers a
  *suspicion score* instead, because no available dataset has pixel-level NV
  annotations and claiming a validated detector would be a claim the data
  cannot support (design doc §1.12, §16). That is the right call and it should
  stay. But an unexplained gap between "detection" and "suspicion score" reads
  as something the team could not do, rather than something it chose. So:
  state it explicitly in the PPT, give NV its own recall number rather than
  folding it into an aggregate that hides the weakness, and label the output
  "possible proliferative pattern — urgent review", never "neovascularization
  detected". Route it straight to urgent human review, which is what makes the
  honest version clinically useful anyway.
- Connects to: `branchB_ruleEngine.m`.

**Task 4.5 — Optic disc / fovea localization**
- File: `central-system/backend/ml-pipeline/segmentation/opticDiscFovea.m`
- Build: classical CV first pass (`imfindcircles` for the bright, roughly-circular optic disc region), refined by a small regression CNN fine-tuned on IDRiD's 516-image localization subset for sub-pixel-accurate centers. Fovea estimated from its typical position relative to the optic disc plus the vessel arcade geometry.
- Connects to: gives the quadrant-mapping axis that Tasks 4.2 and 4.3 need.

**Task 4.6 — Put the two unused named toolboxes to genuine work** *(added 2026-09-08)*
- **Why this exists:** the PS names six tools. **Computer Vision Toolbox** and
  **Medical Imaging Toolbox** currently have *zero* usage anywhere in the
  codebase. Judges do check the tool list, and Phase 4 is the natural and
  honest place for both — this is not about bolting on a decorative call.
- Computer Vision Toolbox, genuine uses in this phase:
  - `labeloverlay` / `insertObjectAnnotation` for the annotated lesion overlays
    that Task 7.3's report needs;
  - `bboxOverlapRatio` and the `evaluateSemanticSegmentation` / FROC-style
    metrics machinery for Task 4.2's lesion-level evaluation;
  - point/blob detectors as the classical-CV candidate generator feeding the
    red-lesion U-Net, which is what design doc §6.6 already describes.
- Medical Imaging Toolbox, genuine uses:
  - `medicalImage` objects for consistent handling and metadata;
  - its segmentation metrics (Dice, Jaccard, Hausdorff) for Phase 4 evaluation,
    rather than hand-rolling them.
- **Definition of Done:** each toolbox is used somewhere it is actually the
  right tool, and you can say in one sentence why, per call site. If the only
  honest answer is "to tick the box", leave it out and say in the PPT that you
  did not need it — that reads better than a decorative dependency.

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

**Task 7.3 — Automated annotated report** *(added 2026-09-08 — was missing)*
- File: `central-system/backend/ml-pipeline/explainability/generateEvidenceReport.m`
- **Why this exists:** PS requirement 4 asks for "**automated annotated
  reports**" alongside Grad-CAM and calibrated confidence. Nothing in the
  codebase generates one. The `explainability_outputs.evidence_summary_text`
  column exists and is never written to — the requirement was schema'd and then
  never built.
- Build: `function [reportPath, summaryText] = generateEvidenceReport(caseId, ...)`
  producing (a) a one-paragraph structured summary and (b) an annotated image.
  The summary is **templated from the lesion counts, not free-form prose** —
  it must be reproducible and translatable, and a generated sentence that
  editorialises about a diagnosis is exactly what §16 says this system must not
  do. Target shape, matching the example already in `api-contracts.md`:
  > "6 microaneurysms (superior-temporal: 3, inferior-nasal: 3), 2 dot
  > hemorrhages. Severe-NPDR criteria not met."
- The annotated image marks lesion locations and quadrant boundaries over the
  fundus photo (`insertObjectAnnotation`, Computer Vision Toolbox — see Task 4.6).
- **State the criterion that was and was not met**, as in the example. Naming
  the rule the case failed to meet is what makes the report auditable against
  ICDR/ETDRS rather than a bare assertion, and it is the same rule text Branch B
  (Task 5.1) already encodes — reuse it, do not restate it in a second place
  that can drift.
- **Definition of Done:** report generated for a graded case, written to
  `evidence_summary_text`, and returned by `GET /api/v1/cases/:caseId`. Every
  number in the sentence traces to a stored lesion count — no figure appears in
  the text that is not in the database.
- Connects to: Tasks 4.2/4.3 (counts), 5.1 (criteria), and the ophthalmologist
  case-detail screen.

---

## Phase 9 — Clinical Validation & Benchmarking *(added 2026-09-08 — was missing)*

**This phase is the PS's "expected solution" section.** Every bullet the PS
lists as an expected deliverable is measured here. Without it the project can
build everything and still not be able to *state* what it achieved — and the
headline claims are all numbers, not features. `evaluateMetrics.m` was in the
directory structure from Task 0 and has been empty the whole time.

**Task 9.1 — Evaluation harness**
- File: `central-system/backend/ml-pipeline/training/evaluateMetrics.m`
- Build: `function metrics = evaluateMetrics(net, testImds, opts)` reporting, on
  the held-out test split (never the calibration fold):
  - **sensitivity and specificity for referable DR (grade ≥ 2)** — the PS's
    >90% / >85% headline, *with confidence intervals*;
  - **quadratic-weighted kappa** across all 5 grades;
  - per-grade confusion matrix, and NV recall reported separately (design doc §16);
  - reliability diagram + expected calibration error, before and after
    temperature scaling — this is what evidences "calibrated confidence scores"
    in PS requirement 4.
- Definition of Done: writes a `.mat` + a human-readable summary, and populates
  the `model_versions` validation columns. Those columns are the continual-
  learning promotion gate (§6.11), so this task is what makes that gate real.

**Task 9.2 — Integrated pipeline vs single-technique baseline**
- File: `central-system/backend/ml-pipeline/training/compareToBaseline.m`
- **Why this exists:** the PS's expected solution asks for "validation against
  published benchmarks showing **the integrated pipeline outperforms any single
  technique approach**". That is a comparative claim, and nothing in the plan
  produced anything to compare against. As written, the project could not have
  substantiated its own headline result.
- Build: evaluate three configurations on the identical test split —
  1. Branch A CNN alone (the single-technique baseline);
  2. Branch B rule engine alone, on segmentation output;
  3. the integrated pipeline (dual-branch + agreement check + calibration + tiering).
  Report the same metric set from Task 9.1 for each.
- Also report **branch agreement rate**, and — where review capacity allows
  measuring it — how often a flagged disagreement corresponded to a real
  grading error caught on review. That is the direct evidence for the
  two-branch design (design doc §1.11, §14), and it is more persuasive than the
  accuracy delta alone.
- **Report the result honestly even if the integrated pipeline does not win.**
  A measured negative is a finding; a fabricated positive is misconduct, and it
  will not survive a technically literate question.

**Task 9.3 — External validation and the domain-generalization-gap experiment**
- Build: evaluate the same frozen model on progressively less similar data —
  IDRiD test split → Messidor-2 → a synthetic portable-camera-perturbed set
  (vignetting, colour shift, resolution degradation applied to a clean test
  set). Then report how much of the gap camera-fingerprint calibration
  (Task 6.3) recovers.
- This is the flagship result in design doc §14: it is a direct, quantified
  answer to the PS's own stated concern about portable-camera image quality.
- Cross-dataset degradation is **expected** — present it as the experiment
  working, not as a failure to hide (design doc §16).

**Task 9.4 — Explainability validation, including the <30 s claim**
- Build: PS requirement 4 sets a specific, measurable bar — ophthalmologist
  validation "in under 30 seconds". `ophthalmologist_reviews.review_duration_seconds`
  already exists; nothing currently populates it from a real timer.
  - Instrument the review screen to record actual time-to-decision and report
    the distribution, not a single average.
  - Report lesion-attention consistency and the counterfactual occlusion test
    (Task 7.1) as quantitative measures.
  - Add a small clinician plausibility rating (2–3 reviewers, "would this
    evidence help you decide") — the PS asks for Grad-CAM "rated as clinically
    useful", which is a human judgement and cannot be self-assessed.
- Definition of Done: a reported median review time with n stated. If n is 3
  demo reviews, say n = 3 — a real number with a small n is defensible; an
  unqualified "under 30 seconds" is not.

---

## Phase 8 — Deployment Hardening

**Task 8.1 — MATLAB Compiler packaging for the local quality gate**
- Build: package `qualityGateMain.m` as a standalone executable via MATLAB Compiler + MATLAB Runtime, so the PHC machine doesn't need a MATLAB license. Swap `qualityGateClient.js` (Task 1.3) from calling the Engine API to shelling out to the compiled executable.

**Task 8.2 — Chunked/resumable sync upload**
- Update `syncManager.js` (Task 3.4) and add `POST /api/v1/cases/:id/chunks` to `central-system/backend/routes/cases.js` for large-image transfer under poor bandwidth.

**Task 8.3 — Proper job queue for grading**
- Replace the synchronous call in `ingestionService.js` (Task 3.3) with a real queue (e.g. a simple in-memory or Redis-backed job queue) so central grading doesn't block the ingestion request under load.

**Task 8.4 — Simulink district model** → **MOVED to Task 3.8** *(2026-09-08)*
- Pulled above the checkpoint. It is PS requirement 5 of 5, it is named again in
  the expected-solution bullets, and it has no dependency on the ML pipeline —
  so it can be built in parallel rather than last. See Task 3.8.
