"""
train_vessel_unet.py
--------------------
Retinal vessel segmentation on CHASE_DB1 using a ResNet34-backed U-Net.

Usage (from ml-pipeline/ root):
    python training/train_vessel_unet.py

Paths are resolved relative to this script's location so the script can be
run from any working directory.
"""

import os
import sys
import random
import shutil
import copy
from pathlib import Path

# ---------------------------------------------------------------------------
# Dependency check — fail fast with a clear message if anything is missing
# ---------------------------------------------------------------------------
def _check_imports() -> None:
    missing = []
    try:
        import numpy
    except ImportError:
        missing.append("numpy")
    try:
        import cv2
    except ImportError:
        missing.append("opencv-python")
    try:
        import torch
    except ImportError:
        missing.append("torch")
    try:
        import torchvision
    except ImportError:
        missing.append("torchvision")
    try:
        import segmentation_models_pytorch
    except ImportError:
        missing.append("segmentation-models-pytorch")
    if missing:
        print("[ERROR] Missing required packages:")
        for pkg in missing:
            print(f"  pip install {pkg}")
        sys.exit(1)

_check_imports()

import numpy as np
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)
import torch
import torch.nn as nn
import torch.nn.functional as F
import torchvision.transforms.functional as TF
from torch.utils.data import Dataset, DataLoader
import segmentation_models_pytorch as smp

# ---------------------------------------------------------------------------
# 0.  Paths  (all relative to ml-pipeline root, which is two levels up)
# ---------------------------------------------------------------------------
SCRIPT_DIR   = Path(__file__).resolve().parent          # .../training/
PIPELINE_DIR = SCRIPT_DIR.parent                        # .../ml-pipeline/

DATASET_DIR  = PIPELINE_DIR / "datasets" / "chasedb1"
MODELS_DIR   = PIPELINE_DIR / "models"
PRED_DIR     = MODELS_DIR   / "vessel_predictions"
CHECKPOINT   = MODELS_DIR   / "vessel_unet_v1.pt"

MODELS_DIR.mkdir(parents=True, exist_ok=True)
PRED_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# 1.  Hyper-parameters & settings
# ---------------------------------------------------------------------------
SEED         = 42
INPUT_SIZE   = 512          # square target after resize + pad
BATCH_SIZE   = 4
MAX_EPOCHS   = 150
ES_PATIENCE  = 20           # early-stopping patience (val Dice epochs)
LR           = 1e-3
LR_FACTOR    = 0.5
LR_PATIENCE  = 10

ENCODER      = "resnet34"
ENC_WEIGHTS  = "imagenet"
N_TRAIN      = 22
N_VAL        = 6


# ---------------------------------------------------------------------------
# 2.  Reproducibility
# ---------------------------------------------------------------------------
def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark     = False

set_seed(SEED)


# ---------------------------------------------------------------------------
# 3.  Device
# ---------------------------------------------------------------------------
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")
if DEVICE.type == "cuda":
    print(f"[Device] Using GPU: {torch.cuda.get_device_name(0)}")
else:
    print("[Device] CUDA not available — running on CPU (will be slow)")


# ---------------------------------------------------------------------------
# 4.  Discover & validate all 28 image/mask pairs
# ---------------------------------------------------------------------------
def discover_pairs(dataset_dir: Path) -> list:
    """
    Scan *dataset_dir* for .jpg files, pair each with its _1stHO.png mask.
    Raises FileNotFoundError if any mask is missing.
    Returns a sorted list of (image_path, mask_path) tuples.
    """
    jpg_files = sorted(dataset_dir.glob("*.jpg"))
    if not jpg_files:
        raise FileNotFoundError(
            f"No .jpg images found in: {dataset_dir}\n"
            "Make sure the CHASE_DB1 files are placed at:\n"
            f"  {dataset_dir}/"
        )

    pairs = []
    missing = []
    for img_path in jpg_files:
        stem = img_path.stem                              # e.g. "Image_01L"
        mask_path = dataset_dir / f"{stem}_1stHO.png"
        if mask_path.exists():
            pairs.append((img_path, mask_path))
        else:
            missing.append(str(mask_path))

    if missing:
        raise FileNotFoundError(
            f"Missing _1stHO.png masks for {len(missing)} image(s):\n"
            + "\n".join(f"  {m}" for m in missing)
        )

    return pairs


