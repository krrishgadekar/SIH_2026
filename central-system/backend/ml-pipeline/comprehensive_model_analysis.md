# Comprehensive Model Analysis — M1 to M5

Diagnostic evaluation of all five PyTorch checkpoints against held-out ground
truth, with failure modes characterised and remediation instructions.

**Date:** 2026-09-18
**Models:** `branchA_v1.pt`, `vessel_unet_v1.pt`, `localization_v1.pt`,
`bright_lesion_unet_v1.pt`, `red_lesion_unet_v1.pt`
**Scripts:** `diagnostics/eval_m1_classifier.py`, `eval_m2_vessel.py`,
`eval_m3_localization.py`, `eval_m45_lesions.py`
**Raw metrics:** `diagnostics/out/m1_metrics.json`, `m2_metrics.json`,
`m3_metrics.json`, `m3_metrics_all.json`, `m45_metrics.json`

---

## 0. How to read this document

### 0.1 Every number here is from a held-out set, and that mattered

Four of the five models were trained on the datasets in `datasets/`. Scoring
them there without checking would have reported training error as accuracy.
The splits were recovered per model from the checkpoints' own artefacts:

| Model | Held-out set used | How it was identified | Contaminated alternative |
|---|---|---|---|
| M1 | 628 images (550 APTOS + 78 IDRiD) | `branchA_v1_test_ids.npy` | 354 IDRiD grading images on disk |
| M2 | DRIVE (20), CHASE (28) | M2 trained on CHASE; DRIVE fully unseen | — |
| M3 | 77 of 78 images | `localization_test_predictions.csv` | 516 IDRiD localization images |
| M4 | 27 images (IDRiD_55–81) | M4 trained on the 54-image Training folder only | 81 pooled images |
| M5 | 16 images | `red_lesion_metrics.json` → `val_ids` | 81 pooled images |

**The gap between held-out and contaminated numbers is itself a finding.** M1
scores QWK 0.9167 with grade-4 recall 0.81 on IDRiD images it trained on, and
QWK 0.8242 with grade-4 recall 0.30 on IDRiD images it did not. Anyone quoting
the first number is quoting memorisation.

### 0.2 The preprocessing chains were verified before anything was measured

A mismatched chain produces plausible, wrong numbers. Each model's recipe was
confirmed against an artefact the training run recorded:

| Model | Check | Result |
|---|---|---|
| M1 | our logits vs `branchA_v1_test_logits.npy` | **52/52 argmax agree**, mean max abs logit diff 0.0090 |
| M3 | 512-space error vs `best_val_pixel_error` = 5.65 px | ours 5.26 px on the full set |
| M5 | per-image Dice vs `per_image_val_dice_at_best` | **mean abs diff 0.0002** |

M2's and M4's chains are taken from `segInfer.py`, which documents M2's as
100.000% exact against published CHASE masks. M4's has no recorded artefact to
reproduce (see §5.1).

---

## 1. Executive summary

| # | Model | Held-out headline | Verdict |
|---|---|---|---|
| M1 | Classifier | QWK **0.8688**, referable Se **0.860** | Systematically under-grades PDR. **Ship-blocking for grade 4.** |
| M2 | Vessel | Dice **0.8136** (convention-matched) | **Healthy.** The reported "domain shift" was a measurement artefact. |
| M3 | Localization | Disc 98.7% within 1R, fovea 96.1% | Rare but catastrophic fovea failure. **Fully detectable — fix is cheap.** |
| M4 | Bright lesion | Dice **0.6676** vs hard exudates | Blind to soft exudates. Optic-disc hypothesis refuted. |
| M5 | Red lesion | Dice **0.6105**, MA detection **62.8%** | Misses small microaneurysms; compounded by the counting filter. |

### The five findings that change what you do

1. **M1 under-grades proliferative DR.** Grade-4 recall 0.444; mean signed
   error −0.889. Of 54 PDR cases, 30 were downgraded and 5 fell below the
   referral threshold entirely. This is the only ship-blocking defect. (§2.2)
