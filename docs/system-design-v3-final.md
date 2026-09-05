# PS 26038 — Explainable AI for Diabetic Retinopathy Screening
## Master System Design Document — v3 (Final)

**Team:** Tanuj (lead), Saad, Krrish, Kankshi, Vedant, Parth
**Status:** Final working reference for the PPT and implementation. Incorporates the team's own design work plus the parts of the teammates' research (a Perplexity/RetinaSaarthi report, a NetraGuard architecture note, and an async implementation plan) that extend this design without reversing decisions already made. One proposal — moving all processing to a fully asynchronous, no-local-AI batch model — was reviewed and deliberately not adopted, since it would have removed the real-time local quality gate and immediate in-person result this design was built around; its one genuinely good sub-idea (a structured capture-metadata questionnaire) was kept and adapted instead.

**How to use this document:** Section 1 explains *why* the system looks the way it does — read it once, fully, before building anything. Sections 4–9 are the specs. Section 15 tells you what to actually build first under time pressure. Section 16 is the honest list of what this system can't yet claim.

---

## 1. Ideation & Design Rationale

### 1.1 The Problem, Restated
India has ~1 ophthalmologist per 100,000 rural people, and diabetic retinopathy (DR) affects ~18% of the country's 77M+ diabetic adults. Early screening prevents 90% of DR-related blindness, but there aren't enough specialists to manually screen at population scale. The task isn't "build an AI that detects DR" — it's "let a non-specialist technician at a Primary Health Centre (PHC) do what only a specialist could do before, and let that specialist trust and act on the AI's output in seconds, not minutes." Every design choice below traces back to that sentence.

### 1.2 Why the Edge/Cloud Split Looks the Way It Does
Rural PHCs have unreliable or absent internet and modest computers. The PS's accuracy bar (>90% sensitivity, sub-pixel microaneurysm detection) is hard enough to hit with a *full-capacity* model — compressing it to survive on modest edge hardware risks losing exactly the accuracy the PS grades on. The only thing that genuinely benefits from running locally is the image-quality check, because a technician needs an instant retake decision before the patient leaves the chair. So: **local does quality gating and nothing else; central does all grading.**

### 1.3 Why Capture Is Camera-Only, Not Mobile+Camera
The team standardized on a dedicated fundus camera alone, feeding a local computer application, to keep the capture-side software surface small for a hackathon timeline. (A mobile capture path, if reintroduced later, is a new input adapter into the same local application — nothing else changes.)

### 1.4 Why Connectivity Handling Looks the Way It Does
Offline-first isn't a nice-to-have — it's the difference between the system working at a real rural PHC or not. The local app always stores locally first, then transmits opportunistically: immediately and in real time if the network is up, or queued (chunked if bandwidth is poor) if it isn't. Patient communication follows the same logic: in-person if the technician can give an answer before the patient leaves; SMS if not.

### 1.5 Why a DR-Positive Result Always Waits for Ophthalmologist Confirmation
The AI never gets to directly tell a patient they have a disease. Every "probably have DR" outcome — real-time or delayed — is confirmed by an ophthalmologist before it becomes an SMS. This is both a safety requirement and the definition of the human-in-the-loop workflow the PS asks for.

### 1.6 Why the District Admin View Is Aggregate-First
An admin managing a whole district needs to know where the system is backed up and where resources should move, not a push per patient. Individual case detail is one click away, not the default view.

### 1.7 Why the Symptom/Risk Questionnaire Is a Helper, Not a Diagnostic Input
Early DR is very often symptomless — that's the entire reason population screening exists. Known DR *risk factors* (diabetes duration, glycemic control, blood pressure) are more predictive than symptoms, so the combined form captures both, but it only ever nudges the image model's confidence — it never overrides what the image shows. No dataset given by SIH links patient history to outcomes, so this is a transparent, clinically-referenced scoring layer, not a trained model.

### 1.8 Why "Continual Learning," Not "Reinforcement Learning"
An ophthalmologist flagging a false positive with a reason, and the model retraining on that correction, is supervised correction over time — not an agent learning through reward signals. Calling it reinforcement learning would collapse under a technically literate question. A validation gate (a newly retrained model cannot replace the live one unless it holds up on a held-out test set) is a safety requirement, not a suggestion.

### 1.9 Why the Non-ML Features Exist
Each one closes a gap that shows up in real screening programs: referral loss-to-follow-up, camp/batch screening matching how outreach actually happens in India, ASHA worker handoff plugging into an existing community health workforce, camera-source tagging costing nothing now and paying off the moment a second camera model enters the field.

### 1.10 Why There's a Second, Separate Questionnaire — Capture Metadata, Not Patient Health
The patient symptom/risk questionnaire (§1.7) is about the patient's health. It has nothing to do with whether the photo itself is technically good. A second, separate structured form — filled in by the technician about the capture (device, pupil dilation, lighting, anything they noticed, their own rough usability read) — gives the quality gate and the central camera-calibration step a human-observed cross-check that pixel analysis alone never has. Keeping the two forms separate matters: merging "how is the patient" with "how is this photo" would confuse both what's being asked and how each answer gets used downstream.

### 1.11 Why Grading Has Two Independent Branches, Not Just One Classifier
A single CNN can't explain *why* it might be wrong on a given image, and it can't be audited against the exact clinical criteria an ophthalmologist trained on. Running an explicit rule engine — the same ICDR/ETDRS criteria a grader would apply, computed directly from the lesion counts the segmentation stage already produces — alongside the CNN gives a second, independent opinion. When they agree, that's real evidence the grade is right. When they disagree, that's a safety signal, not noise to average away — the case gets mandatory review. This is also what turns "the integrated pipeline outperforms any single technique" from a slogan into a literal, checkable claim.

