# PPT Audit 02 — ML Models, Datasets, Metrics

**Project:** NetraSetu (SIH 2026, PS 26038, MathWorks)
**Audited:** 2026-09-25, working tree at `SIH_2026/` (git HEAD not re-checked. The v2c parity report records HEAD `23ce9d2` with a dirty tree on 2026-09-21)
**Method:** Every item below comes from code, configs, checkpoints, result JSON/TXT/CSV/LOG files, or the saved split arrays. Numbers are copied exactly as they appear in the result file. They are never rounded here. When a file stores 4-decimal text, that is the precision given. When a number is derived by arithmetic from files, the arithmetic is shown.

**Path shorthand:** `ML/` = `central-system/backend/ml-pipeline/`. All other paths are relative to `SIH_2026/`.

### Tags

| Tag | Meaning |
|---|---|
| **CODE-VERIFIED** | Found in code, config, checkpoint metadata or a result file |
| **DOC-ONLY** | Claimed in a markdown doc; no code or result file backs it |
| **MOCK** | UI exists but the data is hardcoded (none found in ML scope; see note in §7) |
| **BEYOND-V4** | Exists in code but is not in `docs/system-design-v4.md` |
| **V4-MISSING** | Specified in v4 but absent from the code or the live path |
| **V4-STALE** | v4 states a number or status that the result files now contradict |

---

## 0. Read this before quoting anything on a slide

1. **The deployed classifier is `branchA_v2c`, not v1.** Most numbers in v4 §15 (QWK 0.8242, grade-4 recall 0.444, grade-1 recall 0.000) are **v1** numbers. The v2c equivalents are in §3.1.
2. **DRIVE is used**, for evaluation only (20 images, out-of-domain vessel test). The files are **not on disk now**. See §1.
3. **v4's vessel claim is wrong.** v4 says "a per-domain threshold is applied → 0.8136 Dice". The file shows that 0.8136 is DRIVE scored with thin vessels (GT half-width ≤1 px) excluded as don't-care. No threshold was involved. The live vessel threshold is a fixed 0.5 (`ML/inference/segInfer.py:326`).
4. **Shipped calibration is fitted on val+test pooled** (n=1161 for v2c). The 628-image "test" set therefore also calibrated the temperature, conformal qhat and referableThreshold. Only the cross-fit numbers (§3.3) and Messidor-2 (§3.2) are clean of this.
5. **Messidor-2 was used for model selection.** The selection half picked the incumbent (v2b). That contradicts v4 §14 ("never used in training or model selection"). The deployed model (v2c) is **not** the rule-selected incumbent (v2b).
6. **The NV suspicion score failed validation.** AUC 0.2863 on IDRiD-test and 0.3793 on Messidor-2, both below chance. It is computed and stored, but the rule engine is always handed 0.
7. **MC Dropout is not in the live routing decision.** It returns null on the default MATLAB backend and is not an input to `decideTier()`.
8. **No FROC anywhere in the code.** No confusion-matrix, ROC, calibration or reliability plot images exist either. The data to draw all of them does exist (§5).

---

## 1. Datasets

### 1.1 Inventory

| # | Dataset (exact) | Images / split | Used by | Loader / location | Tag |
|---|---|---|---|---|---|
| D1 | **APTOS 2019 Blindness Detection** (Kaggle competition `aptos2019-blindness-detection`, `train.csv` + `train_images/`) | **3662** (derived, see 1.2). v1 per-source 70/15/15 → train 2563 / val 549 / test 550. **Not on local disk:** `ML/datasets/aptos2019/` is empty | Branch A v1, v2a, v2b, v2c (training, val, calibration, in-domain test) | `ML/training/train_classifier_kaggle.ipynb` and `..._v2.ipynb` → `load_aptos()`; Kaggle path `/kaggle/input/aptos2019-blindness-detection` | CODE-VERIFIED |
| D2 | **IDRiD — B. Disease Grading** (Kaggle training used a private upload mounted at `/kaggle/input/idrid-disease-grading`) | **Kaggle copy: 516** (derived: v1 train 361 + val 77 + test 78). **Local disk: 251 train + 103 test = 354** of the official 413 + 103 (`ML/datasets/idrid/grading/`) | Branch A training/val/test; rule-engine threshold fit (251 train / 103 test); NV-score fit and validation; M1 re-run from pixels (52 of the 78 held-out images exist locally) | `load_idrid()` in both notebooks; `ML/diagnostics/eval_m1_classifier.py`; `ML/diagnostics/collectLesionCounts.py` | CODE-VERIFIED |
| D3 | **IDRiD — A. Segmentation** | **81** = 54 official train + 27 official test. Masks on disk: MA 54/27, HE 53/27, EX 54/27, SE 26/14, OD 54/27 | Red-lesion v1 and v2 (all 81 re-split **65 train / 16 val**, seed 42); hard-exudate model (**43 train / 11 val** from the official 54; evaluated on the official **27** test); fovea gate (81 OD masks used to measure disc diameter) | `ML/training/train_red_lesion_unet.py`, `train_red_lesion_unet_v2.py`, `trainLesionUnets.m`; `ML/diagnostics/eval_m45_lesions.py` | CODE-VERIFIED |
| D4 | **IDRiD — C. Localization** (OD + fovea centre CSVs) | **516** = 413 train + 103 test on disk | M3 optic-disc/fovea U-Net (78 held out, listed in `ML/models/Model3/localization_test_predictions.csv`); fovea-gate threshold selection (val 77 / test 78 / seen-by-model 361) | `ML/diagnostics/eval_m3_localization.py`, `ML/experiments/foveaGateValidation.py`, `ML/inference/verifyModel3.py` | CODE-VERIFIED |
| D5 | **EyePACS, Kaggle re-upload `tanlikesmath/diabetic-retinopathy-resized`** (`resized_train/` + `trainLabels.csv`; the `_cropped` variant is explicitly excluded) | Curated subset, not the full set. **v2b: 5915 training rows** (8932 − 3017), binary head only. **v2c: 14559 training rows** (17576 − 3017), cap `EYEPACS_MAX=24000`, 5-class loss weight 0.5. Plus a 5% monitor-only val slice (count not persisted). Not on disk | Branch A v2b, v2c only | `load_eyepacs()` / `curate_eyepacs()` / `eyepacs_quality_ok()` in `train_classifier_kaggle_v2.ipynb` | CODE-VERIFIED, **BEYOND-V4** |
| D6 | **CHASE_DB1** | **28** images (84 files = 28 `.jpg` + `_1stHO` + `_2ndHO`) on disk at `ML/datasets/chasedb1/`. Training split **22 train / 6 val** | M2 vessel U-Net training. Also M2 "in-domain" evaluation on **all 28**, which includes the 22 training images | `ML/training/train_vessel_unet.py` (`N_TRAIN=22`, `N_VAL=6`); `ML/diagnostics/eval_m2_vessel.py` `chase_cases()` | CODE-VERIFIED |
| D7 | **DRIVE** | **20** images scored (DRIVE `training/` split, because `test/` has no `1st_manual/` ground truth). Scored inside the FOV mask | **Evaluation only**: M2 out-of-domain vessel test. **Never used for training** | `ML/diagnostics/eval_m2_vessel.py` `drive_cases()` (expects `SIH_2026/datasets/DRIVE/`); `ML/inference/evalDriveOnnx.py` (`--drive DIR`). **That folder does not exist on disk now**, so these results cannot be re-run on this machine | CODE-VERIFIED (results in `ML/diagnostics/out/m2_metrics.json`), **BEYOND-V4** |
| D8 | **Messidor-2** | **1748** images on disk (`ML/datasets/Messidor-2/extracted/IMAGES/`, `messidor_data.csv` 1748 rows). **4 ungradable excluded** (`excluded_ungradable.csv`) → **1744 gradable / 874 patients** (`eval_manifest.csv`). Split once by patient-id parity: SELECTION (even) 872 images / 437 patients; REPORT (odd) 872 / 437 | External validation of v2a, v2b, v2c; **model selection** (selection half); NV-score validation; site-recalibration adaptation experiments (Parts D/E use Messidor labels on purpose); fovea-gate flag rate | `ML/experiments/evalMessidor2Candidate.py`, `evalMessidor2V2a.py`, `messidor2ShiftStressTest.py`, `messidor2SiteConformalRecal.py`, `fitAndValidateNVScore.py` | CODE-VERIFIED |
| D9 | Local sample images | 5 files (`datasets/1.webp`, `2.jpg`, `3.webp`, `4.webp`, `5.jpg`) | Smoke tests / demo only | `datasets/` | CODE-VERIFIED |
| D10 | Synthetic camera perturbations (vignette, colour shift, resolution loss, defocus, JPEG, combined; 3 strengths each) | Applied to 52 local IDRiD held-out images | Domain-gap stress test of Branch A **v1** | `ML/experiments/domainGap.py` → `ML/experiments/domain_gap_results.json` | CODE-VERIFIED, BEYOND-V4 |