def validate_pairs(pairs: list, n_samples: int = 3) -> None:
    """Print a validation summary; exits on any unreadable file."""
    print(f"\n{'='*60}")
    print(f"  Dataset validation -- {len(pairs)} image/mask pairs found")
    print(f"{'='*60}")

    errors = []
    for img_path, mask_path in pairs:
        img  = cv2.imread(str(img_path))
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        if img is None:
            errors.append(f"Cannot read image: {img_path}")
        if mask is None:
            errors.append(f"Cannot read mask : {mask_path}")

    if errors:
        print("\n[ERROR] Unreadable files:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)

    # Print shape info for first n_samples pairs
    print(f"\n  Sample dimensions (first {n_samples} pairs):")
    for img_path, mask_path in pairs[:n_samples]:
        img  = cv2.imread(str(img_path))
        mask = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
        print(f"    {img_path.name:25s}  image={img.shape}  |  "
              f"{mask_path.name:30s}  mask={mask.shape}")

    print(f"\n  Total valid pairs: {len(pairs)}")
    print(f"{'='*60}\n")


# ---------------------------------------------------------------------------
# 5.  Preprocessing helpers
# ---------------------------------------------------------------------------
def resize_and_pad(image: np.ndarray, target: int, interp: int) -> np.ndarray:
    """
    Resize *image* so its longest side = *target*, then CENTER-pad to (target x target).
    Preserves aspect ratio.  *interp* is the OpenCV interpolation flag.
    Works for both 2-D (mask) and 3-D (H x W x C) arrays.

    Center padding avoids introducing a systematic positional bias compared
    with top-left padding, while still being fully deterministic.
    """
    h, w = image.shape[:2]
    scale = target / max(h, w)
    new_h, new_w = int(round(h * scale)), int(round(w * scale))

    resized = cv2.resize(image, (new_w, new_h), interpolation=interp)

    # Build an output canvas filled with zeros
    if image.ndim == 3:
        canvas = np.zeros((target, target, image.shape[2]), dtype=image.dtype)
    else:
        canvas = np.zeros((target, target), dtype=image.dtype)

    # Center-paste: compute top-left offset so the image is centred
    pad_top  = (target - new_h) // 2
    pad_left = (target - new_w) // 2
    canvas[pad_top:pad_top + new_h, pad_left:pad_left + new_w] = resized
    return canvas


def load_image(path: Path) -> np.ndarray:
    """Load a retinal image and extract the green channel -> (H, W) uint8."""
    img = cv2.imread(str(path))                         # BGR
    if img is None:
        raise IOError(f"Cannot read image: {path}")
    green = img[:, :, 1]                                # green channel
    return resize_and_pad(green, INPUT_SIZE, cv2.INTER_LINEAR)


def load_mask(path: Path) -> np.ndarray:
    """Load a binary annotation mask -> (H, W) uint8 in {0, 255}."""
    mask = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if mask is None:
        raise IOError(f"Cannot read mask: {path}")
    mask = resize_and_pad(mask, INPUT_SIZE, cv2.INTER_NEAREST)
    # Ensure purely binary uint8 {0, 255} for safe albumentations
    binary = (mask > 127).astype(np.uint8) * 255
    return binary


# ---------------------------------------------------------------------------
# 6.  Dataset
# ---------------------------------------------------------------------------
class ChaseDB1Dataset(Dataset):
    """
    Dataset for CHASE_DB1 retinal vessel segmentation.
    Uses pure PyTorch/torchvision augmentations (no albumentations).
    """
    def __init__(self, pairs, augment: bool = False):
        self.pairs   = pairs
        self.augment = augment

    def __len__(self):
        return len(self.pairs)

    def __getitem__(self, idx):
        img_path, mask_path = self.pairs[idx]

        # Load as numpy arrays: image (H,W) uint8, mask (H,W) uint8 {0,255}
        image = load_image(img_path)
        mask  = load_mask(mask_path)

        # Convert to PIL for torchvision transforms
        from PIL import Image as PILImage
        img_pil  = PILImage.fromarray(image, mode='L')        # grayscale
        mask_pil = PILImage.fromarray(mask,  mode='L')        # grayscale

        if self.augment:
            img_pil, mask_pil = _train_augment(img_pil, mask_pil)

        # To tensor: (1, H, W) float32
        img_t  = TF.to_tensor(img_pil)                        # [0,1] float32
        mask_t = torch.from_numpy(
            np.array(mask_pil, dtype=np.float32)
        ).unsqueeze(0) / 255.0                                 # {0.0, 1.0}

        # Normalize image to approx [-1, 1]
        img_t = TF.normalize(img_t, mean=[0.5], std=[0.5])

        return {"image": img_t, "mask": mask_t, "name": img_path.stem}


# ---------------------------------------------------------------------------
# 7.  Augmentation pipeline  (pure PyTorch/torchvision — no albumentations)
# ---------------------------------------------------------------------------
def _elastic_deform(img_pil, mask_pil, alpha=120.0, sigma=6.0):
    """
    Elastic deformation applied jointly to image and mask.
    Uses a Gaussian-smoothed random displacement field (numpy/scipy only).
    Equivalent to old albumentations ElasticTransform(alpha=120, sigma=6).
    """
    from scipy.ndimage import gaussian_filter

    img_np  = np.array(img_pil,  dtype=np.float32)
    mask_np = np.array(mask_pil, dtype=np.float32)
    h, w = img_np.shape[:2]

    # Random displacement fields
    rng = np.random.default_rng()
    dx = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), sigma) * alpha
    dy = gaussian_filter(rng.standard_normal((h, w)).astype(np.float32), sigma) * alpha

    # Grid of coordinates
    x, y   = np.meshgrid(np.arange(w), np.arange(h))
    map_x  = np.clip(x + dx, 0, w - 1).astype(np.float32)
    map_y  = np.clip(y + dy, 0, h - 1).astype(np.float32)

    warped_img  = cv2.remap(img_np,  map_x, map_y,
                            interpolation=cv2.INTER_LINEAR,
                            borderMode=cv2.BORDER_REFLECT_101)
    warped_mask = cv2.remap(mask_np, map_x, map_y,
                            interpolation=cv2.INTER_NEAREST,
                            borderMode=cv2.BORDER_REFLECT_101)

    from PIL import Image as PILImage
    return (PILImage.fromarray(warped_img.astype(np.uint8),  mode='L'),
            PILImage.fromarray(warped_mask.astype(np.uint8), mode='L'))