2. **M2 is not broken, and the earlier domain-shift diagnosis was wrong.**
   Excluding DRIVE's sub-2px ground truth restores Dice to 0.8136 vs CHASE's
   0.8024. The gap is an annotation-convention mismatch. Scale augmentation —
   the obvious fix — would do nothing, and this was tested in both
   directions. (§3.2)
3. **M3's fovea hallucination is perfectly separable by heatmap peak.**
   AUC 1.000 on the held-out set. A `peak < 0.40` gate catches 5/5 gross
   misses for 10 false alarms in 511 images. ~15 lines of code. (§4.3)
4. **M4 does not fire on the optic disc** — 2.1% of its false positives land
   there, against 2.14% of the frame, exactly the uniform rate. The `r=58`
   mask `segInfer.py` applies is worth +0.0032 Dice, not the large effect its
   comment claims. But M4 **is** blind to soft exudates (Dice 0.076). (§5.2)
5. **Microaneurysms are lost twice.** M5 detects 53.8% of sub-10px MAs, and
   `segInfer.py`'s `--min-area 10` then discards 41.4% of the components it
   did predict. 67.6% of true MAs are below that filter. (§6.3)

---

## 2. M1 — Branch A classifier (`branchA_v1.pt`)

EfficientNet-B0, 5-class, 384px, ben_graham preprocessing. Trained on 2,924
pooled APTOS + IDRiD images.

### 2.1 Held-out performance (628 images)

```
QWK 0.8688   Exact accuracy 0.7404   Within-1-grade 0.9506

CONFUSION MATRIX (rows = true, cols = predicted)
                       0     1     2     3     4   total
  0 No DR            288     5     3     0     0     296
  1 Mild NPDR          6    35    17     1     1      60
  2 Moderate NPDR      7    24    93    46     5     175
  3 Severe NPDR        1     1     0    25    16      43
  4 Proliferative DR   1     4     7    18    24      54
```

| Grade | n | Recall | Precision | F1 | Mean signed error |
|---|---|---|---|---|---|
| 0 No DR | 296 | 0.9730 | 0.9505 | 0.9616 | +0.037 |
| 1 Mild NPDR | 60 | 0.5833 | 0.5072 | 0.5426 | +0.267 |
| 2 Moderate NPDR | 175 | 0.5314 | 0.7750 | 0.6305 | +0.103 |
| 3 Severe NPDR | 43 | 0.5814 | 0.2778 | 0.3759 | +0.256 |
| **4 Proliferative DR** | **54** | **0.4444** | 0.5217 | 0.4800 | **−0.889** |

Referable DR (grade ≥ 2): **Se 0.8603, Sp 0.9382** — 38 of 272 referable
cases missed (14.0%).

### 2.2 FLAW — asymmetric failure on proliferative DR ▲ SHIP-BLOCKING

Grade 4 is the only class with a large negative mean signed error (−0.889);
every other class is positive. The model over-grades mild disease and
under-grades the most severe.

Where the 54 true PDR cases went:

```
predicted 0 (No DR)            :  1   <- NOT REFERABLE
predicted 1 (Mild NPDR)        :  4   <- NOT REFERABLE
predicted 2 (Moderate NPDR)    :  7
predicted 3 (Severe NPDR)      : 18
predicted 4 (Proliferative DR) : 24   <- correct
```

**Why it happens.** PDR's defining features are neovascularisation and
pre-retinal/vitreous haemorrhage — thin, low-contrast vascular structures.
Grade 3 and grade 4 share almost all their *lesion* appearance; what separates
them is vessel morphology. At 384px after ben_graham's contrast step, fine
neovascular fronds are close to unresolvable. The model therefore defaults to
the feature-rich neighbouring class. The 18 cases sent to grade 3 are
consistent with exactly this: it sees severe disease and stops one step short.

Class weighting does not compensate. `class_weights` gives grade 4 a weight of
2.34 against grade 3's 2.92 — grade 4 is weighted *less* than grade 3 despite
being rarer in `train_grade_counts` (250 vs 200 — grade 3 is actually rarer,
so the weighting is internally consistent but does not target the confusion).

**Severity.** 5 of 54 PDR cases (9.3%) were graded below the referral
threshold. In a screening deployment these patients are sent home. PDR is
sight-threatening within months.

**Fix — in priority order:**