### 1.12 Why Neovascularization Gets a Suspicion Score, Not a Segmentation Claim
Neovascularization defines the most severe DR stage and has the least public pixel-level training data of any lesion type here. Claiming a validated segmentation result for it would be a claim the available datasets can't support. A suspicion score from vessel-pattern irregularity, routed straight to urgent human review, is useful, safe, and honest — without overclaiming.

---

## 2. Actors & Personas

| Actor | Role | Touches |
|---|---|---|
| PHC Technician | Non-medical, minimally trained | Local PHC application only |
| Patient | Never touches software | Receives in-person message and/or SMS |
| Ophthalmologist | Remote specialist | Central website — ophthalmologist interface |
| District Health Administrator | Never reviews individual images | Central website — admin interface |
| ASHA / Community Health Worker | Referral follow-up | Referred-case status, via admin interface hand-off (not a separate login in this version) |

---

## 3. High-Level Architecture

![Pipeline layers](diagram_pipeline_layers.svg)

![PHC and central system architecture](diagram_phc_central_architecture.svg)

**Cross-cutting principle — where MATLAB lives:** the PS's MATLAB/toolbox requirement applies to the **actual image-analysis and modeling code** — quality gate, preprocessing, camera calibration, segmentation, both grading branches, calibration, explainability, and the Simulink resource model. It does **not** mean the UI, database, or API layer must be MATLAB. The explicit ICDR rule engine (§6.7) is plain, testable MATLAB code with no toolbox dependency — that's a feature, not a gap, since it's easy to unit-test against the clinical rule text directly.

---

## 4. Local PHC Application — Full Spec

### 4.1 Frontend Components

| Screen | Components | Notes |
|---|---|---|
| Patient Lookup / Registration | ID/search field, new-patient form (name, age, contact number) | Contact number is required — the only channel for delayed/offline results |
| Capture | Camera trigger, live/last-capture preview, "Retake" and "Accept" actions | Talks to Capture Handler (§4.2) |
| Quality Result | Pass/fail badge, specific reason (blur / dark / off-centre / poor field of view / glare / motion artifact / eyelash occlusion / poor color balance / excessive border), retake button | Never a bare rejection — always a reason |
| Patient Questionnaire (symptom + risk, combined form) | Structured fields — §9.1 — regional-language labels, toggle/dropdown (no free text) | About the patient |
| Capture Metadata Questionnaire | Structured fields — §9.6 — tap-only, under 45 seconds | About the photo, not the patient — kept as a separate form from the one above (§1.10) |
| Local Queue | Table of today's patients: Captured / Quality-Passed / Synced / Result-Pending / Result-Delivered | Lets the technician confirm nothing was missed |
| Sync Status | Online/offline indicator, count pending upload | Always visible |

### 4.2 Local Backend / Services

| Service | Responsibility |
|---|---|
| Capture Handler | Interfaces with the fundus camera, pulls the raw image into local storage |
| Quality-Gate Engine | MATLAB-built (packaged via MATLAB Compiler + MATLAB Runtime — no MATLAB license needed on the PHC machine). Input: raw image + the worker-reported device field from the capture-metadata form. Uses the reported device to select a per-camera-family preset for its heuristic thresholds — a direct lookup, not an inference step, so it stays cheap enough for modest hardware. Output: pass / retake+reason / borderline-enhanced |
| Local API | Small internal service (Flask/FastAPI or Node) wrapping Capture Handler and Quality-Gate Engine, reading/writing the Local DB |
| Sync Manager | Network heartbeat check before each transmission attempt. Real-time push on success; chunked/resumable queued upload on failure. Prioritizes referable/uncertain full-case data over confident-negative summary-only records |

### 4.3 Local Database Schema (SQLite)

**patients**
| Field | Type | Notes |
|---|---|---|
| patient_id | TEXT (PK) | Locally generated, globally unique (PHC-prefixed) |
| name | TEXT | |
| age | INTEGER | |
| contact_number | TEXT | Required |
| registered_at | DATETIME | |

**captures**
| Field | Type | Notes |
|---|---|---|
| capture_id | TEXT (PK) | |
| patient_id | TEXT (FK → patients) | |
| camera_device_id | TEXT | Device tag, cross-checked centrally against the image itself (§6.3) |
| image_path | TEXT | |
| quality_status | TEXT | pass / retake / borderline-enhanced |
| quality_reason | TEXT | Nullable |
| retake_count | INTEGER | |
| captured_at | DATETIME | |

**questionnaire_responses** (patient symptom + risk — §9.1)
| Field | Type | Notes |
|---|---|---|
| response_id | TEXT (PK) | |
| capture_id | TEXT (FK → captures) | |
| risk_factor_fields | JSON | |
| symptom_fields | JSON | |
| language | TEXT | |
| recorded_at | DATETIME | |

**capture_metadata_responses** (capture context — §9.6, new)
| Field | Type | Notes |
|---|---|---|
| response_id | TEXT (PK) | |
| capture_id | TEXT (FK → captures) | |
| camera_device_reported | TEXT | Worker-selected, from a fixed device list |
| pupil_status | TEXT | dilated / non-dilated / unknown |
| lighting_environment | TEXT | indoor clinic / outdoor mobile / low light |
| observed_issues | JSON | Multi-select: glare, patient blinked/moved, out of focus, possible media opacity, eyelash/eyelid obstruction, none noticed |
| worker_usability_rating | TEXT | clear / not sure / clearly unusable |
| recorded_at | DATETIME | |

