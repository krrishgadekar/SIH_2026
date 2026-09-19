# NetraSetu Build Audit
### PS 26038 — Explainable AI for Diabetic Retinopathy Screening
**Date:** 2026-09-11 | **Scope:** full codebase vs. `system-design-v3-final.md` v3, `api-contracts.md`, and both implementation plans

A section-by-section reconciliation of the codebase against its own design docs, built for the national-round push, not the internal-round demo script. Every verdict below traces to a file, a metric, or a git commit — nothing here is taken on a doc's word for itself.

**Read in full:** 9 docs, 3,259 lines · **Code audited:** `phc-local-app/`, `central-system/`, `simulink-model/`, `ml-pipeline/` · **Components classified:** 46 · **Cross-checked against:** live model files, evaluation artifacts, one unzipped `.slx`, one git log

---

## 1. Headline

The project is materially further along than its own most recent planning docs admit — and has two problems those docs never mention at all.

**Status distribution across the 46 components audited:** 24 fully implemented · 9 partial · 3 stubbed · 6 not built · 4 diverge from design

| | |
|---|---|
| 🟢 **Simulink model is real** | Confirmed by unzipping the `.slx`: genuine SimEvents blocks — Entity Generator, priority queues, two capacity-1 reviewer servers with Tier-C preemption — cross-validated against an independent MATLAB reference model. `simulink-model/README.md`'s status table still says "not built yet"; that line is stale, not honest. **PS requirement 5 of 5 is met.** |
| 🔵 **A second, orphaned mobile app exists** | `phc-local-app/mobile/` is a ~7,000-line Expo/React Native app named "RetinaSaarthi" — a full parallel PHC flow. It talks to a standalone FastAPI service over ngrok that isn't in this repo at all, not to `central-system/backend`. The design doc explicitly lists a mobile app under "DON'T BUILD." |
| 🔴 **No auth, no encryption, no audit log** | Not a thin version — nothing. No login route exists. `middleware/cors.js`'s own comment says the API "serves patient screening data over a plain unauthenticated port." §10 calls this out-of-scope for the hackathon; the gap between "deferred" and "absent" matters for a compliance slide. |
| 🟡 **Sensitivity is 86.0%, not >90%** | Measured, not estimated: 234 TP / 38 FN over 628 IDRiD test images, 95% CI 81.4–89.7%. Specificity clears its bar at 93.8%. This is the one number a judge will ask about first — see §10, Validation. |

---

## 2. The nine questions, answered

### Q1 — Is there a Simulink/SimEvents model anywhere in this codebase?
**Yes — and it's real, not a stub.** `simulink-model/districtScreeningSimEvents.slx` unzips to real SimEvents blocks (EntityGenerator, Queue×2, EntityServer×3, priority switches, six ToWorkspace loggers) matching the design doc's Patient Arrivals → Network Upload → Tier Triage → Review Queue → Reviewer Pool architecture, including `PermitPreemptionBasedOnAttribute` for Tier-C-over-Tier-B preemption.

> Git commit `66638bb` ("Task 3.8: build and validate the SimEvents district model") records the model agreeing with an independent reference implementation on every review-stage metric (auto-clear 71.0% vs 68.4%, reviewer utilization 20.0% vs 22.2%). `simulink-model/README.md`'s status table has not been updated since and still reads "not built yet" — a documentation-drift bug, not a capability gap.

### Q2 — Is conformal prediction actually implemented, or just temperature scaling?
**Both exist, separately, and neither is standing in for the other.** Temperature scaling fits T=1.531 by NLL on the validation split. Split-conformal calibration is a genuinely separate computation: nonconformity score `s = 1 − p(true grade)`, quantile `q̂ = ⌈(n+1)(1−α)⌉ / n`, fitted on n=626 with an explicit floor check that refuses to report a guarantee below n=9.

> `ml-pipeline/calibration/conformalCalibrate.m` produced `models/calibration_v1.json`: `{"qhat":0.8432,"alpha":0.1}`. `inference/branchAInfer.py`'s `assign_tier()` builds an actual prediction set (`{g : 1−p(g) ≤ q̂}`) and tiers on set membership — a raw-probability threshold is only the fallback path when no calibration file is present.

### Q3 — Is camera-fingerprint calibration implemented, or is camera info just stored unused?
**Neither extreme — it's a genuine mid-state.** Detection is real and runs on every case. Correction is computed but explicitly discarded before it reaches the model.