1. **Raise input resolution for the 3-vs-4 boundary.** 384px is the binding
   constraint. Retrain at 512px or 640px and re-measure grade-4 recall
   specifically. Expect the largest single gain here.
2. **Add an ordinal or cost-sensitive loss.** Replace plain cross-entropy with
   a cost matrix that charges under-grading more than over-grading — e.g.
   penalty ∝ `(true − pred)²` when `pred < true`, and `0.5 × (pred − true)²`
   otherwise. QWK is already the selection metric; align the training loss
   with it.
3. **Re-weight grade 4 explicitly.** Set its class weight above grade 3's, and
   validate on grade-4 recall rather than pooled QWK, which is insensitive to
   54 images in 628.
4. **Interim mitigation, deployable now.** Any case with `P(grade 3) +
   P(grade 4) > 0.5` should be routed to the referable pathway regardless of
   argmax. This costs specificity and recovers most of the 5 missed referrals
   without retraining. Implement in `branchAInfer.assign_tier`.

### 2.3 FLAW — grade 1 collapses on IDRiD

On the IDRiD subset of the held-out split, grade-1 recall is **0.000** (0 of 4;
0 of 3 on the re-run subset). Grade 1 is the rarest class in training (276 of
2,924). On APTOS it holds 0.625.

Mild NPDR is defined by microaneurysms alone — the same structures M5 also
misses (§6.3). The two failures have a common cause: small, low-contrast
lesions. **Fix:** same resolution increase as §2.2; additionally consider
feeding M5's microaneurysm count into the grade-0-vs-1 decision, which the
rule engine is already positioned to do.

### 2.4 Domain gap: APTOS vs IDRiD

| Subset | n | QWK | Exact acc | Grade-4 recall |
|---|---|---|---|---|
| APTOS | 550 | 0.8727 | 0.7691 | 0.4773 |
| IDRiD | 78 | 0.8242 | 0.5385 | 0.3000 |

Exact accuracy drops 23 points on IDRiD while QWK drops only 5 — the errors
stay close to the diagonal but land off it far more often. IDRiD is the
higher-resolution, clinically-graded set and is closer to this pipeline's
deployment distribution. **Report IDRiD numbers, not pooled ones, in any
clinical claim.**

### 2.5 Contamination check — the cost of quoting the wrong number

| Set | QWK | Grade-4 recall | Referable Se |
|---|---|---|---|
| IDRiD held-out (78) | 0.8242 | 0.3000 | 0.8776 |
| **IDRiD all on disk (354), contaminated** | **0.9167** | **0.8065** | **0.9211** |

Grade-4 recall differs by a factor of 2.7 between images M1 trained on and
images it did not. Do not publish the second row.

> **Data gap:** the grading Training folder on this machine holds IDRiD_163–413
> only; 162 images are absent. 26 of M1's 78 held-out IDRiD ids could not be
> scored from pixels for this reason. The published-logits analysis (§2.1) is
> unaffected — it needs no images.

---

## 3. M2 — Vessel segmentation (`vessel_unet_v1.pt`)

U-Net/ResNet-34, **1-channel** (green), PAD-512. Trained on CHASE_DB1.
Checkpoint `best_val_dice` 0.7771.

### 3.1 Measured performance

| Set | Dice | Sensitivity | Specificity | Precision |
|---|---|---|---|---|
| CHASE_DB1 (in-domain, 28) | 0.8024 | 0.7987 | 0.9857 | — |
| DRIVE (unseen, 20, in FOV) | 0.6186 | 0.4629 | 0.9952 | 0.9321 |

### 3.2 CORRECTION — the domain-shift diagnosis was wrong

An earlier session attributed the DRIVE drop to resolution: DRIVE images being
smaller, their vessels reaching the model too thin. **That was tested and is
false.** It is corrected here because it would have sent the team to the wrong
fix.

The aspect-pad normalises everything to 512 regardless of input size, and the
arithmetic runs the *opposite* way: DRIVE at 565px wide scales ×0.88 to reach
512, CHASE at 999px scales ×0.51. A DRIVE vessel arrives **wider** than a
CHASE one.

Both directions were tested:

| Experiment | Dice | Sensitivity |
|---|---|---|
| CHASE native | 0.8024 | 0.7987 |
| CHASE downscaled to DRIVE size | 0.7965 | 0.7850 |
| DRIVE native | 0.6186 | 0.4629 |
| DRIVE upscaled to CHASE size | 0.6180 | 0.4622 |

Downscaling CHASE costs 0.0059 Dice — **3.2% of the 0.1838 gap**. Upscaling
DRIVE changes nothing (0.6180 vs 0.6186). **Scale is not the cause, and scale
augmentation would not help.**

### 3.3 The actual cause — annotation convention

| | CHASE_DB1 | DRIVE |
|---|---|---|
| Vessel pixels, % of FOV | 6.93% | **12.54%** |
| GT with half-width ≤1px | 29.5% | **51.1%** |
| Green channel mean / sd | 41.80 / 35.76 | 97.27 / 20.22 |

DRIVE's annotators marked **1.8× more vessel**, and half of it is
single-pixel-wide capillaries. M2 was trained to CHASE's sparser convention.

Treating DRIVE's thinnest GT as don't-care — neither a miss nor a false
positive — approximates CHASE's convention:

| DRIVE variant | Dice | Se | Precision |
|---|---|---|---|
| All GT (as scored) | 0.6186 | 0.4629 | 0.9321 |
| Intensity-matched to CHASE | 0.6373 | 0.5437 | 0.7699 |
| **Thinnest GT as don't-care** | **0.8136** | **0.7330** | 0.9142 |
| *CHASE in-domain reference* | *0.8024* | *0.7987* | — |

**0.8136 vs 0.8024 — M2 performs at full training-domain level.** Recall by
vessel calibre confirms the mechanism: on DRIVE, recall is 0.203 for ≤1px
vessels and 0.943 at 3–4px.

### 3.4 What is genuinely wrong with M2

Two real, smaller issues remain:

1. **No input standardisation.** M2 normalises with a fixed
   `(x/255 − 0.5)/0.5`. CHASE's green channel has mean 41.8 / sd 35.8; DRIVE's
   97.3 / 20.2. Matching them lifted sensitivity 0.463 → 0.544 — a real gain,
   though it cost precision (0.932 → 0.770).
2. **Threshold 0.5 is miscalibrated off-domain.** On CHASE, 0.5 is optimal
   (Dice 0.8024). On DRIVE, 0.10 is optimal (0.7427 vs 0.6186) — a free
   +0.124 Dice with no retraining.

**Fix:**

1. **Do not add scale augmentation.** Tested; ineffective.
2. **Add per-image intensity standardisation** to the M2 preprocessing path in
   `segInfer._aspect_pad`'s caller: standardise the green channel within the
   FOV to a fixed mean/sd before `(x/255−0.5)/0.5`. Re-verify against the
   published CHASE masks afterwards — `segInfer.py` records 100.000% exact
   agreement today and that check must still pass.
3. **Make the threshold a per-domain parameter**, not the hardcoded `0.5` in
   `segInfer.vessels`. Fit it per camera during calibration.
4. **If DRIVE-convention thin vessels are clinically required**, fine-tune on
   DRIVE — this is a relabelling problem, not an architecture problem.
5. **Stop quoting the 0.6186 figure** as M2's DRIVE performance without the
   convention caveat. It understates the model by ~0.19 Dice.

---

## 4. M3 — Optic disc / fovea localization (`localization_v1.pt`)

U-Net/ResNet-18, 3-channel, SQUISH-512 with INTER_AREA, 2 output heatmaps.
Checkpoint `best_val_pixel_error` 5.65 px (512-space).

### 4.1 Held-out performance (77 images)

| | Optic Disc | Fovea |
|---|---|---|
| Mean error | 26.91 px | **85.56 px** |
| Median | 21.22 px | 31.21 px |
| Std | 37.26 px | **276.69 px** |
| Max | 330.1 px | **1848.4 px** |
| Mean/median ratio | 1.27 | **2.74** |
| Within 1R | 98.70% | 96.10% |

Images are 4288×2848. R = optic disc radius ≈ 0.0655 × width.

### 4.2 FLAW — fovea hallucination

Gross misses (> 2R, i.e. more than one disc diameter):