def _train_augment(img_pil, mask_pil):
    """
    Training augmentation applied synchronously to image and mask.
    Uses torchvision.transforms.functional + scipy for elastic deform.
    - Rotation ±20° with probability 0.7
    - Horizontal flip with probability 0.5
    - Vertical   flip with probability 0.5
    - Elastic deformation with probability 0.3
    - Brightness / contrast ±15% (image only) with probability 0.5
    """
    import random as _rng

    # Rotation ±20 degrees
    if _rng.random() < 0.7:
        angle = _rng.uniform(-20, 20)
        img_pil  = TF.rotate(img_pil,  angle, fill=0)
        mask_pil = TF.rotate(mask_pil, angle, fill=0)

    # Horizontal flip
    if _rng.random() < 0.5:
        img_pil  = TF.hflip(img_pil)
        mask_pil = TF.hflip(mask_pil)

    # Vertical flip
    if _rng.random() < 0.5:
        img_pil  = TF.vflip(img_pil)
        mask_pil = TF.vflip(mask_pil)

    # Elastic deformation (image + mask jointly)
    if _rng.random() < 0.3:
        img_pil, mask_pil = _elastic_deform(img_pil, mask_pil, alpha=120.0, sigma=6.0)

    # Brightness / Contrast (image only — does not affect vessel locations)
    if _rng.random() < 0.5:
        factor = _rng.uniform(1.0 - 0.15, 1.0 + 0.15)
        img_pil = TF.adjust_brightness(img_pil, factor)
        factor  = _rng.uniform(1.0 - 0.15, 1.0 + 0.15)
        img_pil = TF.adjust_contrast(img_pil, factor)

    return img_pil, mask_pil


