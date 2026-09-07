# ml-pipeline/models/

Trained MATLAB network weight files (`.mat`).

**All `.mat` files are git-ignored** (see the root `.gitignore`) — they run to
tens or hundreds of MB. Keep them in the team shared drive or object storage and
copy them here before running inference.

Because they are git-ignored, **cloning the repo does not give you a working
pipeline.** Nothing under `grading/`, `explainability/` or
`services/gradingOrchestrator.js` can run until `branchA_v1.mat` exists in this
directory. If it is missing, rebuild the stub:

```bash
matlab -batch "run('central-system/backend/ml-pipeline/training/createStubBranchA.m')"
```

---

## Model inventory

### `branchA_v1.mat` — **STUB, NOT TRAINED**

| Field | Value |
|---|---|
| Variable name inside `.mat` | `net` |
| Type | `dlnetwork` |
| Architecture | ResNet-50, final FC replaced for 5-class output |
| Terminal layer | `fc1000_softmax` (softmax) |
| Output | 1×5 probabilities, sums to 1 |
| Input size | 512 × 512 × 3 (`benGrahamCrop` → `claheEnhance` → `illuminationNormalize`) |
| Size on disk | ~90 MB |
| Built by | `training/createStubBranchA.m` |
| Trained by (eventually) | `training/trainBranchAClassifier.m` |

> [!CAUTION]
> **Random weights throughout. Every prediction from this file is noise.**
> Any grade, confidence or Grad-CAM heatmap produced while this stub is in place
> is meaningless. It exists so the surrounding plumbing — function signatures,
> `persistent` caching, the `.mat` layout, the orchestrator's DB writes — is
> buildable and testable before training finishes.

It is built with `imagePretrainedNetwork("resnet50", Weights="none", NumClasses=5)`.
`Weights="none"` gives the ResNet-50 *architecture* with random weights and does
**not** require the ResNet-50 pretrained support package, which is not installed
on the current dev machine. For a stub that is strictly better — the weights are
meant to be meaningless, and the layer graph, which is what the pipeline actually
exercises, is identical.

> [!IMPORTANT]
> **Whoever trains the real model needs the support package.** Task 2.2/2.3 does
> transfer learning, which needs the *pretrained* weights: install
> **"Deep Learning Toolbox Model for ResNet-50 Network"** via the Add-On Explorer
> first. Training from random initialisation on ~4k images will not reach the
> sensitivity/specificity targets in the design doc's validation plan.

**Swap-in path.** Overwrite this file with the real trained model. No code
changes anywhere, provided the real model also stores the network in a variable
named `net`, takes 512×512×3 input, and emits 5 probabilities summing to 1.
`classifyBranchA.m` resolves the path with a three-level fallback and caches via
`persistent net`; `gradCam.m` and `classifyBranchA.m` both carry an
`initialize()` guard for uninitialised `dlnetwork` objects, so either an
initialised or uninitialised save works.

After swapping it in, work through the integration checklist:

1. Confirm `classifyBranchA.m` needs no edit (verify, don't assume).
2. Run `calibration/fitTemperature.m` for real against the validation-split
   logits, replacing the `T = 1` placeholder below.
3. Re-run the Grad-CAM check and **this time actually evaluate heatmap
   plausibility** — not diffuse, not corner-concentrated. That check is
   meaningless against the stub and was explicitly skipped.
4. Re-run `node verify_task27.js` and confirm the numbers are now meaningful
   rather than stub noise.
5. Register the new version in the `model_versions` table before it grades
   anything — `grading_results.model_version` is a foreign key onto it, so an
   unregistered model fails loudly by design (design doc §1.8, §6.11).

---

### `temperature_v1.mat` — **PLACEHOLDER, T = 1**

| Field | Value |
|---|---|
| Variable name inside `.mat` | `T` |
| Current value | `1` (identity — no calibration effect) |
| Fitted by | `calibration/fitTemperature.m` |
| Applied by | `calibration/applyTemperature.m` |

`T = 1` makes `applyTemperature` a no-op, so the rest of the pipeline can call it
safely while waiting for a real fit. `fitTemperature.m` deliberately throws until
it is given `valLogits.mat` and `valLabels.mat` from the real trained model's
validation split — it will not silently produce a fake temperature.

---

### Not yet built

| File | Produced by | Phase |
|---|---|---|
| `vesselUnet_v1.mat` | `training/trainVesselUnet.m` | 4 |
| `lesionRedUnet_v1.mat` | `training/trainLesionUnets.m` | 4 |
| `lesionBrightUnet_v1.mat` | `training/trainLesionUnets.m` | 4 |
| `conformal_thresholds_v1.mat` | `calibration/conformalTiering.m` | 6 |