- **Optic disc: 0 of 77.** The disc head is rock solid.
- **Fovea: 2 of 77 (2.6%) held-out; 5 of 516 (1.0%) overall.**

**52% of the reported mean error comes from 2.6% of images.** Excluding them,
mean fovea error drops 85.56 → 41.20 px. The mean was describing the outliers,
not the model.

```
id           split    err px      R    peak   pred DD sep
IDRiD_102    test     2196.4   7.82   0.082      6.29
IDRiD_053    test     2129.5   7.58   0.088      2.64
IDRiD_077    train    1848.4   6.58   0.090      2.41
IDRiD_224    train    1649.6   5.87   0.140      0.53
IDRiD_022    train     707.5   2.52   0.364      3.30
```

**Mechanism.** 3 of the 5 land within 8px of the frame edge (IDRiD_102 at
(510,507) — 1px from the corner). Combined with peaks of 0.08–0.14 against a
healthy 5th-percentile of 0.560, these are not confusions with another
anatomical structure. **The heatmap has no real peak and `argmax` is picking
noise.** The fovea is a low-contrast depression with no edges; when the model
has no evidence, it outputs a near-flat plane.

**Why this matters more than the numbers suggest.**
`segInfer.quadrant_counts` builds the quadrant axis from the fovea→disc
vector. A fovea 6R out rotates that axis arbitrarily. The ICDR rule engine
grades on quadrant counts, so the output is a **wrong grade, not a failure**.
`segInfer` guards the degenerate disc≈fovea case; a confidently-wrong fovea
passes that guard untouched.

### 4.3 The failure is perfectly detectable ◆ HIGHEST-VALUE FIX

Three candidate inference-time signals were scored as detectors:

| Detector | AUC (held-out) | AUC (all 516) | Cost to catch every gross miss |
|---|---|---|---|
| **Heatmap peak** | **1.000** | **0.996** | **9 false alarms / 511 (1.8%)** |
| Peak − mean (margin) | 1.000 | 0.996 | 9 / 511 (1.8%) |
| Disc–fovea distance (anatomy) | 0.573 | 0.883 | 283 / 511 (55.4%) |

Peak separates the failures almost perfectly. Gross misses span 0.082–0.364;
healthy predictions have a 5th percentile of 0.560.

Operating points on all 516 images:

| Threshold | Gross caught | Gross missed | False alarms |
|---|---|---|---|
| 0.10 | 3/5 | 2 | 0 |
| 0.15 | 4/5 | 1 | 2 |
| 0.30 | 4/5 | 1 | 6 |
| **0.40** | **5/5** | **0** | **10** |
| 0.50 | 5/5 | 0 | 20 |

**Fix — implement this first; it is the cheapest large win in the system:**

1. **Add peak-confidence thresholding to `segInfer.localize`.** Return the
   per-landmark peak (already computed — it is in the output payload as
   `"peak"`) and flag `fovea.peak < 0.40`.
2. **On a flagged fovea, do not compute quadrant counts.** Fall back to the
   image-axis convention `segInfer.quadrant_counts` already implements for the
   degenerate case, and set a `foveaUnreliable: true` field in the JSON so the
   evidence report and the conformal tiering can see it. A flagged case should
   route to Tier C (human review), not silently grade.
3. **Do not use the anatomical disc–fovea distance as the gate.** AUC 0.573
   held-out; it would flag 55% of good images. It is a reasonable *secondary*
   assertion — true separation is 2.33 DD (5th–95th: 2.09–2.57) — but not a
   primary detector.
4. **Longer term:** train with an explicit "no confident fovea" output, or add
   soft-argmax plus a peak-sharpness penalty so the model is trained to be
   uncertain rather than arbitrary.

### 4.4 Non-issue: the optic disc

Zero gross misses in 516 images, 98.7% within 1R, and the 512-space error
(4.07 px) is below the checkpoint's recorded 5.65 px. **No action needed.**

---

## 5. M4 — Bright lesion segmentation (`bright_lesion_unet_v1.pt`)

U-Net/ResNet-34, 3-channel, CROP-512, `(x/255−0.5)/0.5`. Trained on the
54-image IDRiD Training folder (43 train / 11 val). **The 27-image Testing
folder was never seen and is used here.**