**sync_queue**
| Field | Type | Notes |
|---|---|---|
| queue_id | TEXT (PK) | |
| capture_id | TEXT (FK → captures) | |
| status | TEXT | pending / in_progress / synced / failed |
| priority | TEXT | high (referable/uncertain, full data) / low (confident-negative, summary only) — provisional until a first central pass classifies it |
| chunks_sent | INTEGER | |
| chunks_total | INTEGER | |
| last_attempt_at | DATETIME | |

---

## 5. Central System — Full Spec

### 5.1 Shared Website Shell & Auth
One website, role-based routing (`ophthalmologist`, `district_admin`). Standard session/token auth. Access control matters given patient health data is involved (§10).

### 5.2 Ophthalmologist Interface — Frontend Components

| Screen | Components |
|---|---|
| Review Queue | Sorted by priority (referable + high-uncertainty + branch-disagreement first), each row: patient reference, PHC, capture time, predicted grade(s), confidence |
| Case Detail | Fundus image, Grad-CAM overlay toggle (restricted to the retinal ROI — §6.9), lesion-evidence panel, **both grading branches shown side by side** (CNN grade and rule-engine grade, with a clear disagreement flag when they differ — §6.7), calibrated confidence and conformal tier (§6.8), questionnaire summaries (patient + capture metadata) shown *alongside*, not blended into, the image evidence |
| Decision Controls | Confirm, Override (reason capture: structured category + optional free text) |
| Case History | Per-patient audit trail, including a simple longitudinal view of DR grade across visits where more than one screening exists |

### 5.3 District Admin Interface — Frontend Components

| Screen | Components |
|---|---|
| Dashboard | Patients screened per PHC per day/week, average review turnaround |
| PHC Health | Sync status per PHC site |
| Referral Tracker | referred → contacted → attended / lost, assigned worker field |
| Resource Recommendations | Plain-language output from the Simulink model (§7) |

### 5.4 Central Backend Services

| Service | Responsibility |
|---|---|
| Ingestion API | Receives image + patient questionnaire + capture-metadata questionnaire from PHC sites |
| Grading Pipeline Orchestrator | Runs, in sequence: preprocessing → camera-fingerprint calibration (§6.3) → segmentation (optic disc/fovea, vessels, two lesion models, NV suspicion) → dual-branch grading (CNN + rule engine, agreement check) → calibration/conformal tiering → explainability (with safeguards) |
| Referral & Notification Service | Routes referable/uncertain/disagreement cases to the ophthalmologist queue; triggers SMS via Twilio once a decision is finalized |
| Continual Learning Service | Stores ophthalmologist overrides + reasons, runs periodic retraining, enforces the validation gate |
| Admin Analytics Aggregator | Computes dashboard metrics; aggregate-only, no per-case push (§1.6) |
| Simulink Integration | Runs the resource-allocation simulation periodically/offline, writes recommendations for the admin dashboard |

### 5.5 Central Database Schema (PostgreSQL)

**patients** — mirrors local patient records.

**cases**
| Field | Type | Notes |
|---|---|---|
| case_id | UUID (PK) | |
| patient_id | UUID (FK) | |
| phc_id | UUID (FK → phc_sites) | |
| capture_id_ref | TEXT | Traceability to the local capture_id |
| camera_device_id | TEXT | Worker-reported |
| camera_family_detected | TEXT | From image-based classification (§6.3), compared against camera_device_id |
| image_path | TEXT | |
| questionnaire_data | JSON | Patient symptom/risk answers |
| capture_metadata | JSON | Capture-context answers (§9.6) |
| received_at | DATETIME | |

**grading_results**
| Field | Type | Notes |
|---|---|---|
| result_id | UUID (PK) | |
| case_id | UUID (FK) | |
| dr_grade_cnn | INTEGER | Branch A output, 0–4 |
| dr_grade_rule_engine | INTEGER | Branch B output, 0–4 |
| branch_agreement | BOOLEAN | False triggers mandatory review regardless of confidence |
| referable | BOOLEAN | Derived: either branch's grade ≥ 2 |
| confidence_score | FLOAT | Post-calibration, CNN branch |
| uncertainty_score | FLOAT | From MC Dropout variance |
| conformal_tier | TEXT | A (auto-clear) / B (AI-assisted review) / C (full manual) — §6.8 |
| model_version | TEXT (FK → model_versions) | |
| graded_at | DATETIME | |

**segmentation_outputs**
| Field | Type | Notes |
|---|---|---|
| case_id | UUID (FK) | |
| lesion_masks_path | TEXT | |
| lesion_counts | JSON | e.g. {"microaneurysms": 3, "hemorrhages": 1, "hard_exudates": 0} — quadrant-mapped where feasible, feeds Branch B |
| nv_suspicion_score | FLOAT | Not a segmentation mask — a vessel-irregularity-derived score (§6.6, §1.12) |
| vessel_map_path | TEXT | |
| optic_disc_coords | POINT | |
| fovea_coords | POINT | |

**explainability_outputs**
| Field | Type | Notes |
|---|---|---|
| case_id | UUID (FK) | |
| gradcam_path | TEXT | ROI-restricted (§6.9) |
| lesion_attention_consistency_score | FLOAT | Overlap between Grad-CAM energy and lesion masks (§6.9) |
| evidence_summary_text | TEXT | e.g. "3 microaneurysms, superior temporal quadrant; severe-NPDR criteria not met" |

