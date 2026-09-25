# 06 — PPT evidence inventory (NetraSetu, SIH 2026 PS 26038)

**Audited:** 2026-09-25, branch `tanuj`, HEAD `7dcf3b1`, working tree **dirty (57 changed/untracked paths)**.
**Method:** every number below was copied from a result file, a log, a config, or a test I re-ran today. Docs were used only as leads. Where only a doc supports a claim, it is tagged DOC-ONLY.

**Before using this file:**

- **`docs/ppt-audit/01`–`05` do not exist.** I checked the working tree and every local and remote branch (`git ls-tree` on all eight refs). This audit was built directly from the code and result files, not from those five files.
- **The mobile rebuild, PHC-side auth and phone↔PC peer sync are not committed.** `phc-local-app/mobile/netrasetu/` (6,764 lines of TS), `phc-local-app/backend/{routes/auth.js,routes/peer.js,services/peer*.js,services/localAuth.js,…}`, the tests, `verify_tls.js` and `verify_mobile_quality_gate_parity.mjs` are all untracked (`git status`). Anything on a slide about them currently exists only on this laptop.
- **Number formatting.** Values from `.txt` result files are copied exactly as printed. Values that exist only in `.json` files are given at full stored precision, usually with the exact k/n fraction next to them. If you shorten a number on a slide, shorten the fraction, not the source file.

### Tags

| Tag | Meaning |
|---|---|
| **CODE-VERIFIED** | Found in code, config, a result file or a log. The path is given. |
| **RE-RUN TODAY** | CODE-VERIFIED, and I executed it on 2026-09-25. |
| **DOC-ONLY** | Claimed in a doc; no code or result file backs it. |
| **MOCK** | A UI exists, but the data shown is hardcoded or synthetic. |
| **NOT FOUND** | Looked for, not present. |
| **NOT IN v4** | Exists in the repo but is absent from, or contradicts, `docs/system-design-v4.md`. |

### Path abbreviations

- `ML/` = `central-system/backend/ml-pipeline/`
- `DX/` = `ML/diagnostics/out/`
- `BE/` = `central-system/backend/`
- `PHC/` = `phc-local-app/`

### Model generations (needed to read any number)

- **Branch A = the CNN classifier.** `branchA_v1` (384 px) was the default until 2026-09-23. `branchA_v2c` (512 px, EfficientNet-B0, trained on APTOS + IDRiD + EyePACS) is the code default today: `ML/inference/branchAInfer.py:94` and `ML/inference/branchAInferMatlab.m:112`.
- **Red-lesion model.** `RED_LESION_MODEL_VERSION` defaults to `v2` (3-class MA/HE): `ML/inference/segInfer.py:114`.
- **Some validations are v1-only.** Dual-branch lift, explainability n=12, domain-gap perturbations and the fovea gate were all measured on v1-era outputs. They are labelled as such below.

---

## 1. Top 15 headline facts

Every fact below is CODE-VERIFIED unless its tag says otherwise. A "Caveat" line is what a judge could fairly ask about.

**1. External validation on data the model never saw.** CODE-VERIFIED · NOT IN v4
- **Fact:** Messidor-2, REPORT half (872 images / 437 patients). The split was pre-declared by patient-ID parity and the report half was opened once (`DX/final_report_log.txt`, v2c 2026-09-21T15:36:22Z).
- **Numbers:** AUC P(grade≥2) **0.9234912886120696**, 95% CI [0.8995793648576036, 0.9450063486294292]. QWK **0.7165599420903168**.
- **Evidence:** `DX/messidor2_v2c_candidate_report.json` → `report_half`
- **Caveat:** v4 §15/§17 says Messidor-2 "has never been run". It has. Sensitivity at the shipped threshold falls to **0.7523** externally (fact 14).

**2. Zero false auto-clears of referable eyes in-domain, across 50 cross-fit folds.** CODE-VERIFIED
- **Numbers:** n=1161. Tier A (auto-clear) share **0.3841** [0.3750, 0.3931]. False auto-clear of true-referable eyes **0.0000** [0.0000, 0.0000]; of grade≥3 eyes **0.0000**. The output ends with "All guards clear."
- **Evidence:** `DX/conformal_v3_crossfit_report_branchA_v2c.txt`
- **Caveat:** the pool is APTOS+IDRiD val+test. Externally the rate is 5/218 (fact 3).

**3. No proliferative-DR eye is ever auto-cleared.** CODE-VERIFIED
- **In-domain (cross-fit):** 100 true grade-4 eyes, 1000 tier assignments → **A: 0, B: 960, C: 40**. Evidence: same file as fact 2, section "GRADE-4 TIER DISTRIBUTION".
- **External (Messidor-2):** true grade≥3 eyes auto-cleared **0/45** on the report half and **0/65** on the selection half. True-referable eyes auto-cleared **5/218 = 0.0229** on the report half. Evidence: `DX/messidor2_shift_stress_test_v2c.txt`.
- **Caveat:** the exact Clopper-Pearson upper bound on 5/218 is 0.0527 (per `ML/docs/messidor2_v2c_final_external_report.md`). That is just above the 5% guard.

**4. Referable-DR sensitivity above the PS's 90% bar (in-domain).** CODE-VERIFIED
- **Out-of-fold (cross-fit):** sensitivity **0.9458** [0.9378, 0.9537], specificity **0.9131** [0.9083, 0.9179]. Evidence: `DX/conformal_v3_crossfit_report_branchA_v2c.txt`.
- **Single held-out split (argmax):** sensitivity **0.9264705882352942** (252/272), specificity **0.9241573033707865** (329/356), n=628. Evidence: `ML/models/Model1/v2c/branchA_v2c_metrics.json` → `test_pooled`.
- **Caveat:** in-domain only. On Messidor-2 the shipped threshold gives sensitivity 0.7523 and specificity 0.9388.

**5. Grade-4 (PDR) recall up from 0.444 to 0.574 on the same 54 held-out PDR eyes.** CODE-VERIFIED
- **Numbers:** v1 **0.4444444444444444** (24/54) → v2c **0.5740740740740741** (31/54). QWK v2c **0.8838745744490235**.
- **Evidence:** `DX/m1_metrics.json` → `heldout.per_grade.4` (v1); `ML/models/Model1/v2c/branchA_v2c_metrics.json` (v2c)
- **Caveat:** v4 still quotes 0.444 as the current figure. Grade-1 recall fell from 0.5833 to 0.55.

**6. PyTorch → MATLAB import is numerically exact.** CODE-VERIFIED
- **Classifier (v2c):** max\|diff\| **0.000001** on 10 real images, **10/10** predicted grades agree. Evidence: `DX/parity_v2c_report.txt`.
- **3-class red-lesion model (M5 v2):** max\|diff\| **0.000014**; MA and HE lesion counts identical on 10/10 images. Evidence: `DX/parity_red_v2_report.txt`.
- **Segmentation served from MATLAB vs Python:** rule-engine grade identical **20/20**, optic disc and fovea positions identical 20/20. Evidence: `DX/seg_backend_parity.txt`.

**7. Sub-second inference inside a persistent MATLAB session.** CODE-VERIFIED
- **Numbers (medians, n=18 requests each):** Branch A **894 ms**; per-case MATLAB pipeline (rule engine, camera check, NV score, evidence report) **682 ms**; vessel **704 ms**; localization **673 ms**; bright-lesion **546 ms**.
- **Evidence:** `ML/inference/matlabSession/session.log`, which records `(… ms)` for every request.
- **Caveat:** the log doesn't record which Branch A version served each request. End-to-end "~21 s per case" is only in docs (see §2.B).

