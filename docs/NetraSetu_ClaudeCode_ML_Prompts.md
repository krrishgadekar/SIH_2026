# NetraSetu — Claude Code Prompts for Model Training

**Before you start:** APTOS 2019 does **not** need local download — Model 1 trains on Kaggle, where APTOS already exists as a built-in public dataset (attach it via Kaggle's "Add Data" in a couple of clicks). Only IDRiD and CHASE_DB1 need to be downloaded to your laptop: IDRiD from IEEE DataPort (requires a free account — self-service signup, not a manual approval queue — grading/segmentation/localization subsets total under 1GB), and CHASE_DB1 from Kingston University's research repository or Dataset Ninja (no registration, ~2MB — used in place of DRIVE, whose manual approval process takes up to a week and doesn't fit this timeline). Place both under `central-system/backend/ml-pipeline/datasets/` per the structure in Prompt 0.

**Attach to every prompt below:** `NetraSetu_ML_Training_Plan.md`. Additional documents are noted per-prompt where relevant.

**Run order:** 0 → (1 on Kaggle, 2→3→4→5 locally, in parallel with 1) → 6a → 6b. Don't start 6a before Model 1 is trained; don't start 6b before Models 4 and 5 are trained.

---

## Prompt 0 — Environment Setup + Shared Preprocessing
*Run this first, locally.*

```
Set up a Python ML environment for training diabetic retinopathy models, following the
attached training plan exactly for architecture/hyperparameter choices in later prompts.

Install: torch, torchvision, timm, segmentation-models-pytorch, albumentations,
opencv-python, pandas, numpy, scikit-learn, matplotlib, scipy.

Verify CUDA is available and detects the GPU — torch.cuda.is_available() should be True,
torch.cuda.get_device_name(0) should show the RTX 4050.

Create this directory structure under central-system/backend/ml-pipeline/:
  preprocessing/
    ben_graham.py
    clahe_enhance.py
  segmentation/
  grading/
  calibration/
  explainability/
  training/
  models/
  datasets/
    aptos2019/
    idrid/grading/
    idrid/segmentation/
    idrid/localization/
    chasedb1/

In preprocessing/ben_graham.py, implement:
  ben_graham_preprocess(image: np.ndarray, target_size: int = 384) -> np.ndarray
that detects the circular retinal boundary, crops to it, resizes to target_size x target_size,
and boosts local contrast by subtracting a heavily-blurred Gaussian copy of itself (kernel
size proportional to target_size / 30), scaled and re-added at mid-gray.

In preprocessing/clahe_enhance.py, implement:
  clahe_enhance(image: np.ndarray, clip_limit: float = 2.0) -> np.ndarray
applying CLAHE to the L channel in LAB color space.

These two functions get reused by every training script below, so make them clean,
importable, and add a docstring with expected input/output shapes.

Write a small test script that loads one sample image, runs both functions, and saves
before/after images so I can visually confirm they work before we go any further.
```

---

## Prompt 1 — Model 1: DR Severity Classifier
*Runs on Kaggle, not locally. Produces a notebook you upload yourself. Can run in parallel with Prompts 2–5.*

```
Write a self-contained Jupyter notebook, train_classifier_kaggle.ipynb, designed to run
on Kaggle's free T4 GPU. Since Kaggle notebooks can't import from my local repo, inline
the Ben Graham preprocessing logic directly in the notebook rather than importing it —
follow the exact same algorithm as preprocessing/ben_graham.py from the setup step
(circular crop, resize, Gaussian-subtraction contrast boost).

The notebook should:

1. Load APTOS 2019 from /kaggle/input/aptos2019-blindness-detection/ (standard Kaggle
   mount path) and IDRiD's Disease Grading CSV + images from a path I will fill in after
   uploading IDRiD as a private Kaggle dataset myself — leave this as a clearly marked
   variable at the top of the notebook for me to edit.

2. Apply the inlined Ben Graham preprocessing to every image, target size 384x384.

3. Split 70/15/15, stratified by grade, done SEPARATELY per source dataset (APTOS and
   IDRiD) before combining them into one training pool — do this so IDRiD's smaller,
   Indian-population data isn't diluted unevenly by APTOS's larger pool.

4. Build an EfficientNet-B0 via timm, ImageNet-pretrained, final classifier layer replaced
   for 5-class output.

5. Implement a custom loss: standard cross-entropy multiplied per-sample by
   (1 + |predicted_grade - true_grade|), combined with inverse-frequency class weights
   computed from the training set's grade distribution.

6. Train with AdamW, initial LR 1e-4, cosine annealing schedule, batch size 32, up to 30
   epochs, early stopping on validation quadratic-weighted kappa with patience 7.

7. Augmentation: random rotation ±20°, horizontal flip, brightness/contrast jitter ±15%,
   random zoom/crop.

8. After every epoch, print quadratic-weighted kappa, macro F1, and referable-DR
   (grade >= 2) sensitivity/specificity on the validation set.

9. At the end, evaluate on the held-out test split and print final kappa and
   sensitivity/specificity.

10. Save the trained model checkpoint AND the validation-set logits as a .npy file —
    both need to be downloaded afterward for temperature scaling in a later step.

Fix all random seeds for reproducibility. Print clear per-epoch progress so I can monitor
this from the Kaggle interface while it runs.
```

---

## Prompt 2 — Model 2: Vessel Segmentation U-Net
*Local. Run before Prompt 4 — it needs this model's encoder weights.*

```
Write training/train_vessel_unet.py to train a vessel segmentation model on CHASE_DB1,
located at datasets/chasedb1/ (28 images total, two independent vessel-mask annotations
per image — use the first observer's mask as ground truth). Use segmentation_models_pytorch's
U-Net with a ResNet34 encoder, ImageNet-pretrained.

Load the images, extract the green channel (or apply CLAHE via
preprocessing/clahe_enhance.py) for better vessel contrast, resize/pad to 512x512 (native
resolution is 999x960 — pad rather than distort to avoid warping vessel geometry).
Split into 22 train / 6 validation.

Loss: combined Dice + BCE.
Optimizer: Adam, LR 1e-3, ReduceLROnPlateau (factor 0.5, patience 10).
Batch size: 4. Up to 150 epochs, early stopping on validation Dice, patience 20.

Augmentation via albumentations — this is not optional given only 22 training images:
rotation, horizontal and vertical flip, elastic transform, brightness/contrast jitter.

Print validation Dice after every epoch. Save the best checkpoint to
models/vessel_unet_v1.pt. At the end, run inference on the 6 validation images and save
predicted masks next to ground truth as PNGs so I can visually inspect the results.
```

---

## Prompt 3 — Model 3: Optic Disc / Fovea Localization
*Local. Independent — can run any time after Prompt 0.*

```
Write training/train_localization.py to train an optic disc and fovea localization model
on the IDRiD Localization subset at datasets/idrid/localization/ (516 images, with a CSV
giving optic disc center and fovea center pixel coordinates).

Use a heatmap-based approach: a U-Net (segmentation_models_pytorch, ResNet18 encoder,
ImageNet-pretrained) predicting two output channels — one Gaussian heatmap for the optic
disc center, one for the fovea center (sigma ~15px, generated from the CSV coordinates,
images resized to 512x512 with coordinates scaled accordingly). At inference, take the
argmax of each channel as the predicted coordinate.

Split 70/15/15. Optimizer: Adam, LR 1e-3. Batch size 16. Up to 40 epochs, early stopping
on validation mean pixel-distance error, patience 8.

Augmentation: mild rotation (+/-10 degrees) and brightness/contrast jitter ONLY. Do NOT
horizontal-flip — it breaks the anatomical left-right relationship between optic disc and
fovea unless coordinates are correspondingly re-mapped, which we're deliberately not doing
here to keep this simple.

Print mean pixel error per epoch. Save to models/localization_v1.pt.
```

---

## Prompt 4 — Model 4: Red-Lesion Segmentation U-Net
*Local. Run after Prompt 2 — this loads its encoder weights.*

```
Write training/train_red_lesion_unet.py to train a microaneurysm + hemorrhage
segmentation model on the IDRiD Segmentation subset at datasets/idrid/segmentation/.
Combine the microaneurysm (MA) and hemorrhage (HE) mask folders into one binary
"red lesion" mask per image (logical OR of both).

Build a U-Net (segmentation_models_pytorch, ResNet34 encoder) but instead of
ImageNet weights, load the encoder from the already-trained models/vessel_unet_v1.pt —
write a small utility function that extracts and loads just the encoder state dict from
that checkpoint into this new model.

Apply Ben Graham preprocessing (preprocessing/ben_graham.py), resize to 512x512. Given
only 81 total images, use patch-based training: extract 256x256 patches, oversampling
patches that contain at least some lesion pixels so the model isn't overwhelmed by
pure-background patches. Split ~65 train / 16 val AT THE IMAGE LEVEL before patching, so
patches from the same source image never appear on both sides of the split.

Loss: combined Dice + focal loss. Optimizer: Adam, LR 5e-4. Batch size 8. Up to 150
epochs, early stopping on validation Dice, patience 20.

Heavy augmentation: rotation, flip, elastic deformation, brightness/contrast, random crop.

Print validation Dice per epoch. Save to models/red_lesion_unet_v1.pt. Save a handful of
prediction-vs-ground-truth visual comparisons for my inspection.

Expect Dice in the 0.4-0.5 range given how small and sparse these lesions are relative to
the tiny dataset — that's a reasonable result here, not a failure, so don't keep tuning
indefinitely chasing a much higher number.
```

---

## Prompt 5 — Model 5: Bright-Lesion Segmentation U-Net
*Local. Can run any time after Prompt 3 (needs its optic disc predictions).*

```
Write training/train_bright_lesion_unet.py, following the same overall pattern as
train_red_lesion_unet.py, with these differences:

- Combine the hard exudate (EX) and soft exudate/cotton-wool (SE) mask folders into one
  binary mask instead of MA+HE.
- Use a fresh ImageNet-pretrained ResNet34 encoder (not the vessel model's weights this
  time — exudates look visually different from vessels, less transfer benefit here).
- Before finalizing training data, mask out the optic disc region in both images and
  masks using the optic disc coordinates predicted by models/localization_v1.pt — run
  inference with that model first to get disc locations, then zero out a circular region
  of about 1.5x typical disc radius around each predicted center, to stop the model
  learning to falsely associate the bright optic disc with exudates.

Same loss (Dice + BCE), same optimizer settings (Adam, LR 5e-4, batch size 8), up to 120
epochs, early stopping on validation Dice, patience 15. Same heavy augmentation set.

Save to models/bright_lesion_unet_v1.pt. Expect Dice in the 0.6-0.7 range — meaningfully
higher than the red-lesion model, since these lesions are larger and higher-contrast.
```

---

## Prompt 6a — Classifier Post-Processing: Calibration, Grad-CAM, MC Dropout
*Local. Run after Model 1's checkpoint and validation logits are downloaded from Kaggle.*

```
Using the trained classifier at models/branchA_v1.pt and its saved validation logits:

1. Write calibration/temperature_scaling.py with fit_temperature(logits, labels) -> float,
   finding the scalar T minimizing negative log-likelihood of softmax(logits/T) against
   true labels (scipy.optimize.minimize_scalar, or a grid search over T in [0.1, 5.0]).
   Fit on the saved validation logits, print the resulting T, save to
   models/temperature_v1.json. Print Expected Calibration Error (ECE) before and after
   applying this temperature so I can confirm it actually improved calibration.

2. Write explainability/gradcam.py with generate_gradcam(model, image_tensor,
   target_class) -> np.ndarray, using Grad-CAM (the pytorch-grad-cam library, or a
   from-scratch hook-based implementation) targeting the last convolutional layer of the
   EfficientNet-B0 backbone. Return a normalized heatmap the same spatial size as the
   input image, ready to overlay.

3. Write calibration/mc_dropout.py with mc_dropout_predict(model, image_tensor,
   num_passes=15) -> (mean_probs, uncertainty), running num_passes stochastic forward
   passes with dropout forced active, returning mean class probabilities and the variance
   across passes as the uncertainty score. First check whether the trained model actually
   has a dropout layer before its final classification head — if it doesn't, tell me
   explicitly rather than silently skipping this, since it means Model 1 needs a quick
   fine-tune with a dropout layer added before this technique has anything to sample from.

Write a small demo script loading one test image and running it through all three, printing
and saving the calibrated probability, the Grad-CAM overlay, and the MC Dropout uncertainty
score together, so I can sanity-check all three work correctly on a real example.
```

---

## Prompt 6b — Rule Engine (Branch B) + Lesion Counting + Agreement Check
*Local. Run after Models 4 and 5 are trained.*
**Also attach:** `implementation-plan-backend-ml.md` — Task 5.1 in that document already specifies this exact rule engine; follow it precisely rather than re-deriving the logic, so the ML side and backend plan stay consistent.

```
Using the trained models/red_lesion_unet_v1.pt and models/bright_lesion_unet_v1.pt, plus
optic disc/fovea coordinates from models/localization_v1.pt:

1. Write grading/lesion_counting.py with count_lesions_by_quadrant(red_mask, bright_mask,
   optic_disc_coords, fovea_coords) -> dict, dividing the image into 4 quadrants relative
   to the optic-disc-to-fovea axis, returning counts of red-lesion and bright-lesion
   connected components per quadrant (cv2.connectedComponents or scipy.ndimage.label).

2. Write grading/rule_engine.py with rule_engine_grade(quadrant_counts: dict,
   nv_suspicion_score: float = 0.0) -> int, implementing the exact decision logic from
   the attached backend implementation plan's Task 5.1, in order, first match wins. Write
   this as a pure function with no I/O — it needs to be directly unit-testable. Include at
   least 5 hand-constructed test cases in test_rule_engine.py, one per grade 0-4, and run
   them to confirm each returns the expected grade.

3. Write grading/agreement_check.py with branches_agree(grade_a: int, grade_b: int) -> bool
   — trivial, but keep it as its own named function since the design doc references it as
   a specific integration point.

Run the lesion counting and rule engine against 5-10 real images from the IDRiD
segmentation validation set, using the trained lesion models' actual predictions (not
ground-truth masks), and print the resulting grade for each alongside what the classifier
(Model 1) predicts for the same images — so I can see the current real-world agreement
rate between the two branches, not just the unit-test cases.
```