**ophthalmologist_reviews**, **referrals**, **notifications**, **corrections**, **model_versions**, **phc_sites**, **users** — unchanged from the previous version; see §5.5 field lists carried over: decision/override reason/review duration; referral status progression; notification channel/type; correction linkage to retraining; model validation metrics and promotion flag.

### 5.6 API Endpoints (Local ↔ Central)

| Method & Path | Purpose | Caller |
|---|---|---|
| POST /api/v1/cases | Submit a new case — image + patient questionnaire + capture-metadata questionnaire | Local Sync Manager |
| POST /api/v1/cases/{case_id}/chunks | Chunked image upload for low-bandwidth transfer | Local Sync Manager |
| GET /api/v1/cases/{case_id}/status | Poll processing status | Local app (optional) |
| GET /api/v1/ophthalmologist/queue | Fetch review queue | Ophthalmologist interface |
| POST /api/v1/cases/{case_id}/review | Submit confirm/override + reason | Ophthalmologist interface |
| GET /api/v1/admin/dashboard | Aggregate stats | District admin interface |
| GET /api/v1/admin/referrals | Referral tracker list | District admin interface |
| PATCH /api/v1/referrals/{referral_id} | Update referral status | District admin interface |
| GET /api/v1/phc/{phc_id}/sync-status | PHC sync health | District admin interface |

---

## 6. ML Layer — Full Pipeline Spec

### 6.1 Image Quality Assessment — **runs locally**
Classical CV heuristics (MATLAB Image Processing Toolbox): focus/blur (Laplacian variance), illumination uniformity, contrast, field-of-view completeness, glare, motion artifact, eyelash/eyelid occlusion, color balance, excessive black-border proportion. Selects a per-camera-family preset using the worker-reported device field (a lookup, not an inference — keeps this step cheap). No labeled dataset required. Stretch: lightweight CNN gradability classifier if a quality-labeled dataset surfaces.

### 6.2 Preprocessing & Enhancement — **runs centrally**
CLAHE (per-camera-family parameters), illumination normalization, denoising, Ben Graham-style circular-crop preprocessing.

### 6.3 Camera-Fingerprint Calibration — **runs centrally** *(new)*
Identifies the capture device family from vignetting shape, aspect ratio, and colour-channel gain ratios; cross-checks this against the worker-reported device field from the capture-metadata questionnaire (§9.6) rather than guessing blind. Maintains a calibration profile bank (per-family white-balance correction, vignetting-flattening mask, enhancement parameter presets). A mismatch between the detected and reported family is itself a useful flag — it can indicate an unusual capture worth a closer look.

### 6.4 Optic Disc / Fovea Localization — **runs centrally**
Classical CV (brightness + circularity heuristics) refined by a lightweight regressor fine-tuned on IDRiD's 516-image localization subset.

### 6.5 Vessel Segmentation — **runs centrally**
U-Net trained on DRIVE (40 images — heavy augmentation required), complemented by a Frangi vesselness filter (classical CV). Vessel output also feeds microaneurysm false-positive suppression (§6.6) and the neovascularization suspicion score.

### 6.6 Lesion Segmentation — **runs centrally**
**Two separate models, not one general-purpose one:**
- **Red-lesion model** (microaneurysms, hemorrhages) — U-Net, vessel-mask-pruned candidates, sub-pixel centroid refinement for microaneurysm localization (intensity-weighted moments), verified by a compact patch classifier to control false positives.
- **Bright-lesion model** (hard exudates, cotton-wool spots) — U-Net with optic-disc masking to avoid disc/exudate confusion.

Both trained on IDRiD's 81-image pixel-annotated subset — small, so transfer learning from the vessel model and aggressive augmentation are required, not optional (see §16). Lesion counts are quadrant-mapped relative to the optic disc–fovea axis, which is what makes the rule engine (§6.7) possible.

**Neovascularization is handled separately and honestly:** no pixel-level segmentation is claimed. A suspicion score is computed from vessel-pattern irregularity, branching complexity, and tortuosity restricted to a ring around the optic disc and major arcades, and labeled "possible proliferative pattern — urgent review," never "confirmed neovascularization" (§1.12).

### 6.7 DR Severity Classification — **runs centrally, two independent branches**

**Branch A — CNN holistic grading:** ResNet-50/101 or EfficientNet, transfer-learned on APTOS 2019 + IDRiD grading subset combined (~4,178 images). **Ordinal-aware loss**, not plain cross-entropy — grades are ordinal, so confusing grade 0 with grade 1 is a smaller error than confusing grade 0 with grade 4, and the loss should reflect that (class-weighted/focal terms still apply on top, for the severe-grade imbalance). Output: 5-class distribution + derived referable/non-referable flag (grade ≥ 2).

**Branch B — explicit ICDR/ETDRS rule engine:** plain, testable MATLAB code operating directly on Branch B's inputs — the quadrant-mapped lesion counts from §6.6 and the NV suspicion score from the same section. Applies the standard criteria directly (no DR = no lesions; mild NPDR = microaneurysms only; moderate NPDR = microaneurysms plus other lesions short of severe criteria; severe NPDR = the "4-2-1 rule" — extensive hemorrhages across all four quadrants, venous beading in two or more, or prominent IRMA in at least one; proliferative DR = neovascularization/suspicion flag present).

**Fusion:** when Branch A and Branch B agree, that agreement is itself evidence, and the case can proceed toward auto-clear or standard review per the confidence tier (§6.8). **When they disagree, that disagreement is a mandatory-review trigger** regardless of either branch's confidence — this is the opposite of averaging an ensemble, and it's what makes the two-branch design a real safety mechanism rather than decoration (§1.11).