**Is DRIVE used? Yes, for evaluation only.** It is the out-of-domain test set for the vessel model (n=20). No model was trained on it. `datasets/README.md` still lists DRIVE as the "Task 4.1 vessel U-Net" training set, and says no dataset is downloaded. **That README is stale (DOC-ONLY):** the vessel model trained on CHASE_DB1, and CHASE, IDRiD and Messidor-2 are on disk.

### 1.2 How the derived counts were obtained

- v1 checkpoint `ML/models/Model1/branchA_v1.pt` → `train_grade_counts` = {0:1381, 1:276, 2:817, 3:200, 4:250}, sum **2924**. Saved split arrays: `branchA_v1_val_ids.npy` = **626** (549 APTOS + 77 IDRiD); `branchA_v1_test_ids.npy` = **628** (550 APTOS + 78 IDRiD). Total = 2924 + 626 + 628 = **4178** = 3662 APTOS + 516 IDRiD.
- v2a/v2b checkpoints → `train_grade_counts` sum = 1425+285+844+206+257 = **3017** = `n_train` of v2a. v2 val = **533** (467 APTOS + 66 IDRiD), from `v2a/branchA_v2a_val_ids.npy`. 3017 + 533 = 3550 = 4178 − 628.
- EyePACS training rows = `n_train` − 3017. Check for v2c: 3017 + 0.5 × 14559 = 10296.5 = the sum of v2c's weighted `train_grade_counts` (6226 + 1115 + 2091 + 447 + 417.5). ✓
- **The v2a, v2b and v2c test sets are exactly v1's 628 images.** Checked by normalising ids: 628/628 overlap for each version.

### 1.3 Label distribution of the shared 628-image test set

From `branchA_v1_test_labels.npy`: grade 0: 296, grade 1: 60, grade 2: 175, grade 3: 43, grade 4: 54. Referable (≥2) = 272 of 628 (prevalence 0.433, per `ML/models/evaluation_branchA_v1.txt`).

---

## 2. Models

### 2.1 Deployed defaults

| Setting | Default in code | Where | Set in `.env`? |
|---|---|---|---|
| `BRANCH_A_MODEL_VERSION` | **`branchA_v2c`** | `ML/inference/branchAInfer.py:94`; `ML/inference/branchAInferMatlab.m:112` | No |
| `RED_LESION_MODEL_VERSION` | **`v2`** (changed from v1 on 2026-09-23 per the code comment) | `ML/inference/segInfer.py:114` | No |
| `INFERENCE_BACKEND` | **`matlab`** | `central-system/backend/services/gradingOrchestrator.js:183`; `.env.example:16` | Not set in `.env` (so defaults to matlab) |
| `SEG_INFERENCE_BACKEND` | **`matlab`** | `ML/inference/segInfer.py:204`; `services/matlabSessionSupervisor.js:74` | No |
| Calibration file | `ML/models/calibration_branchA_v2c.json` (selected by model version) | `branchAInfer.py` / `branchAInferMatlab.m` | — |
| Rule thresholds | `ML/models/rule_thresholds_by_red_version.json` → key `v2` | `services/gradingOrchestrator.js:1329-1333` (`redLesionThresholds()`) | — |

**Stale references to v1 remain outside the live path:**
- `ML/deploy/buildCaseChain.m:59-75`: the MATLAB Compiler build packages `branchA_v1.mat`, `calibration_v1.json` and `rule_thresholds_red_v2.json` (not the live threshold file). A compiled standalone would therefore run v1.
- `central-system/backend/services/continualLearningService.js:36`: `LIVE_MODEL = branchA_v1.mat`.
- `docs/flip_default_v2c.patch` shows the v1 → v2c flip. The code already reflects it.

### 2.2 Model table

