# NetraSetu — ML Model Training Plan
Owner: Tanuj. Backend (Saad, Kankshi) is following the separate backend implementation plan — this document is ML-only, and defines every model that needs actual training, in the order to train them, with exact hyperparameters. Hand this directly to Claude Code, one model at a time.

**Framework: PyTorch**, not MATLAB (see note above — flag if you want this changed before starting).

**Compute strategy:** your RTX 4050 (assumed 6GB VRAM, standard for the laptop variant) has no time limit, so use it for **small-dataset, fast-iterating models** where you'll be debugging constantly. Kaggle's free GPU (T4, 16GB VRAM, ~30hrs/week quota, 12-hour session cap) has far more VRAM but a ticking clock, so reserve it for the **one large, most important training run** — the severity classifier — once the training script is debugged and stable. Don't burn Kaggle hours on a script you're still fixing bugs in; debug locally on a tiny subset first (e.g., 100 images, 2 epochs) to confirm the pipeline runs end-to-end, then move the full run to Kaggle.

**Repo paths:** everything below writes into `central-system/backend/ml-pipeline/` per the existing structure — `training/` for training scripts, `models/` for saved checkpoints, matching the backend plan Saad and Kankshi already have.

**Local storage note:** APTOS 2019 is ~10GB and does **not** need to touch your laptop at all — Model 1 trains on Kaggle, where APTOS already exists as a built-in public dataset you attach to a notebook in a couple of clicks, zero download. The only things that need local disk space are IDRiD (all three subsets combined are under 1GB — 557MB segmentation + 203MB grading + 203MB localization, verified directly against IEEE DataPort's own file listing) and CHASE_DB1 (about 2MB). Your 21GB free is comfortably enough once APTOS is correctly kept off your machine.

---

## Training Sequence (with what runs where, and why)

Two independent tracks can run **in parallel** — the classifier on Kaggle, the small segmentation models on your RTX 4050 — since neither depends on the other finishing first. Sequence within each track matters.

```
DAY 1                          DAY 1 (parallel)
Kaggle: Classifier (Model 1)   Local: Vessel U-Net (Model 2)
        ↓                              ↓
        (runs ~2-4 hrs)         Local: Optic Disc/Fovea (Model 3)
                                       ↓
                                Local: Red-Lesion U-Net (Model 4)
                                (needs Model 2's encoder weights)
                                       ↓
                                Local: Bright-Lesion U-Net (Model 5)

DAY 2 — once Model 1 + Model 4 + Model 5 are done:
Local: Temperature scaling (needs Model 1)
Local: Rule engine — Branch B (needs Model 4 + Model 5's lesion counts)
Local: Grad-CAM + MC Dropout wiring (needs Model 1)
```

**Priority if you run out of time**, in order: Model 1 (classifier) is non-negotiable — everything else is worthless without it. Model 2 (vessels) and Model 4 (red-lesion) come next, since they feed the rule engine that makes "dual-branch grading" real. Model 3 (localization) and Model 5 (bright-lesion) can slip to later without breaking the core demo.

---

## Model 1 — DR Severity Classifier (Branch A)
**This is the one that matters most. Train this first, on Kaggle.**

- **Architecture:** EfficientNet-B0, ImageNet-pretrained (via `timm`), final classifier head replaced for 5-class output. *(ResNet-50 is the fallback if EfficientNet gives you pretrained-weight-loading issues — but try EfficientNet-B0 first, it's a better fit for limited VRAM.)*
- **Datasets:**
  - APTOS 2019 — `train.csv` + `train_images/` (3,662 images, `diagnosis` column = label 0–4)
  - IDRiD Disease Grading subset — 516 images, `Retinopathy grade` column = label 0–4
  - Combine both into one training pool after preprocessing (see below) — do NOT train on APTOS alone, IDRiD's Indian-population data matters for real-world relevance
- **Split:** 70/15/15, stratified by grade, done **separately per source dataset** before combining (so IDRiD's smaller pool isn't drowned out or split unevenly by APTOS's larger one)
- **Preprocessing:** Ben Graham method — circular crop to the retinal boundary, resize to 384×384, subtract a heavily-blurred copy of itself to boost local contrast. Cache preprocessed images to disk so you don't redo this every epoch.
- **Loss:** ordinal-aware weighted cross-entropy — standard cross-entropy multiplied by `(1 + |predicted_grade - true_grade|)` per sample, combined with class weights (`total_count / (5 * count_in_class)`) to handle the grade-0-heavy imbalance
- **Optimizer:** AdamW, initial LR `1e-4`, cosine annealing schedule, weight decay `1e-5`
- **Batch size:** 32 (Kaggle T4 can handle this at 384px comfortably)
- **Epochs:** 30, with early stopping on validation **quadratic-weighted kappa** (not loss, not accuracy — kappa is the metric that actually matters here), patience 7
- **Augmentation:** random rotation (±20°), horizontal flip, brightness/contrast jitter (±15%), random zoom/crop
- **Success target:** quadratic-weighted kappa >0.85 on the held-out test split; referable-DR (grade ≥2) sensitivity >90%, specificity >85% as the ultimate PS target — don't expect to hit the PS target on the first training run, kappa >0.85 is the realistic near-term milestone
- **Save:** checkpoint to `ml-pipeline/models/branchA_v1.pt`, plus export validation-set logits to a `.npy` file — Model 6 (temperature scaling) needs these

---

## Model 2 — Vessel Segmentation U-Net
**Train locally, first among the small models — Model 4 depends on its encoder weights.**

- **Architecture:** U-Net via `segmentation_models_pytorch`, ResNet34 encoder, ImageNet-pretrained
- **Dataset:** **CHASE_DB1** (swapped in for DRIVE — DRIVE's manual approval process takes up to a week, incompatible with this timeline; CHASE_DB1 is the same task, same two-independent-observer annotation style, available immediately with no approval queue, ~2MB total). 28 images total, 14 subjects × 2 eyes, two independent vessel-mask annotations per image (use the first observer's mask as ground truth, matching DRIVE convention). If DRIVE access comes through later, it can be added as a supplementary fine-tuning set, but don't wait on it.
- **Split:** 22 train / 6 val out of the 28
- **Preprocessing:** extract the green channel (best vessel contrast) or apply CLAHE to grayscale; resize/pad to 512×512 (native CHASE_DB1 resolution is 999×960, slightly different aspect ratio from DRIVE — pad rather than distort)
- **Loss:** Dice loss + BCE combined (standard for the vessel-vs-background imbalance)
- **Optimizer:** Adam, LR `1e-3`, reduce-on-plateau (factor 0.5, patience 10)
- **Batch size:** 4
- **Epochs:** 150, early stopping on validation Dice, patience 20 — a small dataset needs many epochs, but will overfit fast without augmentation
- **Augmentation:** heavy — rotation, horizontal/vertical flip, elastic deformation, brightness/contrast jitter. This is not optional given only 22 training images.
- **Success target:** Dice coefficient >0.75 on validation
- **Save:** `ml-pipeline/models/vessel_unet_v1.pt` — Model 4 loads this encoder

---

## Model 3 — Optic Disc / Fovea Localization
**Train locally, independent of everything else.**

- **Architecture:** heatmap-based localization — a small U-Net (or the same `segmentation_models_pytorch` U-Net, ResNet18 encoder) predicting two Gaussian heatmaps (one for optic disc center, one for fovea center), location = heatmap argmax. *(Simpler fallback if time-constrained: direct coordinate regression via ResNet18 + FC head predicting 4 normalized values — less accurate but much faster to implement.)*
- **Dataset:** IDRiD Localization subset — 516 images with OD center + fovea center coordinates in the provided CSV
- **Preprocessing:** resize to 512×512, scale coordinates accordingly; generate Gaussian heatmap targets (σ ≈ 15px) if using the heatmap approach
- **Split:** 70/15/15 (~360/78/78)
- **Loss:** heatmap MSE (heatmap approach) or coordinate MSE (regression fallback)
- **Optimizer:** Adam, LR `1e-3`
- **Batch size:** 16
- **Epochs:** 40, early stopping on validation pixel-distance error, patience 8
- **Augmentation:** mild rotation (±10°) and brightness/contrast jitter only — **do not horizontal-flip** unless you correspondingly re-map coordinates, since flipping breaks the anatomical left/right relationship between optic disc and fovea
- **Success target:** mean localization error under roughly one disc-diameter (~80–100px at this resolution — refine once you see actual disc sizes in the data)
- **Save:** `ml-pipeline/models/localization_v1.pt`

---

## Model 4 — Red-Lesion Segmentation (Microaneurysms + Hemorrhages)
**Train locally, after Model 2 — initialize its encoder from the vessel model.**

- **Architecture:** U-Net (`segmentation_models_pytorch`), encoder weights **loaded from Model 2's trained vessel encoder**, not ImageNet — this matters given how little data you have here
- **Dataset:** IDRiD Segmentation subset (81 images) — combine the microaneurysm (MA) and hemorrhage (HE) mask folders into one binary "red lesion" mask per image
- **Preprocessing:** Ben Graham preprocessing, resize to 512×512. Consider patch-based training (256×256 crops, oversampling lesion-containing patches) given how small and sparse these lesions are relative to the full image
- **Split:** ~65 train / 16 val
- **Loss:** Dice + focal loss (focal handles the extreme pixel-level imbalance — lesion pixels are a tiny fraction of the image)
- **Optimizer:** Adam, LR `5e-4`
- **Batch size:** 8 (patches) or 4 (full images)
- **Epochs:** 150, early stopping on validation Dice, patience 20
- **Augmentation:** heavy — rotation, flip, elastic deformation, brightness/contrast, random crop
- **Success target — set this expectation honestly with the team:** Dice 0.4–0.5 for microaneurysms specifically is a genuinely reasonable outcome given the dataset size and how hard this lesion type is; don't present a lower number as a failure, and don't expect to match large-scale published results
- **Save:** `ml-pipeline/models/red_lesion_unet_v1.pt`

---

## Model 5 — Bright-Lesion Segmentation (Exudates + Cotton-Wool Spots)
**Train locally, can run right after or alongside Model 4.**

- **Architecture:** U-Net (`segmentation_models_pytorch`), ResNet34 encoder, ImageNet-pretrained (transfer from the vessel model is optional here — exudates look visually different from vessels, less benefit than for Model 4)
- **Dataset:** IDRiD Segmentation subset — combine hard exudate (EX) and soft exudate/cotton-wool (SE) mask folders into one binary mask
- **Preprocessing:** same as Model 4, plus mask out the optic disc region using Model 3's output before finalizing candidates, to stop the disc's natural brightness being read as an exudate
- **Split:** same ~65/16
- **Loss:** Dice + BCE
- **Optimizer:** Adam, LR `5e-4`
- **Batch size:** 8
- **Epochs:** 120, early stopping, patience 15 (tends to converge faster than red-lesion — these are larger, easier-to-see lesions)
- **Augmentation:** same heavy set as Model 4
- **Success target:** Dice 0.6–0.7 (bright lesions are meaningfully easier than microaneurysms)
- **Save:** `ml-pipeline/models/bright_lesion_unet_v1.pt`

---

## Not Trained Models — Post-Processing Steps (no epochs, build these after the models above)

| Component | Depends on | What it actually is |
|---|---|---|
| **Temperature scaling** | Model 1's validation logits | Fit one scalar parameter minimizing NLL — a few lines of optimization, not a training loop |
| **Rule engine (Branch B)** | Model 4 + Model 5's lesion counts | Pure if/else code implementing the ICDR/ETDRS criteria — no model, no training, just logic to test against real lesion-count outputs once Models 4–5 exist |
| **Grad-CAM** | Model 1 (trained) | Applied directly to the trained classifier at inference time |
| **Monte Carlo Dropout** | Model 1 (trained, with dropout layers) | Multiple stochastic forward passes at inference — make sure Model 1's architecture actually includes a dropout layer before the final classification head, or this has nothing to sample from |
| **Conformal prediction** | Model 1 + a held-out calibration fold | A quantile calculation on calibration-fold nonconformity scores — stretch goal, do this last if time allows |

---

## Rough Time Estimates (for planning your days, not promises)

| Model | Approx. training time | Where |
|---|---|---|
| Vessel U-Net | 15–25 min | Local |
| Optic Disc/Fovea | 30–60 min | Local |
| Red-Lesion U-Net | 30–60 min | Local |
| Bright-Lesion U-Net | 25–45 min | Local |
| DR Classifier | 2–4 hours | Kaggle |

Given the classifier is the long pole, kick it off on Kaggle first thing, then work through the local models on your RTX 4050 while it runs.
