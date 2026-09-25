# 03 — MathWorks Usage Audit (for the national-round PPT)

**Audited:** 2026-09-25, against the working tree at `SIH_2026/` (HEAD `7dcf3b1`, with uncommitted changes in the mobile/PHC apps. None of those changes touch MATLAB/Simulink files).
**Method:** every claim below was checked against code, `.slx` XML, result files, logs, the live Postgres DB, or a live MATLAB query on this machine. Docs were used only to find things to check, and a doc claim that couldn't be verified is tagged DOC-ONLY.

## Tags used

| Tag | Meaning |
|---|---|
| **CODE-VERIFIED** | Found in code, or in a result/log file, at the path given |
| **DOC-ONLY** | Stated in a doc or commit message, with no result file or runnable evidence in the repo |
| **MOCK** | The UI exists, but what it shows is hardcoded |
| **BEYOND-V4** | Exists in code but isn't in `docs/system-design-v4.md` |
| **V4-MISSING** | v4 describes it, but the code doesn't do it (or not on the live path) |
| LIVE / OFFLINE | Whether it runs per case or per request in the running product (LIVE), or is dev/analysis tooling (OFFLINE) |

---

## 0. Read this first: installed vs licensed on THIS machine

`matlab -batch "ver"` run on 2026-09-25 (MATLAB R2026a Update 5, `matlabroot = D:\`) lists **only these products as installed**:

| Installed (ver) | Licensed (`license('test')`=1) but **NOT installed here** |
|---|---|
| MATLAB 26.1 | Simulink |
| Deep Learning Toolbox 26.1 | SimEvents |
| Image Processing Toolbox 26.1 | Computer Vision Toolbox (`Video_and_Image_Blockset`) |
| Medical Imaging Toolbox 26.1 | Parallel Computing Toolbox (`Distrib_Computing_Toolbox`) |
| Statistics and Machine Learning Toolbox 26.1 | Global Optimization Toolbox (`GADS_Toolbox`) |
| MATLAB Compiler 26.1 (added 2026-09-24) | Optimization Toolbox, MATLAB Report Generator, Signal Processing Toolbox |
| Support package: *Deep Learning Toolbox Converter for ONNX Model Format* | |

`which` results on this machine: `new_system`, `load_system`, `parsim`, `parpool`, `gcp`, `ga`, `surrogateopt`, `patternsearch`, `insertShape`, `insertObjectAnnotation`, `pixelLabelDatastore`, `unet`, and `importNetworkFromPyTorch` all return **not found**. `mlreportgen.dom.Document` **does** resolve (`exist(...,'class') == 8`), even though Report Generator isn't in `ver`. A `D:\toolbox\mdom` folder is present.

**Consequence for the PPT:** the Simulink/SimEvents, Parallel Computing, Global Optimization and Computer Vision work is real code, committed by `Probot-01` (git author) on a machine that had those products. It **cannot be re-run or demoed from this laptop** until they're installed. The four parity reports (`diagnostics/out/parity_*_report.txt`) record the same five-product `ver` list as above, which confirms which machine ran them.

---

## 1. Toolbox → function → file:line → stage

Paths are relative to `SIH_2026/`. `ML/` = `central-system/backend/ml-pipeline/`, `QG/` = `phc-local-app/backend/quality-gate-matlab/`, `SIM/` = `simulink-model/`.

### 1.1 Deep Learning Toolbox (+ ONNX converter support package)

| Functions | file:line | Stage | Status | Tag | Why this toolbox |
|---|---|---|---|---|---|
| `importNetworkFromONNX(...,'InputDataFormats',{'BCSS'})`, `addLayers`/`dropoutLayer(0.3)`, `initialize` | `ML/training/importModels.m:42,46,52` (branchA_v1), `:81` (vessel), `:93` (localization), `:105` (bright lesion), `:117` (red v1), `:136` (red v2); `ML/training/importBranchAV2.m:39,42,48` (v2a/b/c via `importModelsV2b.m:15`, `importModelsV2c.m:13`) | Model import (PyTorch→MATLAB) | OFFLINE (produces the `.mat` files used live) | CODE-VERIFIED | Turns the PyTorch-trained nets into native `dlnetwork`s, so inference happens inside MATLAB |
| `predict(net, dlarray(...,'SSCB'), 'Outputs','x_head_Gemm')`, `extractdata` | `ML/inference/branchAInferMatlab.m:203-206` | Branch A grading (default model `branchA_v2c`, `:112`) | **LIVE** (`INFERENCE_BACKEND` defaults to `matlab`, `central-system/backend/services/gradingOrchestrator.js:183`) | CODE-VERIFIED (+ `session.log`, §5.4) | CNN forward pass for the 5-class DR grade |
| `predict`, `extractdata`, `gather` | `ML/inference/matlabSession/runMatlabInferenceSession.m:186-187` | Segmentation forward passes for `vessel_unet_v1`, `localization_v1`, `bright_lesion_unet_v1` (`:156-163`) | **LIVE** | CODE-VERIFIED (+ `session.log`) | One resident MATLAB process serves the U-Nets |
| `dlfeval`, `forward`, `dlgradient`, `extractdata` | `ML/explainability/gradCam.m:79,109,119,122` | Grad-CAM heatmap | **LIVE** when a Grad-CAM path is passed (`branchAInferMatlab.m`, `gradCam(net, td.display, gradeIdx, gradcamPath)`) | CODE-VERIFIED | Autodiff through the imported net for the explanation overlay |
| `forward(net, dlX)` (MC Dropout) | `ML/calibration/mcDropoutUncertainty.m:89-90` | Uncertainty | **Not used on the MATLAB path.** `branchAInferMatlab.m:338-343` returns `uncertaintyScore: []` with an explicit `uncertaintyError` | CODE-VERIFIED / **V4-MISSING** (v4 §6.8 lists MC Dropout as a routing input) | Would give MC-Dropout variance; disabled because `forward()` was deterministic on the imported net |
| `unet(...)`, `dlnetwork`, `trainingOptions('adam',...)`, `trainnet(...,@diceLoss,...)` | `ML/training/trainVesselUnet.m:158,160,167,185` | MATLAB-native vessel U-Net training | OFFLINE. **No trained artifact or log from this script found.** The deployed `vessel_unet_v1.mat` is ONNX-imported (`importModels.m:81`). `unet` needs Computer Vision Toolbox, which isn't installed here | CODE-VERIFIED (code only) / BEYOND-V4 | Alternative to the PyTorch trainer |
| `imagePretrainedNetwork("resnet50", NumClasses=5)` | `ML/training/createStubBranchA.m:57` | Dev stub classifier | OFFLINE / superseded | CODE-VERIFIED | Placeholder before the real model existed |
| `importNetworkFromPyTorch` | `ML/testImportedNetwork.m:51` | Import experiment | OFFLINE; **function not found on this machine** (no PyTorch converter support package) | CODE-VERIFIED (code only) | Alternative import route, not the one in use |

### 1.2 Image Processing Toolbox

| Functions | file:line | Stage | Status | Tag | Why |
|---|---|---|---|---|---|
| `fspecial('laplacian')`, `imfilter`, `imgaussfilt`, `rgb2gray` | `QG/assessFocus.m:32-33` | PHC quality gate: focus | **LIVE** at the PHC via `matlab -batch` (`phc-local-app/backend/services/qualityGateClient.js`) | CODE-VERIFIED | Classical blur metric for the instant retake decision |
| `imbinarize`, `imfill`, `regionprops` | `QG/assessFOV.m:55` | Quality gate: field of view | LIVE | CODE-VERIFIED | Retinal disc coverage |
| `bwareaopen`, `bwconvhull`, `imclose`, `imfilter`, `strel` | `QG/assessGlareMotionOcclusion.m:123,131` | Quality gate: glare/motion/occlusion | LIVE | CODE-VERIFIED | Artifact detection |
| `rgb2gray`, `bwareafilt`, `bwperim`, `imdilate`, `imfill`, `strel` | `ML/cameraCalibration/classifyCameraFamily.m:124,129,143` | Camera-family fingerprint (v4 §6.3) | **LIVE** (`ML/grading/runCasePipeline.m:76`) | CODE-VERIFIED | Vignetting/edge-band features for the camera cross-check |
| `bwskel`, `bwmorph('branchpoints'/'endpoints')`, `bwconncomp`, `imdilate` | `ML/segmentation/neovascularizationSuspicion.m:173-175,198` | NV suspicion score (v4 §6.6) | **LIVE** (`runCasePipeline.m:90`) | CODE-VERIFIED | Skeleton/branching features from the vessel mask |
| `dicominfo` | `ML/preprocessing/readFundusImage.m:126` | DICOM header (device, laterality) | LIVE when a `.dcm` is uploaded | CODE-VERIFIED | Ophthalmic Photography tags |
| `adapthisteq` (CLAHE), `imnlmfilt`, `imdiffusefilt`, `imgaussfilt`, `imresize`, `regionprops` | `ML/preprocessing/claheEnhance.m:37`, `denoiseRetinal.m:107,118,120`, `benGrahamCrop.m`, `illuminationNormalize.m`, `preprocessModel1.m` | MATLAB preprocessing port | **OFFLINE / retired from the live path.** `branchAInferMatlab.m:25-40` says the port was removed because its residual (SSIM 0.981) flipped the grade on 1/10 and the tier on 2/10 real images. Live preprocessing is Python (`preprocessBranchATensor.py`) | CODE-VERIFIED (matches v4 §6.2 "one implementation") | — |
| `fibermetric` (Frangi), `imreconstruct`, `bwmorph` | `ML/segmentation/vesselSegmentationFrangi.m:84,121` | Frangi vesselness | OFFLINE. Not called by any live service (no reference in `services/*.js`, `segInfer.py` or `runCasePipeline.m`) | CODE-VERIFIED / **V4-MISSING** (v4 §6.5 says the U-Net is "complemented by a Frangi vesselness filter") | — |
| `imfindcircles` | `ML/segmentation/opticDiscFovea.m:91` | Classical OD finder | OFFLINE (live OD/fovea = ONNX U-Net `localization_v1`) | CODE-VERIFIED | — |
| `bwareaopen`, `bwlabel` | `ML/training/parityCheckRedLesionV2.m` | Parity: per-class lesion component counts | OFFLINE | CODE-VERIFIED | Checks that MATLAB and PyTorch counts agree |
| `randomPatchExtractionDatastore` | `ML/training/trainVesselUnet.m:136,143` | MATLAB U-Net training | OFFLINE | CODE-VERIFIED | Patch sampling |
| `ssim`, `im2gray` | `ML/verifyModel1Port.m`, `ML/comparePreprocessingRecipes.m` | Port verification | OFFLINE | CODE-VERIFIED | Measured the 0.981 SSIM residual |

### 1.3 Computer Vision Toolbox (**not installed on this machine**)

| Functions | file:line | Stage | Status | Tag |
|---|---|---|---|---|
| `insertObjectAnnotation`, `insertShape` | `ML/explainability/generateEvidenceReport.m:234,237,239,251` | Annotated evidence overlay | **Never reached live.** The overlay needs `inputs.lesionPoints` (`:193`, early return at `:201`), and `runCasePipeline.m:133` passes only quadrant counts | CODE-VERIFIED (code only) |
| `pixelLabelDatastore`, `unet` | `ML/training/trainVesselUnet.m:78,158` | MATLAB U-Net training | OFFLINE, no artifact | CODE-VERIFIED (code only) |
| `insertObjectAnnotation` | `ML/verifyPhase4.m:147` | Dev verification overlay | OFFLINE | CODE-VERIFIED (code only) |

**PPT note:** don't show Computer Vision Toolbox as part of the live pipeline.

### 1.4 Medical Imaging Toolbox

| Functions | file:line | Stage | Status | Tag | Why |
|---|---|---|---|---|---|
| `medicalImage(imagePath)` → `.Pixels` (H×W×1×3 handling at `:90-100`) | `ML/preprocessing/readFundusImage.m:86` | DICOM ingestion for central grading | LIVE when a `.dcm` arrives. `.dcm` is accepted at `central-system/backend/services/ingestionService.js:35` and `chunkedUploadService.js:70`, and `readFundusImage` is called at `runCasePipeline.m:62` | CODE-VERIFIED / BEYOND-V4 (v4 §16 lists "DICOM input support" but never names this toolbox) | Reads fundus-camera DICOM (Ophthalmic Photography IOD) |
| `dicomwrite` (IPT) to synthesize OP DICOMs | `ML/preprocessing/testReadFundusDicom.m:33,49`, `testReadFundusImage.m:79` | Tests | OFFLINE | CODE-VERIFIED | Round-trip test data |

The PHC quality gate still uses `imread`, so a DICOM can't complete PHC capture→sync end to end (`ingestionService.js:30-34` comment).

### 1.5 Statistics and Machine Learning Toolbox

| Functions | file:line | Stage | Status | Tag | Why |
|---|---|---|---|---|---|
| `TreeBagger` (regression), `predict(mdl.bag, x)`, `exprnd` | `ML/grading/calculateUrgencyScore.m:152,215,307,197` | Triage urgency score | **LIVE but decides nothing.** It's called in `runCasePipeline.m:205` and stored, but `gradingOrchestrator.js:968-975` says it is read "nowhere near decideTier, the referral logic or the SMS". **Trained on synthetic data** (commit `a1b6fbb`) | CODE-VERIFIED / BEYOND-V4 | Random-forest queue-ordering hint |
| `cvpartition`, `perfcurve` (ROC/Youden with bootstrap), `bootci`, `prctile` | `ML/grading/optimizeRuleThresholds.m:1061,1167,1169,1219,1229` | Rule-engine threshold refit | OFFLINE. Its output is used live: `models/rule_thresholds_by_red_version.json` is read at `gradingOrchestrator.js:1332` | CODE-VERIFIED / BEYOND-V4 | Stratified CV and CIs for the Branch B thresholds |
| `corr` | `ML/verifyModel1Port.m:115`, `ML/testImportedNetwork.m:76`, `ML/comparePreprocessingRecipes.m:92` | Verification | OFFLINE | CODE-VERIFIED | — |

Result file (`ML/diagnostics/out/rule_thresholds_v2_refit.json`, `fittedBy: "grading/optimizeRuleThresholds.m"`, `fittedAt 2026-09-22T21:11:51Z`, n = 251, `syntheticData: false`): `qwk 0.8781452712473661`, `cvQwk 0.8631932717445088`, `referableSensitivity 0.9047619047619048`, `tiedOptima 12`. These are **train-split** figures. The held-out figures in `models/rule_thresholds_by_red_version.json` (v2, n = 103 test): `qwk 0.692`, `qwkCI95 [0.559, 0.802]`, `referableSensitivity 0.859`, `referableSpecificity 0.872`. The deployed v2 thresholds (`redFloor 9 / grade3QuadMin 4 / moderateRedCount 11 / brightFloor 7`) differ from the refit's `grade3QuadMin 8`. The reason is recorded in that JSON's `_whyGrade3QuadMinIs4Not8`.

### 1.6 Parallel Computing Toolbox (**not installed on this machine**. `parfor` runs serially here)

| Functions | file:line | Stage | Status | Tag |
|---|---|---|---|---|
| `parsim(in, ...)` | `SIM/sweepDistrictScenarios.m:145,151`; pool at `:251-260` | SimEvents scenario sweep | OFFLINE | CODE-VERIFIED / BEYOND-V4 |
| `parfor`, `parpool`, `gcp` | `SIM/monteCarloQueueing.m:72,191` | Monte-Carlo CIs on the reference queueing model | OFFLINE | CODE-VERIFIED / BEYOND-V4 |
| `parfor`, `parpool` | `QG/calibrateQualityThresholds.m:68,241` | Quality-threshold sweep (writes nothing back) | OFFLINE | CODE-VERIFIED / BEYOND-V4 |
| `parfor`, `parpool` | `ML/explainability/batchGenerateReports.m:70,153` | Batch PDF rendering | OFFLINE | CODE-VERIFIED / BEYOND-V4 |
| `parfor`, `gcp`, `parpool('local')` | `ML/grading/optimizeRuleThresholds.m:838,1018,1022` | Threshold grid search | OFFLINE | CODE-VERIFIED |
| `parfor`, `parpool` | `ML/experiments/runTask92.m:69,161-163` (serial by default) | Integrated vs baseline comparison | OFFLINE | CODE-VERIFIED |

The timings (sweep: "18 SimEvents scenarios via parsim, 185 s on 4 workers". Monte Carlo: "80 runs … in 3.2 s". Quality sweep: "40 images … 74 s on 4 workers". PDFs: "6 PDFs, 24.2 s serial -> 8.6 s on 3 workers". `runTask92`: "0.211 s serial, 0.875 s with parfor") exist **only in commit message `8062605`** → **DOC-ONLY**. `SIM/out/` doesn't exist, so no sweep or Monte-Carlo result file is in the repo.

### 1.7 Global Optimization Toolbox (**not installed on this machine**)

| Functions | file:line | Stage | Status | Tag |
|---|---|---|---|---|
| `optimoptions('surrogateopt'/'ga'/'patternsearch')`, `surrogateopt`, `ga`, `patternsearch` | `ML/grading/optimizeRuleThresholds.m:951-967`; auto-selection at `:772-790` | Threshold refit, alternative solvers | OFFLINE, optional. **The default is exhaustive enumeration** (`:776-777`), and the header (`:57-70`) says these solvers are "used when present and reported as missing when not" | CODE-VERIFIED (code) / BEYOND-V4 |

The solver comparison (exhaustive 0.8780 vs `ga` 0.8739 vs `surrogateopt` 0.8726 train QWK; "Both global solvers returned a WORSE optimum") is **DOC-ONLY**. It's in `docs/backend-plan-status.md:263-275`, and the result JSONs don't record which solver ran. **Don't claim the Global Optimization Toolbox produced the deployed thresholds.** The status doc itself says so (`:277-279`).

### 1.8 Base MATLAB (no toolbox), worth naming correctly

| Functions | file:line | Stage | Status |
|---|---|---|---|
| `fminbnd` (base `toolbox/matlab/optimfun`, **not** Optimization Toolbox) | `ML/calibration/fitTemperature.m:72` | Temperature scaling | OFFLINE (the output file is used live) |
| Plain MATLAB rule engine | `ML/grading/ruleEngineGrade.m` (defaults `:153-155`) | Branch B ICDR grading | LIVE (`runCasePipeline.m:132`) |
| `conformalTiering` | `ML/calibration/conformalTiering.m`, called at `branchAInferMatlab.m:311` | Conformal tier A/B/C | LIVE |
| `calibrateBranchA.m` | `ML/calibrateBranchA.m` | Fits the deployed `models/calibration_branchA_v2c.json` (`note: "fitted by calibrateBranchA.m"`, `temperature 1.5437778038856966`, `qhatPerStratum [0,0.9069146184928477]`, `referableThreshold 0.3872947768389075`, `fittedOn "pooled val+test, n=1161"`) | OFFLINE → LIVE file |
| Pure-MATLAB discrete-event simulator (local `poissrnd_local`, `prctile_local` to avoid a Statistics dependency) | `SIM/referenceQueueingModel.m:345,361` | Resource recommendation | Scheduled daily (§2.4) |

### 1.9 Simulink + SimEvents (**not installed on this machine**)

| Functions | file:line | Stage | Tag |
|---|---|---|---|
| `load_system('sldelib')`, `new_system`, `add_block('sldelib/Entity Generator',…)`, `add_line`, `save_system` | `SIM/buildDistrictScreeningModel.m:75,76,139,94` | Builds `districtScreeningSimEvents.slx` from a script | CODE-VERIFIED |
| `new_system`, `add_block('sldelib/…')`, `save_system`, dashboard blocks | `SIM/buildFullPipelineModel.m:57,269,288,84` | Builds `netraSetuPipeline.slx` | CODE-VERIFIED / BEYOND-V4 |
| `load_system`, `sim(modelName,'ReturnWorkspaceOutputs','on')`, `close_system(…,0)` | `SIM/runDistrictScreeningModel.m:35,39,36` | Weekly validation run | CODE-VERIFIED |
| `open_system`, `set_param(…,'EnablePacing','on','PacingRate',…)` | `SIM/runFullPipelineModel.m:64,95` | Live, watchable demo run | CODE-VERIFIED / BEYOND-V4 |
| `parsim` | `SIM/sweepDistrictScenarios.m:145` | Scenario sweep | CODE-VERIFIED / BEYOND-V4 |

The SimEvents library is `sldelib` (`toolbox/slde`), not `simevents`, in R2026a (commit `66638bb`).

### 1.10 MATLAB Compiler: see §4. MATLAB Report Generator / DOM API

| Functions | file:line | Stage | Status | Tag |
|---|---|---|---|---|
| `import mlreportgen.dom.*`, `Document(…,'pdf')`, `PDFPageFooter`, `append`, `Table`, `Image` | `ML/explainability/generateReport.m:39,61,78,82-302` | Clinical-rationale PDF (v4 §6.9) | LIVE on demand: `central-system/backend/services/caseReport.js` sends it to the session (`report` request, `runMatlabInferenceSession.m`) or falls back to `matlab -batch` | CODE-VERIFIED |

- Evidence gap: **zero `report.pdf` files exist** under `central-system/backend/media/cases/`, and `session.log` has **0** `report` requests. The "real case rendered and served" claim in `docs/backend-plan-status.md:27` is DOC-ONLY for this machine.
- Toolbox naming: this machine has no Report Generator in `ver`, but the DOM class resolves. `ML/explainability/generateReportFigures.m` is a core-MATLAB fallback. Say "MATLAB DOM API (`mlreportgen.dom`)" unless Report Generator is installed on the demo machine.

### 1.11 Licensed but not used (don't put on a slide)

- **Optimization Toolbox:** zero calls to `fmincon`/`fminunc`/`lsqnonlin`/`linprog`/`intlinprog` (grep over all 111 hand-written `.m` files).
- **Signal Processing / Wavelet:** zero calls.
- Production Server, Compiler SDK, Web App Server: not used. The status doc says `license=0` (DOC-ONLY). `netraSetuCaseMain.m:7` mentions "MATLAB Compiler SDK", but the build uses `mcc`.

---

## 2. The `.slx` models

Both `.slx` files were unzipped and their `simulink/systems/*.xml` parsed directly. The block parameters below are copied from the XML.

### 2.1 `simulink-model/districtScreeningSimEvents.slx`: district queueing model (CODE-VERIFIED)

- **Built by:** `SIM/buildDistrictScreeningModel.m` (git `66638bb`, 2026-09-08, author `Probot-01`; last touched `a1b6fbb`, 2026-09-23). Release R2026a (`metadata/mwcorePropertiesReleaseInfo.xml`). 50,966 bytes. `PreLoadFcn = buildEntityBus();` (entity type = `Simulink.Bus` `DRCase` with fields `prio`, `residual`).
- **What it simulates:** PHC arrivals → a bandwidth-bound upload → tier triage (Tier A leaves without a human) → a two-ophthalmologist review pool where **Tier C preempts Tier B, and the preempted case resumes rather than restarting**.
- **StopTime** `576000` s = `simDays 20` × 8 h (`configSet0.xml`, set at `buildDistrictScreeningModel.m:89`).

| Block (XML name) | Type | Key parameters (verbatim) |
|---|---|---|
| Patient Arrivals | EntityGenerator | `IntergenerationTimeAction: dt = -72*log(rand());` · GenerateAction: `u<0.70 → prio=1`, `<0.90 → prio=2`, else `prio=3` · EntityType Bus `DRCase` |
| Upload Queue | Queue | `Capacity=inf` (FIFO) |
| Network Upload | EntityServer | `Capacity=10`, `ServiceTimeAction: dt = -29.6*log(rand());`, `Utilization=on` |
| Tier Triage | EntityOutputSwitch | 3 outputs, `SwitchingCriterion=From attribute`, `SwitchAttributeName=prio` |
| Tier A Auto-Cleared | EntityTerminator | `NumberEntitiesArrived=on` |
| Review Merge | EntityInputSwitch | 2 inputs |
| Review Queue | Queue | `QueueType=Priority`, `PrioritySource=prio`, `SortingDirection=Descending`, `AverageWait=on` |
| Review Dispatch / Reviewer Merge | EntityOutputSwitch / EntityInputSwitch | 2 ports each |
| Reviewer 1, Reviewer 2 | EntityServer | `Capacity=1`; `ServiceTimeAction: if entity.prio == 3  dt = -240*log(rand()); else dt = -30*log(rand()); end`; `PermitPreemptionBasedOnAttribute=on` (`prio`, Descending); `WriteResidualTimeToAttribute=on` (`residual`); `Utilization=on` |
| Reviewed | EntityTerminator | `NumberEntitiesArrived=on` |
| 6 × To Workspace | ToWorkspace | `tierACleared`, `reviewedCount`, `uploadUtil`, `reviewWait`, `reviewerUtil1`, `reviewerUtil2` (Timeseries) |

**Parameters and their sources** (`SIM/referenceQueueingModel.m:57-70`, all labelled assumptions in the code):

| Parameter | Value | Where it lands in the .slx |
|---|---|---|
| annualPatients / workingDaysPerYear / workingHoursPerDay | 100000 / 250 / 8 | mean inter-arrival 72 s |
| imageSizeMB, bandwidthMbps | 4, `[0.5 1 2 5]` | `meanUploadSecs = mean((imageSizeMB*8)./bandwidthMbps)` = 29.6 s (`buildDistrictScreeningModel.m:118`) |
| numPhcs | 10 | Network Upload `Capacity=10` (pooled, **not** per-PHC) |
| tierFractions | `[0.70 0.20 0.10]` | GenerateAction thresholds |
| reviewSecondsB / reviewSecondsC | 30 / 240 | Reviewer ServiceTimeAction |
| numOphthalmologists | 2 | two capacity-1 servers (SimEvents allows preemption only on a single server) |
| simDays, rngSeed | 20, 42 | StopTime; the reference model seed |

- **Outputs:** Tier-A cleared count, reviewed count, upload utilisation, mean review wait, and per-reviewer utilisation. These are returned as a struct by `runDistrictScreeningModel.m:58-66`.
- **Run time:** "Ran live: 49 s" (commit `431bc82`). The README says "about 49 s per run, of which 31 s is the simulation itself". Both are **DOC-ONLY**: there's no result file, and it can't be run here.
- **Where results are stored:** `simulink-model/out/last-validation.json` (`central-system/backend/services/simulinkValidation.js:51-53`). **That file doesn't exist on this machine, and neither does `out/`.**
- **v4 check:** v4 §7 says network transmission is "a bandwidth-constrained queue across good/poor/very-poor connectivity tiers". The `.slx` uses **one pooled server with a single mean (29.6 s)**. The per-tier bandwidth sampling exists only in the pure-MATLAB reference model → **V4-MISSING (partial)** in the `.slx`. Tier-C preemption of Tier B: present ✔.

### 2.2 `simulink-model/netraSetuPipeline.slx`: full, watchable pipeline (CODE-VERIFIED, **BEYOND-V4**)

- **Built by:** `SIM/buildFullPipelineModel.m` (git `28dd289`, 2026-09-21). 179,255 bytes. `PreLoadFcn = buildFullEntityBus;` (Bus `DRCaseFull`).
- **StopTime** `57600` s = `simDays 2` × 8 h (`buildFullPipelineModel.m:71`, defaults at `:97-124`).
- **What it simulates:** arrival → capture plus up to 3 retakes (folded into service time) → quality verdict (abandoned if still unusable) → PHC sync queue → district link (switchable outage) → grading server with failure/retry → tier triage → 2 preemptive reviewers → referral + SMS or clear.

| Block | Type | Key parameters |
|---|---|---|
| Patient Arrivals | EntityGenerator | `TimeSource=Signal port` (rate from "Mean Arrival Secs" `Value=72` → IAT MATLAB Function) |
| Capture Queue | Queue | `Capacity=200` |
| Quality Gate | EntityServer | `Capacity=10`, `dt = 90 * (1 + entity.retakes);` |
| Quality Verdict | EntityOutputSwitch | attribute `qc` → Abandoned Captures |
| Sync Queue | Queue | `Capacity=5000` |
| Network Upload | EntityServer | `Capacity=10`, `ServiceTimeSource=Signal port` ("Upload Time" function; "Network link" toggle) |
| Grading Queue → Grading Server | Queue / EntityServer | `Capacity=5000` / `Capacity=2`, service from a signal ("Grading Time"; "Grading available" toggle) |
| Grading Outcome → Retry Decision | EntityOutputSwitch | attributes `failed`, `route` → Failed Cases |
| Tier Triage | EntityOutputSwitch | attribute `prio`, 3 outputs |
| Review Queue | Queue | `Capacity=5000`, `QueueType=Priority`, `prio` Descending |
| Reviewer 1/2 | EntityServer | `Capacity=1`, preemption on `prio`, residual resume; `ServiceCompleteAction: if entity.prio >= 3 refer=1; elseif rand() < 0.300000 refer=1; else refer=2` |
| Referral Decision | EntityOutputSwitch | → "Referred + SMS" / "Cleared by Reviewer" |
| Live controls | SliderBlock ×2, ToggleSwitchBlock ×2 | "Patients per hour" `30–600`; "Review speed" `0.25–3`; "Network link"; "Grading available" |
| Dashboard | DisplayBlock ×7, DashboardScope ×2, CircularGaugeBlock ×2, LampBlock ×2 | backlog counters, queue-over-time scopes, link/grading gauges, reviewer-busy lamps |
| Random sources | UniformRandomNumber ×4 | seeds 8148 / 1270 / 9134 / 9058, `SampleTime=1` |

**Parameter sources** (`buildFullPipelineModel.m:97-160` + `simulink-model/calibration.json`, produced by `scripts/exportSimCalibration.js`, `generatedAt 2026-09-20T19:27:07.781Z`):

| Parameter | Value used | Source label in calibration.json |
|---|---|---|
| gradingSeconds | 21 | `measured` (n: null) |
| qualityPassRate | 0.9166666666666666 | `measured`, n = 24 (overrides the 0.885 default) |
| tierFractions | `[0.7, 0.2, 0.1]` | `assumed`. The observed `[0.03389830508474576, 0.8135593220338984, 0.15254237288135594]` (n = 59) is **deliberately not used**, because the corpus is disease-enriched IDRiD |
| gradingFailureRate | 0.05 (code default) | the measured `0.5299145299145299` (n = 117) is deliberately not used (`:146-150`) |
| reviewSecondsB / C, numPhcs, numOphthalmologists, hours/day | 30 / 240, 10, 2, 8 | `assumed` |
| referableFraction | 0.30 | code default |

- **Outputs:** live counters and scopes. `runFullPipelineModel('Show',false)` returns the numbers headless.
- **Run time** ("~20 s compiling … eight-hour clinic day in about 7 s, roughly 4,000x real time"), the outage result ("81 cases sit in the PHC queue") and the 4-hour split ("122 auto-cleared, 31 referred, 24 cleared") are from `simulink-model/README.md` and commit `28dd289` → **DOC-ONLY**.
- **Dashboard:** this model **does not feed the dashboard**. No backend or frontend code references `netraSetuPipeline` or `runFullPipelineModel` (grep over `*.js/*.jsx/*.ts/*.tsx/*.sql`). It's a demo/PS-requirement-5 artifact.

### 2.3 How the models feed the dashboard (actual wiring)

```
daily 02:30 (RESOURCE_MODEL_CRON)                      weekly Sun 03:00 (SIMULINK_VALIDATION_CRON)
resourceRecommendations.js                             simulinkValidation.js
  matlab -batch referenceQueueingModel('recommend',…)    matlab -batch runDistrictScreeningModel()
  (PURE MATLAB — no Simulink)                            (the .slx + the reference model on same params)
        │                                                        │
        ▼                                                        ▼
  Postgres resource_recommendations                     simulink-model/out/last-validation.json
  (migration 0008)                                      + system_alerts 'simulink_model_diverged'
        │                                                        │
GET /api/v1/admin/resource-recommendations        GET /api/v1/admin/simulink-validation
(404 until first run)                             (404 until first run)
        └───────────────┬────────────────────────────────────────┘
                        ▼
   central-system/frontend/.../ResourceRecommendationsPanel.jsx
```

- **Code wiring:** CODE-VERIFIED. See `central-system/backend/server.js:156,159`, `routes/adminDashboard.js:67-123`, `services/resourceRecommendations.js:44,113-129`, and `services/simulinkValidation.js:57,71-92`.
- **Inputs to the daily run:** it pulls the observed tier mix (≥30 graded cases in 90 days), the PHC count and the ophthalmologist count from the DB (`resourceRecommendations.js:53-103`). Everything else uses model defaults. The row stores `inputs_source`.
- **The dashboard headline recommendation comes from the pure-MATLAB reference model, not from Simulink.** The `.slx` is the validator. v4 §5.4/§7 ("Simulink Integration runs the resource-allocation simulation on a schedule") → **V4-MISSING (partial)**: the scheduled simulation is the reference model. The weekly `.slx` validation is **BEYOND-V4**.
- **Live DB (queried 2026-09-25):** `SELECT count(*) FROM resource_recommendations` = **0**. `system_alerts` has **no** Simulink/MATLAB rows. So neither job has recorded a result in the current database, which was restored from a 2026-09-24 dump (`docs/changelog-2026-09-24-mobile-sync-auth.md` §9.2).
- **MOCK in the panel:**
  - `central-system/frontend/src/config.js` defaults `USE_MOCK_DATA` to **true** when `VITE_USE_MOCK_DATA` is unset. No frontend `.env` exists.
  - Even in real mode, `centralApiClient.js:268-330` falls back to mock on **any** error, including the backend's intentional 404s. With 0 rows and no `last-validation.json`, **the panel currently always shows `mockResourceRecommendations` / `mockSimulinkValidation`** (`api/mockData.js:280-339`).
  - Those mocks carry numbers found nowhere else: reviewer utilisation 74.2 / 72.0, a fourth check "Queue buffer p95 depth", and `inputsSource` "observed: 43 graded cases".
  - The success toasts are hardcoded: `ResourceRecommendationsPanel.jsx:34` says "(2.0s run time)" and `:48` says "status: AGREE" regardless of the real result.
  - **Don't screenshot this panel for the PPT as evidence.** It also violates v4 §1.22 ("a failure never gets to look like a success").

### 2.4 Weekly self-validation loop

| Item | Value | Evidence |
|---|---|---|
| Scheduler | `node-cron`, `SIMULINK_VALIDATION_CRON` default `'0 3 * * 0'` (Sunday 03:00), `SIMULINK_VALIDATION_ENABLED` default on, timeout 20 min | `simulinkValidation.js:56-57,65-68,175-190` · CODE-VERIFIED |
| What runs | `matlab -batch "addpath(...); r = runDistrictScreeningModel(); disp(jsonencodeAscii(r));"`. The `.slx` is loaded read-only and closed without saving (`runDistrictScreeningModel.m:35-36`) | CODE-VERIFIED |
| What is compared | SimEvents vs `referenceQueueingModel('run', p)` on identical `defaults` | `runDistrictScreeningModel.m:29,78` |
| Check 1 | auto-clear share, tolerance **5** (percentage points) | `:102-103` |
| Check 2 | reviewer utilisation, tolerance **10** (percentage points) | `:104-105` |
| Check 3 | mean review wait, tolerance **5** min | `:106` |
| Not compared | upload figures (pooled vs per-PHC queues differ by construction) | `:96-99` |
| Verdict | `agree` → resolve alert; `diverged` or `error` → raise `simulink_model_diverged` on System Health. `error` is never recorded as a pass | `simulinkValidation.js:130-160` |
| On-demand | `POST /api/v1/admin/simulink-validation/refresh` | `adminDashboard.js:115-123` |
| **Last run result** | **None recorded on this machine.** There is no `simulink-model/out/last-validation.json` and no alert row | checked 2026-09-25 |
| Last result anywhere | 2026-09-08: "auto-clear 71.0% vs 68.4%, reviewer util 20.0% vs 22.2%, review wait 0.1 min vs 0.2 min", all agree (commit `66638bb`). 2026-09-20: "Ran live: 49 s, all three metrics agree" (commit `431bc82`) | **DOC-ONLY** (commit messages; no result file) |
| **Risk** | Simulink/SimEvents aren't installed here, so if the backend runs on this laptop over a Sunday 03:00, the job will write `status: "error"` and raise the alert | inferred from `simulinkValidation.js:130-139` + §0 |

---

## 3. Figures and exported images usable in the PPT

| Asset | Path | Produced by | Notes |
|---|---|---|---|
| District SimEvents model diagram (thumbnail) | `docs/ppt-audit/assets/districtScreeningSimEvents_thumbnail.png` (extracted from the `.slx` zip, `metadata/thumbnail.png`) | Simulink (save) | 500×500. The whole block chain (Patient Arrivals → Upload Queue → Network Upload → Tier Triage → Review Queue → Reviewer 1/2 → Reviewed) is legible. Usable as-is on a small slide |
| Full pipeline model diagram (thumbnail) | `docs/ppt-audit/assets/netraSetuPipeline_thumbnail.png` | Simulink (save) | 500×500, **too small to read**. Re-export on a Simulink machine |
| Pipeline/architecture diagrams | `docs/diagram-pipeline-layers.svg`, `docs/diagram-phc-central-architecture.svg` | Not MATLAB | For context only |
| Grad-CAM overlays | `central-system/backend/media/cases/<caseId>/gradcam.png` (36 files, all dated 2026-09-10) | **Can't tell which backend made them.** `gradCam.m` (MATLAB) and `inference/gradcam.py` (Python) both write this filename | Don't caption as "MATLAB Grad-CAM" without regenerating under the MATLAB backend |
| `diagnostics/out/gradcam_IDRiD_*.png`, `messidor2_sanity_montage.png`, `ml-pipeline/test_output_*.png` | as named | Python scripts (`test_preprocessing.py`, `messidor2ShiftStressTest.py`) | **Not MATLAB output** |
| Clinical-rationale PDF | — | `generateReport.m` | **None exists in the repo.** Generate one: `GET /api/v1/cases/:id/report` on a graded case |
| `.fig` files, `print -s…` exports, scope screenshots | — | — | **None found** |

To produce PPT-grade Simulink images on a machine with Simulink:
```matlab
load_system('simulink-model/districtScreeningSimEvents.slx');
print('-sdistrictScreeningSimEvents', '-dpng', '-r300', 'district_model.png');
load_system('simulink-model/netraSetuPipeline.slx');
print('-snetraSetuPipeline', '-dpng', '-r300', 'full_pipeline.png');
% then runFullPipelineModel() from the desktop (-r, not -batch) and screenshot the dashboard mid-run
```

---

## 4. MATLAB Compiler artifacts

| Component | Entry point | Build script | Assets bundled (`-a`) | Artifact in repo? | Used in production? | Tag |
|---|---|---|---|---|---|---|
| PHC quality gate | `QG/qualityGateCli.m` → `qualityGateMain.m` | `QG/buildQualityGateExe.m:80-115` (`mcc -m … -o qualityGate -d dist -a cameraPresets.json -v`) | `QG/cameraPresets.json` | **No.** `QG/dist/` is empty | **No.** `QUALITY_GATE_EXE` isn't set in any `.env`, so `qualityGateClient.js:75-80` uses `matlab -batch` instead | CODE-VERIFIED (code) / **V4-MISSING** (v4 §4.2 says the gate is "packaged via MATLAB Compiler + MATLAB Runtime") |
| Central case chain (rule engine, camera check, evidence text) | `ML/deploy/netraSetuCaseMain.m` | `ML/deploy/buildCaseChain.m('case')` | `calibrationProfiles.json`, `calibration_v1.json`, `rule_thresholds_red_v2.json` | **No** (`deploy/dist/` is gitignored and absent) | **No** | CODE-VERIFIED / **BEYOND-V4** (v4 §1.20/§17 call central packaging "unstarted") |
| Central inference (networks) | `ML/deploy/netraSetuInferMain.m` (`%#function` pragmas, `ctfroot` lookup `:150-151`) | `ML/deploy/buildCaseChain.m('infer')` | `branchA_v1.mat`, `calibration_v1.json`, `vessel_unet_v1.mat`, `localization_v1.mat`, `bright_lesion_unet_v1.mat` + `models/+<net>/` layer packages + the ONNX support-package folder | **No** | **No** | CODE-VERIFIED / BEYOND-V4 |

**Build history:**

- Quality gate: "qualityGate.exe (1.37 MB) was produced and executed end to end … 2026-09-09" (`buildQualityGateExe.m:9-12`, a code comment), with the timing "~9.1 s per call via matlab -batch against ~4.6 s via the exe" (`:38-41`). Both are **DOC-ONLY** (code comment, no artifact).
- Quality gate rebuild on this machine (2026-09-24): **not finished**. Build 1 failed at runtime init, build 2 failed dependency analysis, build 3 was stopped for low memory (`docs/changelog-2026-09-24-mobile-sync-auth.md` §9.1).
- Central chain: "case chain … compiles to 1.3 MB", "249 MB" dist, "Compiled Branch A matches MATLAB and Python exactly (grade 3, conf 0.821636)" (commit `a1b6fbb`, `docs/backend-plan-status.md:170`) → **DOC-ONLY**.
- **The compiled inference target packages `branchA_v1`, but the live default is `branchA_v2c`** (`branchAInferMatlab.m:112`). A compiled build today would ship a different model from the one being demoed.

**Runtime needs:**

- The free **MATLAB Runtime R2026a** (`mclmcrrt26_1.dll`; locate the installer with `mcrinstaller`). On this machine the exes need `D:\runtime\win64` on PATH.
- "It has NOT been run on a machine without MATLAB" and "The MATLAB Runtime R2026a has not been installed anywhere" (`buildQualityGateExe.m:14-24`).
- The inference target also needs the ONNX converter's `nnet.onnx.layer.*` classes inside the archive (`buildCaseChain.m:79-92`).

---

## 5. How the PyTorch models get into MATLAB

### 5.1 Import path (CODE-VERIFIED)

1. **Train in PyTorch:** Kaggle notebooks `ML/training/train_classifier_kaggle.ipynb`, `train_classifier_kaggle_v2.ipynb`; `train_red_lesion_unet.py`, `train_red_lesion_unet_v2.py`, `train_vessel_unet.py`.
2. **Export ONNX:** `ML/training/export_to_onnx.py:162-166` (`torch.onnx.export(..., opset_version=17, do_constant_folding=True, dynamic_axes=batch, dynamo=False)`); also `ML/inference/exportOnnx.py:74` (opset from `--opset`).
3. **Import:** `importNetworkFromONNX(file, 'InputDataFormats', {'BCSS'})` (`importModels.m:42-141`, `importBranchAV2.m:39`). The unsupported ONNX ops are auto-generated as custom-layer packages: `ML/models/+branchA_v1|v2a|v2b|v2c/ReduceMeanLayer1000-1015.m` and `ML/models/+vessel_unet_v1|localization_v1|bright_lesion_unet_v1|red_lesion_unet_v1|v2/Shape_To_ResizeLayer1000-1004.m`, plus `+ops/` helpers.
4. **Branch A only:** `dropoutLayer(0.3,'Name','dropout_dr')` is added before the head (`importModels.m:46`, `importBranchAV2.m:42`), then `initialize`, then `save` to `ML/models/<name>.mat`.
5. **The ONNX support package must be on the path before `load()`**, or the nets deserialize broken with no error (`ML/inference/ensureOnnxSupportOnPath.m`; `runMatlabInferenceSession.m:73-77`).
6. **Live preprocessing stays in Python.** `preprocessBranchATensor.py` writes a `.mat` tensor, and MATLAB only runs the forward pass, temperature/softmax, `conformalTiering`, and Grad-CAM (`branchAInferMatlab.m:25-40, 286-313`).

Nine networks are imported as `.mat`: `branchA_v1`, `branchA_v2a`, `branchA_v2b`, `branchA_v2c`, `vessel_unet_v1`, `localization_v1`, `bright_lesion_unet_v1`, `red_lesion_unet_v1`, `red_lesion_unet_v2` (`ML/models/`).

### 5.2 Parity checks: PyTorch vs imported MATLAB `dlnetwork` (CODE-VERIFIED, result files)

Inputs and reference outputs are in `ML/training/parity_data/<model>_input.mat` / `_torch_output.mat` (made by `prepare_parity_inputs.py`). There are 10 real images per model, and the threshold is `max|diff| ≤ 0.01` (`ML/training/parityCheck.m:19`).

| Model | Overall max\|diff\| | Grade/argmax agreement | Report file (timestamp) |
|---|---|---|---|
| branchA_v1 | 0.000002 | — | `ML/diagnostics/out/parity_v1_report.txt` (2026-09-20 01:03:03) |
| vessel_unet_v1 | 0.000023 | — | same |
| localization_v1 | 0.000002 | — | same |
| bright_lesion_unet_v1 | 0.000040 | — | same |
| red_lesion_unet_v1 | 0.000017 | — | same ("All 5 models within parity threshold.") |
| branchA_v2a | 0.000001 | 10/10 (100.0%) | `parity_v2a_report.txt` (2026-09-20 12:14:48) |
| branchA_v2b | 0.000001 | 10/10 (100.0%) | `parity_v2b_report.txt` (2026-09-21 19:38:39) |
| **branchA_v2c (live default)** | **0.000001** | **10/10 (100.0%)** | `parity_v2c_report.txt` (2026-09-21 20:02:45) |
| red_lesion_unet_v2 | 0.000014 (softmax) | MA and HE connected-component counts agree exactly on all 10 images (IDRiD_163–172); floors MA ≥ 5 px, HE ≥ 10 px | `parity_red_v2_report.txt` |

**Segmentation backend parity, end to end** (`ML/diagnostics/out/seg_backend_parity.txt` + `.csv`, made by `diagnostics/checkSegBackendParity.py`, 20 IDRiD test images, 4 per grade 0–4):

- MATLAB actually served all three nets on **19/20** images.
- Optic-disc position identical **20/20** (max shift 0.0 px). Fovea identical **20/20** (max shift 0.0 px).
- Vessel pixel count identical **17/20** (max |diff| 1 px).
- Red per-quadrant counts identical **20/20**. Bright per-quadrant counts identical **20/20**.
- **Rule-engine grade identical 20/20.**
- Mean `segInfer` wall time: Python backend **21.40 s/image**, MATLAB backend **22.54 s/image**. Both include a fresh Python start and the PyTorch M5 load.

**Compiled-exe parity:** "grade 3, conf 0.821636" → **DOC-ONLY** (§4).

### 5.3 Why the MATLAB preprocessing port was dropped (CODE-VERIFIED, from a code comment)

`branchAInferMatlab.m:28-32`: "a real, measured residual (SSIM 0.981, not 1.0 …) … large enough to flip the predicted grade on 1/10 and the conformal tier on 2/10 real images, even though the imported network matched Python to 2e-6 given IDENTICAL input". There's no standalone result file for 1/10 and 2/10. The 2e-6 figure matches `parity_v1_report.txt` (0.000002).

### 5.4 Live MATLAB session evidence (CODE-VERIFIED, log file)

`ML/inference/matlabSession/session.log` (live, appended while the backend runs; snapshot **2026-09-25 13:10:03**):

- 4 session starts (2026-09-18 11:01, 2026-09-24 17:10, 2026-09-24 18:29, 2026-09-25 13:04). Each loads `branchA_v1`, `vessel_unet_v1`, `localization_v1`, `bright_lesion_unet_v1`, `red_lesion_unet_v1`, then a warm-up. Load plus warm-up took 29–33 s per start. Branch A requests load the selected version (`branchA_v2c` by default) on first use (`branchAInferMatlab.m:169-199`).
- **0 FAILED requests.**

| Request type | n | min ms | median ms | max ms |
|---|---|---|---|---|
| branchA (classifier + calibration + tier + Grad-CAM) | 28 | 273 | 902 | 16174 |
| seg: localization_v1 | 23 | 629 | 695 | 1920 |
| seg: vessel_unet_v1 | 23 | 539 | 720 | 1159 |
| seg: bright_lesion_unet_v1 | 23 | 432 | 565 | 2289 |
| casePipeline (rule engine, camera, NV, attention, evidence, urgency) | 23 | 489 | 1389 | 14707 |
| report (PDF) | 0 | — | — | — |

These numbers are **live and will change**, so re-snapshot before the PPT freeze.

The latency comparisons in comments and docs are **DOC-ONLY**: there's no result file from `ML/experiments/measureInferenceLatency.js` or `compareInferenceBackends.js`. They are "mean 3.3s/image … vs python's 6.3s" (`gradingOrchestrator.js`, comment at `:174`) and "`matlab -batch` cold-starts in ~24s" (`matlabSession/README.md:3-4`).

---

## 6. Where MATLAB is the runtime in production vs. offline only

### 6.1 LIVE (per case / per request in the running product)

| Where | What MATLAB runs | Process model | Fallback if MATLAB is missing | Evidence |
|---|---|---|---|---|
| **PHC desktop quality gate** | `qualityGateMain.m` (IPT: focus, FOV, illumination, glare/motion/occlusion) | `matlab -batch` per capture (exe path supported but unset) | JS reimplementation `qualityGateFallback.js`, only on ENOENT, on by default unless `QUALITY_GATE_ALLOW_FALLBACK=0` (`qualityGateClient.js:63,224-229`) | CODE-VERIFIED |
| **Central Branch A** | ONNX-imported `branchA_v2c` `predict`, temperature scaling, `conformalTiering`, referable flag, `gradCam.m` | persistent session (`runMatlabInferenceSession.m`), file request/response, heartbeat every 5 s | **None by design.** It fails as `matlab_session_unavailable`. The manual switch is `INFERENCE_BACKEND=python` | CODE-VERIFIED + `session.log` |
| **Central segmentation forward passes** | `vessel_unet_v1`, `localization_v1`, `bright_lesion_unet_v1` | same session (`seg` requests) | Python `segInfer.py`. The **red-lesion model stays on PyTorch** either way (`runMatlabInferenceSession.m:156-163`) | CODE-VERIFIED |
| **Central case pipeline** | `runCasePipeline.m`: `readFundusImage` (Medical Imaging for DICOM), `classifyCameraFamily` (IPT), `neovascularizationSuspicion` (IPT), `ruleEngineGrade` + `branchesAgree` (base), `lesionAttentionConsistency`, `generateEvidenceReport` (text only), `calculateUrgencyScore` (Stats TreeBagger, stored only) | same session (`casePipeline` requests) | JS port of the rule engine/agreement/evidence (`services/matlabFallback.js`), only on ENOENT, `MATLAB_ALLOW_FALLBACK` default on (`gradingOrchestrator.js:79`) | CODE-VERIFIED |
| **Clinical-rationale PDF** | `generateReport.m` (`mlreportgen.dom`) | session, else `matlab -batch` (`caseReport.js`) | none | CODE-VERIFIED code; **no PDF produced yet** |
| **Session supervision** | — | `matlabSessionSupervisor.js` watches the heartbeat and restarts the session | — | CODE-VERIFIED (in v4 §5.4/§10.7) |

### 6.2 SCHEDULED (production backend, background)

| Job | MATLAB runtime | Toolboxes | Status on this machine |
|---|---|---|---|
| Daily resource recommendation (02:30) | `matlab -batch referenceQueueingModel('recommend',…)` | base MATLAB only | Runnable. **0 rows stored so far** |
| Weekly SimEvents validation (Sun 03:00) | `matlab -batch runDistrictScreeningModel()` | Simulink + SimEvents | **Not runnable here**, and it would record `error` |

### 6.3 OFFLINE ONLY (dev/analysis tooling, never per case)

ONNX import and parity (`training/importModels*.m`, `parityCheck*.m`, `verify*Handoff.m`) · calibration fitting (`calibrateBranchA.m`, `fitTemperature.m` with `fminbnd`, `conformalCalibrate.m`) · rule-threshold refit (`optimizeRuleThresholds.m`: Stats + optional Global Opt + Parallel) · `runTask92.m` integrated-vs-baseline harness (writes `ML/experiments/comparison_task92_real.txt`) · MATLAB-native U-Net training (`trainVesselUnet.m`, no artifact) · retired MATLAB preprocessing port and Frangi/`imfindcircles` classical segmenters · `calibrateQualityThresholds.m` · `batchGenerateReports.m` · both `.slx` builders, `runFullPipelineModel.m`, `sweepDistrictScenarios.m` (`parsim`), `monteCarloQueueing.m` · both MATLAB Compiler build scripts.

### 6.4 Honest ceiling (unchanged from v4 §1.20/§17)

Production inference needs a **licensed MATLAB with Deep Learning Toolbox** on the central machine. No compiled artifact exists in the repo, and no Compiler-packaged path is wired into either backend.

---

## 7. v4 cross-check summary (MathWorks scope)

**BEYOND-V4** (in code, not in v4):

- `netraSetuPipeline.slx` (live, controllable full-pipeline model) and its calibration from measured data (`calibration.json`).
- The weekly scheduled `.slx` validation with a System Health alert (`simulinkValidation.js`).
- The central MATLAB Compiler trial build (`deploy/buildCaseChain.m`, two targets). v4 calls this unstarted.
- Parallel Computing: `parsim` sweep, Monte-Carlo CIs, parallel threshold search and quality sweep, batch PDFs.
- Global Optimization solver support in `optimizeRuleThresholds.m` (optional; exhaustive is the default).
- The Statistics TreeBagger urgency score (live, stored, decides nothing, synthetic training data).
- The Statistics-based threshold refit (`perfcurve`, `bootci`, `cvpartition`) whose output file is read live.
- Medical Imaging Toolbox `medicalImage` for DICOM.
- The persistent MATLAB session also serving segmentation, the case pipeline and PDFs (v4 describes it for Branch A only).

**V4-MISSING** (in v4, not in code or not on the live path):

- **MC Dropout on the live (MATLAB) path:** `uncertaintyScore` is always null (`branchAInferMatlab.m:338-343`).
- **The quality gate packaged with MATLAB Compiler + Runtime** (v4 §4.2): no exe, `QUALITY_GATE_EXE` unset, 2026-09-24 rebuild unfinished.
- **Frangi vesselness complementing the U-Net** (v4 §6.5): the code exists but is never called live.
- **Bandwidth tiers in the `.slx`** (v4 §7): the `.slx` uses one pooled 29.6 s server. Tiers exist only in the pure-MATLAB reference model.
- **"Simulink Integration runs the resource-allocation simulation on a schedule"** (v4 §5.4): the scheduled simulation is the non-Simulink reference model. Simulink runs weekly only as a validator.
- **Resource Recommendations sourced from the model** (v4 §5.3): the UI shows **MOCK** data (0 DB rows, and the fallback turns every error into mock).

---

## 8. PPT-safe claims vs. do-not-claim

**Safe (backed by code plus a result or log file):**
- "Branch A and three segmentation U-Nets run inside MATLAB's Deep Learning Toolbox via ONNX import, in a persistent MATLAB session." (`session.log`, 0 failures)
- "PyTorch→MATLAB parity: max |diff| ≤ 0.000040 across 9 imported networks, with 10/10 grade agreement for each v2 classifier." (parity reports)
- "MATLAB and Python segmentation backends give the identical rule-engine grade on 20/20 IDRiD test images." (`seg_backend_parity.txt`)
- "The district SimEvents model has Tier-C preemption with resume, built entirely from a script." (`.slx` XML + builder)
- "Branch B thresholds were refit in MATLAB (Statistics & ML: `perfcurve`, `bootci`, `cvpartition`); held-out QWK 0.692 [0.559, 0.802]." (JSON result files)

**Say only with the qualifier:**
- Simulink run times, the validation agreement numbers, the parallel speed-ups and the Global Opt comparison: "measured on the developer machine (commit log)". No result file is committed.
- MATLAB Compiler: "packaging scripts exist and were trial-built", **not** "deployed without a MATLAB licence".

**Don't claim:**
- That the Resource Recommendations or Simulink Validation panel numbers are real. They're mock right now.
- That Global Optimization produced the deployed thresholds.
- That Computer Vision Toolbox or Optimization Toolbox is in the live pipeline.
- That the case-media Grad-CAM PNGs are MATLAB output, unless you regenerate them under the MATLAB backend.
