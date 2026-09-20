# NetraSetu — Model Interface Reference

Verified 2026-09-10 by reading the training code directly (`train_classifier_kaggle.ipynb`,
`train_vessel_unet.py`, `train_red_lesion_unet.py`) and, for the two Kaggle-trained models
with no local script (localization, bright-lesion), by inspecting the checkpoint + sidecar
files and **empirically confirming preprocessing against ground truth** (probes in this folder's
history). Everything below is what the weights actually expect, not what a plan said.

> ⚠️ **`models/` layout is unstable.** An IDE is reorganising it into `Model1/`, `Model2/` …
> subfolders with parenthetical names (`models/vessel_predictions(Model2)/`,
> `models/red_lesion_predictions(model5)/`). Resolve every checkpoint with a recursive search
> for the filename, not a fixed path.

## Cross-cutting facts

| | |
|---|---|
| `torch.load` | pass `weights_only=False` (checkpoints carry non-tensor metadata) |
| seed | 42 everywhere |
| `preprocessing/ben_graham.py` | `ben_graham_preprocess(bgr_uint8, target_size) -> bgr_uint8 (target,target,3)`. Green-channel circular-crop → `cv2.resize(INTER_AREA)` → `addWeighted(img,4,blur,-4,128)` local-contrast. Callers convert **BGR→RGB** afterwards. |
| **normalization is NOT uniform** | ImageNet (M1, M3) · `(x−0.5)/0.5` on green channel (M2) · `(x/255−0.5)/0.5` on RGB (M4, M5) |
| **input pipeline is NOT uniform** | Ben Graham crop+contrast (M1, M4, M5) · aspect-preserve + center-pad, green channel (M2) · plain squished resize, no crop (M3) |
| all seg models | output **raw logits**, `activation=None`; apply `sigmoid` yourself |

---

## Model 1 — DR severity classifier  (`branchA_v1.pt`)

**Training code:** `training/train_classifier_kaggle.ipynb` (run on Kaggle T4). Local artifacts in `models/Model1/`.
**Task:** 5-class ICDR diabetic-retinopathy grade (0 none · 1 mild · 2 moderate · 3 severe · 4 proliferative) from a fundus photo. Trained on APTOS-2019 + IDRiD "Disease Grading" merged.

### Architecture — `DRClassifier` (custom wrapper, not a bare timm model)
```python
import timm, torch.nn as nn
class DRClassifier(nn.Module):
    def __init__(self, model_name, num_classes, drop_rate):
        super().__init__()
        self.backbone = timm.create_model(model_name, pretrained=False,
                                          num_classes=0, drop_rate=0.0)   # feature extractor, GAP-pooled
        self.drop = nn.Dropout(p=drop_rate)                               # explicit module (MC-Dropout)
        self.head = nn.Linear(self.backbone.num_features, num_classes)
    def forward(self, x):
        return self.head(self.drop(self.backbone(x)))
```
- `model_name="efficientnet_b0"`, `num_classes=5`, `drop_rate=0.3`, `num_features=1280`
- **4.01 M params.** `backbone(x)` returns pooled `(B, 1280)` features (timm `num_classes=0`).
- Load: `m = DRClassifier("efficientnet_b0", 5, 0.3); m.load_state_dict(ckpt["model_state_dict"])` → strict, 0 missing/unexpected.

### Input preprocessing (exactly `eval_tf` in the notebook)
1. `cv2.imread(path)` → BGR uint8
2. `ben_graham_preprocess(bgr, 384)` → BGR uint8 `(384,384,3)`
3. `cv2.cvtColor(..., COLOR_BGR2RGB)`
4. `PIL.Image.fromarray` → `torchvision.transforms`:
   `Resize((384,384))` *(no-op, already 384 — see deviations)* → `ToTensor()` (→ `[0,1]`, CHW) → `Normalize(mean=(0.485,0.456,0.406), std=(0.229,0.224,0.225))`  ← **ImageNet**
5. `x.unsqueeze(0)` → `(1, 3, 384, 384)` float32

### Output
`(B, 5)` **raw logits**. `logits.argmax(1)` = predicted grade. `softmax` for probabilities (uncalibrated — temperature-scaling planned separately using the saved `branchA_v1_val_logits.npy` / `_val_labels.npy`).
"Referable DR" convention used in training metrics = grade ≥ 2.