**8. When the two grading branches disagree, the CNN is wrong 2.4× as often.** CODE-VERIFIED (v1)
- **Numbers:** P(CNN wrong \| disagree) **0.6071** vs P(CNN wrong \| agree) **0.2500**. Lift **1.3727** over the base rate of 0.4423. n=52.
- **Evidence:** `ML/experiments/comparison_task92_real.txt`
- **Caveat:** the same file's verdict is "No difference is demonstrated … Do not claim the integrated pipeline wins" (confidence intervals overlap). Present disagreement as a triage alarm, not as an accuracy gain.

**9. The fovea-failure detector catches every gross miss it has seen.** CODE-VERIFIED
- **Numbers:** threshold 0.37. Test set: **2/2** gross misses caught, false-alarm rate 0.053 (4 of 76). Across all 516 images, **14/516 (2.71%)** are flagged `foveaUnreliable`.
- **Evidence:** `DX/fovea_gate_report.txt` lines 141–166; `ML/inference/segInfer.py:86`
- **Caveat:** only 2 positives per split. The status doc calls it "a safety net, not a proven detector."

**10. Explanations are tested causally, not just displayed.** CODE-VERIFIED (v1)
- **Numbers:** hiding the lesion pixels lowered confidence in **6/6** referable predictions (median drop **0.3881816416978836**) and raised it in **6/6** non-referable predictions. Grad-CAM attention on lesions is a median **2.023340160057525×** chance; 9/12 cases are above chance.
- **Evidence:** `ML/experiments/explainability_results.json`
- **Caveat:** n=12. The same file says review time and clinician plausibility are "NOT MEASURED" and "NOT DONE".

**11. Pixel-level lesion and landmark models.** CODE-VERIFIED
- **Hard exudates:** Dice **0.6675558777334784**, n=27 held-out. Evidence: `DX/m45_metrics.json`.
- **3-class red-lesion model:** merged val Dice **0.599374574746393** vs v1 0.5353; MA **0.44165716990813975**, HE **0.5705328187852601**; n=16 val. Evidence: `ML/models/red_lesion_v2_metrics.json`.
- **Optic disc:** within one disc-radius on **98.7012987012987%** of 77 held-out images. Evidence: `DX/m3_metrics.json`.

**12. Ten or more MathWorks products are called from the code.** CODE-VERIFIED
- **Products:** Deep Learning, Image Processing, Statistics & ML, Parallel Computing, Simulink, SimEvents, MATLAB Compiler, Report Generator, Computer Vision, Medical Imaging, Global Optimization. Files are listed per product in §3.4.
- **SimEvents models:** two, both built by script. `simulink-model/netraSetuPipeline.slx` contains EntityServer ×5, Queue ×4, EntityOutputSwitch ×6 and 2 live toggle switches.
- **Caveat:** on this laptop, `ver` lists only 6 installed products (§3.4).

**13. Offline-first phone ↔ PHC PC sync, end-to-end encrypted, survives a power cut.** RE-RUN TODAY · NOT IN v4
- **What:** AES-256-GCM sealed channel (`PHC/backend/services/peerCrypto.js:7,37`).
- **Tests re-run today:** `npm run test:peer` **12/12**, PHC backend `npm test` **24/24**, mobile `npm test` **23/23**.
- **Caveat:** all of it is uncommitted.

**14. The system distrusts cameras it hasn't validated, and the data shows why.** CODE-VERIFIED · NOT IN v4
- **What:** `decideTier` has 4 Tier-A floors and 3 hard Tier-C overrides (`BE/services/gradingOrchestrator.js:488–561`). One floor is the unvalidated-camera rule.
- **Numbers (Messidor-2):** the rule cuts false auto-clears from **5/218 to 0/218**. The cost is 318/872 = 0.3647 of cases moved to assisted review.
- **Evidence:** `DX/messidor2_site_conformal_recal_v2c.txt:47–50`; `BE/config/validatedCameras.json`

**15. Seven Indian languages in all three front-ends.** CODE-VERIFIED
- **Languages:** bn, en, hi, mr, pa, ta, te.
- **Evidence:** `central-system/frontend/src/i18n/locales/`, `PHC/frontend/src/i18n/locales/`, `PHC/mobile/netrasetu/i18n/locales/`
- **Caveat:** patient SMS templates exist only in en and hi (`BE/services/referralNotificationService.js`, `TEMPLATES`). The en locale file has 123 lines; bn/pa/ta/te have 103, so they are less complete.

---

## 2. Claims → evidence table

"In v4?" shows whether `system-design-v4.md` describes the item: ✔ matches, ✘ absent, ≠ contradicts.

### 2.A ML performance