| ID | Name / version | Architecture | Input | Task | Training data | Weights | Deployed? | Tag |
|---|---|---|---|---|---|---|---|---|
| M1-v1 | `branchA_v1` | timm `efficientnet_b0` → Dropout(0.3) → Linear(1280, 5). Loss: ordinal-weighted CE (`OrdinalWeightedCE`). AdamW lr 1e-4, wd 1e-5, cosine, batch 32, best epoch 17 | 384×384 RGB, Ben Graham crop + Gaussian-subtraction | 5-class ICDR grade | APTOS + IDRiD (2924 train) | `ML/models/Model1/branchA_v1.pt`; `ML/models/branchA_v1.mat` + `+branchA_v1/` | No (still in the MATLAB Compiler build and the continual-learning pointer) | CODE-VERIFIED |
| M1-v2a | `branchA_v2a` | `DRClassifierV2`: efficientnet_b0 → Dropout(0.3) → {head5: Linear(1280,5), headBin: Linear(1280,1)}. Asymmetric ordinal loss (`OrdinalWeightedCEv2`) + focal BCE binary head (γ 2.0, weight 0.5); grade-4 class-weight boost 2.0; best epoch 22 | 512×512 | 5-class + binary referable | APTOS + IDRiD (3017 train) | `Model1/v2a/branchA_v2a.pt`, `Model1/branchA_v2a.onnx`, `models/branchA_v2a.mat` | No | CODE-VERIFIED |
| M1-v2b | `branchA_v2b` | as v2a; best epoch 17 | 512 | as v2a | APTOS + IDRiD + EyePACS (binary head only); 8932 train rows | `Model1/v2b/branchA_v2b.pt`, `.onnx`, `.mat` | No. It is the rule-selected incumbent (`ML/diagnostics/out/messidor2_compare_v2b_v2c.json` → `"incumbent": "v2b"`) | CODE-VERIFIED |
| **M1-v2c** | **`branchA_v2c`** | as v2a + EyePACS in the 5-class loss (weight 0.5) + `DOMAIN_AUG` (per-channel gain, blur, noise, down-up resize); best epoch 28 | 512 | 5-class shipped. **The binary head is trained but not shipped** (`branchAInfer.py:266-282`: "5-class head only") | APTOS + IDRiD + EyePACS; 17576 train rows | `Model1/v2c/branchA_v2c.pt`, `Model1/branchA_v2c.onnx`, `models/branchA_v2c.mat` + `+branchA_v2c/` | **YES (default)** | CODE-VERIFIED |
| M2 | `vessel_unet_v1` | `smp.Unet`, resnet34 encoder (ImageNet init), 1 in-channel, 1 class | Green channel, aspect-preserving resize + centre pad to 512 | Vessel segmentation | CHASE_DB1 22 train / 6 val; best epoch 56; `best_val_dice` 0.7771457731723785 (checkpoint metadata) | `vessel_predictions(Model2)/vessel_unet_v1.pt`, `models/vessel_unet_v1.mat` | YES (MATLAB session). Live threshold fixed at 0.5 | CODE-VERIFIED |
| M3 | `localization_v1` | `smp.Unet`, resnet18, 3 in-channels, 2 heatmap channels (OD, fovea), σ 15 | 512×512 squished | OD + fovea localisation | IDRiD Localization (516 minus 78 held out); best epoch 23; `best_val_pixel_error` 5.646450042724609 px @512 | `Model3/localization_v1.pt`, `models/localization_v1.mat` | YES (MATLAB session) | CODE-VERIFIED |
| M4 | `bright_lesion_unet_v1` (role renamed **`hard_exudate`** in `ML/inference/modelPaths.py`; filename unchanged) | `smp.Unet` resnet34, 3 in-channels, 1 class; OD mask radius 58; patch 256, batch 8, lr 5e-4; best epoch 13 of 28 | Ben Graham crop, 512 | Hard-exudate segmentation | IDRiD Seg EX, 43 train / 11 val | `Model4/bright_lesion_unet_v1.pt`, `models/bright_lesion_unet_v1.mat` | YES (MATLAB session) | CODE-VERIFIED |
| M5-v1 | `red_lesion_unet_v1` | `smp.Unet` resnet34, 3 in, **1 class** (MA+HE merged); encoder transferred from `vessel_unet_v1.pt`; loss 0.5·Dice + 0.5·Focal; best epoch 52 | Crop 512, patch 256 | Red-lesion segmentation | IDRiD Seg 65 train / 16 val | `red_lesion_predictions(model5)/red_lesion_unet_v1.pt`, `models/red_lesion_unet_v1.mat` | No (rollback via env var) | CODE-VERIFIED |
| **M5-v2** | `red_lesion_unet_v2` | `smp.Unet` resnet34, 3 in, **3 classes** (bg / MA / HE); encoder from vessel model; loss 0.5·weighted CE (weights [1.0, 28.541231155395508, 8.45654296875]) + 0.5·Dice; best epoch 82 of 102 | Crop 512, patch 256 | MA and HE separately; min-area floors **MA 5 px / HE 10 px** | same 65/16 split | `models/red_lesion_unet_v2.pt`, `models/red_lesion_unet_v2.mat` + `+red_lesion_unet_v2/` | **YES (default)** | CODE-VERIFIED |
| Q | Quality gate | Classical CV: FOV, glare, motion, illumination, focus/blur, eyelash occlusion, plus a composite "borderline" catch-all. Per-camera presets | Raw capture | pass / retake / borderline | Thresholds hand-set, then re-tuned on the 52-image compression experiment (§3.9) | MATLAB `phc-local-app/backend/quality-gate-matlab/`; JS fallback `phc-local-app/backend/services/qualityGateFallback.js`; mobile `phc-local-app/mobile/src/utils/qualityGate.ts` | YES | CODE-VERIFIED |
| C | Camera-family classifier | Heuristic rules (vignetting, aspect ratio, channel gains); profile bank | Raw capture | Camera-family / mismatch flag | None. Thresholds are "hand-built and unvalidated" (file readme) | `ML/cameraCalibration/classifyCameraFamily.m`, `calibrationProfiles.json` | YES (`ML/grading/runCasePipeline.m:76`) | CODE-VERIFIED |
| NV | NV suspicion score | Classical: vessel density, tortuosity, fractal dimension, branch density in a peri-disc ROI | M2 vessel mask + OD | PDR suspicion | Weights fit on IDRiD train 251 (failed validation) | `ML/segmentation/neovascularizationSuspicion.m` | Computed and stored. **Not used for grading** (rule engine gets 0; `runCasePipeline.m:79-100`) | CODE-VERIFIED |
| F | Frangi vesselness | Classical | — | — | — | `ML/segmentation/vesselSegmentationFrangi.m` | **Not in the live path** (no references in `services/`, `grading/` or `inference/`) | CODE-VERIFIED file; V4-MISSING in the live path |
| RE | ICDR rule engine (Branch B) | MATLAB rules + JS fallback mirror | Quadrant lesion counts | Grade 0–3 (`maxGrade` 3) | Thresholds fit on IDRiD (§4) | `ML/grading/ruleEngineGrade.m`; `services/matlabFallback.js` | YES | CODE-VERIFIED |

---

## 3. Metrics (exact values from result files)

### 3.1 Branch A classifier: in-domain held-out test (the same 628 images for every version)

**Population:** v1's recovered held-out test split, 550 APTOS + 78 IDRiD, grade counts 296/60/175/43/54. **Caveat:** these same 628 images were also part of the calibration pool (§0.4). Point estimates only, except v1 (CIs in `evaluation_branchA_v1.txt`).

**Pooled (n=628)**. Sources: `ML/models/Model1/branchA_v1_metrics.json`, `ML/diagnostics/out/m1_metrics.json` (v1 per-grade); `ML/models/Model1/v2{a,b,c}/branchA_v2{a,b,c}_metrics.json` → `test_pooled`

| Version | QWK | Ref. sens (≥2) | Ref. spec | Grade-4 recall (n=54) | Grade-1 recall (n=60) | Macro-F1 |
|---|---|---|---|---|---|---|
| v1 | 0.8688032708046196 | 0.8602941176470589 (95% CI 0.8141–0.8965) | 0.9382022471910112 (95% CI 0.9082–0.9588) | 0.4444444444444444 | 0.5833333333333334 | 0.5981373308467182 |
| v2a | 0.8734404566269456 | 0.9007352941176471 | 0.9382022471910112 | 0.5370370370370371 | 0.6166666666666667 | 0.6245264758777634 |
| v2b | 0.8848884772709732 | 0.8492647058823529 | 0.9466292134831461 | 0.46296296296296297 | 0.6333333333333333 | 0.6345227178132704 |
| **v2c (deployed)** | **0.8838745744490235** | **0.9264705882352942** | **0.9241573033707865** | **0.5740740740740741** | **0.55** | **0.6748453335181372** |

- v1 referable counts: TP 234, FN 38, TN 334, FP 22. PPV 0.9141 (0.8733–0.9426), NPV 0.8978 (0.8629–0.9247). Accuracy 0.7404. File verdict: "sensitivity target met: no" (judged on the lower CI bound against >0.90).
- In the v2 files, `ref_sens`/`ref_spec` equal `live_path_sens`/`live_path_spec` (argmax + the P(g3)+P(g4)>0.5 safety check).
- v2c in-domain AUC of P(g≥2): 0.9785814606741573 (5-class), 0.9760616325181758 (binary head). Source: `ML/diagnostics/out/messidor2_v2c_candidate_report.json` → `in_domain_test`.
- v1 argmax sends 5 of 54 true grade-4 images to grade 0 or 1 (1 + 4 in the confusion-matrix row below). This is where v4's "5 of 54" comes from.

**IDRiD-only subset (n=78)** and **APTOS-only subset (n=550)**