### MC-Dropout
`m.eval()` then flip only dropout to train: `for mod in m.modules():` `if isinstance(mod, nn.Dropout): mod.train()`. `m.drop` is the sole stochastic unit (backbone built `drop_rate=0.0`); BatchNorm stays frozen. ~0.01–0.015 per-class softmax std over repeated passes.

### Checkpoint keys
`model_state_dict, model_name, arch, num_classes, num_features, drop_rate, img_size(384), normalize_mean, normalize_std, channel_order("RGB"), preprocessing(str), class_weights[5], train_grade_counts, epoch(17), val_qwk(0.8825), seed(42)`

### Training facts / metrics
Split per-source stratified 70/15/15 (seed 42). Loss = inverse-frequency-weighted CE × `(1 + |pred−target|)` ("OrdinalWeightedCE"). AdamW lr 1e-4, wd 1e-5, cosine schedule, 30 epochs max, early-stop patience 7 on val QWK, AMP. Best epoch 17. **Val QWK 0.883 · Test QWK 0.869 · test referable sens 0.86 / spec 0.94.** Weights stored fp32.

### Deviations from a plain plan
- **Wrapper, not `timm.create_model(num_classes=5)`.** Deliberate: timm's EfficientNet head dropout is a functional `F.dropout` with no module, so MC-Dropout would find nothing. The wrapper zeroes backbone dropout and adds one real `nn.Dropout` module before a fresh `Linear`.
- `eval_tf` still contains `Resize((384,384))` even though Ben Graham already emits 384² — harmless no-op, but it means a caller who *skips* Ben Graham and feeds a raw image would get a plain squish-resize + ImageNet norm (wrong — no contrast enhancement).
- Trained with APTOS (`.png`, variable size) + IDRiD (`.jpg`, 4288×2848) mixed; Ben Graham's circular crop is what harmonises them.

---

## Model 1 v2a — DR severity classifier, 512px, 5-class head only  (`models/Model1/v2a/branchA_v2a.pt`)

**Training code:** `training/train_classifier_kaggle_v2.ipynb` (Kaggle, run tag `v2a`, `USE_EYEPACS=False`). Local artifacts in `models/Model1/v2a/`. Verified 2026-09-20 directly against the notebook (the source of truth for this model) and against real-image parity checks — see below, not inferred from the plan doc.

**Task:** same 5-class ICDR grade as v1. **A behind-a-switch upgrade candidate, NOT the default.** Selected via `BRANCH_A_MODEL_VERSION=branchA_v1|branchA_v2a` (env var, default `branchA_v1`), read independently by `inference/branchAInfer.py` and `inference/branchAInferMatlab.m`. `training/{export_to_onnx,importModels,parityCheckV2a,runParityCaptureV2a}` are the v2a-specific integration files; v1's own files are untouched by this integration.

### Architecture — `DRClassifierV2` (as trained, DUAL-head) vs. what actually ships (5-class only)
The trained checkpoint is dual-head:
```python
class DRClassifierV2(nn.Module):
    def __init__(self, model_name, num_classes, drop_rate):
        super().__init__()
        self.backbone = timm.create_model(model_name, pretrained=False, num_classes=0, drop_rate=0.0)
        self.dropout = nn.Dropout(drop_rate)
        self.head5   = nn.Linear(self.backbone.num_features, num_classes)   # 5-class ordinal grade
        self.headBin = nn.Linear(self.backbone.num_features, 1)            # binary referable (>=2)
    def forward(self, x):
        f = self.dropout(self.backbone(x))
        return self.head5(f), self.headBin(f)
```
`model_name="efficientnet_b0"`, `num_classes=5`, `drop_rate=0.3`, `num_features=1280` — same backbone choice as v1.