| Claim a slide might make | Tag | Exact evidence | Path | In v4? |
|---|---|---|---|---|
| Classifier is EfficientNet-B0, 512 px | CODE-VERIFIED | `img_size: 512`; timm repo `timm/efficientnet_b0.ra_in1k` | `ML/models/Model1/v2c/branchA_v2c_metrics.json`, `…/v2c/__huggingface_repos__.json` | ✔ (resolution not stated) |
| Trained on 17,576 images incl. EyePACS | CODE-VERIFIED | `n_train: 17576`, `use_eyepacs: true`, `eyepacs_max: 24000`, `eyepacs_5class_weight: 0.5` | same metrics JSON | ≠ v4 §14 lists no EyePACS |
| Held-out test QWK 0.884 (v2c) | CODE-VERIFIED | `0.8838745744490235`, n=628 | same, `test_pooled` | ✘ (v4 quotes v1) |
| IDRiD-only QWK (v2c) | CODE-VERIFIED | `0.8558659217877095`, n=78 | same, `test_idrid_only` | ≠ v4 quotes 0.8242 (v1) |
| IDRiD-only QWK (v1) 0.8242 | CODE-VERIFIED | `0.8242270894283229`, n=78 | `DX/m1_metrics.json` → `heldout_idrid` | ✔ but now superseded |
| "Pooled APTOS+IDRiD QWK 0.883" (v4 §15) | CONTRADICTED | v1 **test** QWK is `0.8688032708046196`; 0.883 matches v1 **val** QWK `0.8825370183769536` | `DX/m1_metrics.json`; `ML/models/Model1/branchA_v1_metrics.json` | ≠ |
| Referable sens/spec held-out (v2c, argmax) | CODE-VERIFIED | 0.9264705882352942 / 0.9241573033707865 | v2c metrics JSON | ✘ |
| Referable sens/spec at shipped threshold, out-of-fold | CODE-VERIFIED | sens=0.9458 [0.9378,0.9537] spec=0.9131 [0.9083,0.9179] | `DX/conformal_v3_crossfit_report_branchA_v2c.txt` | ✘ |
| Referable sens/spec at threshold, pooled | CODE-VERIFIED | sensitivity 0.9503 (478/503), specificity 0.9103 (599/658). **In-sample**: the threshold was fitted on this same pool. | same file | ✘ |
| In-domain AUC 0.979 | CODE-VERIFIED | `0.9785814606741573` (single split) | `DX/messidor2_v2c_candidate_report.json` → `in_domain_test` | ✘ |
| Grade-4 recall v2c | CODE-VERIFIED | 0.5740740740740741 (31/54) | v2c metrics JSON | ≠ v4 says 0.444 |
| Grade-1 recall v2c | CODE-VERIFIED | 0.55 pooled; 0.5 on IDRiD (n=4) | v2c metrics JSON | ≠ v4 says 0.000 (v1, IDRiD) |
| "5 of 54 PDR below referral threshold" | CODE-VERIFIED **for v1 only** | v1 grade-4 row `[1,4,7,18,24]` → 5 predicted as grade 0 or 1. v2c row `[1,2,14,6,31]` → 3. | `DX/m1_metrics.json`; v2c metrics JSON | stale |
| Messidor-2 external AUC / QWK | CODE-VERIFIED | report half 0.9234912886120696 / 0.7165599420903168 | `DX/messidor2_v2c_candidate_report.json` | ≠ v4 says never run |
| Messidor-2 sens/spec at shipped threshold | CODE-VERIFIED | report half sens=0.7523 spec=0.9388 | `DX/messidor2_shift_stress_test_v2c.txt` | ≠ |
| Messidor-2 grade-4 recall | CODE-VERIFIED | 0.46153846153846156 (6/13) report half; 0.6818181818181818 (15/22) selection half | candidate report JSON | ✘ |
| v2c chosen over the rule-selected v2b | DOC-ONLY for the rationale; numbers CODE-VERIFIED | v2b false auto-clear 28/218 = 0.1284 vs v2c 5/218 = 0.0229 | `DX/messidor2_shift_stress_test_v2b.txt`, `…_v2c.txt`; rationale in `docs/backend-plan-status.md:198–206` | ✘ |
| 50 local labels fix v2b's calibration transfer | CODE-VERIFIED (v2b, **not the deployed model**) | n=50: Tier A mean 0.3338; full table in the report | `DX/messidor2_site_conformal_recal_v2b.txt`; `ML/docs/messidor2_v2b_final_external_report.md` | ✘ |
| Vessel U-Net Dice 0.80 on CHASE_DB1 | CODE-VERIFIED **but inflated** | `0.8024185508929272` on **all 28** CHASE images; the model trained on 22 of them. The honest held-out number is best val Dice **0.7771457731723785** (6-image val set). | `DX/m2_metrics.json`; `ML/models/red_lesion_v2_metrics.json` → `vessel_ckpt_best_val_dice`; `ML/training/train_vessel_unet.py:384` | ≠ v4 compares against the inflated figure |
| Vessel out-of-domain Dice 0.8136 | CODE-VERIFIED with a caveat | `0.8136335719155415` on DRIVE **with GT ≤1 px excluded**. Raw DRIVE Dice is `0.6186212261842878`. | `DX/m2_metrics.json` → `drive_thick_only`, `drive` | ✔ (caveat missing) |
| Per-domain vessel threshold via camera calibration | NOT FOUND | `segInfer.py:322` uses a fixed `full > 0.5`; no "domain" logic in segInfer | `ML/inference/segInfer.py` | ≠ v4 §6.5 |
| Hard-exudate Dice 0.6676 | CODE-VERIFIED | 0.6675558777334784, n=27 | `DX/m45_metrics.json` | ✔ |
| Soft-exudate Dice 0.076 | DOC-ONLY | No result file contains it; only prose in `ML/comprehensive_model_analysis.md:80,419` | — | ✔ |
| MA detection rate (v1 model) | CODE-VERIFIED | MA `overall_detect_pct` 62.80193236714976; HE 79.38718662952647 | `DX/m45_metrics.json` | ✔ |
| 3-class red-lesion model beats v1 | CODE-VERIFIED | 0.599374574746393 vs 0.5353 (+0.0641); encoder transferred from the vessel model (216 tensors) | `ML/models/red_lesion_v2_metrics.json` | ✔ (encoder transfer ✘) |
| Class-specific size floors MA 5 / HE 10 px | CODE-VERIFIED | `chosen_floors` | `ML/models/red_lesion_v2_config.json` | ✔ |
| OD / fovea localization | CODE-VERIFIED | within one radius: OD 98.7012987012987%, fovea 96.1038961038961%, n=77, `contaminated: false` | `DX/m3_metrics.json` | ✔ |
| Neovascularization suspicion score works | **Refuted** | AUC grade 4 vs 0–3: IDRiD test 0.2863 [0.1245,0.4877], Messidor-2 0.3793 [0.2435,0.5223]. Log verdict: "TOO LOW to justify any live use." Gated to 0 in the rule engine. | `ML/experiments/nv_validation_run.log`; `docs/backend-plan-status.md:172` | ≠ v4 says "never measured" |
| Rule-engine thresholds refit (red v2), held-out | CODE-VERIFIED | n=103: QWK 0.692 [0.559,0.802], sens 0.859, spec 0.872; "SENSITIVITY IS BELOW THE 0.90 TARGET" | `ML/models/rule_thresholds_by_red_version.json` → `v2._heldOutTest` | ✘ |
| Branch agreement 46.2%, lift 1.37× | CODE-VERIFIED (v1, n=52) | agreement 46.2%, LIFT 1.3727 | `ML/experiments/comparison_task92_real.txt` | ✔ |
| "Integrated pipeline beats single technique" | **Refuted by own data** | "No difference is demonstrated" | same | ✔ (v4 also says unsupported) |
| Conformal sets are always contiguous | CODE-VERIFIED | `assign_tier` returns the contiguous hull `range(low, high+1)` | `ML/inference/branchAInfer.py` ~l.490–495 | ✔ |
| Deployed conformal method | CODE-VERIFIED | `method: ordinal_mode_interval_stratified_v3`, T=1.5437778038856966, referableThreshold 0.38729477683890751 | `ML/models/calibration_branchA_v2c.json` | ≠ v4 §18 still lists this as an open question |
| P(g3)+P(g4) > 0.5 safety check | CODE-VERIFIED | `referable = (p34 > 0.5) or (…p_referable >= referable_threshold)` | `ML/inference/branchAInfer.py:565–567` | ✔ |
| MC-Dropout uncertainty | CODE-VERIFIED on the Python path only | `--mc-dropout` default 20 (`branchAInfer.py:525`). **NULL on the default MATLAB path** by design. | `BE/services/gradingOrchestrator.js:930–946`; `docs/backend-plan-status.md:141` | ≠ v4 implies it is always an input |
| Grad-CAM | CODE-VERIFIED | Produced in the Branch A call; stored as `media/cases/<id>/gradcam.png` | `BE/services/gradingOrchestrator.js:690–783`; `ML/explainability/gradCam.m`, `ML/inference/gradcam.py` | ✔ |
| Domain-gap robustness to synthetic camera degradation | CODE-VERIFIED (v1, n=52) | QWK baseline 0.8270005253020487; worst tested 0.7898989898989899 (colour shift 1.0) | `ML/experiments/domain_gap_results.json` | ✔ |
| Camera-family classifier accuracy | NOT MEASURED | Profile file says: "Do not quote a classification accuracy for this; none has been measured." | `ML/cameraCalibration/calibrationProfiles.json` | ✔ |
| Symptom/risk questionnaire adjusts confidence (§6.10) | NOT FOUND | No fusion code. The questionnaire feeds only the urgency score (queue tie-break) | `BE/services/gradingOrchestrator.js:1239–1270` | ≠ |
| Triage urgency score | CODE-VERIFIED, **trained on synthetic data** | TreeBagger; CHECK 1..100; ordering tie-break only | `ML/grading/calculateUrgencyScore.m`; `BE/db/migrations/0018_urgency_score.sql` | ✘ |

### 2.B System, pipeline and operations