### 6.8 Calibration & Uncertainty — **runs centrally**
- **Calibration:** temperature scaling (post-hoc, one parameter).
- **Uncertainty:** Monte Carlo Dropout (multiple stochastic forward passes, variance = uncertainty).
- **Conformal prediction for tier boundaries** *(new)*: rather than relying on a raw calibrated probability threshold alone, a split-conformal calibration step (quantile computation on a held-out calibration fold — Statistics and Machine Learning Toolbox) produces a *statistically guaranteed* operating point per tier:

| Tier | Guarantee | Consequence |
|---|---|---|
| Tier A — auto-clear | Guaranteed high NPV at a chosen confidence level | Skips the ophthalmologist queue entirely |
| Tier B — AI-assisted review | Guaranteed high PPV | Reviewed with Grad-CAM + lesion evidence, target <30s |
| Tier C — full manual | No statistical guarantee met, or branch disagreement, or a force-flagged poor-but-not-unusable capture | Routed to full manual grading, no shortcuts |

This sits alongside temperature scaling and MC Dropout, not instead of them — the conformal step is what turns "the model says it's confident" into "the model is confident at a level we can actually stand behind," which matters more here than in a typical classification task because the output drives a real referral decision.

### 6.9 Explainability — **runs centrally**
Grad-CAM/Grad-CAM++ on the classifier's final conv layer, combined with the segmentation output into a structured evidence summary (not a bare heatmap). **Safeguards, since Grad-CAM alone is not clinically sufficient** (it's low-resolution, highlights discriminative regions rather than lesion boundaries, and can look plausible while attending to artifacts, borders, or the optic disc):
- Heatmap energy outside the retinal ROI is discounted.
- Explanations dominated by the optic disc are flagged unless hard-exudate logic supports it.
- A **lesion-attention consistency score** measures overlap between Grad-CAM energy and the actual lesion masks — stored per case (§5.5) and shown to the ophthalmologist alongside the heatmap, not left implicit.
- A **counterfactual occlusion test** (mask the top lesion region, confirm the predicted probability actually drops more than masking a random region) is run during validation to catch cases where the heatmap is plausible-looking but not actually causal.

### 6.10 Symptom + Risk Fusion — **runs centrally**
Rule-based weighted scoring (clinically-referenced weights for risk factors and symptoms), applied as a confidence adjustment after the image model's calibrated output. Not a learned model — no dataset currently links questionnaire data to outcomes (§1.7).

### 6.11 Continual Learning — **runs centrally, periodic**
Ophthalmologist overrides + structured reasons feed a periodic fine-tuning job (classifier and/or lesion models) on original training data plus weighted/oversampled corrections. **Validation gate, non-negotiable:** a newly retrained model cannot replace the live one unless it holds up on a held-out validation set (sensitivity, specificity, kappa) — see §1.8.

---

## 7. Systems Layer — Simulink Resource Model

- **Approach:** Discrete-event simulation (SimEvents). Entities = patient images. Arrival process = image acquisition rate per PHC. Network transmission = a bandwidth-constrained queue. Ophthalmologist review = a limited-capacity server, ~30s (Tier B) to several minutes (Tier C) service time, so Tier C entities should be modeled as pre-empting Tier B on the same reviewer resource pool.
- **Inputs:** acquisition rate per PHC, number of PHCs, bandwidth distribution, number of ophthalmologists.
- **Outputs:** queue length over time, average wait time, bottleneck location, a plain-language resource recommendation.
- **Execution:** runs periodically/offline against current volume data, feeding the Admin Analytics Aggregator (§5.4) and the Resource Recommendations screen (§5.3). Treat bandwidth and sync-timing parameters as modeled assumptions, not measured field data, and say so (§16).

---

## 8. End-to-End Data Flows

### 8.1 Online Real-Time Flow
1. Technician captures image via dedicated fundus camera → Capture Handler.
2. Quality-Gate Engine runs locally, using the worker-reported device field to select its preset. Retake needed → loop to step 1. Pass/borderline-enhanced → proceed.
3. Technician completes both questionnaires: patient symptom/risk (§9.1) and capture metadata (§9.6).
4. Sync Manager transmits image + patient data + both questionnaires to the Ingestion API in real time.
5. Grading Pipeline Orchestrator runs: preprocessing → camera-fingerprint calibration → segmentation (optic disc/fovea, vessels, two lesion models, NV suspicion) → dual-branch grading with agreement check → calibration/conformal tiering → explainability with safeguards.
6. Referral & Notification Service applies tier + agreement logic: Tier A and branches agree → auto-clears; Tier B/C or branch disagreement → ophthalmologist queue.
7. Result returns to the PHC. Technician tells patient in person: "probably have DR" or "do not have DR."
8. Non-referable, no disagreement: case closes, no SMS.
9. Referable or disagreement: ophthalmologist reviews (§8.3) → on confirmation, SMS sent.
10. Case data feeds Admin Analytics Aggregator (aggregate view only).

### 8.2 Offline / Delayed Flow
1–3. Same as above.
4. Sync Manager finds no network → stores locally, queues (chunked/resumable when bandwidth allows).
5–9 (relabeled). Same pipeline runs centrally once received; because the patient has already left, the result — either outcome, after ophthalmologist confirmation if positive — is delivered by SMS.