**This integration ships the 5-class head ONLY.** The binary head's conformal/deployment story is undecided (see `experiments/conformalPolicySweep.py`) and is out of scope here — every exported/imported/live-path artifact (`branchA_v2a.onnx`, `branchA_v2a.mat`, `branchAInfer.py`'s `BRANCH_A_MODEL_VERSION=branchA_v2a` path) drops `headBin` entirely and returns only `head5`'s output. The wrapper used for this (`DRClassifierV2Export` in `training/export_to_onnx.py`, reused by `prepare_parity_inputs.py` and by `branchAInfer.py`'s `load_model()` so there is one definition, not three) renames the checkpoint's `head5.*` to `head.*` and drops `headBin.*` before a `strict=True` load — deliberately using v1's own module names (`backbone`/`drop`/`head`) so the exported ONNX graph's node names are IDENTICAL to v1's (`x_backbone_global__2`, `x_head_Gemm`), which is what lets `importModels.m`'s v2a entry and `branchAInferMatlab.m` follow v1's pattern verbatim instead of re-deriving new node names.

### Input preprocessing (notebook cells 3/4/10/12 — the source of truth)
1. `cv2.imread(path)` → BGR uint8
2. `ben_graham_preprocess(bgr, 512)` → BGR uint8 `(512,512,3)` — **byte-identical function** to `preprocessing/ben_graham.py` / v1's own recipe, only `target_size` differs (384 → 512; the notebook's own inlined copy says so explicitly, and this was verified, not assumed)
3. `cv2.cvtColor(..., COLOR_BGR2RGB)`, cached as `.npy` (`_preprocess_and_cache`, cell 10)
4. `PIL.Image.fromarray` → `eval_tf`: `Resize((512,512))` *(no-op, already 512)* → `ToTensor()` (→ `[0,1]`, CHW) → `Normalize(mean=(0.485,0.456,0.406), std=(0.229,0.224,0.225))` ← **ImageNet, same as v1**
5. `x.unsqueeze(0)` → `(1, 3, 512, 512)` float32

Identical in kind to v1's chain, only the resolution differs — confirmed via checkpoint metadata (`img_size=512`, `channel_order="RGB"`, `normalize_mean/std`=ImageNet, `preprocessing`=`"ben_graham: circular crop -> resize -> gaussian-subtraction contrast"`) which `branchAInfer.py`'s existing `preprocess()`/`load_calibration()` already read dynamically from the checkpoint — no code there needed to change for the different resolution.