# ---------------------------------------------------------------------------
# 8.  Loss
# ---------------------------------------------------------------------------
class CombinedLoss(nn.Module):
    """50% Dice + 50% BCE-with-logits."""

    def __init__(self):
        super().__init__()
        self.dice = smp.losses.DiceLoss(mode="binary", from_logits=True)
        self.bce  = nn.BCEWithLogitsLoss()

    def forward(self, logits, targets):
        return 0.5 * self.dice(logits, targets) + 0.5 * self.bce(logits, targets)


# ---------------------------------------------------------------------------
# 9.  Metric helper
# ---------------------------------------------------------------------------
@torch.no_grad()
def compute_dice_batch(logits, targets, threshold=0.5):
    """
    Compute Dice per sample in the batch, then return the MEAN across the batch.
    This gives each image equal weight regardless of batch size, which is
    important for the tiny 6-image validation set.
    Shape: logits/targets are (B, 1, H, W).
    """
    preds = (torch.sigmoid(logits) > threshold).float()   # (B, 1, H, W)
    # Flatten spatial dims per sample
    preds_flat   = preds.view(preds.size(0), -1)           # (B, H*W)
    targets_flat = targets.view(targets.size(0), -1)       # (B, H*W)
    intersection = (preds_flat * targets_flat).sum(dim=1)  # (B,)
    union        = preds_flat.sum(dim=1) + targets_flat.sum(dim=1)  # (B,)
    per_sample   = (2.0 * intersection) / (union + 1e-8)   # (B,)
    return per_sample.mean().item()


# Keep a convenience alias used in train_one_epoch
compute_dice = compute_dice_batch


# ---------------------------------------------------------------------------
# 10.  Training loop
# ---------------------------------------------------------------------------
def train_one_epoch(model, loader, optimizer, criterion, device):
    model.train()
    total_loss, total_dice, n = 0.0, 0.0, 0
    for batch in loader:
        images  = batch["image"].to(device)
        masks   = batch["mask"].to(device)

        optimizer.zero_grad()
        logits = model(images)
        loss   = criterion(logits, masks)
        loss.backward()
        optimizer.step()

        bs = images.size(0)
        total_loss += loss.item() * bs
        total_dice += compute_dice(logits, masks) * bs
        n += bs

    return total_loss / n, total_dice / n


@torch.no_grad()
def validate(model, loader, criterion, device):
    """
    Validation pass.
    - Loss    : weighted by batch size (standard).
    - Dice    : per-IMAGE Dice accumulated, then divided by total images,
                so every validation image contributes equally (critical for N=6).
    """
    model.eval()
    total_loss  = 0.0
    dice_scores = []   # one scalar per validation image
    n           = 0
    for batch in loader:
        images = batch["image"].to(device)
        masks  = batch["mask"].to(device)

        logits = model(images)
        loss   = criterion(logits, masks)

        bs = images.size(0)
        total_loss += loss.item() * bs
        n          += bs

        # Collect per-image Dice for this batch
        preds        = (torch.sigmoid(logits) > 0.5).float()        # (B,1,H,W)
        preds_flat   = preds.view(bs, -1)
        targets_flat = masks.view(bs, -1)
        intersection = (preds_flat * targets_flat).sum(dim=1)       # (B,)
        union        = preds_flat.sum(dim=1) + targets_flat.sum(dim=1)
        per_img_dice = (2.0 * intersection / (union + 1e-8))        # (B,)
        dice_scores.extend(per_img_dice.cpu().tolist())

    mean_dice = float(np.mean(dice_scores))   # equal-weight mean over all val images
    return total_loss / n, mean_dice