| Version | IDRiD QWK | IDRiD sens | IDRiD spec | IDRiD g4 recall (n=10) | IDRiD g1 recall (n=4) | APTOS QWK | APTOS sens | APTOS spec |
|---|---|---|---|---|---|---|---|---|
| v1 | 0.8242270894283229 | 0.8775510204081632 | 0.896551724137931 | 0.3 | 0.0 | 0.8726506910777662 | 0.8565022421524664 | 0.9418960244648318 |
| v2a | 0.8098200773499243 | 0.9591836734693877 | 0.8620689655172413 | 0.5 | 0.0 | 0.8790576474121146 | 0.8878923766816144 | 0.944954128440367 |
| v2b | 0.8370322221190454 | 0.8571428571428571 | 0.8620689655172413 | 0.2 | 0.5 | 0.8892969810260406 | 0.8475336322869955 | 0.9541284403669725 |
| **v2c** | **0.8558659217877095** | **0.9387755102040817** | **0.896551724137931** | **0.6** | **0.5** | 0.884775563259921 | 0.9237668161434978 | 0.926605504587156 |

**Binary referable head** (trained, not shipped), pooled n=628, sens / spec: v2a 1.0 / 0.025280898876404494 (degenerate); v2b 0.8823529411764706 / 0.9325842696629213; v2c 0.9007352941176471 / 0.9382022471910112.

**Do not quote (contaminated):** `m1_metrics.json` → `idrid_all` (n=354, all local IDRiD grading images, most seen in training) QWK 0.9167334441640453. The file itself flags it `"contaminated": true`.

**Pooled val+test at the shipped referableThreshold** (threshold fitted on these same images). Source: `ML/diagnostics/out/conformal_v3_crossfit_report_branchA_v2c.txt`
- v2c (n=1161, threshold 0.3873): sensitivity 0.9503 [0.9277, 0.9661] (478/503); specificity 0.9103 [0.8861, 0.9298] (599/658).
- v2b (threshold 0.2764): sensitivity 0.9503 [0.9277, 0.9661] (478/503); specificity 0.9027 [0.8777, 0.9231] (594/658).

**Confusion matrices** (rows = truth 0–4, columns = prediction 0–4), pooled n=628. These are PPT candidates.

v1 (`evaluation_branchA_v1.txt`):
```
true0  288   5   3   0   0
true1    6  35  17   1   1
true2    7  24  93  46   5
true3    1   1   0  25  16
true4    1   4   7  18  24
```
v2c (`v2c/branchA_v2c_metrics.json`):
```
true0  283  10   2   1   0
true1    3  33  22   0   2
true2    2  15 131  19   8
true3    0   0   5  25  13
true4    1   2  14   6  31
```

**Temperature scaling**
- v1 (`evaluation_branchA_v1.txt`, fitted on 626 val predictions): T 1.5311; ECE 0.1021 → 0.0545; mean confidence 0.8426 → 0.7612 (accuracy 0.7404). A 10-bin reliability table is in the same file.
- Currently shipped temperatures (fitted on pooled val+test): v1 1.5113232364275615, v2a 1.0982478509604088, v2b 1.38650281635265, **v2c 1.5437778038856966**. Sources: `ML/models/calibration_*.json`.

### 3.2 Branch A classifier: Messidor-2 external validation

**Population:** 1744 gradable images / 874 patients. v2b and v2c are reported on the REPORT half (872 images / 437 patients). v2a was reported on the full 1744. CIs are patient-level bootstrap (n_boot=2000) unless marked. The one-time "peek" audit log is `ML/diagnostics/out/final_report_log.txt` (v2a 2026-09-20T15:34:04Z, v2b 2026-09-21T14:34:25Z, v2c 2026-09-21T15:36:22Z).

| Metric | **v2c REPORT half** | v2b REPORT half | v2a full set (n=1744) |
|---|---|---|---|
| AUC P(g≥2), 5-class | 0.9234912886120696 [0.8995793648576036, 0.9450063486294292] | 0.9229512106163903 [0.8977277383504944, 0.9443962193132194] | 0.8678401588686053 [0.8422005734228534, 0.8917684250638445] |
| AUC, binary head | 0.9241716466066268 | 0.9316450635468396 | — |
| QWK | 0.7165599420903168 [0.6590062220460656, 0.7643605774561859] | 0.6642634295762664 [0.5986025899471108, 0.7205567685209574] | 0.6134576158512819 [0.5589062468827548, 0.6646169703030288] |
| Argmax referable sens | 0.7018348623853211 [0.6333333333333333, 0.7688684486373165] | 0.5642201834862385 [0.4846795929880279, 0.6344558907900509] | 0.5251641137855579 [0.47044776897414514, 0.5811989606533037] |
| Argmax referable spec | 0.9403669724770642 [0.9204368174726989, 0.9585905424703351] | 0.9709480122324159 [0.9571176867723822, 0.984026830955821] | 0.951048951048951 [0.9373086864715305, 0.9634255454878023] |
| Sens / spec at the **shipped** referableThreshold | 0.7523 [0.6861, 0.8143] / 0.9388 [0.9181, 0.9579] (threshold 0.3873) | 0.7844 [0.7177, 0.8433] / 0.9128 [0.8891, 0.9355] (threshold 0.2764) | not run with v2a's shipped threshold |
| Grade-4 recall | 0.46153846153846156 (n=13) [0.14285714285714285, 0.8] | 0.15384615384615385 (n=13) [0.0, 0.3857692307692315] | 0.5142857142857142 (n=35) |
| Grade-1 recall | 0.20149253731343283 (n=134) | 0.08208955223880597 (n=134) | 0.040740740740740744 (n=270) |

Sources: `ML/diagnostics/out/messidor2_v2c_candidate_report.json`, `messidor2_v2b_candidate_report.json` (→ `report_half`), `messidor2_shift_stress_test_v2c.txt`, `messidor2_shift_stress_test_v2b.txt`, `messidor2_v2a_external_validation.json`.

**v2c SELECTION half** (n=872), a cross-check: AUC 0.9158420749965297; QWK 0.7645200238704335; shipped-threshold sens / spec 0.7615 / 0.9131.

**v2a Messidor-2 accuracy by camera resolution** (`messidor2_v2a_external_validation.json` → `resolution_breakdown`):

| Resolution | n | QWK |
|---|---|---|
| 1440×960 | 527 | 0.5181065019467783 |
| 2240×1488 | 614 | 0.7272236854631422 |
| 2304×1536 | 603 | 0.4735034833426882 |

**Model selection outcome** (`messidor2_compare_v2b_v2c.json`): incumbent stays **v2b**. The selection-half AUC gain for v2c is −0.0089, paired CI [−0.0287, +0.0117]. That figure is quoted from `ML/docs/messidor2_v2c_final_external_report.md`; the JSON records `"incumbent": "v2b"`.

### 3.3 Conformal tiering

**Method shipped:** `ordinal_mode_interval_stratified_v3`. This is Mondrian stratification over **2 strata** (non-referable grades 0–1 / referable grades 2–4), `alphaPerStratum` [0.3, 0.05], plus a `referableThreshold` gate. It is **not** per-grade Mondrian as v4 §6.8 specifies. Archived predecessor: `calibration_v1_marginal_lac_ARCHIVE.json` (marginal LAC, α 0.1). Tier logic: `ML/inference/branchAInfer.py:438` `assign_tier()`; final tier `services/gradingOrchestrator.js:488` `decideTier()`.

**In-domain, 10×5 cross-fit = 50 folds** over the pooled val+test pool (v2c/v2a/v2b n=1161; v1 n=1254). Sources: `ML/diagnostics/out/conformal_v3_crossfit_report*.txt`