> `gradingOrchestrator.js` (lines ~699–716) calls `classifyCameraFamily.m` every case and logs a reported-vs-detected mismatch flag. Its own comment: "every one of those outputs was DISCARDED... the family is detected and surfaced as a mismatch signal, and no correction reaches the model. Reconnecting it would feed the network an input distribution it was not trained on." `applyCalibrationProfile.m` exists and is unused in the live path.

### Q4 — Does the Grad-CAM lesion-consistency safeguard check the heatmap against segmentation masks, or is Grad-CAM standalone?
**Wired and live — this is newer than the project's own docs claim.** Both the implementation plan and the model's own Task 7.1 note say the consistency score "stays NULL... needs lesion masks." That's stale as of today.

> `gradingOrchestrator.js` (lines ~783–803) upsamples the real 12×12 Grad-CAM map, scores it against real lesion/ROI masks from `segInfer.py` via `lesionAttentionConsistency.m`, and writes a real score to `explainability_outputs.lesion_attention_consistency_score` for every case with segmentation output. The offline counterfactual-occlusion check (n=12) shows the confidence drop moving in the expected direction on 12/12 cases — see `experiments/explainability_results.json`.

### Q5 — Is neovascularization anything beyond a hardcoded zero/absent value?
**No — confirmed hardcoded, exactly as suspected.** `neovascularizationSuspicion.m` exists but is never called by the orchestrator.

> `gradingOrchestrator.js` hardcodes `nvScore = 0` into the rule engine "so the grade-4 branch stays shut" and writes SQL `NULL` — never `0` — to `nv_suspicion_score`, matching the not-measured-vs-measured-zero distinction the rest of the API contract insists on. A CNN grade-4 is escalated straight to Tier C instead of being cross-checked, which is an honest substitute safety mechanism, not NV detection.

### Q6 — Does the lesion evidence panel have real data for 4 lesion categories, or only the 2 the models distinguish?
**The UI is built for 4; the pipeline only ever produces 2.** This is the clearest UI/backend mismatch in the system.

> `LesionEvidencePanel.jsx` renders four independent fields: `microaneurysms`, `hemorrhages`, `hardExudates`, `softExudates`. But `segInfer.py` only ever computes `redLesions` (MA ∪ HE, fused at training time — see `MODEL_INTERFACE.md`: "MA and HE are deliberately merged into one class... cannot be split back apart") and `brightLesions` (hard ∪ soft exudates, same fusion). The Task 4.2 spec that called a post-hoc morphological MA/HE split "REQUIRED, not optional" was never built into the live path — no sub-pixel centroid refinement exists either; centroids are plain integer-pixel connected-component centers.

### Q7 — Are encryption, RBAC, and audit logging actually implemented, or just documented?
**Just documented. All three are completely absent, including the basic versions.**

> No login route exists anywhere in the repo. `middleware/` holds only CORS handling. The review endpoint accepts a client-supplied `ophthalmologistId` string with no verification against the `users` table, which itself has a `password_hash` column nothing ever writes to. No TLS termination in either backend; `pgcrypto` is enabled only for `gen_random_uuid()`, not data encryption. `ophthalmologist_reviews` records what was decided, not who logged in or accessed what — the design doc's own §10 calls this table an "audit trail," which is aspirational relabeling, not a mechanism.