### 5.1 FLAW — M4 only detects hard exudates

The checkpoint says "bright lesion" without naming its ground truth. All three
candidate targets were scored (27 held-out images):

| Candidate GT | Dice | Sensitivity | Precision |
|---|---|---|---|
| **EX (hard exudates)** | **0.6676** | 0.7232 | 0.6199 |
| SE (soft exudates) | **0.0757** | 0.3020 | 0.0433 |
| EX ∪ SE (union) | 0.6630 | 0.6629 | 0.6631 |

**M4's target is hard exudates alone.** Against soft exudates it scores Dice
0.076 with precision 0.043 — it is not detecting them at all.

This is a naming defect with clinical consequence. "Bright lesion" in the
pipeline reads as *all* bright lesions. Soft exudates (cotton-wool spots) are
a distinct entity and a sign of retinal ischaemia contributing to severe
NPDR assessment. Anything consuming M4's mask as "bright lesions" is
systematically missing them.

Held-out performance vs its real target:

```
Dice (pooled) 0.6676   Se 0.7232   Sp 0.9939   Precision 0.6199
per-image Dice 0.5356 +/- 0.1720
worst: IDRiD_70 (0.1442), IDRiD_68 (0.2405), IDRiD_80 (0.2857),
       IDRiD_57 (0.2882), IDRiD_73 (0.3065)
```

**Fix:**

1. **Rename the model and its output field** to `hard_exudate`, throughout
   `segInfer.py`, the JSON payload, and the evidence report. The current name
   asserts a capability the model does not have.
2. **Decide explicitly whether soft exudates are in scope.** If they are,
   train a separate head or a 2-class model — IDRiD annotates SE separately
   and only 40 of 81 images have any, so it needs its own sampling strategy.
   If they are not, document the exclusion in the clinical claims.
3. Per-image Dice varies 0.14–0.83 (sd 0.172). Investigate IDRiD_70 and
   IDRiD_68 before tuning anything globally.

### 5.2 REFUTED — M4 does not mistake the optic disc for a lesion

`segInfer.py` states the disc "is bright and round and the bright-lesion model
fires on it, so without this every image gains a large false exudate exactly
where the disc is". **Measured against IDRiD's optic-disc annotation, this is
not happening:**

- False-positive pixels inside the annotated disc: **910 of 42,352 = 2.1%**
- The disc occupies **2.14%** of the frame
- → **1.0× the uniform rate.** No preferential firing whatsoever.
- Mean share of each disc marked as lesion: **0.5%**

The worst single case (IDRiD_60) has 5.3% of its disc marked — 382 pixels.

What the masking is actually worth:

| Mask | Dice | Se | Precision |
|---|---|---|---|
| none | 0.6676 | 0.7232 | 0.6199 |
| r=40 | 0.6699 | 0.7232 | 0.6239 |
| **r=58 (shipped)** | **0.6708** | 0.7229 | 0.6257 |
| r=80 | 0.6701 | 0.7208 | 0.6261 |
| annotated disc | 0.6705 | 0.7232 | 0.6250 |

**r=58 gains +0.0032 Dice.** It is correctly chosen — it beats both larger and
smaller radii and even the exact annotation — but it is a marginal refinement,
not protection against a major failure mode.

**Action:** keep the mask (it is free and slightly positive), but **correct
the comment in `segInfer.py:lesions`**. The current text would lead someone to
believe removing the mask breaks the system, and to spend effort defending
against a failure mode that does not exist. The od_masking behaviour was
trained in (`od_masking: True` in the checkpoint), which is the most likely
reason the model already avoids the disc.

---

## 6. M5 — Red lesion segmentation (`red_lesion_unet_v1.pt`)

U-Net/ResNet-34, encoder transferred from M2's vessel encoder. Target is
**MA ∪ HE**, stated explicitly in the checkpoint. Held-out = the 16 recorded
`val_ids`. Recipe reproduces the recorded per-image Dice to **0.0002**.

### 6.1 Held-out performance (16 images)