| Metric | **v2c** | v2b | v2a | v1 |
|---|---|---|---|---|
| Coverage (marginal) | 0.9236 [0.9198, 0.9274] | 0.9371 [0.9335, 0.9408] | 0.9242 [0.9195, 0.9289] | 0.9371 [0.9322, 0.9419] |
| Coverage, referable stratum | 0.9489 [0.9416, 0.9562] | 0.9513 [0.9465, 0.9561] | 0.9513 [0.9438, 0.9589] | 0.9519 [0.9464, 0.9575] |
| Coverage, grade 4 | 0.9270 [0.9110, 0.9430] | 0.8970 [0.8825, 0.9115] | 0.9100 [0.8933, 0.9267] | 0.8932 [0.8769, 0.9096] |
| Coverage, grade 1 | 0.6364 [0.6124, 0.6603] | — | 0.6773 [0.6487, 0.7059] | 0.6990 [0.6727, 0.7253] |
| Mean set size | 2.0100 [1.9745, 2.0455] | 1.8258 [1.8140, 1.8375] | 1.8871 [1.8658, 1.9083] | 1.9698 [1.9576, 1.9820] |
| **Tier A / B / C share** | **0.3841 / 0.4375 / 0.1784** | 0.4818 / 0.3936 / 0.1245 | 0.4564 / 0.4160 / 0.1276 | 0.4454 / 0.4019 / 0.1527 |
| **False auto-clear, true referable (final Tier A)** | **0.0000 [0.0000, 0.0000]** | 0.0169 [0.0131, 0.0206] | 0.0064 [0.0041, 0.0086] | 0.0129 [0.0097, 0.0161] |
| False auto-clear, true grade ≥3 | 0.0000 [0.0000, 0.0000] | 0.0056 [0.0024, 0.0087] | 0.0000 [0.0000, 0.0000] | 0.0052 [0.0022, 0.0082] |
| Referable sens / spec at the fold-fitted threshold | 0.9458 [0.9378, 0.9537] / 0.9131 [0.9083, 0.9179] | 0.9475 [0.9396, 0.9555] / 0.9008 [0.8959, 0.9056] | 0.9477 [0.9410, 0.9544] / 0.9011 [0.8965, 0.9056] | 0.9497 [0.9429, 0.9566] / 0.8757 [0.8680, 0.8834] |
| Guard check | "All guards clear." | "GUARD TRIPPED" (grade-4 coverage lower CI 0.8825 < 0.9) | "GUARD TRIPPED" (grade-4 coverage lower CI 0.8933 < 0.9) | — |

v2c grade-4 tier distribution (1000 assignments over 10 repeats): A 0, B 960, C 40.

**External (Messidor-2), shipped policy unmodified.** Source: `messidor2_shift_stress_test_v2c.txt` / `_v2b.txt`

| Metric | v2c REPORT | v2c SELECTION | v2b REPORT |
|---|---|---|---|
| Coverage (marginal) | 0.8704 [0.8458, 0.8935] | 0.8521 [0.8270, 0.8770] | 0.8337 [0.8043, 0.8625] |
| Mean set size | 2.3005 | 2.2856 | 1.6651 |
| Tier A / B / C | 0.3647 / 0.2202 / 0.4151 | 0.3647 / 0.2500 / 0.3853 | 0.6594 / 0.1628 / 0.1778 |
| **False auto-clear, true referable** | **5/218 = 0.0229** (bootstrap [0.0047, 0.0441]) | 9/239 = 0.0377 ([0.0146, 0.0631]) | 28/218 = 0.1284 ([0.0825, 0.1837]) |
| False auto-clear, true grade ≥3 | 0/45 = 0.0000 | 0/65 = 0.0000 | 0/45 = 0.0000 |

- Clopper-Pearson 95% intervals for v2c are v2c REPORT CP95 [0.0075, 0.0527] and v2c SELECTION CP95 [0.0174, 0.0703]. They appear only in `ML/docs/messidor2_v2c_final_external_report.md`, not in a JSON (DOC-ONLY, computed alongside). Against the ≤5% guard, the upper bound is breached on both halves.
- Site-recalibration adaptation experiments (Parts D/E) are in `messidor2_shift_stress_test_v2c.txt` and `messidor2_site_conformal_recal_v2c.{json,txt}`. They use Messidor labels on purpose and are **not** generalisation claims. BEYOND-V4.

**Set contiguity:** the shipped v3 method is contiguous by construction. v4 §15 says marginal LAC produced non-contiguous sets on 14.6% of 103 images; that was **not found in any result file** (DOC-ONLY). `conformal_policy_sweep.txt` records a cross-fit empty-set fraction of 0.0000 for the old C0 policy only.

### 3.4 Segmentation

**M2 vessels.** Source: `ML/diagnostics/out/m2_metrics.json` (threshold 0.5)

| Population | n | Dice | IoU | Sens | Spec | Note |
|---|---|---|---|---|---|---|
| CHASE_DB1 (training domain) | 28 | 0.8024185508929272 | 0.6700325489270208 | 0.7986626021630807 | 0.9856967743696108 | **Includes the 22 training images** (only 6 were val) |
| CHASE downscaled to DRIVE size | 28 | 0.7964856615634763 | 0.6617998939656878 | 0.785043185350601 | 0.9861252861313363 | Scale control |
| **DRIVE (unseen), inside FOV** | 20 | **0.6186212261842878** | 0.44782881995175156 | 0.4629330101946735 | 0.9951644064053927 | Honest out-of-domain number |
| DRIVE, green matched to CHASE intensity | 20 | 0.6373449928363223 | 0.46772293022496964 | 0.5437369932298939 | 0.9766992623359253 | — |
| DRIVE, thin vessels (GT half-width ≤1 px) excluded | 20 | 0.8136335719155415 | 0.6858197877609009 | 0.7329890556956222 | 0.9951644064053927 | **This is v4's "0.8136" (§0.3)** |

- Only 3.227951951344171% of the CHASE→DRIVE Dice drop comes from scale (`attribution.scale_share_pct`).
- DRIVE thinnest-calibre recall (0–1 px) is 0.20306840855598018, against 0.5442296738631144 on CHASE.
- The threshold sweep described in `eval_m2_vessel.py` is **not in the persisted JSON** (run with `--skip-sweep`, or not saved).
- M2's own validation Dice (6 CHASE images): 0.7771457731723785 (checkpoint metadata).

**M4 hard exudates.** Source: `m45_metrics.json`; IDRiD official seg test, n=27
- Dice **0.6675558777334784**, IoU 0.5010010300454091, sens 0.7231692249701589, spec 0.993934448158236, precision 0.6198852978396863, per-image mean Dice 0.5356274114515198.
- With the OD masked at radius 58: Dice 0.6707994267252897.
- Training val (11 images): best mean Dice 0.5831056841876934, global 0.7325068434272193 (`Model4/bright_lesion_final_metrics.json`).
- **Soft exudates (SE):** Dice 0.0757, sens 0.3020, precision 0.0433 against the SE mask. `eval_m45_lesions.py` computes this (it scores EX, SE and EX∪SE), but the value is persisted **only in** `ML/comprehensive_model_analysis.md` §5.1. The JSON keeps EX only. Tag: code-computed, number DOC-ONLY.

**M5-v1 red lesions (merged MA+HE).** Source: `m45_metrics.json` → `m5_heldout`; the 16 recorded val ids
- Dice 0.6105493377975186, IoU 0.43941778891933386, sens 0.5697009397596432, spec 0.9971674858765426, precision 0.6577079697498546, per-image Dice 0.535084553393911.
- Pixel-level Dice by lesion type (v1 mask vs each GT): MA 0.18269742250592388, HE 0.5614045546679385.
- Lesion-level detection by GT component size, v1:

| Size (px) | MA detected / total | HE detected / total |
|---|---|---|
| 0–10 | 301 / 560 | 10 / 29 |
| 10–25 | 196 / 243 | 73 / 94 |
| 25–100 | 23 / 25 | 131 / 155 |
| 100–500 | — | 61 / 71 |
| 500+ | — | 10 / 10 |
| **Overall** | **62.80193236714976%** | **79.38718662952647%** |

**M5-v2 red lesions (deployed, 3-class).** Source: `ML/models/red_lesion_v2_metrics.json`; 16 val images
- Val Dice merged **0.599374574746393**; MA **0.44165716990813975**; HE **0.5705328187852601**. v1 comparison: 0.5353 → delta 0.0641.
- No IoU is recorded for v2.
- Lesion-level (component) floor sweep:
  - MA at floor 5: recall 0.6666666666666666, precision 0.6302021403091558, F1 0.647921760391198 (n_gt 828).
  - HE at floor 10: recall 0.5403899721448467, precision 0.6608391608391608, F1 0.5945757489763652 (n_gt 359).
- MA size distribution at 512 px: median 6.0 px; 71.3% below 10 px (n=3452 components).

**FROC:** **not found in any code or result file.** It is mentioned only in `docs/implementation-plan-backend-ml.md` and `docs/system-design-v3-final.md`. DOC-ONLY / V4-MISSING.

### 3.5 Optic disc and fovea (M3)

Source: `ML/diagnostics/out/m3_metrics.json`. Held-out n=77. `localization_test_predictions.csv` lists 78; the result file does not record why one is missing. Errors are in native pixels unless marked @512.

| Landmark | Mean err | Median err | SD | Max | Mean @512 | Within 1 disc radius |
|---|---|---|---|---|---|---|
| Optic disc | 26.90957333394187 | 21.21918721935409 | 37.262213021172066 | 330.13435356874027 | 4.067483220290085 | 98.7012987012987% |
| Fovea | 85.55583505219597 | 31.20722071892978 | 276.68782044278447 | 1848.4190415392825 | 12.243829982191787 | 96.1038961038961% |

All 516 images (contaminated, `m3_metrics_all.json`): OD within 1R 99.8062015503876%, fovea within 1R 98.25581395348837%.

### 3.6 Fovea reliability gate

Source: `ML/diagnostics/out/fovea_gate_report.txt`; code `ML/inference/segInfer.py:86` (`FOVEA_PEAK_THRESHOLD = 0.37`), `fovea_unreliable()` at `:230`.
- Gross miss = error > 522.1 px native (the median disc diameter, measured from 81 IDRiD OD masks). Gross misses: 6/516 (1.2%) native.
- **Threshold 0.37 selected on VAL only** (val_reconstructed, n=77): sens 2/2 = 1.000 [0.158, 1.000]; FAR 1/75 = 0.013 [0.000, 0.072].
- **TEST (n=78, untouched):** sens 2/2 = 1.000 [0.158, 1.000]; FAR 4/76 = 0.053 [0.015, 0.129]. AUC 1.000, flagged by the file as "indicative" (only 2 positives).
- Flag rate: IDRiD, all 516 → 14/516 (2.71%). **Messidor-2 → 255/1744 = 0.14621559633027523** (`messidor2_v2a_external_validation.json` → `fovea_gate`).
- Live effect: Tier A → B floor (`gradingOrchestrator.js:538`); the rule engine skips its quadrant criteria.

### 3.7 Camera-fingerprint classifier

**No accuracy has been measured.** `ML/cameraCalibration/calibrationProfiles.json` (readme) and `classifyCameraFamily.m:29-30` both state "NO CLASSIFICATION ACCURACY HAS BEEN MEASURED and none should be quoted". `ML/verifyCameraCalibration.m` checks only synthetic-perturbation feature separation, and it has no persisted result file. Live use: mismatch plus a probation floor (`CAMERA_PROBATION_MIN_CASES = 20`, `gradingOrchestrator.js:645`). CODE-VERIFIED (component); metric **none**.

### 3.8 Quality gate

Source: `ML/experiments/quality_gate_compression.json`. n=52 IDRiD held-out images, each in a clean and a JPEG-quality-10 version; camera preset `forus_3nethra_v2`.
- Focus-threshold sweep best: **threshold 0.17**, clean pass 0.8846153846153846, compressed reject 1.0, Youden 0.8846153846153846. The threshold in force when measured was 0.4.
- Status at that 0.4 threshold: clean → pass 6 / borderline 40 / retake 6; JPEG10 → retake 52.
- Focus score: clean median 0.28758700000000004 (max 0.390852); JPEG10 median 0.100738.
- **Inconsistency:** the script docstring (`qualityGateCompression.py`) says "clean 52/52 REJECTED", while the JSON shows 6 pass, 40 borderline, 6 retake. Treat the JSON as authoritative. The docstring appears to predate the saved run.
- **Live presets** (`phc-local-app/backend/quality-gate-matlab/cameraPresets.json`): `default` focus 0.17 / illumination 0.4; `mobile_lens` focus 0.12 / illumination 0.3.
- MATLAB ↔ JS ↔ mobile parity scripts exist (`verify_quality_gate_parity.js`, `verify_mobile_quality_gate_parity.mjs`) but **persist no result file**. Run them live if a slide needs a number.

### 3.9 NV suspicion score

Source: `ML/experiments/nv_validation_run.log`. The script's JSON report was written to a temp scratchpad outside the repo, so the log is the only in-repo record.
- Fit on IDRiD train (n=251). 5-fold CV AUC mean 0.5094 (std 0.0845).
- AUC, grade 4 vs 0–3:

| Score variant | IDRiD-test (n=103, 13 PDR) | Messidor-2 (n=1744, 35 PDR) |
|---|---|---|
| Old 2-component (the live formula) | 0.2692 [0.1582, 0.4009] | 0.3632 [0.2398, 0.4961] |
| Equal 4-way | 0.2376 [0.1391, 0.3468] | 0.3681 [0.2381, 0.5108] |
| Fitted 4-way | **0.2863 [0.1245, 0.4877]** | **0.3793 [0.2435, 0.5223]** |

- At the design threshold 0.6, the old score gives sens 0.0000 / spec 1.0000 on both sets.
- File verdict: "AUC is TOO LOW to justify any live use".
- Live: stored in `segmentation_outputs.nv_suspicion_score`; `nvForRule` hard-coded to 0 (`ML/grading/runCasePipeline.m:88-100`).

### 3.10 Branch agreement and integrated vs single technique

Source: `ML/experiments/comparison_task92_real.txt`. **Branch A v1 + v1-era rule engine**, n=52 local IDRiD held-out images.
- **Agreement 46.2% (24/52)**, disagreement 53.8% (28).
- P(A wrong) 0.4423; P(A wrong | agree) 0.2500; P(A wrong | disagree) 0.6071; **lift 1.3727**.
- A alone: sens 0.8276 [0.6545–0.9240], spec 0.9130 [0.7320–0.9758], κ 0.8270.
- B alone: sens 0.9310 [0.7804–0.9809], spec 0.5652 [0.3681–0.7437], κ 0.6356.
- Integrated (defer disagreements, coverage 46.2%): sens 0.9286 [0.6853–0.9873], spec 1.0000 [0.7225–1.0000], κ 0.9024.
- File verdict: "No difference is demonstrated … Do not claim the integrated pipeline wins."
- **Not re-measured** with v2c + the v2 red-lesion model + the v2 thresholds.

Also on disk: `ML/diagnostics/out/agreement_results.csv` (14 disagreement rows) and `recalibrated_results.csv` (the same 14; `agree_v2` = 1 on 4 of 14). Both are older scratch slices.

