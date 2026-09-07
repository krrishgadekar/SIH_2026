# Branch A Model — Training & Handoff Guide

**Audience:** whoever owns Tasks 2.2 / 2.3 (Branch A CNN training).
**Purpose:** make integration a file copy, not a debugging session.

Everything downstream of your model is already built and passing against an
untrained stub. The pipeline runs end to end today. The only thing missing is a
model whose weights mean something. If you follow the contract in §1–§3, handing
over is: copy one `.mat` file into `ml-pipeline/models/`, run one script, done —
**no code changes anywhere.**

The failure mode this guide exists to prevent is the quiet one: a model that
loads fine, returns correctly-shaped output, and is 20 points less accurate than
your validation run said, because inference sees different pixels than training
did. Read §2 even if you skip everything else.

---

## 0. Before you start: install the support package

```
Add-On Explorer -> "Deep Learning Toolbox Model for ResNet-50 Network"
```

Not installed on the current dev machine. Without it, `imagePretrainedNetwork("resnet50")`
errors, and the workaround (`Weights="none"`) gives you random weights — fine for
the stub that exists now, useless for you. **Transfer learning is the whole
plan**: ~4,178 images is far too few to train ResNet-50 from scratch to the
design doc's targets.

---

## 1. What you deliver

Three files into `central-system/backend/ml-pipeline/models/`:

| File | Contents | Consumed by |
|---|---|---|
| `branchA_v1.mat` | one variable, `net` | `grading/classifyBranchA.m` |
| `valLogits.mat` | one variable, `valLogits` — **N×5 double, raw pre-softmax logits** | `calibration/fitTemperature.m` |
| `valLabels.mat` | one variable, `valLabels` — **N×1 integer, values 0–4** | `calibration/fitTemperature.m` |

Plus, in a message rather than a file: your held-out **sensitivity and
specificity for referable DR (grade ≥ 2)**, and **quadratic-weighted kappa**.
These go into the `model_versions` table and become the bar any future retrained
model must clear before it can replace yours (design doc §1.8 — the validation
gate is non-negotiable).

### The `net` contract

| Requirement | Why |
|---|---|
| Variable is named exactly `net` | `classifyBranchA.m` does `load(path, 'net')` |
| Save **only** `net` | `save('branchA_v1.mat', 'net')`. Saving the workspace can drag training data in and produce a multi-GB file |
| Input **512 × 512 × 3** | What `benGrahamCrop` emits |
| Output **1 × 5**, summing to 1 | Needs a terminal softmax. Without it `confidence_score` is not a probability and the Tier A/B/C thresholds are meaningless |
| Column *k* = grade *k−1* | See §3 |
| `dlnetwork`, `DAGNetwork` or `SeriesNetwork` | `classifyBranchA` handles all three |
| Contains a `dropoutLayer` | See §4 — decide this **before** training, not after |

---

## 2. The preprocessing chain — match it exactly

**This is the single highest-risk item in the handoff.**

At inference, `gradingOrchestrator.js` runs precisely this, in this order:

```matlab
img          = imread(imagePath);
preprocessed = illuminationNormalize(claheEnhance(benGrahamCrop(img, 512)));
result       = classifyBranchA(preprocessed);
```

Your training images must go through **the same three functions, in the same
order, with the same parameters.** Call the real files in
`ml-pipeline/preprocessing/` — do not reimplement them in your training script,
and do not substitute a plain `imresize`.

```matlab
addpath('central-system/backend/ml-pipeline/preprocessing');

function out = preprocessForBranchA(img)
    out = illuminationNormalize(claheEnhance(benGrahamCrop(img, 512)));
end
```

What each does, so you can see why substituting is not safe:

- **`benGrahamCrop(img, 512)`** — detects the retinal disc (`gray > 15` +
  `imfill`), crops to its bounding box, resizes to 512, then subtracts a heavily
  blurred copy of itself and re-adds at mid-grey. This is a large local-contrast
  boost, not a resize. Images that skip it look nothing like images that got it.
- **`claheEnhance(img)`** — CLAHE on the LAB L channel only, `ClipLimit` 0.01.
- **`illuminationNormalize(img)`** — per-channel `imgaussfilt(·, 50)` background
  subtraction, re-added at midpoint 128.

If you train on raw resized images and inference feeds contrast-boosted
illumination-flattened ones, nothing errors. Accuracy just quietly collapses,
and it will look like a bad model rather than a preprocessing mismatch.

> **Cache the preprocessed images to disk once**, then train from that. The chain
> is slow, and re-running it every epoch wastes hours. Just make sure the cache is
> regenerated if anyone edits the preprocessing files.

