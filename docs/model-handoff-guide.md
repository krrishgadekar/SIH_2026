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

> **Correction (2026-09-18):** the delivered `branchA_v1.pt` did not arrive via
> the MATLAB/ResNet-50 route §0/§6 describe — it was trained in PyTorch
> (EfficientNet-B0) on Kaggle. §1's net contract and §2's preprocessing chain
> below have been corrected to match what that checkpoint actually expects:
> **384×384×3, ImageNet normalization, no CLAHE** — not the 512×512 /
> `benGrahamCrop→claheEnhance→illuminationNormalize` contract this guide
> originally specified. Source of truth: `preprocessing/preprocessModel1.m`
> (the executable port, with the empirical logit-reproduction evidence in its
> header) and `diagnostics/MODEL_INTERFACE_REFERENCE.md` ("Model 1"). §0 and
> §6 still describe the original MATLAB-native plan and were not updated —
> read them as historical intent, not as what was actually built.

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
| Input **384 × 384 × 3** | What `preprocessModel1.m` (the default `'model1'` recipe inside `preprocessForBranchA.m`) emits — **not** 512×512. See §2 |
| Normalized with **ImageNet mean/std** (`[0.485,0.456,0.406]` / `[0.229,0.224,0.225]`) after scaling to `[0,1]` — **no CLAHE** | What the checkpoint's own metadata (`normalize_mean`/`normalize_std`) and `identifyTrainingChain.py` confirm the model was actually trained on — see §2 |
| Output **1 × 5**, summing to 1 | Needs a terminal softmax. Without it `confidence_score` is not a probability and the Tier A/B/C thresholds are meaningless |
| Column *k* = grade *k−1* | See §3 |
| `dlnetwork`, `DAGNetwork` or `SeriesNetwork` | `classifyBranchA` handles all three |
| Contains a `dropoutLayer` | See §4 — decide this **before** training, not after |

---

## 2. The preprocessing chain — match it exactly

**This is the single highest-risk item in the handoff.**

**THE CHAIN CHANGED AGAIN on 2026-09-09**, a second time, for a different
reason than the paragraph below originally described: the delivered
`branchA_v1.pt` turned out to be trained on a **Python** chain
(`ben_graham.py`, no CLAHE, 384×384, ImageNet normalization) — not on the
richer MATLAB `benGrahamCrop → denoiseRetinal → adaptiveEnhance` sequence this
guide specified up front and this section used to describe. Training on one
chain and serving on the other is exactly the silent failure this whole
section exists to prevent, and it had actually happened.

There is still ONE function that defines the chain, and both sides call it —
that part of the design held up. What changed is which chain it runs by
default:

```matlab
addpath('central-system/backend/ml-pipeline/preprocessing');

preprocessed = preprocessForBranchA(img);        % default recipe: 'model1'
```

`gradingOrchestrator.js` calls the identical function at inference. **Do not
call the individual steps, and do not reimplement the sequence** — a
hand-written copy in two places is how the skew starts, and it has already
changed twice.

The default recipe (`opts.recipe = 'model1'`) is a port of the exact Python
training chain, implemented in `preprocessModel1.m`:

```
ben_graham_preprocess(img, 384)   ->   BGR->RGB   ->   ImageNet normalize
```

i.e. circular-crop to the retinal disc → resize to **384×384** (not 512) →
Ben Graham local-contrast boost (`4*img - 4*blur + 128`) → convert to RGB →
`(x/255 - mean) / std` with ImageNet's `mean=[0.485,0.456,0.406]`,
`std=[0.229,0.224,0.225]`. **No CLAHE, no denoising, no adaptive
enhancement, no camera-calibration correction** — none of those ran during
training, so applying any of them at inference makes a correct model perform
worse, not better.

This was established empirically, not assumed: `identifyTrainingChain.py`
replayed candidate chains against the checkpoint's own published test-split
logits (a fingerprint only the right preprocessing reproduces):

```
ben_graham only      mean |logit diff| 0.0050   class agreement 100.0%
ben_graham + CLAHE    mean |logit diff| 1.5861   class agreement  57.7%
```

That 100%-agreement, 0.0050-diff result is why `'model1'` is the default.
Full detail, including the MATLAB-port's own residual error against the
Python reference (2.98 grey levels / SSIM 0.981, attributable to
MATLAB-vs-OpenCV imaging-op differences, not the recipe), is in
`preprocessModel1.m`'s header and `diagnostics/MODEL_INTERFACE_REFERENCE.md`
("Model 1") — treat both as the source of truth over this guide.

The richer `benGrahamCrop → denoiseRetinal → adaptiveEnhance` sequence (§2's
original subject) still exists as `opts.recipe = 'legacy'`, targeting 512×512
with quality-score-adaptive CLAHE — it is real code, still used by the Phase 4
segmentation models, which we do control both sides of. It is simply **not**
what Branch A was trained on, so it must never be the recipe Branch A's input
goes through.

If you ever retrain Branch A on a different chain, update both
`preprocessModel1.m` and this section in the same commit — that is how this
mismatch happened the first time.

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
- [ ] Trained on `preprocessModel1.m`'s output — Ben Graham 384×384, ImageNet norm, no CLAHE (§2)
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
| Preprocessing you must match | `.../ml-pipeline/preprocessing/preprocessModel1.m` (the `'model1'` recipe — see §2) |
| Full, verified per-model interface spec | `.../ml-pipeline/diagnostics/MODEL_INTERFACE_REFERENCE.md` |
| Acceptance check | `.../ml-pipeline/training/verifyModelHandoff.m` |
| Stub generator (what exists now) | `.../ml-pipeline/training/createStubBranchA.m` |