**Rule engine alone** (v2 thresholds, IDRiD test n=103; `ML/models/rule_thresholds_by_red_version.json` → `v2._heldOutTest`): QWK 0.692 [0.559, 0.802]; referable sens 0.859; spec 0.872.

### 3.11 Lesion-attention consistency, occlusion, review time

Source: `ML/experiments/explainability_results.json`. Branch A **v1**, CAM at 384, n=12 images from v1's test ids.
- Attention enrichment over chance: median 2.023340160057525, mean 2.3596396239822264, min 0.2897371514237985, max 5.2766932634498955. Above chance: 9 of 12.
- Occlusion (lesions inpainted):
  - Referable arm n=6: correct direction 6/6, median confidence drop 0.3881816416978836.
  - Non-referable arm n=6: correct direction 6/6, median −0.050253331661224365.
- **Review time: NOT MEASURED** (`reviewTimeN: 0`). **Clinician plausibility: NOT DONE.**
- Live: `lesionAttentionConsistency.m` runs per case (`runCasePipeline.m:156`) and is stored as `lesion_attention_consistency_score`. There is no aggregate result file for v2c.

### 3.12 Synthetic domain gap (Branch A v1, n=52)

Source: `ML/experiments/domain_gap_results.json`.

| Condition | Accuracy | Sens | Spec | κ | Tier A / B / C |
|---|---|---|---|---|---|
| Baseline | 0.5576923076923077 | 0.8275862068965517 | 0.9130434782608695 | 0.8270005253020487 | 16 / 21 / 15 |
| JPEG, strength 1.0 (worst) | 0.19230769230769232 | 1.0 | 0.2608695652173913 | 0.16252577825788084 | 1 / 32 / 19 |
| Combined, strength 1.0 | 0.3076923076923077 | 0.9310344827586207 | 0.782608695652174 | 0.5387344766410409 | 1 / 6 / 45 |

Vignette, colour-shift, resolution-loss and defocus results at 0.25 / 0.5 / 1.0 are in the same file.

### 3.13 Backend parity (MATLAB vs PyTorch)

- Branch A v2c: 10/10 argmax agreement, overall max|diff| 0.000001 (`ML/diagnostics/out/parity_v2c_report.txt`; MATLAB R2026a).
- Red-lesion v2: max|softmax diff| 0.000014; MA/HE component counts agree on 10/10 (`parity_red_v2_report.txt`).
- Segmentation backend (20 IDRiD test images, 4 per grade; `seg_backend_parity.txt`): rule-engine grade identical 20/20; OD/fovea identical 20/20; vessel pixel count identical 17/20 (max |diff| 1 px).

---

## 4. Rule engine (Branch B)

- **Live threshold file:** `ML/models/rule_thresholds_by_red_version.json`, loaded by `services/gradingOrchestrator.js` `redLesionThresholds()` (`:1327-1350`). It is keyed by the `redLesionModelVersion` that segInfer reports, and the JS fallback (`services/matlabFallback.js`) reads the same values.
- **Active values (key `v2`, since red-lesion v2 is the default):**

| Parameter | Value | Source |
|---|---|---|
| `redFloor` | **9** | threshold file |
| `grade3QuadMin` | **4** | threshold file |
| `moderateRedCount` | **11** | threshold file |
| `brightFloor` | **7** | threshold file |
| `maxGrade` | 3 | built-in default, `ML/grading/ruleEngineGrade.m:157` |
| `nvThreshold` | 0.6 | built-in default, `ruleEngineGrade.m:158`; unreachable because NV is passed as 0 |

- Lesion min-area floors that the thresholds are coupled to: MA 5 px, HE 10 px, at 512 (asserted in `segInfer.py:137-145`).
- **How they were fit:**
  - Optimizer: `ML/grading/optimizeRuleThresholds.m` (coarse grid + local refinement; full grid 4.42e8 points vs a 1.2e6 cap).
  - Data: IDRiD grading **TRAIN, 251 of 413** images (only the local partial copy). Lesion counts from `ML/diagnostics/collectLesionCounts.py` with red v2 → `ML/diagnostics/out/lesion_counts_v2_train.csv` / `_test.csv`.
  - Optimizer output (`ML/diagnostics/out/rule_thresholds_v2_refit.json`): redFloor 9, **grade3QuadMin 8**, moderateRedCount 11, brightFloor 7; train QWK 0.87814527124736608, CV QWK 0.86319327174450877, train sens 0.90476190476190477. 12 tied optima.
  - `grade3QuadMin` was then **manually set to 4**, because it scored better on the held-out TEST split (exact-grade accuracy 0.650 vs 0.602). This is a test-set-informed choice; it does not change sens/spec, which stay flat at 0.859 / 0.872 for every value 3–10.
  - Held-out TEST n=103: QWK 0.692 [0.559, 0.802]; sens 0.859; spec 0.872. That replaces 0.457 / 0.231 / 0.984 with v1 thresholds on v2 counts.
  - Disclosed limitations in the file: sensitivity is below the 0.90 target; 14 of 17 grade-1 test cases are called 0.
- **v1 threshold set** (3 / 3 / 5 / 1) came from 14 validation images and is kept only for rollback.
- **Superseded file:** `ML/models/rule_thresholds_red_v2.json` (Gate-2 recalibration, 2026-09-20: v2 redFloor 12, grade3QuadMin 4, brightFloor 5). It is **not read by the live orchestrator** but **is** packaged by `ML/deploy/buildCaseChain.m:59`.
- **Venous beading / IRMA** (the "2" and "1" of the 4-2-1 rule): `ruleEngineGrade.m` accepts `venousBeadingQuadrants` / `irmaQuadrants`, but **no code produces them** (they are absent from `segInfer.py`). Severe-NPDR therefore rests on the haemorrhage-quadrant criterion alone. V4-MISSING.

---

## 5. Figures already generated (PPT candidates)

| Figure | Path | What it shows | Model/version |
|---|---|---|---|
| Grad-CAM examples (5) | `ML/diagnostics/out/gradcam_IDRiD_032_gt4_pred3.png`, `gradcam_IDRiD_212_gt0_pred0.png`, `gradcam_IDRiD_256_gt1_pred0.png`, `gradcam_IDRiD_369_gt3_pred3.png`, `gradcam_IDRiD_401_gt2_pred3.png` | CAM overlays with true/predicted grade in the filename | v1 (dated 2026-09-10, before v2 existed) |
| Per-case pipeline outputs | `central-system/backend/media/cases/<caseId>/` (36 case folders) and a backup copy in `db-backups/central-media-20260924-174855/` | `original.jpg`, `gradcam.png`, `original_vessel.png`, `original_red.png`, `original_bright.png`, `original_lesion384.png`, `original_roi384.png` | whatever was live when each case ran |
| Vessel prediction vs GT (6 pairs) | `ML/models/vessel_predictions(Model2)/Image_{08L,08R,09L,09R,13L,13R}_{gt,pred}.png` | CHASE_DB1 masks | M2 |
| Red-lesion v1 overlays (5) | `ML/models/red_lesion_predictions(model5)/IDRiD_{31,33,37,58,78}_redlesion.png` | val images | M5-v1 |
| Red-lesion v2 overlays (5) | `ML/models/red_lesion_predictions_v2/IDRiD_{24,31,58,66,78}_redlesion_v2.png` | val images, MA/HE | M5-v2 |
| Preprocessing comparison | `ML/test_output_original.png`, `test_output_clahe.png`, `test_output_ben_graham.png`, `test_output_both.png`, `test_output_comparison.png` | Original vs CLAHE vs Ben Graham | preprocessing |
| Messidor-2 sanity montage | `ML/diagnostics/out/messidor2_sanity_montage.png` | Loader sanity grid | — |
| Architecture diagrams | `docs/diagram-phc-central-architecture.svg`, `docs/diagram-pipeline-layers.svg` | System / pipeline layers | — |
| App screenshots | `demo_images/1_quality_pass.jpg`, `2_grading_confirm.jpg`, `3_grading_override.jpg`, `4_backup.jpg` | UI flow | — |