---

## 3. Class ordering — the 0-vs-1 indexing trap

DR grades are **0–4**. MATLAB's `max()` returns a **1-based** index.
`classifyBranchA.m` bridges this with:

```matlab
[~, gradeIdx] = max(probs);
result.grade  = gradeIdx - 1;
```

So **output column 1 must be grade 0**, column 2 grade 1, and so on. If your
network's class order is anything else, every grade in the system is silently
wrong — and wrong in a way that still produces valid-looking 0–4 values, so
nothing downstream will catch it.

Verify explicitly before training:

```matlab
categories(imds.Labels)      % must print: '0' '1' '2' '3' '4', in that order
```

`imageDatastore` sorts categorical labels **as strings**. `'0'...'4'` sort
correctly. Labels like `'grade0'`, `'No_DR'`, `'Mild'` do not — if you use names
like that, set the order yourself:

```matlab
imds.Labels = categorical(rawLabels, {'0','1','2','3','4'});
```

---

## 4. Include a dropout layer — decide now, not later

Add a `dropoutLayer` before the final fully-connected layer:

```matlab
% ... backbone ...
dropoutLayer(0.3, 'Name', 'dropout_dr')
fullyConnectedLayer(5, 'Name', 'fc_dr')
softmaxLayer('Name', 'softmax_dr')
```

**Why it matters even though it seems like a Phase 6 problem:** Task 6.1
estimates uncertainty via MC Dropout — many forward passes with dropout forced
active, variance across them = `uncertainty_score`. With no dropout layer
anywhere, that is impossible.

And `uncertainty_score` is not optional decoration. The ophthalmologist queue
ranks **Tier C cases by uncertainty descending** (api-contracts.md). No dropout →
no uncertainty → the queue cannot rank the cases that most need a human.

Adding it later means a re-finetune. Adding it now costs one line.

---

## 5. Splits — you need three, not two

The plan says 70/15/15. Be aware that **two different later tasks both want
held-out data, and they must not share it**:

```
70%  train
15%  validation  ->  split again:
                       ~10%  temperature fitting (Task 2.5)  -> valLogits/valLabels
                       ~5%   conformal calibration (Task 6.2)
15%  test        ->  final reported metrics ONLY. Never fit anything on this.
```

Split stratified by label, **per dataset before merging** (`splitEachLabel(imds,
0.7, 0.15, 0.15, 'randomized')`), so IDRiD's smaller set keeps its proportions
rather than being swamped by APTOS.

If temperature and conformal calibration are fitted on the same rows, the
conformal coverage guarantee is optimistic and the Tier A auto-clear promise is
not backed by what it claims to be (design doc §16).

### Saving the logits

`fitTemperature.m` needs **raw pre-softmax logits**, not probabilities:

```matlab
% Capture activations at the FC layer, BEFORE softmax.
valLogits = predict(net, valImages, 'Outputs', 'fc_dr');   % N x 5
valLogits = double(gather(extractdata(valLogits)))';
valLabels = double(valImages.Labels) - 1;                  % categorical -> 0..4

save('valLogits.mat', 'valLogits');
save('valLabels.mat', 'valLabels');
```

Probabilities can be converted back to logits by `log()`, but only up to an
additive constant, and any class that saturated to exactly 0 becomes `-Inf`.
Save the real logits.

---

## 6. Training specifics (Task 2.2 / 2.3)

Per the implementation plan:

- **Datasets:** APTOS 2019 (`diagnosis` column, 0–4) + IDRiD grading subset
  (`Retinopathy grade` column, 0–4).
- **Class weights:** `classWeight = totalCount / (numClasses * countInClass)`.
  Grade 0 is roughly half of APTOS; unweighted, the model learns to always
  predict 0 and reports ~36% "accuracy".
- **Ordinal-aware loss.** Grades are ordinal — calling a grade 4 a grade 0 is far
  worse than calling it a grade 3, and plain cross-entropy treats those
  identically. Multiply the per-sample cross-entropy by
  `(1 + abs(predictedGrade - trueGrade))`, so a 4-grade error costs ~5× an
  adjacent-grade one.
- **Transfer learning:** ResNet-50 pretrained, replace the final FC for 5 classes,
  learning rate ~`1e-4`.

**Sanity floor:** held-out accuracy meaningfully above ~36% (always-predict-grade-0).
That is a floor for detecting a broken run, *not* a target. The real targets are
>90% sensitivity / >85% specificity for referable DR. For context, IDx-DR's FDA
pivotal trial hit 87.2% / 90.7% under far better-resourced conditions — so report
what you actually measure, with confidence intervals, and don't promise the
target in advance (design doc §16).