### 8.3 Ophthalmologist Review & Override Flow
1. Case appears in Review Queue, sorted by priority (referable + uncertain + disagreement first).
2. Ophthalmologist opens Case Detail: image, Grad-CAM, lesion-attention consistency score, both grading branches with any disagreement flagged, conformal tier, questionnaire summaries.
3. Confirm → notification flow proceeds.
4. Override → structured reason + optional free text → recorded → creates a `corrections` row for Continual Learning.

### 8.4 Continual Learning Flow
1. Corrections accumulate.
2. On schedule/threshold, retraining runs on original data + weighted corrections.
3. New model version evaluated against held-out validation set.
4. Passes gate → promoted, becomes live. Fails → discarded, corrections remain queued.

### 8.5 Referral & Patient Communication Flow
1. Referable/disagreement case confirmed by ophthalmologist → `referrals` row created, status = referred.
2. Admin / assigned ASHA worker updates status: contacted → attended (or lost).
3. SMS to patient fires at confirmation — separate from referral-status updates, which are for admin tracking.

### 8.6 District Admin Aggregation Flow
1. Admin Analytics Aggregator computes dashboard metrics — no per-case push.
2. Simulink Integration writes periodic resource recommendations.
3. Admin opens Referral Tracker for follow-up-gap visibility.

---

## 9. Non-ML Feature Specifications

### 9.1 Symptom + Risk Questionnaire (patient) — Field List
**Risk factors:** years since diabetes diagnosis (ranges), blood sugar control (good/moderate/poor, patient-reported), blood pressure status (normal/high/unknown), pregnancy status.
**Symptoms:** blurred vision, floaters, sudden vision change, eye pain (y/n each).
Structured fields only — no free text — so they translate cleanly and feed the scoring layer (§6.10) without NLP.

### 9.2 Bandwidth-Aware Sync
Full data first for referable/uncertain cases; summary-only for confident-negative. Chunked, resumable transfer under poor bandwidth.

### 9.3 Referral Loss-to-Follow-Up Tracking
`referrals` table (§5.5) and Referral Tracker screen (§5.3): referred → contacted → attended, with a "lost" state and optional ASHA/health-worker assignment.

### 9.4 Camera-Source Tagging & Calibration
Every capture is tagged with a worker-reported `camera_device_id`. This now does real work, not just bookkeeping: it drives the local quality gate's preset selection (§6.1) and is cross-checked against an image-based camera-family classification centrally (§6.3), with a mismatch itself flagged as worth a closer look.

### 9.5 Camp / Batch Screening Mode
Falls out naturally from offline-first design: a full day of captures queues locally and syncs in one batch when connectivity returns.

### 9.6 Capture Metadata Questionnaire (about the photo, not the patient) — *new*
Presented once per captured image, immediately after capture, entirely on the local device. Tap-only, target under 45 seconds, no free text — every field is either auto-captured or a single tap, matching the design principle of §9.1.

| Field | Input | Why it matters downstream |
|---|---|---|
| Camera device model | Tap: fixed list for the PHC's device(s) | Cross-checks the central camera-fingerprint classifier (§6.3); selects the local preset (§6.1) |
| Pupil status | Tap: dilated / non-dilated / unknown | Sets the expected image-quality baseline |
| Lighting environment | Tap: indoor clinic / outdoor mobile / low light | Prior for illumination normalization (§6.2) |
| Observed issue checklist | Multi-tap: glare / patient blinked or moved / out of focus / possible media opacity / eyelash-eyelid obstruction / none noticed | Structured evidence for the quality gate and the eventual clinical report |
| Worker's overall usability rating | Tap: looks clear / not sure / clearly unusable | Coarse human tie-breaker for borderline automated quality scores |

This is deliberately separate from the patient questionnaire (§1.10) and validated separately (§14) — its value is measured by ablating it out of the quality/triage decision and checking whether Tier-A precision and recapture accuracy actually drop.

---

## 10. Non-Functional Requirements