### Q8 — Was validation ever run against Messidor-2, or only IDRiD/APTOS?
**Only IDRiD (plus APTOS's own held-out split) — and the code says so itself, unprompted.**

> No `messidor2/` folder exists under `ml-pipeline/datasets/`. `experiments/domainGap.py`'s own docstring: "Messidor-2 is NOT available in this repo, so the middle rung is missing and this is NOT external-dataset validation. Saying otherwise would be the exact overclaim this project refuses." The domain-gap experiment that did run used two of its three intended rungs — IDRiD test split and five kinds of synthetic portable-camera perturbation (vignette, colour-shift, resolution loss, defocus, JPEG) at three severities each, real numbers, all dated today.

### Q9 — What's the current state of the mobile app folder set aside earlier?
**Not empty. Not lightly scaffolded. A ~7,000-line, substantially built app — that the current design explicitly rejected.**

> `phc-local-app/mobile/` is a real Expo 57 / React Native 0.86 / TypeScript app (`package.json` name: `"retina-saarthi"`) with 10 full screens (Home, Registration, Capture, Quality Result, Questionnaire, Processing, Result, Explainability, History, Report), typed API client, navigation, and context/hooks layers. It targets `API_BASE_URL = 'https://unpadded-slick-pushiness.ngrok-free.dev'` — a standalone single-model FastAPI server that exists nowhere in this repo and is not `central-system/backend`. It predates or bypasses `system-design-v3-final.md` §1.3/§15, which explicitly lists a mobile capture app under "DON'T BUILD." Full detail in §7 below.

---

## 3. Prioritized gap list

Ordered as requested: what the problem statement explicitly requires and is missing, first; what the team designed for itself and didn't build, second; what works but weakly, third. This is the list to triage from — not a recommendation on what to fix first.

### Tier 1 — PS-mandated gaps
*Things PS 26038 explicitly names as a requirement or expected-solution bullet, currently missing or unmet.*

1. **Referable-DR sensitivity is 86.0%, below the PS's >90% bar** *(measured)* — 95% CI 81.4–89.7% on 628 real IDRiD test images, judged on the lower CI bound per the project's own validation plan, so 86.0% does not support a >90% claim even optimistically. Specificity (93.8%) clears its own >85% bar. This is the single number most likely to be challenged in the national round.
2. **Sub-pixel microaneurysm centroids don't exist** *(named twice in the PS)* — Centroids are plain integer-pixel connected-component centers; the intensity-weighted-moment refinement Task 4.2 called "REQUIRED, not optional" was never built into the live inference path.
3. **Microaneurysms and hemorrhages are never separated in output** *(named as 2 deliverables in the PS)* — Merged into one binary mask at training time and, per the model's own interface doc, "cannot be split back apart." The lesion-evidence UI has four fields ready; two of them can never be populated independently of their sibling.
4. **The <30-second ophthalmologist-validation claim has never been measured** *(PS requirement 4)* — `review_duration_seconds` exists as a column; nothing populates it from a real timer. n = 0 today. The code's own experiment note: "no median can be reported and none is invented."
5. **Grad-CAM has no clinician plausibility rating** *(PS requirement 4)* — The PS asks for Grad-CAM "rated as clinically useful" — a human judgement. The quantitative safeguards are done and wired; the 2–3-reviewer plausibility check is not, and can't be self-assessed by the team.
6. **Two of the three ETDRS "4-2-1" severe-NPDR criteria have no detector** *(rule-engine accuracy)* — Venous beading and IRMA are hardcoded `false`/`0` in the rule engine. The code comments admit this plainly: "Branch B can UNDER-grade severe NPDR, and it does so silently." Only the hemorrhage-count leg of the 4-2-1 rule is real.
7. **No basic authentication, encryption, or audit logging** *(PS + §10 NFRs)* — The design doc frames full compliance review as future work; what's missing here is more basic than that — there is no login at all, so "ophthalmologist" and "district admin" are not actually distinct, enforced roles today.

### Tier 2 — Documented but not built
*Things the team specified for itself in the design doc that the current code doesn't do.*

8. **Camera-calibration correction never reaches the model** — Detection works; the profile-based pixel correction that's supposed to follow it was disconnected when Branch A moved to Python, and never reconnected. This also means the design doc's flagship "recovered gap once calibration switches on" experiment (§14) is currently un-runnable — there's no "with correction" arm to compare against.
9. **Continual learning is built but dormant** — `continualLearningService.js` has real promotion-gate logic, transactional model-swap, and rollback — but is never imported or started anywhere. The cron job that's supposed to drive it never runs. `retrainBranchA.m` also doesn't exist, so even a manual trigger would immediately throw.
10. **Simulink output never reaches the admin dashboard** — Zero references to "simulink" anywhere in `central-system/backend`. The Resource Recommendations panel is fully hardcoded placeholder copy ("Pune North Sector," "45/hr," "re-route 30%") with an inert button — a real, validated Simulink model sits completely unconnected to the product that's supposed to surface its output.
11. **`GET /api/v1/cases/:caseId/reviews` still doesn't exist** — Flagged as an open gap in `api-contracts.md` itself; still true. The Case Detail screen's per-patient audit trail has nowhere to read review history from.
12. **Patient and capture-metadata questionnaires are missing fields in the shipped UI** — Patient form: only 3 of ~8 design-doc fields are collected (glycemic control, pregnancy status, and all four symptom toggles are hardcoded to neutral defaults before submission). Capture-metadata form: lighting environment and worker usability rating are hardcoded; its observed-issue chips don't match the six spec'd values and aren't mapped to them.
13. **Mock data is the silent default in both web frontends** — Confirmed: `USE_MOCK_DATA` falls back to `true` whenever the env var is unset in either app. A frontend deployed without that variable set shows fabricated cases and never calls the real backend — while looking completely healthy.

### Tier 3 — Quality & robustness gaps
*Things that run and produce real output, but weakly — worth knowing before a judge finds them first.*

14. **Branch agreement rate is ~46%, not the "second opinion" story the design implies** — On the 52-case held-out set, Branch A and Branch B agree on 24 cases and disagree on 28. Disagreement does concentrate real errors (lift 1.37 — P(A wrong | disagree) = 0.61 vs P(A wrong) = 0.44), which is genuine evidence the mechanism works. But it also means most cases route to mandatory Tier C review, which is expensive if reviewer capacity is the bottleneck the Simulink model itself identifies.
15. **The "integrated pipeline beats a single technique" claim is not yet supported** — Task 9.2's own verdict, on real predictions: "No difference is demonstrated... confidence intervals overlap at matched coverage. Do not claim the integrated pipeline wins." Honestly reported, but it means the PS's "outperforms any single technique" expected-solution bullet doesn't have a positive result behind it yet — n=52 is also too small to expect one.
16. **NV recall is 44.4% — the weakest lesion metric, as predicted, now confirmed** — 0.444 on 54 grade-4 cases, reported separately rather than folded into aggregate accuracy — exactly per §16's own guidance. Still worth stating out loud in the pitch before a judge notices the confusion matrix's bottom row.
17. **The local IDRiD grading set is incomplete on disk** — Only images numbered ~163–413 are present locally (of 516) — which is why the "test split" evaluation above landed on n=52 rather than the ~78 a full 15% split would give. Every metric in this report is real, but on a smaller and less statistically powerful slice than the design intended.
18. **Two rival, disconnected preprocessing/serving stacks coexist** — MATLAB is still the documented architecture (`implementation-plan-backend-ml.md`, `models/README.md`), but the actually-serving classifier is a Python/PyTorch pipeline built later (`NetraSetu_ML_Training_Plan.md`). The old MATLAB stub-loading code is dead but still present. This is fine functionally but will confuse anyone who reads the docs in doc-order rather than code-order — including judges who ask "so where's the MATLAB."

---

## 4. Local PHC application
*Design doc §4. Frontend in `phc-local-app/frontend/`, backend in `phc-local-app/backend/`.*

| Component | Status | What we found |
|---|---|---|
| Patient Registration | 🟢 Implemented | Full form, calls `localApi.registerPatient()`, real navigation into the capture flow. |
| Capture screen | 🔵 Diverges | Uploads to the local quality gate as designed, **but also** calls an undocumented external ngrok FastAPI endpoint for an on-screen "AI Severity Prediction" — the exact thing §1.2 says the local app must never do ("local does quality gating and nothing else"). Default endpoint in `config.js`: `ML_API_ENDPOINT` → the same ngrok host the orphaned mobile app uses. Code comments call it a deliberate demo shortcut with mock fallback. |
| Quality Result panel | 🟡 Partial | Shows the correct reason chips (blur/glare/etc.) when real data exists, but falls back to hardcoded-looking metric numbers (e.g. a bare `0.94`) when the AI metrics aren't supplied — reads as a real measurement even when it isn't. |
| Patient Questionnaire | 🟡 Partial | Only 3 of ~8 design-doc fields are collected in the UI: `knownDiabetic`, `yearsSinceDiagnosis`, `bloodPressure`. Glycemic control, pregnancy status, and all four symptom toggles are hardcoded to neutral defaults before the real API call. |
| Capture Metadata Questionnaire | 🟡 Partial | Correctly kept as a separate component from the patient form (matches §1.10's intent). Lighting environment and worker usability rating are hardcoded at submit time; the observed-issues chip set doesn't match the six spec'd values and isn't mapped onto them. |
| Local Queue table | 🟢 Implemented | Correct 5-stage lifecycle (captured / quality_passed / synced / result_pending / result_delivered), matching api-contracts.md exactly. |
| Sync Status badge | 🟢 Implemented | Real `GET /sync/status` call, online/offline dot plus pending count, graceful fallback on failure. |
| Capture Handler + Quality Gate client | 🟢 Implemented | Exceeds the design doc: a three-tier fallback (compiled exe → `matlab -batch` → pure-JS `qualityGateFallback.js` reimplementation using `sharp`) so a dev machine with no MATLAB still runs a same-logic quality gate. |
| Sync Manager (chunked/resumable) | 🟢 Implemented | Genuinely implements resumable chunked upload matching the central `/chunks` endpoint group — threshold-based switch-over, per-chunk timeout, missing-chunk resend. |

---

## 5. Central backend services
*Design doc §5.4/§5.6. All in `central-system/backend/`.*

| Component | Status | What we found |
|---|---|---|
| Ingestion API + Grading Orchestrator | 🟢 Implemented | Real Express routes; orchestrator spawns the real Python inference chain and the real MATLAB rule-engine/explainability chain per case, ~12.5s end to end. |
| Job queue (Task 8.3) | 🟢 Implemented | `gradingQueue.js`, 295 lines. Cases return in milliseconds and grade asynchronously; `recoverStranded()` genuinely runs at boot and re-queues anything left mid-flight by a crash. |
| Chunked upload (Task 8.2) | 🟢 Implemented | `chunkedUploadService.js`, 483 lines. Per-chunk and whole-file SHA-256 verification; idempotent completion. |
| Referral & Notification / SMS | 🟢 Implemented | Real Twilio client, `SMS_DRY_RUN` support, masked-number logging. Implements all 8 documented `smsStatus` values plus two undocumented ones (`no_contact_number`, `client_unavailable`) — the code is ahead of api-contracts.md here, not behind it. |
| Admin Analytics Aggregator | 🟢 Implemented | Real SQL aggregation, correct Asia/Kolkata day-boundary handling, correct null-vs-zero semantics for turnaround time. |
| Continual Learning Service | 🟡 Partial | `continualLearningService.js` (377 lines) has real promotion-gate logic, transactional swap-and-rollback. But it is **never imported or started anywhere** — the cron job that should drive it never runs, and its own `retrainBranchA.m` dependency doesn't exist yet. |
| Simulink Integration (backend consumer) | 🔴 Not built | Zero references to "simulink" anywhere in `central-system/backend`. No endpoint or field for resource recommendations exists on the API side at all. |
| Auth / role-based access control | 🔴 Not built | No login route in the repo. No middleware enforces `ophthalmologist` vs `district_admin` on any endpoint. `cors.js`'s own comment: "this API serves patient screening data over a plain unauthenticated port." |
| Data encryption | 🔴 Not built | No TLS in either backend (HTTPS is Vercel's job for the frontend leg only). No at-rest encryption for Postgres, SQLite, or stored images. |
| Audit logging | 🟣 Stubbed | `ophthalmologist_reviews` is the only candidate and only records the review decision itself — not logins, not access, and its `ophthalmologist_id` column isn't even foreign-keyed to a real user. |
| `GET /cases/:caseId/reviews` | 🔴 Not built | Still doesn't exist. Flagged as an open gap inside api-contracts.md itself; confirmed still true in the routes. |

---

## 6. Central website — ophthalmologist & admin
*Design doc §5.2/§5.3. All in `central-system/frontend/`.*

| Component | Status | What we found |
|---|---|---|
| Review Queue | 🟢 Implemented | Priority-sorted list wired to the real queue endpoint. |
| Case Detail page | 🟢 Implemented | The "hardest screen" is genuinely well-built and matches the design brief closely. |
| Grad-CAM overlay | 🟢 Implemented | Real toggleable, absolutely-positioned overlay **in place** on the base image (not side-by-side, as the design doc specifically wanted), with a synthetic-pattern fallback only for ungraded/mock cases. |
| Lesion Evidence panel | 🔵 Diverges | Renders 4 independent fields (microaneurysms / hemorrhages / hardExudates / softExudates), null-safe. The backend can only ever populate 2 of those independently — see §7, Q6. |
| Branch Comparison panel | 🟢 Implemented | Correct null-handling for pre-Branch-B cases, and a genuinely distinct visual state (not just a text label) when the branches disagree. |
| Decision Controls | 🟢 Implemented | Confirm/Override, structured reason categories, and — important — `correctedGrade` is actually captured and sent, avoiding the `override_without_grade` SMS trap. Reviewer identity is hardcoded (no real login backs it, see §5). |
| Case History / longitudinal view | 🟢 Implemented | Renders `priorAssessments` with a grade-over-time trend strip. |
| Admin Dashboard / PHC Health / Referral Tracker | 🟢 Implemented | All three make real API calls, not mock-only. |
| Resource Recommendations panel | 🟣 Stubbed | Fully hardcoded placeholder copy with fabricated numbers ("Pune North Sector," "45/hr") and an inert button. No fetch call exists. Doubly a gap: the Simulink model is real (§8) and still doesn't reach here. |
| Mock/real data switch | 🔵 Diverges | Both apps default `USE_MOCK_DATA` to `true` whenever the env var is unset — an unconfigured deploy silently shows fabricated cases while looking fully functional. |

---

## 7. ML pipeline
*Design doc §6, the 14-item model list in §11. All in `central-system/backend/ml-pipeline/`. Five real trained checkpoints exist on disk (EfficientNet-B0 classifier, ResNet34 vessel U-Net, ResNet18 localization U-Net, and two ResNet34 lesion U-Nets) — this section is about what each one actually does once it's wired in, not whether training happened.*

| Component | Status | What we found |
|---|---|---|
| Image Quality Assessment (local) | 🟢 Implemented | Classical CV heuristics across the documented factors, with the three-tier MATLAB→exe→JS fallback noted in §4. |
| Preprocessing & Enhancement | 🟢 Implemented | Ben Graham crop → denoise → adaptive enhance, consolidated into one shared function called identically at train and inference time (fixed a real skew bug along the way — a mismatched CLAHE stage once dropped Branch A's logit agreement from 100% to 57.7%). |
| Camera-Fingerprint Calibration | 🔵 Diverges | Detection runs every case and is logged as a mismatch flag; correction is computed but explicitly discarded before reaching the model. See Q3. |
| Optic Disc / Fovea Localization | 🟢 Implemented | Real trained U-Net (57MB checkpoint), ~11–20px error against IDRiD ground truth. Several of its own preprocessing facts (normalization, channel meaning) had to be reverse-engineered from the checkpoint rather than read from documentation — noted as a real risk for anyone touching it next. |
| Vessel Segmentation | 🟢 Implemented | Real trained U-Net on CHASE_DB1 (swapped in for DRIVE, which has a week-long approval queue) — a disclosed, reasonable substitution, not silently made. |
| Lesion Segmentation (red + bright) | 🔵 Diverges | Both models are real and trained (Dice 0.535 red-lesion, 0.583–0.733 bright-lesion). But MA+hemorrhage and hard+soft-exudate are each fused into one class at training time and, per the model's own interface doc, cannot be split back apart — see Q6. No sub-pixel centroid refinement in the live path — see Gap #2. |
| Neovascularization | 🟣 Stubbed | Suspicion-score function exists, is never called. Hardcoded to `0`/`NULL` in the live path — see Q5. |
| DR Severity Classification — Branch A (CNN) | 🟢 Implemented | Real trained EfficientNet-B0, real evaluation on 628 images: sensitivity 86.0%, specificity 93.8%, kappa 0.869. This is the actual, currently-serving classifier — not the MATLAB stub the implementation plan still describes. |
| DR Severity Classification — Branch B (rule engine) | 🟡 Partial | Real, runs on real quadrant lesion counts, thresholds recalibrated against real segmenter output. Two of three ETDRS 4-2-1 criteria (venous beading, IRMA) have no detector and are hardcoded off — see Gap #6. Output capped at grade 3 by design, since NV is disabled. |
| Calibration — temperature scaling | 🟢 Implemented | Real fit, T=1.531 on n=626, not the T=1 placeholder the docs describe. |
| Calibration — conformal prediction | 🟢 Implemented | Genuine split-conformal quantile computation, separately fitted from temperature scaling. See Q2. |
| Uncertainty — MC Dropout | 🟢 Implemented | Real `Dropout(0.3)` layer, genuine stochastic forward passes (20 by default), refuses to fabricate a value when no dropout module is found. |
| Explainability — Grad-CAM | 🟢 Implemented | Real heatmaps from the trained classifier's last conv layer. |
| Explainability — safeguards (consistency + counterfactual) | 🟢 Implemented | Both wired and live against real lesion masks — see Q4. |
| Symptom + Risk Fusion | 🔵 Unverified | Not independently verified end-to-end in this audit. Since the shipped Patient Questionnaire UI collects only 3 of ~8 fields (§4), whatever scoring exists downstream cannot currently receive most of the inputs the design doc's weighting scheme expects. Flagged for a follow-up check, not asserted as broken. |
| Continual Learning | 🟡 Partial | See §5 — real logic, never invoked. |

---

## 8. Simulink resource model
*Design doc §7. In `simulink-model/` — the one component in this audit that is more finished than the project's own docs claim.*

| Component | Status | What we found |
|---|---|---|
| SimEvents district model (`.slx`) | 🟢 Implemented | Confirmed real by unzipping the file: genuine SimEvents blocks matching the design doc's architecture exactly, including Tier-C-preempts-Tier-B via `PermitPreemptionBasedOnAttribute`. Cross-validated against an independent reference model in git commit `66638bb`. |
| Build script (`buildDistrictScreeningModel.m`) | 🟢 Implemented | A genuine, documented block-and-line builder (`new_system`/`add_block`/`add_line`) — the `.slx` is a build artifact of this script, not a hand-edited opaque binary, as the design doc's own reviewability requirement wanted. |
| Reference queueing model | 🟢 Implemented | A deliberate pure-MATLAB oracle, built to (a) produce numbers before Simulink/SimEvents were installed and (b) cross-validate the real model once it existed. Not a disguised substitute for the `.slx` — both exist, and they agree. |
| Scenario sensitivity | 🟢 Implemented | Confirmed scenario-dependent output: minimum ophthalmologists to hold p95 wait under 60 minutes shifts from 1→3 (70% Tier-A auto-clear) to 2→8 (no tiering) — satisfies the design doc's own "same output regardless of input is not a model" test. |
| `simulink-model/README.md` status table | 🔵 Diverges | Still says the `.slx` is "not built yet." It was, successfully, on 2026-09-08 — a one-line documentation fix, not a functional gap. |
| Wiring to the admin dashboard | 🔴 Not built | See §5/§6 — a fully validated model with nowhere in the product to be seen. |

---

## 9. Non-functional requirements
*Design doc §10. This is the shortest table in the report for a reason.*

| Component | Status | What we found |
|---|---|---|
| Offline capability (local app) | 🟢 Implemented | Capture, quality gate, both questionnaires, and local queueing all function with zero connectivity, per design. |
| Sub-second quality-gate performance | 🟢 Implemented | Not independently re-benchmarked in this audit, but the JS-fallback and compiled-exe paths (§4) are both designed for sub-second response; no evidence found of it missing the target. |
| HTTPS / TLS | 🔴 Not built | See §5. Entirely dependent on the hosting provider for the frontend leg; the backend itself is plain HTTP. |
| Role-based access control | 🔴 Not built | See §5. |
| Audit logging | 🟣 Stubbed | See §5. |
| Scalability design (district-scale) | 🟢 Implemented | This is what the Simulink model is for, and it's real (§8) — even though it isn't connected to anything a user can see yet. |

---

## 10. Clinical validation & benchmarking
*Design doc §14, implementation plan Phase 9. This is the part of the codebase most changed since the team's own most recent snapshot — the "no accuracy number exists yet" note in `implementation-plan-backend-ml.md` is two days stale.*

**Referable DR, 628-image IDRiD test split** (`models/evaluation_branchA_v1.txt`, 2026-09-09; judged on the CI's lower bound, per the project's own rule):

| Metric | Measured | Target | Met? |
|---|---|---|---|
| Sensitivity | 86.0% (CI 81.4–89.7%) | >90% | ❌ No |
| Specificity | 93.8% (CI 90.8–95.9%) | >85% | ✅ Yes |
| Quadratic-weighted kappa | 0.869 | — | — |
| NV recall (54 grade-4 cases) | 44.4% | reported separately | — |
| Branch A/B agreement (n=52 slice) | 46.2% | — | — |
| Disagreement error-lift | 1.37× | above 1 = useful signal | ✅ |

| Component | Status | What we found |
|---|---|---|
| Evaluation harness (Task 9.1) | 🟢 Implemented | Run for real, today, on 628 held-out images — not the empty harness the 2026-09-09 implementation plan describes. Sensitivity/specificity, kappa, full confusion matrix, reliability diagram, and NV recall reported separately, all present in `models/evaluation_branchA_v1.txt`. |
| Integrated pipeline vs. single-technique baseline (Task 9.2) | 🟢 Implemented | Run for real on 52 cases. Honest verdict: overlapping confidence intervals at matched coverage mean the "integrated pipeline wins" claim is not yet supported — reported as such rather than rounded up. Disagreement-lift of 1.37 is real, positive evidence for the two-branch design specifically, independent of the accuracy comparison. |
| External validation — Messidor-2 | 🔴 Not built | Never run. Explicitly and voluntarily disclosed in the experiment script's own docstring — see Q8. |
| Domain-generalization-gap experiment | 🟡 Partial | 2 of 3 rungs done (IDRiD test + 5 synthetic portable-camera perturbations × 3 severities, real numbers). Messidor-2 rung missing. The "gap recovered once calibration switches on" half of the flagship result can't be produced at all right now, since calibration correction isn't wired (Gap #8). |
| Explainability validation | 🟡 Partial | Lesion-attention consistency and counterfactual occlusion: done, quantitative, n=12, wired live in production. Clinician plausibility rating: not done (needs real reviewers). <30s review-time claim: not measured, n=0, explicitly disclosed rather than invented — see Gap #4/#5. |
| Neovascularization recall reported separately | 🟢 Implemented | 0.444 on 54 grade-4 cases — reported on its own rather than folded into an aggregate, exactly per the design doc's own §16 guidance. |

---

## 11. The mobile app (out of scope, but real)
*Not part of any design doc's build list. Documented here because it exists, is substantial, and could confuse a demo if picked up by accident.*

`phc-local-app/mobile/` is a working Expo/React Native TypeScript application — `"retina-saarthi"` in its own `package.json`, one of the two candidate project names the design doc's open items say were never resolved (§17). It is not a stub: ~7,000 lines across 10 screens (Home, Patient Registration, Capture, Quality Result, Questionnaire, Processing, Result, Explainability, History, Report), a typed 616-line API client, real navigation and context layers, and dependencies on `expo-camera`, `expo-network`, and `expo-file-system` — not placeholder packages.

> **system-design-v3-final.md §15, "DON'T BUILD (for this stage)":** "…a mobile capture app (deliberately dropped, §1.3)."

Its backend is not `central-system/backend`. `src/config/api.ts` points at `https://unpadded-slick-pushiness.ngrok-free.dev` — a single-model FastAPI inference server that doesn't exist anywhere in this repository. Its response contract (`imageQuality`, `severity`, `referableDR`, a flat `confidence` object) has no relationship to `api-contracts.md`'s documented shapes — no dual-branch grading, no conformal tier, no Grad-CAM safeguards, no Branch B. The PHC web app's own Capture screen also opportunistically calls this same ngrok endpoint for an "AI Severity Prediction" shown on the Quality Result screen — a second, quieter instance of the same disconnection, inside the app that *is* in scope.

Read plainly: this is very likely a teammate's independent, pre-v3 prototype (matching the design doc's own preface, which names "RetinaSaarthi" and "NetraGuard" as two documents the team reconciled into v3) that never got folded into the final architecture, or deliberately reconciled out of it. It isn't broken — it's just a different product than the one the rest of this audit describes, sitting in the same repo under a name that suggests it's part of the plan.

---

## Methodology

All nine files under `docs/` were read in full before any code was opened. Four parallel audits then verified the ML pipeline, the two backends, both frontends plus the mobile folder, and the Simulink model plus datasets/validation directly against source — not against the implementation plan's own status markers, several of which were confirmed stale (dated 2026-09-09, two days behind the code). Every verdict above cites the specific file, metric, or commit it rests on; anything this audit could not directly verify (e.g. whether the symptom/risk confidence-fusion scoring in §6.10 runs against real questionnaire data end to end) is named as unverified rather than guessed at.

**Legend:** 🟢 Implemented · 🟡 Partial · 🟣 Stubbed/mocked · 🔴 Not built · 🔵 Diverges from design