### Output
5-class raw logits (binary head dropped, see above). `logits.argmax(1)` = predicted grade. Referable convention: grade ≥ 2 (checkpoint's own `referable_from=2`), same as v1.

### Checkpoint keys
Same shape as v1's: `model_state_dict` (362 tensors: 360 backbone + `head5.{weight,bias}` + `headBin.{weight,bias}`), `model_name`, `arch`, `num_classes(5)`, `num_features(1280)`, `drop_rate(0.3)`, `img_size(512)`, `normalize_mean/std`, `channel_order("RGB")`, `preprocessing(str)`, `class_weights[5]`, `grade4_weight_boost(2.0)`, `train_grade_counts`, `epoch(22)`, `val_qwk(0.8947)`, `val_metrics`, `seed(42)`.

### Training facts / metrics (from `models/Model1/v2a/branchA_v2a_metrics.json`, post-hoc-verified in `experiments/evalV2aPostHoc.py` — reproduced exactly, zero mismatches)
APTOS+IDRiD only (`USE_EYEPACS=False`). Best epoch 22. **Test QWK (pooled) 0.873, IDRiD-only 0.810, APTOS-only 0.879.** Argmax-referable sens/spec (pooled) 0.901/0.938. Grade-4 recall (pooled) 0.537 (29/54); IDRiD-only 0.500 (5/10). The checkpoint's own `binary_head_spec` at its (buggy, since-fixed-elsewhere) locked threshold is near-zero and should be ignored — see `training/train_classifier_kaggle_v2.ipynb`'s threshold-lock cell fix and `experiments/evalV2aPostHoc.py`'s correctly-locked numbers (AUC 0.981) for the real picture of that head, not used by this integration regardless.

### Deviations / integration notes specific to v2a
- **ONNX export path differs from v1's:** `models/Model1/branchA_v2a.onnx`, not `training/onnx_out/branchA_v2a.onnx` — v1's other 4 models still export to `onnx_out/`, only this integration's own output path differs, by this task's own brief.
- **Calibration file is version-specific and does NOT exist yet:** `models/calibration_branchA_v2a.json` (never `calibration_v1.json` — two separate guards, filename AND an explicit `modelVersion` field check in both `branchAInfer.py` and `branchAInferMatlab.m`, refuse a cross-version file even if copy-pasted with the right name). Running `BRANCH_A_MODEL_VERSION=branchA_v2a` today reports `calibrated:false` / `UNCALIBRATED` — this is correct, expected behaviour, not a bug: the conformal policy for v2a is undecided (see `experiments/conformalPolicySweep.py`), and this integration deliberately does not generate one.
- **Parity, empirically verified 2026-09-20** (10 real IDRiD images, `training/parity_data/branchA_v2a_*`): onnxruntime vs PyTorch softmax max|diff| = 8.3e-7 (threshold 1e-4, `training/prepare_parity_inputs.py`); imported MATLAB dlnetwork vs PyTorch softmax max|diff| = 1e-6, argmax agreement 10/10 (threshold 0.01, `training/parityCheckV2a.m`, report captured to `diagnostics/out/parity_v2a_report.txt`); MATLAB-path vs Python-path (both via `BRANCH_A_MODEL_VERSION=branchA_v2a`, real images end-to-end) max|diff| = 1.5e-6, grade agreement 10/10.
- **Switching back to `branchA_v1` (including within the same persistent MATLAB session — `matlabSession/runMatlabInferenceSession.m`) was verified to reproduce v1's original calibrated behaviour** (`calibrated:true`, `temperature=1.531`, matching conformal tiers) on the same 10 images — the persistent-net caching in `branchAInferMatlab.m` is keyed by `BRANCH_A_MODEL_VERSION` specifically so a mid-session version switch reloads rather than silently keeps serving whichever model loaded first.
- Grad-CAM confirmed working at 512 through both backends (`backbone.bn2.act` is the same submodule path in both models — same backbone architecture — so `inference/gradcam.py`'s `TARGET_LAYER` needed no change).
- MC-Dropout: untested for v2a specifically in this integration (out of scope — no calibration/temperature exists yet to make an uncertainty score meaningful); the dropout module is found generically by type (`isinstance(mod, nn.Dropout)`), not by attribute name, so nothing architectural should block it, but this is not itself a verified claim.

---

## Model 2 — retinal vessel segmentation  (`vessel_unet_v1.pt`)

**Training code:** `training/train_vessel_unet.py` (local, CHASE_DB1). Artifacts in `models/vessel_predictions(Model2)/`.
**Task:** binary vessel map. CHASE_DB1 was used as a stand-in for DRIVE.

### Architecture
```python
import segmentation_models_pytorch as smp
m = smp.Unet(encoder_name="resnet34", encoder_weights=None,
             in_channels=1, classes=1, activation=None)
m.load_state_dict(ckpt["model_state_dict"])
```
- **24.43 M params.** ResNet34 U-Net, **single-channel input**. (Trained with `encoder_weights="imagenet"`; smp adapted the 3→1 channel stem, so at load time `encoder_weights=None` + state_dict is correct.)
- Checkpoint has **no `classes` / `architecture` / `activation` key** — you must know it's `smp.Unet(..., classes=1, activation=None)`.

### Input preprocessing (`load_image` in the script)
1. `cv2.imread` → BGR uint8
2. **green channel only**: `img[:, :, 1]` → `(H, W)` uint8
3. `resize_and_pad(green, 512, cv2.INTER_LINEAR)`: scale so **longest side = 512 preserving aspect ratio**, then **center-pad with zeros** to `512×512`. *(Not a plain resize. A 4288×2848 image becomes 512×340 content on a black 512×512 canvas.)*
4. `TF.to_tensor` → `(1,512,512)` float32 in `[0,1]`
5. `TF.normalize(mean=[0.5], std=[0.5])` → roughly `[-1,1]`   ← **not ImageNet**
6. `.unsqueeze(0)` → `(1, 1, 512, 512)`

Masks in training: `resize_and_pad(..., INTER_NEAREST)` then `> 127`.

### Output
`(B, 1, 512, 512)` raw logits → `torch.sigmoid` → threshold **0.5** → binary vessel mask, in the padded 512 frame. To map back, undo the pad/scale from step 3.

### Checkpoint keys
`model_state_dict, encoder("resnet34"), encoder_weights("imagenet"), input_size(512), in_channels(1), preprocessing("green_channel_aspect_ratio_resize_center_pad_512"), normalization("mean=0.5 std=0.5 max_pixel_value=255"), seed(42), best_epoch(56), best_val_dice(0.7771)`

### Training facts / metrics
CHASE_DB1 28 images, **subject-level** split 22 train / 6 val (11/3 subjects, seed 42) to avoid L/R-eye leakage. Loss = 0.5 Dice + 0.5 BCE-with-logits. Adam lr 1e-3, ReduceLROnPlateau, batch 4, 150 epochs max, ES patience 20. Augmentation was pure torchvision + scipy (albumentations avoided). **Best val Dice 0.777 (epoch 56).**

### Deviations from a plan
- **CHASE_DB1 substituted for DRIVE** (dataset availability). CHASE images are ~999×960 (near-square) so the center-pad barely triggers *there*; on a real 3:2 fundus photo it produces large black bands — downstream code must feed the same green-channel + aspect-pad pipeline or results collapse.
- Single **green channel**, `(x−0.5)/0.5` normalization — different from every other model here.
- This encoder is the initialisation source for Model 5.

---

## Model 3 — optic-disc & fovea localization  (`localization_v1.pt`)

**Training code:** none locally — trained on Kaggle. Artifacts in `models/Model3/` (`localization_v1.pt`, `localization_training_history.csv`, `localization_test_predictions.csv`). **Preprocessing below was reverse-engineered** and confirmed against IDRiD localization ground truth (mean error ≈ 11–20 px optic-disc, in 512-space).

### Architecture
```python
m = smp.Unet(encoder_name="resnet18", encoder_weights=None,
             in_channels=3, classes=2, activation=None)   # in_channels not in ckpt -> default 3
m.load_state_dict(ckpt["model_state_dict"])
```
- **14.33 M params.** ResNet18 U-Net (smaller encoder than the resnet34 used elsewhere), **2 output channels**.
- Checkpoint has **no** `in_channels`, `architecture`, `normalization`, `preprocessing`, or channel-meaning keys.

### Input preprocessing (reverse-engineered — verified)
1. `cv2.imread` → BGR → `cv2.cvtColor(BGR2RGB)`
2. **`cv2.resize(rgb, (512, 512))`** — plain resize, **aspect ratio NOT preserved, no cropping, no Ben Graham**
3. `/255.0`, then `(x − [0.485,0.456,0.406]) / [0.229,0.224,0.225])`  ← **ImageNet**
4. `transpose(2,0,1)`, `unsqueeze(0)` → `(1, 3, 512, 512)`

Feeding a Ben-Graham or aspect-padded image here **degrades it** — it was trained on the raw squished frame.

### Output
`(B, 2, 512, 512)` heatmaps (soft Gaussian blobs, training `sigma=15`). Post-process:
```python
hm = torch.sigmoid(model(x))[0].cpu().numpy()          # (2, 512, 512)
od_y,  od_x  = np.unravel_index(hm[0].argmax(), hm[0].shape)   # channel 0 = OPTIC DISC
fov_y, fov_x = np.unravel_index(hm[1].argmax(), hm[1].shape)   # channel 1 = FOVEA
```
Coordinates are in **512-space**. To original pixels: `x_orig = x_512 * W/512`, `y_orig = y_512 * H/512` (confirmed by `localization_test_predictions.csv`, whose `*_true_*` columns are GT rescaled to 512).

### Checkpoint keys
`model_state_dict, encoder("resnet18"), encoder_weights("imagenet"), input_size(512), classes(2), sigma(15.0), seed(42), best_epoch(23), best_val_pixel_error(5.65)`

### Training facts / metrics
IDRiD "C. Localization" set (OD-center + fovea-center CSV markups). `best_val_pixel_error = 5.65` **in 512-space** (≈ 1% of frame; ≈ 47 px at 4288 width). MSE-style heatmap regression (`train_loss` ~2e-4 by convergence).

### Deviations / risks
- **Undocumented interface** — the four facts you can't recover from the checkpoint (plain resize, ImageNet norm, ch0=OD/ch1=fovea, 512-space output) are all recorded here because someone will otherwise get them wrong.
- `resnet18` (not `resnet34`). `sigma=15` is only the training target-blob width; irrelevant to inference (argmax the peak).

---

## Model 4 — bright-lesion (exudate) segmentation  (`bright_lesion_unet_v1.pt`)

**Training code:** none locally — Kaggle. Artifacts in `models/Model4/` (`.pt` + `bright_lesion_training_history.csv`, `bright_lesion_training_summary.json`, `bright_lesion_final_metrics.json`). **Preprocessing reverse-engineered and confirmed by Dice against IDRiD hard-exudate GT** (see "verified" table below).

### Architecture
```python
m = smp.Unet(encoder_name="resnet34", encoder_weights=None,
             in_channels=3, classes=1, activation=None)
m.load_state_dict(ckpt["model_state_dict"])
```
- **24.44 M params.** ResNet34 U-Net. `architecture` key = `"smp.Unet"`.

### Input preprocessing (reverse-engineered — verified)
1. `cv2.imread` → BGR
2. `ben_graham_preprocess(bgr, 512)` → `cv2.cvtColor(BGR2RGB)`
3. `/255.0`, then **`(x − 0.5) / 0.5`**  ← **NOT ImageNet**, despite `encoder_weights:"imagenet"` in the checkpoint
4. `(1, 3, 512, 512)` float32

**Verified** (mean Dice vs IDRiD hard-exudate GT over 54 images):

| pipeline | Dice |
|---|---|
| Ben Graham + `(x−0.5)/0.5` | **0.49** ✅ (matches ckpt `best_val_dice` 0.58 on its 11-img val subset) |
| Ben Graham + ImageNet norm | 0.33 |
| plain resize + ImageNet | 0.08 |
| plain resize + `(x−0.5)/0.5` | 0.06 |

### Output
`(B, 1, 512, 512)` raw logits → `sigmoid` → threshold **0.5** → binary exudate mask.
**Optic-disc masking:** training used `od_masking=True, od_mask_radius=58` — it zeroed a disc of radius 58 px (512-space) at the OD centre so the bright disc isn't learned as exudate. For faithful inference, get the OD centre from Model 3 and zero predictions within ~58 px of it; otherwise expect disc false-positives.

### Checkpoint keys
`model_state_dict, optimizer_state_dict, architecture("smp.Unet"), encoder("resnet34"), encoder_weights("imagenet"), in_channels(3), classes(1), input_size(512), training_patch_size(256), od_masking(True), od_mask_radius(58), loss("Dice+BCE"), learning_rate(5e-4), batch_size(8), epoch(13), best_val_dice(0.583), global_val_dice(0.733), seed(42)`

### Training facts / metrics
IDRiD segmentation "Hard Exudates" set — 54 images → **43 train / 11 val**. Trained on **256×256 patches**, but **inference is full-frame 512** (`input_size`). `best_val_dice` 0.583 = per-image mean; `global_val_dice` 0.733 = pixel-pooled. Best epoch 13 of 28. lr 5e-4 → 1.25e-4 decay.

### Deviations / risks
- **`encoder_weights:"imagenet"` in the checkpoint describes only the *encoder init*, not the input normalization** — actual norm is `(x−0.5)/0.5`. This is the single easiest thing to get wrong.
- Target is IDRiD "Hard Exudates"; may or may not include soft exudates (no script to confirm — Dice is marginally higher scored against hard∪soft). Treat as "bright lesions" generically.
- Patch-trained, full-image inferred (same as Model 5).
- OD masking is part of the trained behaviour but is *not* applied by the model itself — caller must do it.

---

## Model 5 — red-lesion (MA + haemorrhage) segmentation  (`red_lesion_unet_v1.pt`)

**Training code:** `training/train_red_lesion_unet.py` (local). Artifacts in `models/red_lesion_predictions(model5)/`.
**Task:** one binary "red lesion" mask = `logical_OR(microaneurysms, haemorrhages)` — **not** separate MA/HE outputs.

### Architecture
```python
m = smp.Unet(encoder_name="resnet34", encoder_weights=None,
             in_channels=3, classes=1, activation=None)
m.load_state_dict(ckpt["model_state_dict"])
```
- **24.44 M params.** ResNet34 U-Net. `architecture` = `"segmentation_models_pytorch.Unet"`.
- **Encoder initialised by transfer from Model 2 (the vessel model), not ImageNet.** conv1 was adapted 1→3 channels by tiling the vessel kernel and dividing by 3; all 216 encoder tensors loaded. (`ckpt["vessel_transfer_stats"]` records this.) Irrelevant at load time — the saved state_dict is complete — but explains why `encoder_init` ≠ imagenet.

### Input preprocessing (`ckpt["preprocessing"]`, from the script)
1. `cv2.imread` → BGR
2. `ben_graham_preprocess(bgr, 512)` → `cv2.cvtColor(BGR2RGB)`
3. `astype(float32) / 255.0`, then per-channel **`(x − 0.5) / 0.5`** (`NORM_MEAN=NORM_STD=0.5`)
4. `transpose(2,0,1)`, `unsqueeze(0)` → `(1, 3, 512, 512)`

GT masks in training: full-res `MA | HE` → cropped with the *same* retinal bbox Ben Graham uses → `cv2.resize(..., INTER_NEAREST)` to 512.

### Output
`(B, 1, 512, 512)` raw logits → `sigmoid` → threshold **0.5** → binary red-lesion mask (MA and HE fused; no way to separate them from this model).

### Checkpoint keys
`model_state_dict, optimizer_state_dict, architecture, encoder_name("resnet34"), encoder_init(str), in_channels(3), classes(1), activation(None), patch_size(256), image_input_size(512), preprocessing(str), loss("0.5*Dice + 0.5*Focal (from logits)"), optimizer("Adam"), lr(5e-4), seed(42), best_epoch(52), best_val_dice(0.5353), vessel_transfer_stats(dict)`

### Training facts / metrics
IDRiD segmentation set, all 81 images (54 official-train + 27 official-test **pooled**), re-split at **image level** 65 train / 16 val (seed 42). Trained on **256×256 patches**, lesion-aware sampling (70 % lesion / 30 % background, ≥10 lesion px = "lesion"). Heavy custom cv2/scipy augmentation (albumentations + matplotlib native-crash in this env). **Inference is full-frame 512** (validation was image-level). Loss 0.5 Dice + 0.5 Focal. Adam lr 5e-4, batch 8, 150 epochs max, ES patience 20 → stopped epoch 72. **Best val Dice 0.535 (epoch 52)** — sparse tiny lesions, ~0.4–0.5 was the expected range.

### Deviations from a plan
- **MA and HE merged** into one class deliberately (task spec), rather than two heads.
- **Encoder transfer-learned from the CHASE_DB1 vessel model** instead of ImageNet.
- **Patch-trained, full-image inferred.**
- IDRiD's official seg train/test division was **discarded** in favour of a fresh 65/16 image-level split.

---

## One-look inference cheat-sheet

| model | file | build | in shape | preprocessing | normalize | out | post |
|---|---|---|---|---|---|---|---|
| 1 classifier | `branchA_v1.pt` | `DRClassifier("efficientnet_b0",5,0.3)` | `(B,3,384,384)` | Ben Graham 384 → RGB | ImageNet | `(B,5)` logits | `argmax` = grade 0–4 |
| 2 vessel | `vessel_unet_v1.pt` | `smp.Unet("resnet34",None,1,1,None)` | `(B,1,512,512)` | **green ch** → aspect-resize + **center-pad** 512 | `(x−0.5)/0.5` | `(B,1,512,512)` logits | `sigmoid>0.5` |
| 3 localization | `localization_v1.pt` | `smp.Unet("resnet18",None,3,2,None)` | `(B,3,512,512)` | **plain resize** 512, no crop | ImageNet | `(B,2,512,512)` heatmaps | argmax ch0=OD, ch1=fovea; ×(W/512,H/512) |
| 4 bright lesion | `bright_lesion_unet_v1.pt` | `smp.Unet("resnet34",None,3,1,None)` | `(B,3,512,512)` | Ben Graham 512 → RGB | **`(x−0.5)/0.5`** (not ImageNet) | `(B,1,512,512)` logits | `sigmoid>0.5`; zero disc r≈58 around OD |
| 5 red lesion | `red_lesion_unet_v1.pt` | `smp.Unet("resnet34",None,3,1,None)` | `(B,3,512,512)` | Ben Graham 512 → RGB | `(x/255−0.5)/0.5` | `(B,1,512,512)` logits | `sigmoid>0.5` (MA∪HE) |

*(This doc lives in `diagnostics/` to stay out of the modules Saad owns; it could be promoted to `models/README.md`, which is currently empty.)*