**Not generated as images** (no files found): confusion-matrix plots, ROC curves, FROC curves, calibration / reliability diagrams, training curves. The data to render them exists:
- **Confusion matrices:** `branchA_v2{a,b,c}_metrics.json` (`confusion_matrix`), `m1_metrics.json`.
- **ROC:** `Model1/v2c/test_logits.csv` + `test_labels.csv` (and v2a/v2b); `ML/diagnostics/out/messidor2_v2c_logits5.npy` + `_ids.npy` + `ML/datasets/Messidor-2/eval_manifest.csv`.
- **Reliability diagram:** the 10-bin table in `ML/models/evaluation_branchA_v1.txt` (v1 only).
- **Training curves:** `Model1/v2*/branchA_v2*_history.json`, `Model3/localization_training_history.csv`, `Model4/bright_lesion_training_history.csv`.
- **FROC:** needs new code. Lesion-level recall/precision per floor already exists in `red_lesion_v2_metrics.json` (`floor_sweep`), which can be plotted as a precision–recall-by-floor curve (not FROC).
- **PDF clinical report:** a generator exists (`ML/explainability/generateReportFigures.m`, `exportgraphics(..., 'Append', true)`), but **no PDF is on disk**.

---

## 6. v4 cross-reference

### 6.1 V4-STALE (v4 states something the files now contradict)

| v4 claim (section) | What the files show |
|---|---|
| "QWK 0.8242 on IDRiD alone" (§15) | That is **v1**. Deployed v2c IDRiD-only = 0.8558659217877095 (n=78) |
| "Grade-4 recall 0.444, 5 of 54 below referral" (§15, §17) | v1. v2c pooled = 0.5740740740740741 |
| "Grade-1 recall 0.000 on 4 cases" (§15) | v1 IDRiD-only. v2c = 0.5 (n=4) |
| "Per-domain threshold → out-of-domain 0.8136 matches in-domain 0.8024" (§6.5, §15) | 0.8136 is DRIVE with thin vessels excluded, not thresholded. True DRIVE Dice 0.6186212261842878. CHASE 0.8024 includes training images. The live threshold is a fixed 0.5 |
| "Messidor-2 external validation has never been run" (§15, §17) | Run for v2a, v2b and v2c (§3.2) |
| Messidor-2 "never used in training or model selection" (§14) | The selection half **is** used for model selection. Parts D/E fit on Messidor labels (as experiments) |
| "NV … has never been measured" (§15, §17) | Measured: AUC 0.2863 / 0.3793. **It failed** |
| Fovea gate "specified, not yet built" (§16) | Built: threshold 0.37 with a validation report |
| MA/HE 3-class retrain "designed but not built" (§16) | Built and default (red v2) |
| Conformal method switch is an open item (§18) | Switched to `ordinal_mode_interval_stratified_v3` (but 2 strata, see V4-MISSING) |
| IDRiD grading 516 (§14) | Kaggle training copy 516 (derived); local disk 354 (251 + 103) |
| Branch agreement 46.2%, 1.37× lift (§15) | Matches the file (1.3727), but it is still the v1 measurement |
| Hard exudate Dice 0.6676 / SE 0.076 (§15) | 0.6675558777334784 ✓. SE 0.0757 is only in markdown |

### 6.2 V4-MISSING (in v4, absent from code or the live path)

- Per-domain vessel threshold, and camera-family → vessel-threshold selection (§6.3, §6.5). The live threshold is a fixed 0.5.
- Frangi filter in the live path (§6.5). The file exists but is unused.
- Venous-beading and IRMA detectors (§6.6, §6.7). The rule engine accepts the inputs, but nothing produces them.
- MC Dropout as a routing input (§6.8). `mcDropout.py` exists; the MATLAB backend returns null; `decideTier()` does not take it.
- Per-grade (class-conditional) Mondrian conformal (§6.8). The code uses 2 strata (non-referable / referable).
- Grad-CAM++ (§6.9). Only Grad-CAM is present.
- FROC evaluation (in the brief, not a v4 metric, but requested). Not present.
- Symptom/risk fusion (§6.10). No code found (a repo-wide search for fusion/risk-weight terms matches only "confusion").
- Continual learning retraining (§6.11). The gate and trigger exist in `services/continualLearningService.js`; `defaultRetrainFn` throws `retrain_not_implemented`, and `LIVE_MODEL` points at v1.
- Nine-factor quality gate (§6.1). The code checks 6 hard factors (FOV, glare, motion, illumination, blur, eyelash) plus a composite; there is no explicit contrast or colour-balance check.
- Camera-classifier accuracy. None has been measured.
- Clinician plausibility rating and review-duration measurement (§15). Explicitly not done (n=0).
- MATLAB Compiler packaging of the **current** model. `ML/deploy/buildCaseChain.m` packages v1.

### 6.3 BEYOND-V4 (in code, not in v4)

- EyePACS (resized Kaggle) in v2b and v2c; the curated sampling and quality filter.
- DRIVE as an out-of-domain vessel test set; vessel calibre-stratified recall; scale-attribution experiment.
- Dual-head Branch A (binary referable head, focal loss, validation-locked threshold). Trained, not shipped.
- Asymmetric ordinal loss; grade-4 weight boost 2.0; domain augmentation (v2c).
- `referableThreshold` gate inside tiering, and the P(g3)+P(g4)>0.5 safety check in the live path (`branchAInfer.py:565-567`).
- Extra tier floors: laterality mismatch, `unvalidated_camera` (`gradingOrchestrator.js:523-560`), camera/site probation at 20 cases.
- Messidor-2 site-recalibration experiments (Parts D/E); patient-level bootstrap and Clopper-Pearson reporting; selection/report split with an append-only peek log.
- Synthetic camera-perturbation domain-gap test; JPEG-compression quality-gate experiment; `mobile_lens` quality preset.
- MATLAB ↔ PyTorch parity harnesses for Branch A, red v2 and segmentation.
- Red-lesion encoder transfer from the vessel model; component-size floor sweep.
- Fovea gate measured on Messidor-2 (14.62% flagged).

---

## 7. Gaps and things not found

- **DRIVE images:** not on disk (`SIH_2026/datasets/DRIVE/` absent). The DRIVE numbers exist only as saved results.
- **APTOS and EyePACS images:** not on disk. Training ran on Kaggle; notebooks are saved **without outputs**, so the EyePACS quality-filter pass rate, the per-grade EyePACS composition and the EyePACS monitor-val size are not recorded anywhere. A notebook comment mentions "62%" for the filter; no log backs it.
- **NV validation JSON:** written outside the repo (temp scratchpad). Only the `.log` remains.
- **v2c lesion-attention and occlusion aggregates:** none. Only the v1 n=12 study exists.
- **Quality-gate parity results:** scripts exist; no saved output.
- **Vessel threshold sweep:** described in code, not persisted.
- **MOCK:** no hardcoded mock data was found in the ML code or result files. Whether any UI shows hardcoded ML numbers (for example the mobile-app mock fallback v4 §16 describes) belongs to the app/UI audit and was not checked here.