```
Dice (pooled) 0.6105   Se 0.5697   Sp 0.9972   Precision 0.6577
per-image Dice 0.5351 +/- 0.1121
worst: IDRiD_37 (0.3733), IDRiD_58 (0.3805), IDRiD_78 (0.4003),
       IDRiD_66 (0.4286), IDRiD_64 (0.4772)
```

### 6.2 FLAW — microaneurysms are detected far worse than haemorrhages

Scoring M5's single output against each annotation separately:

| Target | Pixel Se | Pixel Dice | Per-lesion detection |
|---|---|---|---|
| Haemorrhages | 0.5757 | 0.5614 | **79.39%** (285/359) |
| **Microaneurysms** | 0.5414 | **0.1827** | **62.80%** (520/828) |

Per-lesion detection by area (512-space pixels, detection = any overlap):

| Area | Microaneurysms | Haemorrhages |
|---|---|---|
| 0–10 px | **53.75%** (301/560) | **34.48%** (10/29) |
| 10–25 px | 80.66% (196/243) | 77.66% (73/94) |
| 25–100 px | 92.00% (23/25) | 84.52% (131/155) |
| 100–500 px | — | 85.92% (61/71) |
| >500 px | — | 100.00% (10/10) |

**This is a size effect, not a lesion-type effect.** Detection rises
monotonically with area for both classes and is near-identical at matched
sizes (0–10px: 53.8% MA vs 34.5% HE; 10–25px: 80.7% vs 77.7%). MA scores worse
overall only because **67.6% of microaneurysms are under 10px** while
haemorrhages are mostly larger.

MA pixel Dice of 0.183 is much worse than its 53.8% detection rate implies:
the model finds roughly half the microaneurysms but delineates none of them
accurately — expected, since a 6-pixel lesion cannot survive a U-Net's
encoder-decoder downsampling with its boundary intact.

### 6.3 FLAW — the counting filter discards what M5 does find ▲ COMPOUND

`segInfer.py` defaults to `--min-area 10` (512-space). Measured on the 16
held-out images:

```
GT microaneurysm components          : 828
  of which < 10 px (below the filter): 560 (67.6%)
M5 predicted components, min_area=1  : 1005
M5 predicted components, min_area=10 :  589
counting loss from the >=10px filter : 41.4%
```

**Microaneurysms are lost twice.** M5 detects 53.8% of sub-10px MAs, and the
counting stage then discards 41.4% of all predicted components — concentrated
in exactly that size range. Effective end-to-end MA yield is far below the
62.8% detection figure.

This directly damages early-DR sensitivity. **Mild NPDR (grade 1) is defined
by microaneurysms alone** — and M1 independently scores 0.000 recall on grade 1
in IDRiD (§2.3). Both models fail on the same structures for the same reason.

**Critical constraint before anyone changes the filter:** `segInfer.py`
documents that `min_area=10` is not a free parameter — `redFloor` and
`grade3QuadMin` were calibrated against counts produced with this exact
filter, and it reproduces `diagnostics/check_agreement.py` 14/14. Changing it
silently rescales what those thresholds mean.

**Fix — in this order:**

1. **Do not change `--min-area` in isolation.** Changing it requires
   re-running `diagnostics/recalibrate_rule.py` to refit `redFloor` and
   `grade3QuadMin` against the new counts. Treat the filter and the thresholds
   as one unit.
2. **Split the filter by lesion class.** Haemorrhages are large and a 10px
   floor is reasonable noise suppression; microaneurysms are 3–8px and the
   floor removes signal. A single threshold cannot serve both. Recalibrate
   afterwards.
3. **Train M5 at higher effective resolution for small lesions.** Its 256px
   patch training is sound, but the decoder cannot recover sub-10px structures
   at 512 output. Options: a shallower U-Net, a higher-resolution output head,
   or a dedicated small-lesion detector operating on patches at native scale.
4. **Score M5 on per-lesion detection, not pixel Dice.** The rule engine counts
   lesions; pixel Dice at 0.183 for MA and a 53.8% detection rate describe very
   different capabilities, and only the second one predicts grading behaviour.
5. **Re-validate the whole chain on grade-1 cases specifically** once 1–4 land.

---

## 7. Prioritised remediation backlog