| Claim | Tag | Exact evidence | Path | In v4? |
|---|---|---|---|---|
| Branch A runs inside MATLAB by default | CODE-VERIFIED | `INFERENCE_BACKEND` default `'matlab'` | `BE/services/gradingOrchestrator.js:183` | ✔ |
| Persistent MATLAB session with supervisor | CODE-VERIFIED | Heartbeat file present; supervisor service | `ML/inference/matlabSession/`; `BE/services/matlabSessionSupervisor.js`, `workerSupervisor.js` | ✔ |
| Per-request MATLAB latency | CODE-VERIFIED | See fact 7 | `ML/inference/matlabSession/session.log` | ✘ |
| ~21 s end-to-end per case | DOC-ONLY (single measurement) | `gradingSeconds: 21, source: measured, n: null` — a single figure, not a distribution | `simulink-model/calibration.json`; `docs/backend-plan-status.md:140` | ✘ |
| ~12.5 s per case | DOC-ONLY, **contradicts the above** | — | `docs/DEMO_SETUP.md:53`; `BE/services/gradingWatchdog.js:17` comment | ✘ |
| Segmentation worker saves ~17 s per case | DOC-ONLY | "17.1 s" startup vs "2.0 s" work | `docs/backend-plan-status.md:139` | ✘ |
| Quality gate: MATLAB 9.1 s vs compiled exe 4.6 s | DOC-ONLY (code comment) | "MEASURED warm on the dev machine" | `PHC/backend/services/qualityGateClient.js` header | ✘ |
| Idempotent ingestion on `capture_id` | CODE-VERIFIED | `UNIQUE (capture_id_ref)` | `BE/db/migrations/0005_idempotent_ingestion.sql:29` | ✔ |
| Summary-first + chunked, resumable upload | CODE-VERIFIED | `POST /summary`, `/:captureRef/chunks/*` | `BE/routes/cases.js:151–236` | ✔ |
| 18 schema migrations (node-pg-migrate) | CODE-VERIFIED | `0001`–`0018` | `BE/db/migrations/` | ✔ (v4 calls it a gap) |
| Review claiming, 30-min expiry | CODE-VERIFIED | `CLAIM_TTL_MINUTES … 30` | `BE/services/authConfig.js:77`; `BE/routes/cases.js:482` | ✔ |
| "Confirm" blocked when branches disagree | CODE-VERIFIED | `if (g.branch_agreement === false)` → reject | `BE/routes/cases.js:371–379` | ✔ |
| One tiering decision with floors | CODE-VERIFIED | `decideTier()` | `BE/services/gradingOrchestrator.js:488–561` | ✔ (unvalidated-camera floor ✘) |
| Tier A requires branch **agreement** | CONTRADICTED | Only `branchAgreement === false` forces C. `null` (rule engine couldn't assess) can still reach A. | same | ≠ v4 §6.8 |
| Every CNN grade 4 goes to Tier C | CODE-VERIFIED **only when the rule engine is a lower bound** | `beyondRuleEngine` condition | `BE/services/gradingOrchestrator.js:896–899` | ≈ |
| Watchdog for stuck jobs | CODE-VERIFIED | 90 s interval | `BE/services/gradingWatchdog.js:29` | ✔ |
| Consolidated System Health endpoint | CODE-VERIFIED | `GET /system-health` | `BE/routes/adminDashboard.js:57` | ✔ |
| Continual learning with a validation gate | **Partly built** | Gate and promotion logic exist. **Retraining is not implemented**: `retrainBranchA.m` is absent and the function throws `retrain_not_implemented`. | `BE/services/continualLearningService.js:150–179` | ≠ v4 implies it works |
| Corrections captured for retraining | CODE-VERIFIED | `dataset_labels` written in the review transaction; export script exists | `BE/db/migrations/0013_dataset_labels.sql`; `scripts/exportTrainingSet.js` | ✔ |
| Clinical-rationale PDF (Report Generator) | CODE-VERIFIED (code) | `GET /:caseId/report` → `generateReport.m` (`mlreportgen`), with a core-MATLAB fallback | `BE/routes/cases.js:542`; `BE/services/caseReport.js:52`; `ML/explainability/generateReport.m` | ≠ v4 §16 lists it as unbuilt |
| DICOM input | CODE-VERIFIED (code); test is synthetic-only | `medicalImage(imagePath)` | `ML/preprocessing/readFundusImage.m:86`; `ML/preprocessing/testReadFundusDicom.m` | ≠ v4 §16 lists it as unbuilt |
| SMS via Twilio | CODE-VERIFIED (code) | Live DB: **all 16 notification rows are `dry_run`**. `.env` now has `SMS_DRY_RUN=0`; `test_sms.js` sends to one hardcoded number. | `BE/services/referralNotificationService.js`; `test_sms.js`; DB query today | ✔ |
| Undelivered SMS → manual follow-up | CODE-VERIFIED | Migration 0011; Twilio status webhook | `BE/db/migrations/0011_referral_manual_follow_up.sql`; `BE/routes/notifications.js:54` | ✔ |
| Simulink/SimEvents district model | CODE-VERIFIED (artifact) | `.slx` files contain EntityGenerator/Server/Queue blocks; built by `buildDistrictScreeningModel.m` and `buildFullPipelineModel.m` | `simulink-model/*.slx` | ✔ |
| Simulink agrees with the reference model (auto-clear 71.0% vs 68.4%) | DOC-ONLY | No output file in the repo; `simulink-model/out/` does not exist | `simulink-model/README.md` | ✔ |
| Resource recommendations run daily | CODE-VERIFIED (code) | **0 rows** in `resource_recommendations` in the live DB today | `BE/services/resourceRecommendations.js`; DB query | ✔ |
| Parallel Computing: threshold search from 24 min to 215 s | DOC-ONLY | — | `docs/backend-plan-status.md:159` | ✘ |
| Global Optimization solvers lost to exhaustive search | DOC-ONLY (table) | Refit JSONs show the exhaustive result (QWK 0.87814527124736608); ga/surrogateopt runs are not saved | `DX/rule_thresholds_v2_refit.json`; `docs/backend-plan-status.md:263–267` | ✘ |
| Live DB volume | CODE-VERIFIED (queried read-only today) | 36 cases (35 graded, 1 error); tiers B=27, C=8, **A=0**; all 35 rows `model_version=branchA_v1`; 17 reviews; 16 referrals; 7 access-log rows | Postgres `dr_screening_central` | — |
| Access log | CODE-VERIFIED | 7 rows | migration 0002; DB | ✔ |

### 2.C Security

| Claim | Tag | Evidence | Path | In v4? |
|---|---|---|---|---|
| Central login, bcrypt, JWT, CSRF, role guards | CODE-VERIFIED (code) | `routes/auth.js`, `requireAuth.js`, `requireRole.js` | `BE/` | ≠ v4 §11.1 says "none" |
| Auth is **on** | **No.** `AUTH_ENABLED` defaults to false and is **not set** in `.env` | `flag('AUTH_ENABLED')` default false | `BE/services/authConfig.js:42–49`; `.env` | — |
| Central web login is real | **MOCK** | Hardcoded `admin/admin123`, `doctor/doctor123` | `central-system/frontend/src/components/screens/LoginScreen.jsx:78,102` | — |
| PHC API keys enforced | CODE-VERIFIED | `PHC_AUTH_ENABLED=t…` in `.env` | `BE/middleware/requirePhcApiKey.js` | ✘ |
| PHC technician login (scrypt, lockout) | RE-RUN TODAY (24/24) · uncommitted | `LOCAL_AUTH_ENABLED` default false | `PHC/backend/services/localAuth.js`, `passwords.js` | ✘ |
| TLS 1.2+ on both backends | CODE-VERIFIED (code); test is DOC-reported 12/12 | `TLS_KEY_PATH`/`TLS_CERT_PATH` | `BE/server.js:179`; `verify_tls.js` | ✔ |
| Encryption at rest (AES-256) | **NOT DONE** | Status: "Not done"; the registry blocks Device Encryption | `docs/backend-plan-status.md:12,105–111`; `docs/changelog-2026-09-24-mobile-sync-auth.md` §7.7 | ≠ v4 §11.1 requirement |
| Phone ↔ PC AES-256-GCM, encrypted USB bundles | RE-RUN TODAY (12/12) · uncommitted | — | `PHC/backend/services/peerCrypto.js`, `peerBundle.js`; `PHC/mobile/netrasetu/peer/` | ✘ |

### 2.D Front-ends: real vs mock

| Screen / feature | Tag | Evidence |
|---|---|---|
| **Both web apps default to mock data** | MOCK by default | `USE_MOCK_DATA … : true` in `central-system/frontend/src/config.js:1–3` and `PHC/frontend/src/config.js:1–3` (true unless `VITE_USE_MOCK_DATA` is set) |
| Central review queue, case detail, claim, review, review history | Real when `VITE_USE_MOCK_DATA=false` | `centralApiClient.js:46–207` call `/api/v1/...` |
| Central district dashboard | **MOCK, always** | `getAdminDashboard()` returns `mockData.mockAdminDashboard` with no real branch (`centralApiClient.js:222–226`, comment "mock-only today"). The backend `GET /admin/dashboard` exists but is never called. |
| Central PHC sync statuses | **MOCK, always** | `getPhcSyncStatuses()` (`centralApiClient.js:261–264`) |
| Referral status update | **MOCK, always** | `updateReferral()` edits the in-memory mock (`centralApiClient.js:247–259`). The backend `PATCH /referrals/:id` exists but is never called. |
| Field Ops page (5 PHCs, technicians, cameras) | **MOCK** | `const mockPhcData = [...]` (`FieldOpsPage.jsx:34–39`) |
| Login role cards "6 cases pending", "42 cases today" | **MOCK** | `LoginScreen.jsx:18,26` |
| Grad-CAM overlay | Real image when available; **synthetic illustration** as fallback on 404 | `GradCamOverlay.jsx` (`SyntheticGradCam`) — at odds with v4 §1.22 |
| Case history timeline | Real if the backend sends `priorAssessments` (`BE/services/ingestionService.js:648`) | — |
| Resource recommendations / Simulink validation panel | Real when not in mock mode | `centralApiClient.js:268–322` |
| **PHC desktop "Diagnostic Result" modal** | **MOCK** | Hardcoded biomarkers ("4 tiny red punctate lesions") and fallback `prediction={… \|\| mockAiPredictions.pass}` (`PHC/frontend/src/components/screens/DiagnosticResultModal.jsx`, `LocalQueueTable.jsx:220`). Violates v4 §1.3/§1.22. |
| PHC desktop capture quality result in mock mode | **MOCK** | `mockAiPredictions[mockScenario]` (`CaptureScreen.jsx:97–105`) |
| PHC desktop ngrok ML endpoint | Dead config | `ML_API_ENDPOINT = …ngrok-free.dev/predict` still exported (`PHC/frontend/src/config.js:6`) but imported nowhere |
| Mobile app (`netrasetu/`) | RE-RUN TODAY (unit 23/23, peer 12/12) · uncommitted | Talks to central with the PHC key. `test:sync` 9/9 and `test:parity` 35/35 are DOC-only (need live central / MATLAB). **Never run on a physical device** (changelog 1.4 🟡). |
| Legacy mobile `src/` with ngrok | Dead code | `PHC/mobile/src/config/api.ts:11`; not imported (`App.tsx` imports `./netrasetu/Root`) |
| `experimenting Frontend/` (3-D eye landing page) | CODE-VERIFIED | three.js scroll story, 3,615 lines (`experimenting Frontend/README.md`) · ✘ NOT IN v4 |

### 2.E Quality gate

| Claim | Tag | Evidence |
|---|---|---|
| "Nine quality factors" (v4 §6.1) | **CONTRADICTED** | `qualityGateMain.m` returns six reasons: `insufficient_fov`, `glare`, `motion_artifact`, `low_illumination`, `blur`, `eyelash_occlusion` (l.82–143). No contrast, colour-balance or black-border checks. |
| Per-camera-family presets | **Partly** | `cameraPresets.json` has only `default` and `mobile_lens` |
| Compiled exe + free MATLAB Runtime at the PHC | **NOT BUILT** | `PHC/backend/quality-gate-matlab/dist/` is empty. Changelog §9.1: "❌ not finished". `DEMO_SETUP.md:386`: the Runtime path has "never been tested on a machine without MATLAB". |
| Central inference Compiler build (`ML/deploy/`) | DOC-ONLY | `deploy/dist/` does not exist; claim in `docs/backend-plan-status.md:170` |
| JS fallback (no MATLAB needed) | CODE-VERIFIED, **on by default** | `ALLOW_JS_FALLBACK = … !== '0'` (`qualityGateClient.js:63`). The changelog says it is "switched off by design"; not reflected in code or `.env`. |
| Mobile gate is a port of the MATLAB gate | CODE-VERIFIED (code); parity 35/35 DOC-only | `PHC/mobile/netrasetu/lib/quality/`; `verify_mobile_quality_gate_parity.mjs` |
| Blur threshold rejects compressed images | CODE-VERIFIED | At threshold 0.17: cleanPass 0.8846153846153846, compressedReject 1.0 (n=52, JPEG q10) — `ML/experiments/quality_gate_compression.json` |

### 2.F Tests

| Claim | Tag | Evidence |
|---|---|---|
| Mobile unit tests | **RE-RUN TODAY: 23/23 pass** | `PHC/mobile` `npm test` |
| Phone ↔ PC peer sync incl. power cut | **RE-RUN TODAY: 12/12 pass** | `PHC/mobile` `npm run test:peer` |
| PHC backend auth + peer + TLS | **RE-RUN TODAY: 24/24 pass** | `PHC/backend` `npm test` |
| "17 Node suites, 516 checks + 5,760 parity comparisons" | DOC-ONLY | `docs/backend-plan-status.md:93`. Not re-run: these suites write to the live DB. 11 `verify_*.js`/`.mjs` files exist at the repo root. |
| MATLAB tests (`testBranchB` 54, `testRuleEngineSignals` 17, `testPhase7Explainability` 58, `testReadFundusDicom` 8) | Files exist · counts DOC-ONLY | `ML/grading/`, `ML/explainability/`, `ML/preprocessing/` |
| Conformal Python ↔ MATLAB golden vectors | CODE-VERIFIED (file) | `ML/tests/conformal_golden_vectors.json`, `test_conformal_v2.py` |
| "Zero automated tests" (v4 §17) | **CONTRADICTED** | See rows above |

### 2.G Context claims (external statistics)

| Claim | Tag |
|---|---|
| ~1 ophthalmologist per 100,000 rural people; DR in ~18% of 77M diabetics; 90% of blindness preventable (v4 §1.1) | DOC-ONLY — no citation in the repo |
| IDx-DR pivotal trial 87.2% / 90.7%, 900 patients (v4 §15) | DOC-ONLY — needs a citation on the slide |
| "Medios AI / AIDRSS figures" | NOT FOUND in the repo (v4 §18 itself says to spot-check) |

---

## 3. Deployment and hardware requirements

### 3.1 Central server

| Item | What the repo shows | Tag / path |
|---|---|---|
| Machine that produced every timing | AMD Ryzen 7 7435HS (8 cores / 16 threads), 23.7 GB RAM, NVIDIA RTX 4050 Laptop GPU, Windows 11 Home. C: 334 GB (19 free), D: 141 GB (7 free). | Queried today (`Win32_Processor`, `Win32_OperatingSystem`) |
| GPU needed for inference? | **No.** All PyTorch checkpoints load with `map_location="cpu"`; no `gpuArray` or `ExecutionEnvironment` in the MATLAB inference path. `DEMO_SETUP.md:55`: "No GPU needed." | `ML/inference/branchAInfer.py:250`, `segInfer.py:180` |
| GPU needed for training | Yes. Kaggle T4 (P100 also noted); EyePACS-scale training for v2b/v2c | `ML/training/train_classifier_kaggle*.ipynb` |
| RAM | "8 GB minimum, 16 GB comfortable"; peak inference ~2.0 GB | DOC-ONLY `docs/DEMO_SETUP.md:50–51` |
| Disk | `ML/models/` = **1.5 GB**; `ML/training/onnx_out` = 443 MB; per-case media **24 MB for 41 case folders** (median folder 616 KB) | `du` today |
| Software stack | Node 18+ (tested 24.11); PostgreSQL 14+; Python 3.10.9 with torch/timm/smp/opencv; **MATLAB R2026a** | `docs/DEMO_SETUP.md:19–24`; `ML/requirements.txt` |
| Grading concurrency | `GRADING_CONCURRENCY` default **1**; the Simulink model assumes 2 | `BE/services/gradingQueue.js:55`; `simulink-model/README.md` |
| Throughput per case | See §2.B: 21 s (doc, n=null) vs 12.5 s (older doc). Per-request MATLAB medians are in fact 7. | — |
| Measured grading failure rate | `gradingFailureRate: 0.5299…` (n=117), labelled "inflated by development runs … upper bound" | `simulink-model/calibration.json` |
| MATLAB Production Server | Not licensed (`license('test','MATLAB_Production_Server') = 0`, today) | — |

**Derived arithmetic for cost slides (my calculation — label it as derived, not measured):**
- The PS figure is 100,000 patients/yr (`calibration.json` `annualPatients`, "assumed").
- Two eyes per patient gives 200,000 cases/yr.
- 250 working days × 8 h (`calibration.json`) gives 2,000 h/yr, so about **100 cases/hour** is required.
- At 21 s per case, one grading worker handles about 171 cases/hour.
- So **one server of the dev-laptop class, concurrency 1, covers the PS scale on paper**, before retries and peaks.
- The 0.53 failure-rate figure above would need resolving before quoting this.

### 3.2 PHC desktop

| Item | What exists | Tag / path |
|---|---|---|
| Software | Node backend (port 4000), SQLite (`PHC/backend/db/local.sqlite`), React/Vite web frontend | CODE-VERIFIED |
| Quality gate, option 1 | Licensed MATLAB + Image Processing Toolbox (`matlab -batch`, about 9.1 s per call per the code comment) | CODE-VERIFIED / DOC timing |
| Quality gate, option 2 | Compiled `qualityGate.exe` + free MATLAB Runtime R2026a. **The exe is not built and the Runtime path is untested.** | `PHC/backend/quality-gate-matlab/dist/` empty |
| Quality gate, option 3 | Pure-JS fallback (`sharp`), no MATLAB needed | `PHC/backend/services/qualityGateFallback.js` |
| PC hardware spec (CPU/RAM/disk) | **NOT FOUND** — no PHC hardware requirement anywhere in the repo | — |
| Camera integration | **NOT FOUND** — no camera SDK/driver code. Desktop capture is a file upload. | `PHC/frontend/src/components/screens/CaptureScreen.jsx` |
| Supported input formats | jpg, jpeg, png, bmp, tif, DICOM; **.webp fails** (`imread`) | DOC `docs/backend-plan-status.md:349–352`; `ML/preprocessing/readFundusImage.m` |
| Fundus cameras known to the calibration bank | forus_3nethra_v2 (portable_handheld), remidio_fop (smartphone_adapter), topcon_trc_nw400 and zeiss_visucam (desktop_tabletop). Thresholds "HAND-BUILT AND UNVALIDATED". | `ML/cameraCalibration/calibrationProfiles.json` |
| Cameras validated for auto-clear | **None real.** The single entry is `topcon_trc_nw400`, "DEMO SEED -- NOT A REAL VALIDATION" | `BE/config/validatedCameras.json` |

### 3.3 Mobile device and fundus lens

| Item | What exists | Tag / path |
|---|---|---|
| Framework | Expo ~57.0.25, React Native 0.86.3, expo-camera, expo-sqlite, expo-secure-store | `PHC/mobile/package.json` |
| Platform | Android package `com.retinasaarthi.phc`; iOS bundle ID declared; permissions CAMERA, READ_MEDIA_IMAGES, ACCESS_NETWORK_STATE, INTERNET; `usesCleartextTraffic: true` | `PHC/mobile/app.json` |
| Minimum Android version / device RAM | **NOT FOUND** (no minSdk declared). Changelog relies on "Android 10+" file-based encryption. | `docs/changelog-2026-09-24-mobile-sync-auth.md` §7.6 |
| Fundus lens model | **NOT FOUND** — no lens make/model, field of view or working distance specified anywhere | `PHC/mobile/netrasetu/screens/LensCameraScreen.tsx` is generic (torch, zoom, pupil guide) |
| Lens quality preset | `mobile_lens`: focusThreshold 0.12, illuminationThreshold 0.3 (no fitting provenance) | `PHC/backend/quality-gate-matlab/cameraPresets.json` |
| Tested on a real phone | **No** ("not run on a device (no Android SDK here)") | changelog 1.4 |
| Lens captures and Tier A | `mobile_lens` is not in `validatedCameras.json`, so lens images can **never auto-clear** | `BE/services/gradingOrchestrator.js:554–559` |

### 3.4 MATLAB licensing per component

Two different questions for cost slides: which products the **code** calls (below), and which products are **installed** on the demo laptop. Today `ver` on `D:\bin\matlab.exe` listed only: MATLAB, Deep Learning, Image Processing, MATLAB Compiler, Medical Imaging, Statistics & ML. `license('test', …)` returned 1 for Parallel, Simulink, SimEvents, Report Generator, Computer Vision (`Video_and_Image_Blockset`), Global Optimization (`GADS_Toolbox`) and Optimization, but **those products are not installed here**. Install them, or run those parts on another machine, before any demo that needs them.

| Component (where it runs) | Products the code calls | Evidence | Unlicensed alternative that exists |
|---|---|---|---|
| **PHC quality gate** (every PHC) | MATLAB + **Image Processing** | `PHC/backend/quality-gate-matlab/assess*.m` | Compiler + free Runtime (**exe not built**) or the JS fallback |
| Quality-threshold calibration (offline, dev) | + Parallel Computing | `calibrateQualityThresholds.m` | — |
| **Central Branch A inference** | MATLAB + **Deep Learning** (+ free ONNX converter support package) | `ML/inference/branchAInferMatlab.m`, `ensureOnnxSupportOnPath.m` | `INFERENCE_BACKEND=python` (PyTorch, no MATLAB) |
| Central M2–M4 segmentation forward passes | + Deep Learning | `runMatlabInferenceSession.m` (`SEG_SERVED`) | `SEG_INFERENCE_BACKEND=python` (faster: 2.6 s vs 5.3 s, DOC) |
| M5 red-lesion model | none (PyTorch) | `docs/backend-plan-status.md:31` | — |
| **Central per-case pipeline** (`runCasePipeline.m`) | MATLAB + **Image Processing** (camera family, NV) + **Statistics & ML** (`TreeBagger` urgency) + **Computer Vision** (`insertShape` in `generateEvidenceReport.m`) + **Medical Imaging** (DICOM only) | `ML/grading/runCasePipeline.m`; `ML/grading/calculateUrgencyScore.m:152`; `ML/explainability/generateEvidenceReport.m:237`; `ML/preprocessing/readFundusImage.m:86` | `BE/services/matlabFallback.js` (JS rule engine, 720-case parity DOC-reported) |
| Clinical PDF | + **Report Generator** | `ML/explainability/generateReport.m` | `generateReportFigures.m` (core MATLAB) |
| Daily resource recommendation | MATLAB + **Statistics & ML** (`prctile`) | `simulink-model/referenceQueueingModel.m:250,252,361` | — |
| Weekly Simulink validation | **Simulink + SimEvents** | `simulink-model/*.slx`, `BE/services/simulinkValidation.js` | can be disabled (`SIMULINK_VALIDATION_ENABLED`) |
| Scenario sweeps, Monte Carlo (offline) | + Parallel Computing | `sweepDistrictScenarios.m`, `monteCarloQueueing.m` | serial fallback |
| Rule-threshold fitting (offline) | Statistics & ML + Parallel + **Global Optimization** (`surrogateopt`/`ga`/`patternsearch`) | `ML/grading/optimizeRuleThresholds.m` | exhaustive search (what the deployed thresholds came from) |
| Model import (offline) | Deep Learning (`importNetworkFromONNX`) | `ML/training/importModels*.m` | — |
| Packaging (dev side) | **MATLAB Compiler** | `ML/deploy/buildCaseChain.m`, `PHC/backend/quality-gate-matlab/buildQualityGateExe.m` | — |
| Legacy vessel-training script | Computer Vision (`unetLayers`) + Deep Learning | `ML/training/trainVesselUnet.m` (the deployed vessel model was trained in PyTorch) | — |

**Licensing bottom line for the cost slide:**
- **Every PHC:** $0 MATLAB licence if the Compiler route is finished (Runtime is free), or with the JS fallback. Neither Compiler route has been proven on a machine without MATLAB.
- **Central server, full MATLAB path:** MATLAB + Deep Learning + Image Processing + Statistics & ML + Computer Vision, plus Report Generator for the MATLAB PDF, plus Simulink/SimEvents for weekly validation.
- **Central server, no MATLAB at all:** runs on PyTorch + the JS fallback (`INFERENCE_BACKEND=python`, `MATLAB_ALLOW_FALLBACK`), losing the MATLAB-only extras (PDF via Report Generator, urgency score, Simulink validation).

---

## 4. Impressive but undocumented (not in v4, or not in any doc)

| Item | Why it's impressive | Tag | Path |
|---|---|---|---|
| **Messidor-2 external validation with a one-time report-half opening and an audit log** | A pre-registered external-validation discipline most teams skip | CODE-VERIFIED · NOT IN v4 | `DX/final_report_log.txt`, `DX/messidor2_*` (33 files), `ML/docs/messidor2_v2{b,c}_final_external_report.md` |
| **Site conformal recalibration experiment** (how many local labels a new site needs) | Directly answers "how do you deploy to a new district?" | CODE-VERIFIED · NOT IN v4 | `DX/messidor2_site_conformal_recal_v2{b,c}.txt` |
| **Unvalidated-camera Tier A floor, fail-closed** | 0/218 false auto-clears on the external set | CODE-VERIFIED · NOT IN v4 | `BE/config/validatedCameras.json`, `BE/services/validatedCameras.js` |
| **Disclosed model-selection override (v2c over rule-picked v2b), with the reason recorded** | Shows safety-driven engineering judgment | CODE-VERIFIED numbers · NOT IN v4 | `DX/messidor2_compare_v2b_v2c.json`, stress-test txts |
| **Rule thresholds keyed to the segmenter version** (they travel with the model) | Prevents a silent collapse to specificity 0.231 | CODE-VERIFIED · NOT IN v4 | `ML/models/rule_thresholds_by_red_version.json` |
| **NV score honestly refuted and gated off** | AUC 0.2863 / 0.3793, published rather than hidden | CODE-VERIFIED · ≠ v4 | `ML/experiments/nv_validation_run.log` |
| **Vessel-encoder transfer into the red-lesion U-Net** (216 tensors, conv1 adapted 1→3 channels) | Cross-task transfer learning | CODE-VERIFIED · NOT IN v4 | `ML/models/red_lesion_v2_metrics.json` → `vessel_transfer` |
| **Vessel "domain shift" diagnosed by controlled experiment** (scale explains only 3.23% of the drop) | Causal debugging, not a label | CODE-VERIFIED | `DX/m2_metrics.json` → `attribution.scale_share_pct` 3.227951951344171 |
| **Live SimEvents pipeline model** with sliders and outage switches (`netraSetuPipeline.slx`), calibrated from the live DB | Interactive PS-requirement-5 demo | CODE-VERIFIED (artifact) · NOT IN v4 | `simulink-model/buildFullPipelineModel.m`, `scripts/exportSimCalibration.js` |
| **Persistent segmentation worker** alongside the MATLAB session | Latency engineering | CODE-VERIFIED (code) · NOT IN v4 | `ML/inference/segSession/runSegWorker.py`, `BE/services/segWorkerSupervisor.js` |
| **Phone ↔ PC encrypted peer sync + encrypted USB bundles + offline PBKDF2 login** | Real rural-outage story | RE-RUN TODAY · NOT IN v4 · uncommitted | `docs/peer-sync-protocol.md`, `PHC/backend/services/peer*.js` |
| **Fundus-lens capture on mobile** | Low-cost capture path | CODE-VERIFIED · **contradicts v4 §1.21/§16** (explicitly rejected) · untested on device | `PHC/mobile/netrasetu/screens/LensCameraScreen.tsx` |
| **Collision-safe IDs**: monotonic timestamp + 8-char suffix ("1M IDs with zero collisions") | Patient-safety detail | CODE-VERIFIED (code); 1M test DOC-ONLY | `PHC/backend/services/ids.js`, `docs/id-format-spec.md` |
| **Triage urgency score with exact Shapley attribution** | Explainable prioritisation (but synthetic training data) | CODE-VERIFIED · NOT IN v4 | `ML/grading/calculateUrgencyScore.m` |
| **Laterality mismatch floor** (DICOM eye tag vs technician's choice) | Wrong-eye safety check | CODE-VERIFIED · NOT IN v4 | `gradingOrchestrator.js:533–537` |
| **`tier_reason` persisted per case** | Every routing decision is auditable | CODE-VERIFIED · NOT IN v4 | `BE/db/migrations/0015_grading_tier_reason.sql` |
| **3-D animated eye landing page** | Opening visual for the pitch | CODE-VERIFIED · NOT IN v4 | `experimenting Frontend/` |
| **Quality gate vs JPEG compression study** | Portable/phone-transfer realism | CODE-VERIFIED | `ML/experiments/quality_gate_compression.json` |
| **Code size** | Tracked files: MATLAB 111 files / 20,130 lines; Python 67 / 21,419; JS 99 / 19,727; JSX 38 / 7,467; SQL 19 / 1,019 (excluding generated ONNX layer packages). Plus 6,764 untracked lines of mobile TS. 244 commits. | CODE-VERIFIED | `git ls-files` + `wc -l`, today |

---

## 5. Contradictions between README/docs and code

### 5.1 README.md (root) vs code

| README says | Code says | Evidence |
|---|---|---|
| PHC app has an "Edge Inference Engine: immediate classification" | The PHC does **quality gating only**; grading is central (v4 §1.2 agrees with the code). The desktop "diagnostic result" is a **mock** modal. | `PHC/frontend/src/components/screens/DiagnosticResultModal.jsx` |
| "Local Sync Queue: Encrypted offline store" | PHC SQLite is **not encrypted at rest** | changelog §7.7 |
| Grad-CAM "pinpointing microaneurysms, hemorrhages, and exudates" | Grad-CAM is classifier attention; lesions come from separate segmentation models (n=12 enrichment median 2.02×) | `ML/experiments/explainability_results.json` |
| "District Admin Analytics: screening rates, disease prevalence" | Dashboard data is **always mock** | `centralApiClient.js:222–226` |
| `simulink-model/`: "Optical simulation & edge hardware models" | It is a **discrete-event queueing model** of the screening pipeline | `simulink-model/README.md` |
| Prerequisites: Node.js only | Also needs PostgreSQL, Python 3.10 + torch, MATLAB R2026a | `docs/DEMO_SETUP.md:19–24` |
| Architecture lists only `frontend/` under each app | Both have full backends; there is also a mobile app | tree |
| Title "DR✦AI", no mention of NetraSetu | Product is "NetraSetu"; mobile slug is still `retina-saarthi` | `PHC/mobile/app.json` |

### 5.2 `system-design-v4.md` vs code (v4 is out of date in both directions)

| v4 says | Reality | Evidence |
|---|---|---|
| §11.1/§17: "no authentication anywhere" | Auth is built for central, the PHC and mobile; central `AUTH_ENABLED` is off by default and the web login is mock | §2.C above |
| §17: "Zero automated tests" | 3 suites re-run today (59 tests); 11 verify scripts; MATLAB tests | §2.F |
| §15/§17: "Messidor-2 has never been run" | Run for v2a/v2b/v2c | `DX/messidor2_*` |
| §15: grade-4 recall 0.444 is the current figure | v2c: 0.5740740740740741 | §2.A |
| §15: pooled QWK 0.883 | v1 test pooled 0.8688032708046196; 0.883 is v1 **val** | §2.A |
| §15: NV "has never been measured" | Measured and failed (AUC 0.2863 / 0.3793); gated off | `nv_validation_run.log` |
| §15: vessel out-of-domain 0.8136 "matches" in-domain 0.8024 | 0.8024 includes the 22 training images; 0.8136 excludes thin vessels | `DX/m2_metrics.json` |
| §6.5: per-domain vessel threshold via camera calibration | Fixed 0.5 threshold | `ML/inference/segInfer.py:322` |
| §6.1: nine quality factors | Six | `qualityGateMain.m` |
| §4.2/§3: quality gate "packaged via MATLAB Compiler + Runtime" | Exe not built | `dist/` empty; changelog §9.1 |
| §6.8: Tier A requires branch agreement | `null` agreement can reach Tier A | `gradingOrchestrator.js:498–516` |
| §6.10: questionnaire adjusts confidence | Not implemented | §2.A |
| §6.11: continual learning retrains | Retraining throws `retrain_not_implemented` | `continualLearningService.js:165–179` |
| §6.3: probation is the camera safeguard | An additional unvalidated-camera floor exists | `validatedCameras.json` |
| §16: PDF report and DICOM are unbuilt | Both built | §2.B |
| §16: patient search endpoint doesn't exist | `GET /patients/search` exists | `BE/routes/patients.js:55` |
| §1.21/§16: phone-lens capture explicitly rejected | Built (`LensCameraScreen.tsx`) | — |
| §16: "remove the live ngrok call" | Constant still exported (unused) in the desktop config; legacy mobile `src/` still has it (unused) | `PHC/frontend/src/config.js:6`; `PHC/mobile/src/config/api.ts:11` |
| §16: disable the mobile mock fallback | The rebuilt mobile app replaced it, but the **desktop** app still shows mock results | `LocalQueueTable.jsx:220` |
| §14: datasets = APTOS, IDRiD, CHASE_DB1, Messidor-2 | Also EyePACS (training v2b/v2c) and DRIVE (vessel eval) | metrics JSON; `DX/m2_metrics.json` |
| §18: is the deployed conformal method ordinal/class-conditional? | Yes: `ordinal_mode_interval_stratified_v3` | `ML/models/calibration_branchA_v2c.json` |

### 5.3 Internal doc-vs-doc and doc-vs-code contradictions

| Item | Conflict | Evidence |
|---|---|---|
| Per-case latency | 21 s (`backend-plan-status.md:140`) vs 12.5 s (`DEMO_SETUP.md:53`, `gradingWatchdog.js:17`) | — |
| Required MATLAB toolboxes | `DEMO_SETUP.md:29–33` lists IPT, CV and Medical Imaging as "required" and omits Deep Learning and Statistics & ML, which the default live path now calls | §3.4 |
| MATLAB Compiler SDK licence | Status doc: "not available (license=0)". Today `license('test','MATLAB_Builder_for_Java')` returned **1**. | `docs/backend-plan-status.md:249`; queried today |
| Compiler trial build of central inference "Done, 1.3 MB" | No `ML/deploy/dist/`; the changelog shows Compiler was only installed on this machine on 2026-09-24 | `docs/backend-plan-status.md:170` vs changelog §3.2 |
| JS quality-gate fallback "switched off by design" | Code default is on | `qualityGateClient.js:63`; changelog §9.4 |
| Simulink grading capacity 2 | Backend default concurrency 1 | `simulink-model/README.md` vs `gradingQueue.js:55` |
| Status doc says "All 67 rows said branchA_v1" | Live DB has 35 graded rows, all `branchA_v1`; no persisted case was graded by v2c | DB query today; changelog §9.2 (DB restored to 36 cases) |
| `media/cases` "= 36 folders, matching the database" | 41 folders on disk today | changelog §9.2 vs `ls` |
| `backend-plan-status.md:393`: "the code default is `branchA_v1` … nothing in a slide should say v2c yet" | Superseded by the same doc's own l.178–183 and by code: the default **is** v2c | `branchAInfer.py:94` |
| MATLAB session log says "loaded branchA_v1" at every start | That is a preload list hardcoded to v1; the requests are served by `branchAInferMatlab.m`'s own net, default v2c. Misleading log line. | `runMatlabInferenceSession.m:81–94` |
| NetraSetu_Build_Audit.md (2026-09-12) quotes sensitivity 86.0% | That was v1; v2c is 0.9264705882352942 held-out | `docs/NetraSetu_Build_Audit.md:82,177` |

### 5.4 Risks to fix before the national round (found while auditing)

1. **Commit the mobile rebuild, PHC auth and peer sync.** They are untracked. A disk failure loses the three suites re-run today.
2. **`test_sms.js` is committed with a hardcoded personal phone number** (root and `BE/`). Remove it or move the number to `.env`.
3. **No v2c-graded case exists in the live DB.** Every demo screenshot from the DB shows v1 grades (the status doc also warns that pre-2026-09-23 screenshots are v1).
4. **Tier A = 0 in the live DB.** With `validatedCameras.json` enforcing, only `topcon_trc_nw400` can auto-clear. If the demo is meant to show an auto-clear, use that camera ID, and say it is a demo seed.
5. **This laptop lacks Simulink, SimEvents, Report Generator, Parallel and Global Optimization installs** (`ver`). The live Simulink demo and the MATLAB PDF need them installed first.