# ---------------------------------------------------------------------------
# 11.  Inference & saving predictions
# ---------------------------------------------------------------------------
@torch.no_grad()
def save_predictions(model, val_pairs, device, pred_dir):
    """
    Run inference on each validation image, save predicted binary mask as PNG,
    and copy the corresponding ground-truth mask alongside for comparison.
    """
    model.eval()

    print(f"\n[Inference] Saving predictions to: {pred_dir}")
    for img_path, mask_path in val_pairs:
        from PIL import Image as PILImage
        image = load_image(img_path)                        # (512,512) uint8
        img_pil = PILImage.fromarray(image, mode='L')
        img_t   = TF.to_tensor(img_pil)                    # (1,512,512) float32 [0,1]
        img_t   = TF.normalize(img_t, mean=[0.5], std=[0.5])
        tensor  = img_t.unsqueeze(0).to(device)             # (1,1,512,512)

        logits = model(tensor)
        prob   = torch.sigmoid(logits).squeeze().cpu().numpy()  # (512,512)
        pred   = (prob > 0.5).astype(np.uint8) * 255

        stem = img_path.stem
        cv2.imwrite(str(pred_dir / f"{stem}_pred.png"), pred)

        # Copy ground-truth mask
        gt_dst = pred_dir / f"{stem}_gt.png"
        shutil.copy2(str(mask_path), str(gt_dst))

        print(f"  Saved: {stem}_pred.png  |  {stem}_gt.png")


# ---------------------------------------------------------------------------
# 12.  Main
# ---------------------------------------------------------------------------
def subject_level_split(pairs: list, n_val_subjects: int, seed: int):
    """
    CHASE_DB1 contains L/R images from the SAME subject (e.g. Image_01L, Image_01R).
    Splitting at image level risks placing both eyes from a subject in different splits,
    causing data leakage.  This function splits at the SUBJECT level.

    Strategy:
      - Extract the numeric subject ID (e.g. "01") from each filename.
      - Collect all unique subject IDs.
      - Shuffle subjects with the fixed seed.
      - Assign the first n_val_subjects to validation; the rest to training.
      - Return (train_pairs, val_pairs) with L and R images kept together.
    """
    import re

    # Map subject_id -> list of (img_path, mask_path)
    subjects: dict = {}
    for img_path, mask_path in pairs:
        m = re.search(r"Image_(\d+)[LR]", img_path.stem)
        if m is None:
            raise ValueError(f"Unexpected filename format: {img_path.name}")
        sid = m.group(1)   # e.g. "01"
        subjects.setdefault(sid, []).append((img_path, mask_path))

    subject_ids = sorted(subjects.keys())

    rng = random.Random(seed)
    rng.shuffle(subject_ids)

    val_ids   = subject_ids[:n_val_subjects]
    train_ids = subject_ids[n_val_subjects:]

    train_pairs = [pair for sid in train_ids   for pair in subjects[sid]]
    val_pairs   = [pair for sid in val_ids     for pair in subjects[sid]]

    return train_pairs, val_pairs, sorted(train_ids), sorted(val_ids)