- **Offline capability:** local app fully functional (capture, quality gate, both questionnaires, local queueing) with zero connectivity.
- **Performance:** quality-gate decision fast enough for a live retake call — sub-second target, hence a lightweight heuristic rather than a heavy model.
- **Data privacy:** encrypted transmission (HTTPS/TLS), role-based access control, audit logging (`ophthalmologist_reviews` already captures this). Full compliance review (India's DPDP Act, medical-device software considerations) is out of scope for the hackathon prototype but should be named explicitly in the PPT as a known next step.
- **Scalability:** designed with the district-scale figure (100,000+ patients/year) in mind even though the hackathon prototype demonstrates at small scale — this is what §7 is for.

---

## 11. Consolidated ML Models & Algorithms List

1. **Image quality assessment (local):** classical CV heuristics across nine factors (focus, illumination, contrast, field of view, glare, motion artifact, eyelash occlusion, color balance, border proportion), with worker-reported-device preset selection. Stretch: lightweight CNN.
2. **Preprocessing:** CLAHE (per-camera-family parameters), illumination normalization, denoising, Ben Graham preprocessing.
3. **Camera-fingerprint calibration:** image-based camera-family classifier, cross-checked against worker-reported device, per-family calibration profile bank.
4. **Optic disc/fovea localization:** classical CV + lightweight CNN regressor.
5. **Vessel segmentation:** U-Net + Frangi vesselness filter.
6. **Lesion segmentation:** two separate U-Nets (red-lesion: microaneurysms/hemorrhages with sub-pixel centroid refinement; bright-lesion: exudates/cotton-wool with optic-disc masking). Neovascularization: vessel-irregularity suspicion score, not segmented.
7. **DR severity classification — Branch A:** ResNet-50/101 or EfficientNet, transfer learning, ordinal-aware loss plus class-weighting/focal terms.
8. **DR severity classification — Branch B:** explicit ICDR/ETDRS rule engine on quadrant-mapped lesion counts; branch disagreement is a mandatory-review trigger.
9. **Calibration:** temperature scaling + split-conformal prediction for statistically guaranteed tier boundaries.
10. **Uncertainty estimation:** Monte Carlo Dropout.
11. **Explainability:** Grad-CAM/Grad-CAM++, ROI-restricted, validated with a lesion-attention consistency score and a counterfactual occlusion test.
12. **Symptom/risk fusion:** rule-based weighted scoring (not learned).
13. **Continual learning:** supervised fine-tuning on ophthalmologist corrections + validation-gated promotion.
14. **Resource allocation modeling:** discrete-event simulation (Simulink SimEvents).

---

## 12. Consolidated Architecture Components List

| Component | Layer | Technology | Purpose |
|---|---|---|---|
| Capture Handler | PHC backend | Camera SDK/driver | Pull image from fundus camera |
| Quality-Gate Engine | PHC backend / ML | MATLAB, compiled via MATLAB Compiler + Runtime | Local retake decision, device-preset lookup |
| Local API | PHC backend | Flask/FastAPI or Node | Glue between frontend, capture, quality gate, local DB |
| Local Database | PHC backend | SQLite | §4.3 schema |
| Sync Manager | PHC backend | Custom, chunked/resumable upload | Online/offline transmission |
| Local PHC App | PHC frontend | Local web app (HTML/JS or React) on localhost | §4.1 screens, both questionnaires |
| Ingestion API | Central backend | REST | Receive PHC data |
| Camera Calibration Service | Central backend / ML | MATLAB | Camera-family classification, cross-check, calibration profiles |
| Grading Pipeline Orchestrator | Central backend / ML | MATLAB (relevant toolboxes) | §6 pipeline |
| ICDR/ETDRS Rule Engine | Central backend / ML | Base MATLAB, no toolbox | Branch B grading, agreement check with Branch A |
| Central Database | Central backend | PostgreSQL | §5.5 schema |
| Referral & Notification Service | Central backend | Custom + Twilio | Routing, SMS |
| Continual Learning Service | Central backend / ML | Custom retraining pipeline | §6.11 |
| Admin Analytics Aggregator | Central backend | Custom | Dashboard metrics |
| Simulink Integration | Central / systems | Simulink + SimEvents | §7 |
| Ophthalmologist Interface | Central frontend | Web app | §5.2 |
| District Admin Interface | Central frontend | Web app | §5.3 |

---

## 13. Datasets

| Dataset | Size | Labels | Used for | Notes |
|---|---|---|---|---|
| APTOS 2019 | 3,662 images | 5-class DR severity (image-level) | Branch A classification training | No lesion masks; class-imbalanced |
| IDRiD | 81 (segmentation) + 516 (grading) + 516 (localization) | Pixel-level lesion + optic disc masks; DR+DME grades; optic disc/fovea coordinates | Segmentation (both lesion models), classification, localization | Segmentation subset is small — needs augmentation/transfer learning (§16) |
| DRIVE | 40 images | Pixel-level vessel masks | Vessel segmentation | Very small; pair with classical CV |
| Messidor-2 | ~1,748 images | DR grading (adjudicated reference standard) | External/domain-generalization validation (§14) | Held-out generalization check, not primary training |

**Still needed from teammates' additional datasets:** name + link, label type, image count/class balance, resolution/camera source — determines which pipeline stage it strengthens.

---

## 14. Metrics & Validation Plan

- **Primary target:** referable DR (grade ≥ 2): >90% sensitivity, >85% specificity (PS requirement). Report against a real external reference point, not in isolation: the IDx-DR FDA pivotal trial (900 patients, 10 primary-care sites) achieved 87.2% sensitivity and 90.7% specificity under rigorous, well-resourced conditions — this project's target should be understood and pitched relative to that kind of benchmark, not presented as trivially achievable (§16).
- **5-class agreement:** quadratic-weighted kappa, benchmarked against published APTOS/IDRiD results.
- **Branch agreement rate:** how often Branch A and Branch B agree, and — where review capacity allows measuring it — how often a flagged disagreement corresponded to an actual grading error caught on review. This is the direct evidence for the two-branch design's value (§1.11).
- **Lesion-level evaluation:** FROC curves (sensitivity vs. false positives per image, at standard operating points) for microaneurysm/lesion detection, not just Dice/IoU — this is the convention this literature actually uses and is more informative than a single accuracy number.
- **Domain-generalization-gap experiment (flagship result):** evaluate the same frozen model on progressively less similar held-out data — IDRiD test split, then Messidor-2, then a synthetic portable-camera-perturbed set (vignetting/colour-shift/resolution degradation applied to a clean test set if real portable-camera images aren't available in time) — and report the performance recovered once camera-fingerprint calibration (§6.3) is switched on. The size of that recovered gap is a direct, quantified answer to the PS's own stated concern about portable-camera image quality.
- **Explainability validation:** lesion-attention consistency score and counterfactual occlusion test (§6.9) as quantitative measures, plus — time permitting — a small clinician plausibility rating (2–3 reviewers, "would this evidence help you decide"). This replaces "show a heatmap and assert it's explainable" with something actually measured.
- **Capture-metadata questionnaire ablation:** remove the questionnaire signal from the quality/triage decision and re-measure Tier-A precision and recapture-list accuracy — a measurable drop justifies the feature's existence with a number, not just an argument.
- **Reference table for pitch context** (verify exact figures before the final PPT — the IDx-DR row below is independently confirmed; the others are as reported in teammates' research and worth a spot-check):

| System | Sensitivity | Specificity | Context |
|---|---|---|---|
| IDx-DR (FDA pivotal trial) | 87.2% | 90.7% | US primary care, 900 patients, 10 sites — independently verified |
| Medios AI / Remidio (SMART study, India) | ~93.0% (referable) | ~92.5% (referable) | Smartphone-based, offline, Indian population — verify before citing |
| AIDRSS (Indian multicentric study) | ~92.0% (any DR) | ~88.0% | Indian population, multi-site — verify before citing |
| This project's target | >90% | >85% | Referable DR, portable camera, rural India |

- Validate the integrated pipeline (two-branch grading + calibration) against a plain end-to-end CNN baseline on the same data — direct evidence for the PS's "outperforms any single technique" requirement.

---

## 15. Build Priority Tiers

Under Sept 7/10 time pressure, this is the order that keeps a demoable system at every stage — not everything below is expected to be finished, but nothing below should be skipped by accident either.

**MUST BUILD:** patient registration; dedicated-camera capture; local quality gate with specific retake reasons; both questionnaires; Branch A CNN classifier; temperature-scaling calibration with basic uncertainty routing; Grad-CAM; ophthalmologist review interface with confirm/override; referral SMS flow; a result report/dashboard.

**SHOULD BUILD:** vessel segmentation; at least one lesion model (red-lesion is higher-value than bright-lesion, since it supports the harder, more clinically prioritized detection); Branch B rule engine + disagreement flag; district admin aggregate dashboard; referral loss-to-follow-up tracking; MC Dropout uncertainty; external validation on Messidor-2.

**WOW (build if the above is solid):** camera-fingerprint calibration with the domain-generalization-gap experiment; conformal prediction tiers; Grad-CAM safeguards (lesion-attention score, counterfactual test); full Simulink SimEvents district simulation across multiple scenarios; continual learning loop with validation gate; ASHA worker handoff; camp/batch mode demonstration.

**DON'T BUILD (for this stage):** full pixel-level neovascularization segmentation; deep ensembles; GAN/diffusion-based enhancement; Vision Transformer models; a mobile capture app (deliberately dropped, §1.3); a full OpenAPI spec; anything resembling a chatbot, blockchain feature, or general hospital-management system.

---

## 16. Risks & Honest Limitations

Stating these proactively reads as maturity, not weakness — say them in the PPT before a judge finds them.

- **This is a screening decision-support and referral-recommendation system, not an autonomous diagnostic.** Every positive result is confirmed by an ophthalmologist before it reaches a patient. Say this explicitly rather than letting "AI detects DR" imply otherwise.
- **90%/85% is a validation target, not a guarantee.** The IDx-DR FDA pivotal trial — a far better-resourced, rigorously validated system — achieved 87.2%/90.7% under controlled conditions. Report your actual achieved numbers with confidence intervals; don't promise the target in advance.
- **Diabetic macular edema (DME) cannot be reliably ruled out from color fundus photographs alone.** Real screening pathways also refer for suspected DME — state this limitation explicitly in the referral policy rather than implying complete disease coverage.
- **Neovascularization detection will have the weakest recall of any lesion type.** It's rare, subtle, and has the least labeled data. Report it with its own metric rather than folding it into an aggregate accuracy number that hides the weakness.
- **IDRiD's pixel-level lesion masks cover only 81 images.** Enough to fine-tune and validate a classical-plus-transfer-learning approach, not enough to train a lesion-segmentation CNN from scratch — lean on transfer learning from the vessel model and heavy augmentation, and don't oversell small-test-set improvements.
- **Simulink parameters (bandwidth tiers, sync timing) are modeled assumptions, not measured field data.** Label them as such in the demo rather than presenting them as ground truth.
- **Conformal guarantees are only as good as the calibration set's representativeness.** If the calibration data is APTOS-heavy, say so, and note a real deployment would recalibrate per-site and per-camera-family.
- **Both questionnaires depend on technician compliance.** A rushed technician may tap through carelessly — mitigate by keeping every field single-tap, treating automated signals as primary and questionnaire answers as a secondary cross-check, never a single point of failure.
- **Cross-dataset performance degradation is expected, not a sign of failure.** If Messidor-2 or the synthetic portable-camera set score lower than the internal test set, that's the domain-generalization-gap experiment working as intended (§14) — present it as a measured finding, not something to hide.

---

## 17. Open Items

- [ ] Additional datasets from teammates — see §13 checklist.
- [ ] Whether a quality-labeled dataset exists to upgrade §6.1 from heuristic to learned.
- [ ] Whether any dataset links patient history/symptoms to outcomes, to upgrade §6.10 from rule-based to learned.
- [ ] Confirm whether district admin wants per-case real-time alerts (default here is aggregate-only, §1.6).
- [ ] Firm up retraining cadence/correction-count threshold for §6.11 once case volume is estimated.
- [ ] Decide whether ASHA workers get their own login/interface or remain admin-assigned only.
- [ ] Full OpenAPI spec for §5.6, once implementation starts.
- [ ] Spot-check the Medios AI and AIDRSS figures in §14's reference table before they go in the final PPT.
- [ ] Pick a final system name for PPT branding (currently unnamed here; teammates' documents used "RetinaSaarthi" and "NetraGuard" independently).