| # | Model | Action | Effort | Impact |
|---|---|---|---|---|
| 1 | M3 | Peak-confidence gate at 0.40 + Tier C routing | **~15 lines** | Eliminates silent wrong grades |
| 2 | M1 | `P(3)+P(4) > 0.5` → referable override | **~10 lines** | Recovers most of 5 missed PDR referrals |
| 3 | M4 | Rename to `hard_exudate` everywhere | Small | Removes a false capability claim |
| 4 | M4 | Correct the optic-disc comment in `segInfer.py` | Small | Prevents wasted effort on a non-issue |
| 5 | M2 | Per-domain threshold (0.10 on DRIVE-like) | Small | +0.124 Dice off-domain, no retraining |
| 6 | M5 | Class-split min-area + recalibrate rule engine | Medium | Recovers microaneurysm counts |
| 7 | M1 | Retrain at 512px with cost-sensitive loss | **Large** | The real fix for grade-4 recall |
| 8 | M2 | Per-image intensity standardisation | Medium | +0.08 sensitivity off-domain |
| 9 | M5 | Small-lesion architecture work | Large | Early-DR sensitivity |
| 10 | M4 | Decide and implement soft-exudate scope | Medium | Completes bright-lesion coverage |

Items 1–5 are deployable without retraining and address the two failure modes
that produce *silently wrong grades* rather than visible errors.

---

## 8. Things that are NOT wrong (verified, do not spend effort here)

- **M3's optic disc.** 0 gross misses in 516 images; beats its own recorded
  validation error.
- **M4 and the optic disc.** Measured at 1.0× the uniform false-positive rate.
  The `r=58` mask is correctly tuned; it is just worth little.
- **M2's architecture and scale handling.** Tested in both directions; it
  performs at training-domain level once annotation convention is matched.
- **Every preprocessing chain.** M1 reproduces published logits 52/52, M5
  reproduces per-image Dice to 0.0002, M3 to within 0.4 px of its recorded
  validation error.
- **M2's ONNX export** (from prior work): MAE 1.5e-06, 0 mask pixels changed.

---

## 9. Methodology notes and limitations

1. **Small held-out sets.** M5's is 16 images, M4's 27, M3's 77. Per-lesion
   counts are larger (828 MA, 359 HE) and support the size analysis, but
   image-level statistics carry wide error bars. Do not over-read a single
   worst-image ranking.
2. **M4's val split is unrecoverable.** `bright_lesion_final_metrics.json`
   records 43/11 with no ids. The 27-image Testing folder is used instead,
   which is strictly cleaner but not the split its 0.5831 `best_val_dice` was
   measured on — our 0.6676 and that number are not directly comparable.
3. **The optic-disc radius convention** (R = 0.0655 × image width) is a stated
   convention, not a per-image measurement. IDRiD annotates no disc diameter
   in the localization set. Within-R rates shift if a different R is assumed;
   the raw pixel errors do not.
4. **The "don't-care" analysis in §3.3** approximates CHASE's annotation
   convention by a distance-transform proxy. It demonstrates the mechanism
   convincingly but is not a substitute for re-annotating DRIVE to CHASE's
   protocol.
5. **162 grading images are missing** from this machine (IDRiD_001–162),
   limiting §2's pixel-level IDRiD analysis to 52 of 78 held-out ids.
6. **CHASE has no FOV mask**, so its specificity is computed over the whole
   frame while DRIVE's is computed inside the FOV. Dice — the metric the §3
   comparison rests on — is unaffected by true negatives, so the comparison
   holds; the specificity columns are not directly comparable.

---

## 10. Reproducing this analysis

```bash
cd diagnostics

python eval_m1_classifier.py --set all   --json out/m1_metrics.json
python eval_m2_vessel.py                 --json out/m2_metrics.json
python eval_m3_localization.py --set heldout --json out/m3_metrics.json
python eval_m3_localization.py --set all     --json out/m3_metrics_all.json
python eval_m45_lesions.py               --json out/m45_metrics.json
```

All scripts import their preprocessing from `inference/segInfer.py`,
`inference/branchAInfer.py` and `inference/verifyModel3.py` rather than
reimplementing it, so a change to a training chain propagates here
automatically. Every script prints which split it used and labels contaminated
figures on every line.