def main():
    # ---- Discover & validate pairs ----------------------------------------
    pairs = discover_pairs(DATASET_DIR)
    validate_pairs(pairs, n_samples=3)

    if len(pairs) != 28:
        print(f"[ERROR] Expected exactly 28 image/mask pairs; found {len(pairs)}.")
        sys.exit(1)

    # ---- Subject-level Train / Val split -----------------------------------
    # CHASE_DB1 has 14 subjects, each contributing an L and R image.
    # Split 11 subjects (22 images) -> train, 3 subjects (6 images) -> val.
    N_VAL_SUBJECTS   = 3
    N_TRAIN_SUBJECTS = 11   # 14 - 3

    train_pairs, val_pairs, train_ids, val_ids = subject_level_split(
        pairs, n_val_subjects=N_VAL_SUBJECTS, seed=SEED
    )

    print(f"Subject-level split  (seed={SEED})")
    print(f"  Training subjects   ({len(train_ids):2d}): {', '.join(train_ids)}")
    print(f"  Validation subjects ({len(val_ids):2d}): {', '.join(val_ids)}")

    print(f"\nTrain split  ({len(train_pairs)} images):")
    for p, _ in sorted(train_pairs, key=lambda x: x[0].name):
        print(f"  {p.name}")

    print(f"\nValidation split  ({len(val_pairs)} images):")
    for p, _ in sorted(val_pairs, key=lambda x: x[0].name):
        print(f"  {p.name}")
    print()

    # ---- Datasets & loaders ------------------------------------------------
    train_ds = ChaseDB1Dataset(train_pairs, augment=True)
    val_ds   = ChaseDB1Dataset(val_pairs,   augment=False)

    train_loader = DataLoader(
        train_ds, batch_size=BATCH_SIZE, shuffle=True,
        num_workers=0, pin_memory=(DEVICE.type == "cuda"),
    )
    val_loader = DataLoader(
        val_ds, batch_size=BATCH_SIZE, shuffle=False,
        num_workers=0, pin_memory=(DEVICE.type == "cuda"),
    )

    # ---- Model -------------------------------------------------------------
    model = smp.Unet(
        encoder_name    = ENCODER,
        encoder_weights = ENC_WEIGHTS,
        in_channels     = 1,           # single green channel
        classes         = 1,
        activation      = None,        # raw logits; loss handles sigmoid
    ).to(DEVICE)

    print(f"[Model] U-Net  encoder={ENCODER}  weights={ENC_WEIGHTS}  "
          f"in_channels=1  classes=1\n")

    # ---- Loss / Optimiser / Scheduler --------------------------------------
    criterion = CombinedLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max",          # maximise val Dice
        factor=LR_FACTOR, patience=LR_PATIENCE,
    )

    # ---- Pre-training sanity check -----------------------------------------
    print(f"\n{'='*60}")
    print("  Pre-training sanity check")
    print(f"{'='*60}")
    print(f"  Train images : {len(train_pairs)}")
    print(f"  Val   images : {len(val_pairs)}")

    # Raw (un-augmented) sample
    raw_img  = load_image(train_pairs[0][0])
    raw_mask = load_mask(train_pairs[0][1])
    print(f"\n  Raw image shape  : {raw_img.shape}  dtype={raw_img.dtype}")
    print(f"  Raw mask  shape  : {raw_mask.shape}  dtype={raw_mask.dtype}")
    assert raw_img.shape == (INPUT_SIZE, INPUT_SIZE), \
        f"Expected ({INPUT_SIZE},{INPUT_SIZE}), got {raw_img.shape}"
    assert raw_img.ndim == 2, "Image must be single-channel (2-D) before augmentation"
    unique_vals = np.unique(raw_mask)
    assert set(unique_vals).issubset({0, 255}), \
        f"Mask must be binary {{0, 255}}, found: {unique_vals}"
    assert raw_img.shape == raw_mask.shape, \
        "Image and mask spatial dimensions must match"
    print("  [OK] Raw image is single-channel")
    print("  [OK] Raw mask values are binary {0, 255}")
    print("  [OK] Image and mask shapes match")

    # Augmented sample (from Dataset __getitem__)
    aug_sample = train_ds[0]
    img_t  = aug_sample["image"]   # torch.Tensor (1, H, W)
    mask_t = aug_sample["mask"]    # torch.Tensor (1, H, W)
    print(f"\n  Augmented image tensor : {tuple(img_t.shape)}  dtype={img_t.dtype}")
    print(f"  Augmented mask  tensor : {tuple(mask_t.shape)}  dtype={mask_t.dtype}")
    assert img_t.shape[0] == 1, f"Expected 1 channel in image tensor, got {img_t.shape[0]}"
    assert img_t.shape[1:] == mask_t.shape[1:], \
        "Augmented image and mask spatial dims must match"
    unique_mask = torch.unique(mask_t)
    assert all(v in [0.0, 1.0] for v in unique_mask.tolist()), \
        f"Mask tensor must be binary {{0.0, 1.0}}, found: {unique_mask.tolist()}"
    print("  [OK] Augmented tensors have correct shapes, dtypes, and value range")
    print(f"{'='*60}\n")

    # ---- Training ----------------------------------------------------------
    best_val_dice  = -1.0
    best_epoch     = 0
    best_state     = None
    es_counter     = 0

    header = (f"{'Epoch':>6}  {'Tr Loss':>9}  {'Tr Dice':>9}  "
              f"{'Vl Loss':>9}  {'Vl Dice':>9}  {'LR':>10}  Notes")
    print(header)
    print("-" * 68)

    for epoch in range(1, MAX_EPOCHS + 1):
        tr_loss, tr_dice = train_one_epoch(model, train_loader, optimizer, criterion, DEVICE)
        vl_loss, vl_dice = validate(model, val_loader, criterion, DEVICE)

        scheduler.step(vl_dice)
        current_lr = optimizer.param_groups[0]["lr"]

        improved = vl_dice > best_val_dice
        marker   = "BEST" if improved else ""

        print(f"{epoch:>6}  {tr_loss:>9.4f}  {tr_dice:>9.4f}  "
              f"{vl_loss:>9.4f}  {vl_dice:>9.4f}  {current_lr:>10.2e}  {marker}")

        if improved:
            best_val_dice = vl_dice
            best_epoch    = epoch
            best_state    = copy.deepcopy(model.state_dict())
            es_counter    = 0

            # Save checkpoint immediately on improvement
            torch.save({
                "model_state_dict" : best_state,
                "encoder"          : ENCODER,
                "encoder_weights"  : ENC_WEIGHTS,
                "input_size"       : INPUT_SIZE,
                "in_channels"      : 1,
                "preprocessing"    : "green_channel_aspect_ratio_resize_center_pad_512",
                "normalization"    : "mean=0.5 std=0.5 max_pixel_value=255",
                "seed"             : SEED,
                "best_epoch"       : best_epoch,
                "best_val_dice"    : best_val_dice,
            }, str(CHECKPOINT))
        else:
            es_counter += 1

        if es_counter >= ES_PATIENCE:
            print(f"\n[Early Stop] No improvement for {ES_PATIENCE} epochs. "
                  f"Best val Dice={best_val_dice:.4f} at epoch {best_epoch}.")
            break

    # ---- Load best checkpoint ----------------------------------------------
    print(f"\n[Checkpoint] Loading best model from epoch {best_epoch} "
          f"(val Dice={best_val_dice:.4f})")
    ckpt = torch.load(str(CHECKPOINT), map_location=DEVICE, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])

    print(f"\n[Checkpoint] Saved to: {CHECKPOINT}")
    print(f"  encoder       : {ckpt['encoder']}")
    print(f"  encoder_weights: {ckpt['encoder_weights']}")
    print(f"  input_size    : {ckpt['input_size']}")
    print(f"  in_channels   : {ckpt['in_channels']}")
    print(f"  preprocessing : {ckpt['preprocessing']}")
    print(f"  normalization : {ckpt['normalization']}")
    print(f"  seed          : {ckpt['seed']}")
    print(f"  best_epoch    : {ckpt['best_epoch']}")
    print(f"  best_val_dice : {ckpt['best_val_dice']:.4f}")

    # ---- Save predictions on validation set --------------------------------
    save_predictions(model, val_pairs, DEVICE, PRED_DIR)

    print(f"\n[Done] Training complete.")
    print(f"       Best val Dice : {best_val_dice:.4f}  (epoch {best_epoch})")
    print(f"       Checkpoint    : {CHECKPOINT}")
    print(f"       Predictions   : {PRED_DIR}")


if __name__ == "__main__":
    main()
