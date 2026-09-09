# Model interface contract

**Source:** transcribed from Tanuj's handover message, 2026-09-09. His own
`diagnostics/MODEL_INTERFACE_REFERENCE.md` is the authoritative version and is
**not yet pushed to this repo** — only `Model1/branchA_v1.pt` is here. When that
folder lands, reconcile this file against it and delete whichever copy is
redundant.

Recorded here because a preprocessing contract that lives only in a chat message
is a contract that gets reimplemented from memory. This project has already
measured what that costs: a CLAHE stage that training never used dropped Branch
A's agreement with its own published logits from 100% to 57.7%. A model only
ever sees what preprocessing hands it.

**None of this is verifiable from the checkpoints alone** — several fields are
absent from the files and were reverse-engineered (see M3). Treat every row as a
claim to be re-confirmed against ground truth when the checkpoint arrives, not
as something the file will tell you.

---

## The five checkpoints

| # | Model | Build | Input | Preprocessing | Normalization | Output |
|---|-------|-------|-------|---------------|---------------|--------|
| 1 | `branchA_v1.pt` classifier | `DRClassifier("efficientnet_b0", 5, 0.3)` (custom wrapper) | `(B,3,384,384)` | Ben Graham 384 → RGB | ImageNet | `(B,5)` logits, argmax = grade 0–4 |
| 2 | `vessel_unet_v1.pt` | `smp.Unet("resnet34", None, 1, 1, None)` | `(B,1,512,512)` | green channel → aspect-resize + **center zero-pad** to 512 | `(x−0.5)/0.5` | `(B,1,512,512)` logits, sigmoid > 0.5 |
| 3 | `localization_v1.pt` | `smp.Unet("resnet18", None, 3, 2, None)` | `(B,3,512,512)` | **plain resize** to 512 (squished, no crop, no Ben Graham) | ImageNet | `(B,2,512,512)`; argmax ch0 = optic disc, ch1 = fovea, coords in 512-space (`×W/512`, `×H/512`) |
| 4 | `bright_lesion_unet_v1.pt` | `smp.Unet("resnet34", None, 3, 1, None)` | `(B,3,512,512)` | Ben Graham 512 → RGB | `(x−0.5)/0.5` **not ImageNet** | `(B,1,512,512)` logits, sigmoid > 0.5; **caller must zero a disc r≈58 around the OD** |
| 5 | `red_lesion_unet_v1.pt` | `smp.Unet("resnet34", None, 3, 1, None)` | `(B,3,512,512)` | Ben Graham 512 → RGB | `(x/255−0.5)/0.5` | `(B,1,512,512)` logits, sigmoid > 0.5 (MA ∪ HE fused) |

Only M1's recipe has been independently confirmed in this repo, by reproducing
its published logits to 0.0050 with 100% class agreement
(`identifyTrainingChain.py`). Rows 2–5 are unverified here.

---

## The traps

**Three normalizations, two geometry pipelines.** ImageNet for M1 and M3;
`(x−0.5)/0.5` for M2, M4, M5. Ben Graham crop+contrast for M1, M4, M5; plain or
padded resize for M2 and M3. There is no single "the preprocessing" — getting
the pair right per model is the whole job.

**M4's `encoder_weights: "imagenet"` is a decoy.** That field describes how the
encoder was *initialised*, not what normalization the input wants. Tanuj
resolved it by Dice against ground truth: Ben Graham + `(x−0.5)/0.5` → 0.49,
Ben Graham + ImageNet norm → 0.33, plain-resize variants → 0.06–0.08. Called
out as the single easiest thing here to get wrong, and note the failure mode —
ImageNet norm still produces a plausible-looking mask at 0.33 Dice. It degrades
quietly rather than erroring.

**M3 documents nothing about itself.** No `in_channels`, no normalization, no
preprocessing, no channel meanings in the checkpoint. Four facts you cannot
recover from the file — plain squished resize, ImageNet norm, ch0 = OD /
ch1 = fovea, output in 512-space — are reverse-engineered, corroborated by
~11–20 px OD error against IDRiD ground truth. It is also **resnet18**, not the
resnet34 used everywhere else.

**M1 is a wrapper, not `timm.create_model(num_classes=5)`.** Backbone built with
`drop_rate=0.0`, then an explicit `nn.Dropout(0.3)` module, then a fresh
`Linear`. That structure is deliberate: MC-Dropout (Task 6.1) needs a *module*
to toggle, and timm's own head dropout is functional and cannot be toggled.
Its `eval_tf` also carries a redundant `Resize((384,384))` after Ben Graham
already emits 384².

**M2 was trained on CHASE_DB1, not DRIVE**, on the single green channel, with
aspect-preserving resize + **center zero-pad** — not a plain resize. CHASE images
are near-square so the padding barely shows there. A real 3:2 fundus photograph
gets large black bands, and downstream code must reproduce that exact pad or the
model collapses. This is a train/serve skew waiting to happen on our data
specifically, because our images are not CHASE-shaped.

**M4 and M5 are patch-trained (256²) but full-image-inferred (512²).** M4's
OD-masking (`od_masking=True`, `od_mask_radius=58`) is trained-in behaviour that
**the model does not apply** — the caller must, using M3's OD centre. So M4
depends on M3: bright-lesion output is wrong until localization runs.

**M5's encoder is transfer-learned from M2**, not ImageNet (conv1 tiled 1→3 ch,
÷3). MA and HE are deliberately merged into one class, so the rule engine's
"red lesions" are a fused count and cannot be split back apart. IDRiD's official
segmentation split was discarded for a fresh 65/16 image-level split — which
means IDRiD segmentation images are **not** a clean held-out set for M5.

**`models/` paths are unstable** — an IDE keeps reorganising them into
`Model1/`, `red_lesion_predictions(model5)/` and similar. Resolve checkpoints by
recursive filename search, not by a hardcoded path.

---

## What this changed in our code

The rule-engine thresholds were recalibrated against real segmentation output on
14 validation images. See `../grading/ruleEngineGrade.m` — the reasoning, the
constants, and the n=2 caveat on `grade3QuadMin` are documented there rather
than repeated here.