---

## 7. Confidence sanity

Check the confidence distribution across a handful of validation images before
handing over.

The current untrained stub returns **0.99999999 on every image**, which puts every
case in Tier A — and **Tier A auto-clears, skipping the ophthalmologist queue
entirely.** That is the most dangerous possible failure mode: it looks like a
confident, working system and it silently reviews nothing.

A trained model should show a *spread* — high confidence on clear grade-0 images,
lower on ambiguous ones. If yours is pinned near 1.0 everywhere:

- batch-norm statistics may not have actually been learned (check you fine-tuned
  rather than freezing everything);
- or you are feeding different preprocessing than you trained on (§2);
- or the loss collapsed to a single class (check the confusion matrix, not just
  accuracy).

Temperature scaling (§5) softens overconfidence, but it is a one-parameter
post-hoc fix. It cannot rescue a model that is saturated on every input.

---

## 8. Before you hand over: run the acceptance check

```bash
matlab -batch "cd('central-system/backend/ml-pipeline/training'); verifyModelHandoff('/path/to/your/branchA_v1.mat')"
```

It checks — against the *real* pipeline code, not a copy — the file layout, the
input/output contract, determinism, dropout presence, the full preprocessing
chain, `classifyBranchA`, and Grad-CAM. **HARD FAIL** means integration breaks.
**WARN** means it works but something downstream is degraded (most warnings cost
a retrain if deferred).

It does not overwrite your `models/branchA_v1.mat`; verification runs in place.

Running it against today's stub correctly reports the missing dropout layer — so
you can see what a warning looks like before you have your own model.

One check it deliberately cannot automate: it writes a Grad-CAM PNG and asks you
to **look at it**. Attention should sit on retinal structure — not spread evenly,
not clustered in the corners or the black border. Corner concentration usually
means the model latched onto a preprocessing artifact.

---

## 9. Handover checklist

- [ ] ResNet-50 support package installed; transfer learning, not scratch
- [ ] Trained on `benGrahamCrop` → `claheEnhance` → `illuminationNormalize` output (§2)
- [ ] `categories(imds.Labels)` verified as `'0'..'4'` in order (§3)
- [ ] `dropoutLayer` present before the final FC (§4)
- [ ] Three-way split; test split never fitted on (§5)
- [ ] `valLogits` are **pre-softmax**, N×5; `valLabels` are 0–4, N×1 (§5)
- [ ] Confidence spread checked, not saturated (§7)
- [ ] `verifyModelHandoff` passes with zero HARD FAILs (§8)
- [ ] Sensitivity / specificity (referable, grade ≥ 2) and quadratic kappa recorded
- [ ] Saved with `save('branchA_v1.mat', 'net')` — `net` only

---

## 10. What happens after you hand over

Backend side, for reference — you don't run these:

1. Copy the three `.mat` files into `ml-pipeline/models/`, replacing the stub.
2. Register the version — `grading_results.model_version` is a foreign key onto
   `model_versions`, so an unregistered model **fails loudly by design**:
   ```sql
   INSERT INTO model_versions
     (version_id, trained_at, validation_sensitivity, validation_specificity,
      validation_kappa, promoted, promoted_at)
   VALUES ('branchA_v2', now(), 0.91, 0.87, 0.82, true, now());
   ```
3. Fit the real temperature: remove the guard `error()` at the top of
   `fitTemperature.m` and run it. Overwrites the `T = 1` placeholder.
4. Re-run `node verify_task27.js` — expect meaningful numbers and a genuine
   spread of conformal tiers instead of everything landing in A.
5. Re-check the Grad-CAM heatmap for plausibility. That check was explicitly
   skipped against the stub because an untrained network's Grad-CAM is noise.

---

## Reference

| Thing | Where |
|---|---|
| Task 2.2 / 2.3 spec | `docs/implementation-plan-backend-ml.md` |
| Wire formats & enums | `docs/api-contracts.md` |
| Why two branches, tiers, honest limits | `docs/system-design-v3-final.md` §6.7, §6.8, §16 |
| Model inventory & swap-in path | `central-system/backend/ml-pipeline/models/README.md` |
| Inference wrapper you must match | `.../ml-pipeline/grading/classifyBranchA.m` |
| Preprocessing you must match | `.../ml-pipeline/preprocessing/` |
| Acceptance check | `.../ml-pipeline/training/verifyModelHandoff.m` |
| Stub generator (what exists now) | `.../ml-pipeline/training/createStubBranchA.m` |
