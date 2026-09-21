"""
train_red_lesion_unet_v2.py
----------------------------
Phase 1 of the M5 red-lesion retrain: a TRUE 3-class softmax model
(0=background, 1=microaneurysm, 2=haemorrhage) on the IDRiD segmentation
subset, built to be apples-to-apples comparable with v1's binary
"red lesion = MA OR HE" model (train_red_lesion_unet.py, val Dice 0.5353).

This script is TRAINING + EVALUATION ONLY. It does not touch inference/,
MATLAB, segInfer.py, the rule engine, or any v1 artifact. v1 itself
(train_red_lesion_unet.py) is imported for its dataset discovery, Ben Graham
preprocessing wrapper, retinal-bbox mask alignment, augmentation primitives,
vessel-encoder transfer loader, and image-level dice helper - all reused
UNCHANGED so the train/val split, resolution, and encoder init are identical
to v1's, not just "similar". Only what genuinely differs for 3 classes
(mask construction, patch lesion-presence check, loss, validation, and the
component-level floor sweep) is reimplemented here.

Usage:
    python training/train_red_lesion_unet_v2.py --smoke   # fast pipeline check
    python training/train_red_lesion_unet_v2.py            # full training run
"""

import sys
import json
import time
import random
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))

import numpy as np
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import segmentation_models_pytorch as smp
from PIL import Image, ImageDraw

import train_red_lesion_unet as v1  # noqa: E402  (reuse split/preproc/transfer)

# ===========================================================================
# Paths
# ===========================================================================
PIPELINE_DIR = v1.PIPELINE_DIR
MODELS_DIR   = v1.MODELS_DIR
VESSEL_CKPT  = v1.VESSEL_CKPT

CHECKPOINT   = MODELS_DIR / "red_lesion_unet_v2.pt"
METRICS_JSON = MODELS_DIR / "red_lesion_v2_metrics.json"
CONFIG_JSON  = MODELS_DIR / "red_lesion_v2_config.json"
PRED_DIR     = MODELS_DIR / "red_lesion_predictions_v2"

# ===========================================================================
# CONFIG - inherited from v1 unless a comment says otherwise
# ===========================================================================
SEED            = v1.SEED
BEN_GRAHAM_SIZE = v1.BEN_GRAHAM_SIZE
PATCH_SIZE      = v1.PATCH_SIZE
IN_CHANNELS     = v1.IN_CHANNELS
ENCODER         = v1.ENCODER
N_VAL_IMAGES    = v1.N_VAL_IMAGES
DEVICE          = v1.DEVICE

NUM_CLASSES = 3   # 0=background 1=MA 2=HE  (NEW: v1 was binary)

# v1's exact split, as written into models/red_lesion_predictions(model5)/red_lesion_metrics.json
# (seed=42, 65/16 image-level split of the same 81 discovered records). Kept as a
# hard-coded cross-check, not the source of truth - the source of truth is
# v1.discover_records() + the same shuffle, reproduced below and ASSERTED equal
# to this list so a change to discover_records() would fail loudly here too.
V1_TRAIN_IDS = ['IDRiD_01', 'IDRiD_02', 'IDRiD_03', 'IDRiD_04', 'IDRiD_05', 'IDRiD_06',
    'IDRiD_07', 'IDRiD_08', 'IDRiD_10', 'IDRiD_11', 'IDRiD_12', 'IDRiD_14', 'IDRiD_15',
    'IDRiD_17', 'IDRiD_18', 'IDRiD_19', 'IDRiD_20', 'IDRiD_21', 'IDRiD_22', 'IDRiD_23',
    'IDRiD_25', 'IDRiD_26', 'IDRiD_27', 'IDRiD_28', 'IDRiD_29', 'IDRiD_30', 'IDRiD_32',
    'IDRiD_34', 'IDRiD_35', 'IDRiD_36', 'IDRiD_38', 'IDRiD_39', 'IDRiD_40', 'IDRiD_41',
    'IDRiD_42', 'IDRiD_43', 'IDRiD_44', 'IDRiD_45', 'IDRiD_46', 'IDRiD_47', 'IDRiD_48',
    'IDRiD_49', 'IDRiD_52', 'IDRiD_55', 'IDRiD_56', 'IDRiD_57', 'IDRiD_59', 'IDRiD_60',
    'IDRiD_61', 'IDRiD_62', 'IDRiD_63', 'IDRiD_65', 'IDRiD_67', 'IDRiD_68', 'IDRiD_69',
    'IDRiD_70', 'IDRiD_72', 'IDRiD_73', 'IDRiD_74', 'IDRiD_75', 'IDRiD_76', 'IDRiD_77',
    'IDRiD_79', 'IDRiD_80', 'IDRiD_81']
V1_VAL_IDS = ['IDRiD_09', 'IDRiD_13', 'IDRiD_16', 'IDRiD_24', 'IDRiD_31', 'IDRiD_33',
    'IDRiD_37', 'IDRiD_50', 'IDRiD_51', 'IDRiD_53', 'IDRiD_54', 'IDRiD_58', 'IDRiD_64',
    'IDRiD_66', 'IDRiD_71', 'IDRiD_78']
V1_BEST_VAL_DICE = 0.5353  # models/red_lesion_predictions(model5)/red_lesion_metrics.json
STOP_CONDITION_MARGIN = 0.03  # report plainly, no downstream integration, if we fall > this below v1

# --- optimisation (identical to v1) ---------------------------------------
BATCH_SIZE   = v1.BATCH_SIZE     # 8 - unchanged; the extra 2-class decoder head
                                   # (3 vs 1 output channel) is a negligible
                                   # parameter/activation delta on a resnet34-Unet,
                                   # so v1's batch size still fits the 6GB 4050.
LR           = v1.LR
MAX_EPOCHS   = v1.MAX_EPOCHS
ES_PATIENCE  = v1.ES_PATIENCE
LR_FACTOR    = v1.LR_FACTOR
LR_PATIENCE  = v1.LR_PATIENCE

# --- loss weighting (NEW: v1 used 0.5*Dice + 0.5*Focal; we keep the same
# 0.5/0.5 split but swap Focal for class-weighted CE, since focal's alpha is
# tuned for a single foreground class, not two very differently-sized ones) --
CE_WEIGHT   = 0.5
DICE_WEIGHT = 0.5
CLASS_WEIGHT_CAP = 50.0   # cap inverse-sqrt-frequency weights (MA is extremely rare)

N_VIS_IMAGES = 5

# --- class-specific minimum-area filter sweep (component-level, on val) ---
MA_FLOOR_CANDIDATES = [1, 2, 3, 5, 8]
HE_FLOOR_CANDIDATES = [10, 20, 30, 50]
V1_SHARED_FLOOR = 10  # segInfer.py --min-area default, at 512-space (see inference/segInfer.py)

# ===========================================================================
# 1. THREE-CLASS MASK CONSTRUCTION (MA precedence over HE on overlap)
# ===========================================================================
def build_three_class_mask(rec: "v1.ImageRecord", full_hw):
    """uint8 mask in {0,1,2}: 0=background 1=MA 2=HE. MA takes precedence on
    overlapping pixels. Returns (mask, overlap_pixel_count) at FULL resolution."""
    h, w = full_hw
    ma = np.zeros((h, w), dtype=bool)
    he = np.zeros((h, w), dtype=bool)
    if rec.ma_path is not None:
        m = cv2.imread(str(rec.ma_path), cv2.IMREAD_GRAYSCALE)
        if m is None:
            raise IOError(f"cannot read MA mask {rec.ma_path}")
        ma = m > 0
    if rec.he_path is not None:
        m = cv2.imread(str(rec.he_path), cv2.IMREAD_GRAYSCALE)
        if m is None:
            raise IOError(f"cannot read HE mask {rec.he_path}")
        he = m > 0
    overlap_px = int((ma & he).sum())
    combined = np.zeros((h, w), dtype=np.uint8)
    combined[he] = 2
    combined[ma] = 1   # MA precedence: overwrite HE label on overlap
    return combined, overlap_px


def preprocess_record_v2(rec: "v1.ImageRecord"):
    """Return (proc_rgb uint8 [S,S,3], mask uint8 [S,S] in {0,1,2}, overlap_px_512).
    Mirrors v1.preprocess_record exactly except for the mask construction."""
    img_bgr = cv2.imread(str(rec.image_path))
    if img_bgr is None:
        raise IOError(f"cannot read image {rec.image_path}")
    h, w = img_bgr.shape[:2]

    proc = v1.ben_graham_preprocess(img_bgr, target_size=BEN_GRAHAM_SIZE)

    full_mask, overlap_px_full = build_three_class_mask(rec, (h, w))
    x, y, cw, ch = v1.retinal_bbox(img_bgr)
    mask_crop = full_mask[y:y + ch, x:x + cw]
    mask_s = cv2.resize(mask_crop, (BEN_GRAHAM_SIZE, BEN_GRAHAM_SIZE),
                        interpolation=cv2.INTER_NEAREST)
    mask_s = np.clip(mask_s, 0, 2).astype(np.uint8)

    ma512 = (mask_s == 1)
    he_full_would_be = full_mask[y:y + ch, x:x + cw] == 2
    # overlap AT 512 scale: pixels where a NEAREST-resized MA-label and a
    # NEAREST-resized HE-only-region would coincide is not directly
    # observable post label-collapse; we report the full-res overlap (exact)
    # and separately the count of MA-labelled pixels at 512 for context.
    proc_rgb = cv2.cvtColor(proc, cv2.COLOR_BGR2RGB)
    return proc_rgb, mask_s, overlap_px_full


class PreprocCacheV2:
    """Lazy in-RAM cache: img_id -> (proc_rgb, mask{0,1,2}, overlap_px_full)."""
    def __init__(self, records):
        self._by_id = {r.img_id: r for r in records}
        self._cache = {}

    def get(self, img_id: str):
        if img_id not in self._cache:
            self._cache[img_id] = preprocess_record_v2(self._by_id[img_id])
        return self._cache[img_id]

    def warm(self, ids):
        t0 = time.time()
        for iid in ids:
            self.get(iid)
        return time.time() - t0

    def nbytes(self):
        return sum(a.nbytes + b.nbytes for a, b, _ in self._cache.values())


# ===========================================================================
# 2. PATCH SAMPLING (lesion presence = ANY nonzero-label pixel, not mask.sum())
# ===========================================================================
def sample_patch_v2(img: np.ndarray, mask: np.ndarray, rng: random.Random, want_lesion: bool):
    H, W = mask.shape
    P = PATCH_SIZE
    max_y, max_x = H - P, W - P

    def _crop():
        y = rng.randint(0, max_y)
        x = rng.randint(0, max_x)
        return img[y:y + P, x:x + P], mask[y:y + P, x:x + P]

    if want_lesion and (mask > 0).sum() >= v1.MIN_LESION_PIXELS:
        for _ in range(v1.MAX_CROP_ATTEMPTS):
            ip, mp = _crop()
            if (mp > 0).sum() >= v1.MIN_LESION_PIXELS:
                return ip, mp, True
        ip, mp = _crop()
        return ip, mp, bool((mp > 0).sum() >= v1.MIN_LESION_PIXELS)

    ip, mp = _crop()
    return ip, mp, bool((mp > 0).sum() >= v1.MIN_LESION_PIXELS)


# ===========================================================================
# 3. AUGMENTATION (v1's geometric pipeline, adapted for a 3-value label map)
# ===========================================================================
def augment_v2(img: np.ndarray, mask: np.ndarray, rng: random.Random):
    """img float32 [P,P,3] in [0,255]; mask float32 [P,P] in {0,1,2}.
    Geometric ops use INTER_NEAREST on the mask (as v1 does), which preserves
    discrete label values exactly - no thresholding/binarisation needed."""
    h, w = mask.shape

    if rng.random() < v1.AUG_ROTATE_P:
        angle = rng.uniform(-180.0, 180.0)
        M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
        img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REFLECT_101)
        mask = cv2.warpAffine(mask, M, (w, h), flags=cv2.INTER_NEAREST,
                              borderMode=cv2.BORDER_REFLECT_101)

    if rng.random() < v1.AUG_HFLIP_P:
        img = img[:, ::-1]
        mask = mask[:, ::-1]
    if rng.random() < v1.AUG_VFLIP_P:
        img = img[::-1, :]
        mask = mask[::-1, :]

    if rng.random() < v1.AUG_ELASTIC_P:
        nrng = np.random.default_rng(rng.randrange(2 ** 32))
        img, mask = v1._elastic(np.ascontiguousarray(img), np.ascontiguousarray(mask), nrng)

    if rng.random() < v1.AUG_BRIGHTNESS_P:
        c = 1.0 + rng.uniform(-v1.CONTRAST_DELTA, v1.CONTRAST_DELTA)
        b = 255.0 * rng.uniform(-v1.BRIGHTNESS_DELTA, v1.BRIGHTNESS_DELTA)
        mean = float(img.mean())
        img = (img - mean) * c + mean + b

    img = np.ascontiguousarray(np.clip(img, 0.0, 255.0), dtype=np.float32)
    mask = np.ascontiguousarray(np.clip(np.rint(mask), 0, 2).astype(np.float32))
    return img, mask


# ===========================================================================
# 4. DATASET
# ===========================================================================
class RedLesionPatchDatasetV2(Dataset):
    def __init__(self, records, cache: PreprocCacheV2, augment_on: bool):
        self.records = list(records)
        self.cache = cache
        self.augment_on = augment_on
        self.n = len(self.records)
        self.epoch = 0

    def set_epoch(self, e: int):
        self.epoch = e

    def __len__(self):
        return self.n * v1.PATCHES_PER_IMAGE_EPOCH

    def __getitem__(self, idx):
        rec = self.records[idx % self.n]
        proc_rgb, mask, _ = self.cache.get(rec.img_id)

        rng = random.Random((SEED * 1_000_003) ^ (self.epoch * 9_973) ^ (idx * 131))
        want_lesion = rng.random() < v1.LESION_PATCH_RATIO

        img_f = proc_rgb.astype(np.float32)
        mask_f = mask.astype(np.float32)
        ip, mp, has_les = sample_patch_v2(img_f, mask_f, rng, want_lesion)

        if self.augment_on:
            ip, mp = augment_v2(ip, mp, rng)

        img_t = v1.to_input_tensor(ip)
        mask_t = torch.from_numpy(np.ascontiguousarray(
            np.clip(np.rint(mp), 0, 2).astype(np.int64)))
        return {"image": img_t, "mask": mask_t, "has_lesion": float(has_les), "id": rec.img_id}


# ===========================================================================
# 5. LOSS / METRICS
# ===========================================================================
def compute_class_weights(train_recs, cache: PreprocCacheV2) -> torch.Tensor:
    counts = np.zeros(NUM_CLASSES, dtype=np.int64)
    for r in train_recs:
        _, m, _ = cache.get(r.img_id)
        for c in range(NUM_CLASSES):
            counts[c] += int((m == c).sum())
    freq = counts / counts.sum()
    w = 1.0 / np.sqrt(freq + 1e-12)
    w = w / w[0]                       # background weight fixed at 1.0
    w = np.clip(w, 1.0, CLASS_WEIGHT_CAP)
    return torch.tensor(w, dtype=torch.float32), counts.tolist(), freq.tolist()


class WeightedCEDiceLoss(nn.Module):
    """CE_WEIGHT * class-weighted CE + DICE_WEIGHT * per-class Dice averaged
    over MA and HE (background excluded from the Dice term, as is standard -
    it dominates by pixel count and adds nothing the CE term doesn't already
    penalise)."""
    def __init__(self, class_weights: torch.Tensor):
        super().__init__()
        self.ce = nn.CrossEntropyLoss(weight=class_weights)
        self.dice = smp.losses.DiceLoss(mode="multiclass", classes=[1, 2],
                                        from_logits=True, smooth=1.0)

    def forward(self, logits, targets):
        return CE_WEIGHT * self.ce(logits, targets) + DICE_WEIGHT * self.dice(logits, targets)


def dice_multiclass_patch(logits, targets, eps=1.0):
    """Mean per-sample merged-lesion (MA|HE vs background) Dice over a patch
    batch - the training-loop progress metric, analogous to v1's patch Dice."""
    preds = torch.argmax(logits, dim=1)
    p = (preds > 0).float().view(preds.size(0), -1)
    t = (targets > 0).float().view(targets.size(0), -1)
    inter = (p * t).sum(1)
    dice = (2 * inter + eps) / (p.sum(1) + t.sum(1) + eps)
    return dice.mean().item()


# ===========================================================================
# 6. MODEL
# ===========================================================================
def build_model_v2() -> smp.Unet:
    return smp.Unet(
        encoder_name=ENCODER,
        encoder_weights=None,
        in_channels=IN_CHANNELS,
        classes=NUM_CLASSES,
        activation=None,
    )


# ===========================================================================
# 7. IMAGE-LEVEL VALIDATION
# ===========================================================================
@torch.no_grad()
def validate_image_level_v2(model, val_records, cache: PreprocCacheV2, criterion):
    model.eval()
    per_ma, per_he, per_merged = {}, {}, {}
    losses = []
    for rec in val_records:
        proc_rgb, gt, _ = cache.get(rec.img_id)
        x = v1.to_input_tensor(proc_rgb.astype(np.float32)).unsqueeze(0).to(DEVICE)
        logits = model(x)
        target = torch.from_numpy(gt.astype(np.int64))[None].to(DEVICE)
        losses.append(criterion(logits, target).item())
        pred = torch.argmax(logits, dim=1)[0].cpu().numpy().astype(np.uint8)
        per_ma[rec.img_id] = v1.dice_binary(pred == 1, gt == 1)
        per_he[rec.img_id] = v1.dice_binary(pred == 2, gt == 2)
        per_merged[rec.img_id] = v1.dice_binary(pred > 0, gt > 0)
    mean_loss = float(np.mean(losses))
    mean_ma = float(np.mean(list(per_ma.values())))
    mean_he = float(np.mean(list(per_he.values())))
    mean_merged = float(np.mean(list(per_merged.values())))
    return mean_loss, mean_ma, mean_he, mean_merged, per_ma, per_he, per_merged


def train_one_epoch_v2(model, loader, optimizer, criterion):
    model.train()
    tot_loss = tot_dice = n = 0
    for batch in loader:
        images = batch["image"].to(DEVICE, non_blocking=True)
        masks = batch["mask"].to(DEVICE, non_blocking=True)
        optimizer.zero_grad(set_to_none=True)
        logits = model(images)
        loss = criterion(logits, masks)
        loss.backward()
        optimizer.step()
        bs = images.size(0)
        tot_loss += loss.item() * bs
        tot_dice += dice_multiclass_patch(logits.detach(), masks) * bs
        n += bs
    return tot_loss / n, tot_dice / n


# ===========================================================================
# 8. COMPONENT-LEVEL EVALUATION + MIN-AREA FLOOR SWEEP
# ===========================================================================
def connected_components(mask_bin: np.ndarray):
    n, labels, stats, _ = cv2.connectedComponentsWithStats(
        mask_bin.astype(np.uint8), connectivity=8)
    comps = [{"label": i, "area": int(stats[i, cv2.CC_STAT_AREA])} for i in range(1, n)]
    return labels, comps


def filter_components_by_area(labels: np.ndarray, comps: list, min_area: int):
    kept = [c for c in comps if c["area"] >= min_area]
    discarded = [c for c in comps if c["area"] < min_area]
    if kept:
        keep_labels = np.array([c["label"] for c in kept])
        mask = np.isin(labels, keep_labels)
    else:
        mask = np.zeros(labels.shape, dtype=bool)
    return mask, kept, discarded


def component_match_stats(pred_mask_bin: np.ndarray, gt_mask_bin: np.ndarray):
    """Any-overlap component matching (standard for sparse-lesion detection):
    a GT component counts as recalled if ANY predicted pixel overlaps it; a
    predicted component counts as a precision hit if it overlaps ANY GT pixel."""
    pred_labels, pred_comps = connected_components(pred_mask_bin)
    gt_labels, gt_comps = connected_components(gt_mask_bin)
    gt_hit = 0
    for c in gt_comps:
        if pred_mask_bin[gt_labels == c["label"]].any():
            gt_hit += 1
    pred_hit = 0
    for c in pred_comps:
        if gt_mask_bin[pred_labels == c["label"]].any():
            pred_hit += 1
    return {"n_gt": len(gt_comps), "n_pred": len(pred_comps),
            "gt_hit": gt_hit, "pred_hit": pred_hit}


@torch.no_grad()
def collect_raw_val_predictions(model, val_records, cache: PreprocCacheV2):
    """One forward pass per val image; cache raw (pre-filter) class masks so
    the floor sweep doesn't re-run the model per candidate."""
    model.eval()
    raw = {}
    for rec in val_records:
        proc_rgb, gt, _ = cache.get(rec.img_id)
        x = v1.to_input_tensor(proc_rgb.astype(np.float32)).unsqueeze(0).to(DEVICE)
        pred = torch.argmax(model(x), dim=1)[0].cpu().numpy().astype(np.uint8)
        raw[rec.img_id] = {"pred_ma": pred == 1, "pred_he": pred == 2,
                           "gt_ma": gt == 1, "gt_he": gt == 2}
    return raw


def sweep_floor(raw_preds: dict, class_key: str, candidates: list):
    """class_key in {'ma','he'}. Returns list of dicts, one per candidate floor,
    with pooled (val-set-wide) component-level recall/precision/F1 and the
    kept/discarded component counts."""
    results = []
    for floor in candidates:
        agg = {"n_gt": 0, "n_pred": 0, "gt_hit": 0, "pred_hit": 0}
        kept_total = discarded_total = 0
        for iid, d in raw_preds.items():
            pred_bin = d[f"pred_{class_key}"]
            gt_bin = d[f"gt_{class_key}"]
            labels, comps = connected_components(pred_bin)
            filt_mask, kept, discarded = filter_components_by_area(labels, comps, floor)
            kept_total += len(kept)
            discarded_total += len(discarded)
            stats = component_match_stats(filt_mask, gt_bin)
            for k in agg:
                agg[k] += stats[k]
        recall = agg["gt_hit"] / agg["n_gt"] if agg["n_gt"] else 0.0
        precision = agg["pred_hit"] / agg["n_pred"] if agg["n_pred"] else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        results.append({"floor": floor, "recall": recall, "precision": precision, "f1": f1,
                        "n_gt": agg["n_gt"], "n_pred_kept": agg["n_pred"],
                        "kept_components": kept_total, "discarded_components": discarded_total})
    return results


def shared_floor_baseline(raw_preds: dict, floor: int):
    """Apply ONE shared floor across MA+HE predictions combined (mirrors v1 /
    segInfer.py's single --min-area filter) for a discard-rate comparison."""
    kept_total = discarded_total = 0
    for iid, d in raw_preds.items():
        merged_pred = d["pred_ma"] | d["pred_he"]
        labels, comps = connected_components(merged_pred)
        _, kept, discarded = filter_components_by_area(labels, comps, floor)
        kept_total += len(kept)
        discarded_total += len(discarded)
    total = kept_total + discarded_total
    pct_discarded = 100.0 * discarded_total / total if total else 0.0
    return {"floor": floor, "kept": kept_total, "discarded": discarded_total,
            "total": total, "pct_discarded": pct_discarded}


def ma_size_distribution(records, cache: PreprocCacheV2, bins: list):
    """GT MA component-area histogram at the model's 512px input scale,
    pooled across ALL 81 images (train+val) - grounds the floor sweep in the
    actual size distribution rather than an assumption carried over from a
    different resolution."""
    areas = []
    for r in records:
        _, gt, _ = cache.get(r.img_id)
        _, comps = connected_components(gt == 1)
        areas.extend(c["area"] for c in comps)
    areas = np.array(sorted(areas))
    hist = {}
    for b in bins:
        hist[f"<{b}px"] = int((areas < b).sum())
    return {
        "n_components": int(len(areas)),
        "min": int(areas.min()) if len(areas) else 0,
        "median": float(np.median(areas)) if len(areas) else 0.0,
        "mean": float(areas.mean()) if len(areas) else 0.0,
        "max": int(areas.max()) if len(areas) else 0,
        "cumulative_below": hist,
        "pct_cumulative_below": {k: round(100.0 * v / len(areas), 1) if len(areas) else 0.0
                                 for k, v in hist.items()},
    }


# ===========================================================================
# 9. VISUALISATION
# ===========================================================================
@torch.no_grad()
def save_visualisations_v2(model, vis_records, cache: PreprocCacheV2, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    model.eval()
    saved = []
    for rec in vis_records:
        proc_rgb, gt, _ = cache.get(rec.img_id)
        x = v1.to_input_tensor(proc_rgb.astype(np.float32)).unsqueeze(0).to(DEVICE)
        pred = torch.argmax(model(x), dim=1)[0].cpu().numpy().astype(np.uint8)
        d_merged = v1.dice_binary(pred > 0, gt > 0)

        def colourise(lbl):
            out = np.zeros((*lbl.shape, 3), dtype=np.uint8)
            out[lbl == 1] = (255, 0, 0)     # MA = red
            out[lbl == 2] = (255, 255, 0)   # HE = yellow
            return out

        gt_rgb = colourise(gt)
        pred_rgb = colourise(pred)
        overlay = proc_rgb.copy()
        overlay[gt == 1] = (0.35 * overlay[gt == 1] + np.array([0, 200, 0]) * 0.65).astype(np.uint8)
        overlay[gt == 2] = (0.35 * overlay[gt == 2] + np.array([0, 120, 255]) * 0.65).astype(np.uint8)
        overlay[pred == 1] = (0.35 * overlay[pred == 1] + np.array([220, 0, 0]) * 0.65).astype(np.uint8)
        overlay[pred == 2] = (0.35 * overlay[pred == 2] + np.array([255, 255, 0]) * 0.65).astype(np.uint8)

        strip = np.concatenate([proc_rgb, gt_rgb, pred_rgb, overlay], axis=1)
        bar = 22
        canvas = Image.new("RGB", (strip.shape[1], strip.shape[0] + bar), "white")
        canvas.paste(Image.fromarray(strip), (0, bar))
        ImageDraw.Draw(canvas).text(
            (6, 5),
            f"{rec.img_id}   mergedDice={d_merged:.3f}    |   preprocessed   |   "
            f"GT (red=MA,yellow=HE)   |   prediction   |   overlay",
            fill=(0, 0, 0))
        fp = out_dir / f"{rec.img_id}_redlesion_v2.png"
        canvas.save(str(fp))
        saved.append((rec.img_id, str(fp), d_merged))
    return saved


# ===========================================================================
# 10. SANITY CHECKS
# ===========================================================================
def run_sanity_checks_v2(train_recs, val_recs, cache, model, transfer_stats,
                          full_train_recs=None, full_val_recs=None):
    print("\n" + "=" * 70)
    print("  SANITY CHECKS v2 (must pass before training)")
    print("=" * 70)
    critical_fail = False

    def ok(msg):   print(f"  [OK]      {msg}")
    def warn(msg): print(f"  [WARNING] {msg}")
    def err(msg):
        nonlocal critical_fail
        critical_fail = True
        print(f"  [ERROR]   {msg}")

    # The split-identity check always runs against the FULL 65/16 split, even
    # in smoke mode (which trains/validates on a small subset of it) - smoke
    # mode subsets which records get used, it never changes what the split is.
    chk_train = full_train_recs if full_train_recs is not None else train_recs
    chk_val = full_val_recs if full_val_recs is not None else val_recs
    if sorted(r.img_id for r in chk_train) == sorted(V1_TRAIN_IDS) and \
       sorted(r.img_id for r in chk_val) == sorted(V1_VAL_IDS):
        ok(f"Split identical to v1: train={len(chk_train)} val={len(chk_val)}")
    else:
        err("Split DIFFERS from v1's recorded split - Dice will not be comparable")

    inter = set(r.img_id for r in train_recs) & set(r.img_id for r in val_recs)
    if not inter:
        ok("No source image appears in both train and validation")
    else:
        err(f"Leakage! images in both splits: {sorted(inter)}")

    proc_rgb, mask_s, _ = cache.get(train_recs[0].img_id)
    if proc_rgb.shape == (BEN_GRAHAM_SIZE, BEN_GRAHAM_SIZE, 3) and mask_s.shape == (BEN_GRAHAM_SIZE, BEN_GRAHAM_SIZE):
        ok(f"Preprocessing OK: image {proc_rgb.shape}, mask {mask_s.shape} (aligned)")
    else:
        err(f"Preproc shape wrong: image {proc_rgb.shape}, mask {mask_s.shape}")
    uniq = set(np.unique(mask_s).tolist())
    if uniq.issubset({0, 1, 2}):
        ok(f"3-class mask values valid: {sorted(uniq)}")
    else:
        err(f"Mask has invalid label values: {sorted(uniq)}")

    # MA precedence check on the one record with the biggest known full-res overlap
    ov_rec = next((r for r in train_recs + val_recs if r.img_id == "IDRiD_64"), None)
    if ov_rec is not None and ov_rec.ma_path and ov_rec.he_path:
        img_bgr = cv2.imread(str(ov_rec.image_path))
        full_mask, overlap_px = build_three_class_mask(ov_rec, img_bgr.shape[:2])
        ma = cv2.imread(str(ov_rec.ma_path), cv2.IMREAD_GRAYSCALE) > 0
        if overlap_px > 0 and np.all(full_mask[ma] == 1):
            ok(f"MA precedence verified on {ov_rec.img_id}: {overlap_px} overlap px, "
               f"all MA-labelled pixels retain label 1 despite HE overlap")
        elif overlap_px == 0:
            warn(f"{ov_rec.img_id} has no MA/HE overlap at runtime (expected some) - "
                 f"precedence untested on this record")
        else:
            err(f"MA precedence broken on {ov_rec.img_id}: some MA pixels lost label 1")
    else:
        warn("Could not locate IDRiD_64 in this split for the MA-precedence check")

    rng = random.Random(0)
    ipatch, mpatch, _ = sample_patch_v2(proc_rgb.astype(np.float32), mask_s.astype(np.float32), rng, True)
    if ipatch.shape == (PATCH_SIZE, PATCH_SIZE, 3) and mpatch.shape == (PATCH_SIZE, PATCH_SIZE):
        ok(f"Sampled patch dims: image {ipatch.shape}, mask {mpatch.shape}")
    else:
        err(f"Patch dims wrong: image {ipatch.shape}, mask {mpatch.shape}")

    model.to(DEVICE)
    ds = RedLesionPatchDatasetV2(train_recs, cache, augment_on=True)
    b = [ds[i] for i in range(BATCH_SIZE)]
    imgs = torch.stack([x["image"] for x in b]).to(DEVICE)
    msks = torch.stack([x["mask"] for x in b]).to(DEVICE)
    if msks.dtype == torch.int64 and set(torch.unique(msks).tolist()).issubset({0, 1, 2}):
        ok(f"Batch mask dtype/values OK: {msks.dtype}, values {sorted(set(torch.unique(msks).tolist()))}")
    else:
        err(f"Batch mask dtype/values wrong: {msks.dtype}, {torch.unique(msks)}")

    class_weights, counts, freq = compute_class_weights(train_recs, cache)
    criterion = WeightedCEDiceLoss(class_weights.to(DEVICE)).to(DEVICE)
    model.train()
    out = model(imgs)
    if tuple(out.shape) == (BATCH_SIZE, NUM_CLASSES, PATCH_SIZE, PATCH_SIZE):
        ok(f"Model forward pass OK: {tuple(imgs.shape)} -> {tuple(out.shape)}")
    else:
        err(f"Model forward output shape {tuple(out.shape)}")
    loss = criterion(out, msks)
    if torch.isfinite(loss) and loss.ndim == 0:
        ok(f"Loss is a finite scalar: {loss.item():.4f}  (class weights={class_weights.tolist()})")
    else:
        err(f"Loss not finite scalar: {loss}")
    loss.backward()
    g = model.encoder.conv1.weight.grad
    if g is not None and torch.isfinite(g).all() and g.abs().sum() > 0:
        ok("Backprop OK: finite non-zero gradient on encoder.conv1")
    else:
        err("Backprop produced no/nan gradient on encoder.conv1")
    model.zero_grad(set_to_none=True)

    if torch.cuda.is_available():
        ok(f"GPU detected: {torch.cuda.get_device_name(0)}")
    else:
        warn("CUDA not available - training will run on CPU (slow but valid)")

    ts = transfer_stats
    if (ts["encoder_tensors_changed_vs_random_init"] >= 200
            and not ts["missing_encoder_keys"]
            and ts["deep_layer_verified"] and ts["conv1_verified"]):
        ok(f"Vessel encoder transfer verified: {ts['encoder_param_tensors_loaded']} tensors, "
           f"conv1 {ts['conv1_handling']}")
    else:
        err(f"Vessel encoder transfer NOT confirmed: {ts}")

    print("=" * 70)
    if critical_fail:
        print("  RESULT: CRITICAL SANITY CHECK FAILED - aborting before training.")
        print("=" * 70)
        sys.exit(1)
    print("  RESULT: all critical sanity checks passed.")
    print("=" * 70 + "\n")
    return class_weights, counts, freq


# ===========================================================================
# 11. MAIN
# ===========================================================================
def main():
    t_start = time.time()
    v1.set_seed(SEED)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    smoke = "--smoke" in sys.argv

    print("=" * 70)
    print("  RED-LESION v2 (3-class: bg/MA/HE)  --  IDRiD segmentation")
    print("  Phase 1 of the M5 retrain - TRAINING + EVALUATION ONLY")
    print("=" * 70)
    print(f"  Python exe        : {sys.executable}")
    print(f"  Torch / CUDA      : {torch.__version__} / {torch.version.cuda}  "
          f"available={torch.cuda.is_available()}")
    print(f"  Device            : {DEVICE}"
          + (f"  ({torch.cuda.get_device_name(0)})" if DEVICE.type == "cuda" else ""))
    print(f"  smp version       : {smp.__version__}")
    print(f"  mode              : {'SMOKE TEST' if smoke else 'FULL RUN'}")

    # ---- 1. discover (reuses v1 EXACTLY) --------------------------------
    records = v1.discover_records()
    records.sort(key=lambda r: r.img_id)
    cache = PreprocCacheV2(records)

    ids_sorted = [r.img_id for r in records]
    shuffled = ids_sorted[:]
    random.Random(SEED).shuffle(shuffled)
    val_ids = set(shuffled[:N_VAL_IMAGES])
    train_ids = set(shuffled[N_VAL_IMAGES:])
    train_recs = [r for r in records if r.img_id in train_ids]
    val_recs = [r for r in records if r.img_id in val_ids]
    assert not (train_ids & val_ids), "image-level split leak"

    print("-" * 70)
    print(f"  IMAGE-LEVEL SPLIT (seed={SEED}, reproduced from v1)   "
          f"train={len(train_recs)}  val={len(val_recs)}")
    print("-" * 70)

    if smoke:
        train_recs_use = train_recs[:8]
        val_recs_use = val_recs[:4]
        print(f"  [SMOKE] using {len(train_recs_use)} train / {len(val_recs_use)} val images, 2 epochs")
    else:
        train_recs_use = train_recs
        val_recs_use = val_recs

    dt = cache.warm([r.img_id for r in records])
    total_overlap = sum(cache.get(r.img_id)[2] for r in records)
    print(f"  Preprocessed-image RAM cache warmed: {len(records)} images in {dt:.1f}s, "
          f"{cache.nbytes() / 1e6:.1f} MB resident")
    print(f"  MA/HE overlap pixels (full resolution, summed over dataset): {total_overlap}")

    # ---- 2. model + vessel encoder transfer -----------------------------
    print("-" * 70)
    print("  MODEL + VESSEL-ENCODER TRANSFER (identical procedure to v1)")
    print("-" * 70)
    model = build_model_v2()
    ts = v1.load_vessel_encoder(model, VESSEL_CKPT)
    model.to(DEVICE)
    print(f"  encoder tensors loaded: {ts['encoder_param_tensors_loaded']}  "
          f"conv1: {ts['conv1_handling']}")

    # ---- 3. sanity checks -------------------------------------------------
    class_weights, class_counts, class_freq = run_sanity_checks_v2(
        train_recs_use, val_recs_use, cache, model, ts,
        full_train_recs=train_recs, full_val_recs=val_recs)
    class_weights = class_weights.to(DEVICE)
    criterion = WeightedCEDiceLoss(class_weights).to(DEVICE)
    print(f"  Class pixel counts (train, 512-space): bg={class_counts[0]:,} "
          f"MA={class_counts[1]:,} HE={class_counts[2]:,}")
    print(f"  Class weights (CE): bg=1.00 MA={class_weights[1]:.2f} HE={class_weights[2]:.2f}")

    max_epochs = 2 if smoke else MAX_EPOCHS
    es_patience = 999 if smoke else ES_PATIENCE

    train_ds = RedLesionPatchDatasetV2(train_recs_use, cache, augment_on=True)
    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,
                              num_workers=0, pin_memory=(DEVICE.type == "cuda"), drop_last=True)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
        optimizer, mode="max", factor=LR_FACTOR, patience=LR_PATIENCE)

    print("-" * 70)
    print(f"{'Epoch':>5} | {'TrLoss':>8} {'TrDice':>7} | {'VlLoss':>8} {'VlMerged':>8} "
          f"{'VlMA':>7} {'VlHE':>7} | {'LR':>9} | {'sec':>6} | notes")
    print("-" * 70)

    best_val_dice = -1.0
    best_epoch = 0
    best_per = ({}, {}, {})
    epoch_times = []
    es_counter = 0

    for epoch in range(1, max_epochs + 1):
        e0 = time.time()
        train_ds.set_epoch(epoch)
        tr_loss, tr_dice = train_one_epoch_v2(model, train_loader, optimizer, criterion)
        vl_loss, vl_ma, vl_he, vl_merged, per_ma, per_he, per_merged = validate_image_level_v2(
            model, val_recs_use, cache, criterion)
        scheduler.step(vl_merged)
        lr_now = optimizer.param_groups[0]["lr"]
        e_dt = time.time() - e0
        epoch_times.append(e_dt)

        improved = vl_merged > best_val_dice
        note = ""
        if improved:
            best_val_dice = vl_merged
            best_epoch = epoch
            best_per = (per_ma, per_he, per_merged)
            es_counter = 0
            note = "BEST -> checkpoint"
            if not smoke:
                ckpt = {
                    "model_state_dict": model.state_dict(),
                    "architecture": "segmentation_models_pytorch.Unet",
                    "encoder_name": ENCODER,
                    "encoder_init": f"transfer from models/{VESSEL_CKPT.name} (encoder only; "
                                    f"conv1 {ts['conv1_handling']})",
                    "in_channels": IN_CHANNELS,
                    "classes": NUM_CLASSES,
                    "class_map": {"0": "background", "1": "microaneurysm", "2": "haemorrhage"},
                    "activation": None,
                    "patch_size": PATCH_SIZE,
                    "image_input_size": BEN_GRAHAM_SIZE,
                    "preprocessing": ("ben_graham_preprocess -> RGB; per-channel normalise "
                                      "(x/255 - 0.5)/0.5; masks resized NEAREST; "
                                      "3-class target = MA(1) precedence over HE(2) over bg(0)"),
                    "seed": SEED,
                    "best_epoch": best_epoch,
                    "best_val_dice_merged": best_val_dice,
                    "loss": f"{CE_WEIGHT}*WeightedCE + {DICE_WEIGHT}*Dice(classes=[MA,HE])",
                    "class_weights": class_weights.tolist(),
                    "optimizer": "Adam",
                    "lr": LR,
                    "vessel_transfer_stats": ts,
                }
                torch.save(ckpt, str(CHECKPOINT))
        else:
            es_counter += 1

        print(f"{epoch:>5} | {tr_loss:>8.4f} {tr_dice:>7.4f} | {vl_loss:>8.4f} {vl_merged:>8.4f} "
              f"{vl_ma:>7.4f} {vl_he:>7.4f} | {lr_now:>9.2e} | {e_dt:>6.1f} | {note}")

        if es_counter >= es_patience:
            print(f"\n  Early stopping: no val merged-Dice improvement for {ES_PATIENCE} epochs.")
            break

    mean_epoch_s = float(np.mean(epoch_times)) if epoch_times else 0.0
    print("-" * 70)
    print(f"  Best epoch {best_epoch}  |  best val merged Dice {best_val_dice:.4f}  |  "
          f"mean {mean_epoch_s:.1f} s/epoch over {len(epoch_times)} epochs")

    if smoke:
        print("\n  [SMOKE TEST DONE] pipeline runs end-to-end without error. "
              "No checkpoint/metrics written (smoke mode).")
        print(f"  wall time: {(time.time() - t_start):.1f} s")
        return

    # ---- reload best checkpoint -----------------------------------------
    ckpt = torch.load(str(CHECKPOINT), map_location=DEVICE, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"  Reloaded best checkpoint: {CHECKPOINT}")

    best_per_ma, best_per_he, best_per_merged = best_per

    # ---- visualisations ---------------------------------------------------
    vis_pool = sorted(val_recs, key=lambda r: best_per_merged.get(r.img_id, 0.0), reverse=True)
    pick = vis_pool[:max(1, N_VIS_IMAGES // 2)] + vis_pool[-(N_VIS_IMAGES - N_VIS_IMAGES // 2):]
    seen, vis_records = set(), []
    for r in pick:
        if r.img_id not in seen:
            seen.add(r.img_id)
            vis_records.append(r)
    vis_records = vis_records[:N_VIS_IMAGES]
    saved = save_visualisations_v2(model, vis_records, cache, PRED_DIR)
    print(f"  Saved {len(saved)} visualisations to {PRED_DIR}")

    # ---- component-level evaluation + floor sweep -------------------------
    print("-" * 70)
    print("  COMPONENT-LEVEL EVALUATION + MIN-AREA FLOOR SWEEP (val set)")
    print("-" * 70)
    raw_preds = collect_raw_val_predictions(model, val_recs, cache)

    ma_sweep = sweep_floor(raw_preds, "ma", MA_FLOOR_CANDIDATES)
    he_sweep = sweep_floor(raw_preds, "he", HE_FLOOR_CANDIDATES)

    best_ma = max(ma_sweep, key=lambda r: (r["f1"], -r["floor"]))
    best_he = max(he_sweep, key=lambda r: (r["f1"], -r["floor"]))

    print("  MA floor sweep:")
    for r in ma_sweep:
        print(f"    floor={r['floor']:>2}px  recall={r['recall']:.3f}  precision={r['precision']:.3f}  "
              f"F1={r['f1']:.3f}  kept={r['kept_components']}  discarded={r['discarded_components']}")
    print(f"  -> chosen MA floor: {best_ma['floor']}px (max F1={best_ma['f1']:.3f})")

    print("  HE floor sweep:")
    for r in he_sweep:
        print(f"    floor={r['floor']:>2}px  recall={r['recall']:.3f}  precision={r['precision']:.3f}  "
              f"F1={r['f1']:.3f}  kept={r['kept_components']}  discarded={r['discarded_components']}")
    print(f"  -> chosen HE floor: {best_he['floor']}px (max F1={best_he['f1']:.3f})")

    shared_v2 = shared_floor_baseline(raw_preds, V1_SHARED_FLOOR)
    print(f"  For context - applying v1's SHARED {V1_SHARED_FLOOR}px floor to v2's own "
          f"MA+HE predictions: {shared_v2['discarded']}/{shared_v2['total']} components discarded "
          f"({shared_v2['pct_discarded']:.1f}%) [v1's measured shared-filter discard rate: 41.4%]")

    ma_dist = ma_size_distribution(records, cache, [1, 2, 3, 5, 8, 10, 20, 30, 50, 100])
    print(f"  MA GT component-size distribution at 512px (n={ma_dist['n_components']} components, "
          f"all 81 images): median={ma_dist['median']:.1f}px "
          f"pct<10px={ma_dist['pct_cumulative_below']['<10px']}%")

    # ---- metrics / config JSON --------------------------------------------
    metrics = {
        "phase": "M5 red-lesion retrain, Phase 1 (training + evaluation only)",
        "best_epoch": best_epoch,
        "best_val_dice_merged": best_val_dice,
        "val_dice_ma": float(np.mean(list(best_per_ma.values()))),
        "val_dice_he": float(np.mean(list(best_per_he.values()))),
        "val_dice_merged": float(np.mean(list(best_per_merged.values()))),
        "per_image_val_dice_ma": best_per_ma,
        "per_image_val_dice_he": best_per_he,
        "per_image_val_dice_merged": best_per_merged,
        "v1_comparison": {
            "v1_best_val_dice": V1_BEST_VAL_DICE,
            "v2_val_dice_merged": best_val_dice,
            "delta": round(best_val_dice - V1_BEST_VAL_DICE, 4),
            "stop_condition_margin": STOP_CONDITION_MARGIN,
            "stop_condition_triggered": bool(best_val_dice < V1_BEST_VAL_DICE - STOP_CONDITION_MARGIN),
        },
        "train_image_count": len(train_recs),
        "val_image_count": len(val_recs),
        "seed": SEED,
        "class_pixel_counts_train": {"background": class_counts[0], "MA": class_counts[1], "HE": class_counts[2]},
        "class_weights_ce": class_weights.tolist(),
        "ma_he_overlap_px_full_res": total_overlap,
        "ma_size_distribution_512px": ma_dist,
        "floor_sweep": {"ma": ma_sweep, "he": he_sweep},
        "chosen_floors": {"ma": best_ma["floor"], "he": best_he["floor"]},
        "shared_floor_baseline_on_v2": shared_v2,
        "v1_measured_shared_floor_discard_pct": 41.4,
        "timing": {"mean_seconds_per_epoch": mean_epoch_s, "num_epochs_run": len(epoch_times),
                  "total_wall_minutes": round((time.time() - t_start) / 60, 2)},
        "model_config": {
            "architecture": "segmentation_models_pytorch.Unet",
            "encoder_name": ENCODER,
            "encoder_init": f"transfer from models/{VESSEL_CKPT.name} (encoder only)",
            "in_channels": IN_CHANNELS,
            "classes": NUM_CLASSES,
            "class_map": {"0": "background", "1": "microaneurysm", "2": "haemorrhage"},
            "image_input_size": BEN_GRAHAM_SIZE,
            "patch_size": PATCH_SIZE,
            "batch_size": BATCH_SIZE,
            "lr": LR,
            "max_epochs": MAX_EPOCHS,
            "es_patience": ES_PATIENCE,
            "loss": f"{CE_WEIGHT}*WeightedCE + {DICE_WEIGHT}*Dice(classes=[MA,HE])",
        },
        "vessel_transfer": ts,
    }
    with open(METRICS_JSON, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Wrote metrics JSON: {METRICS_JSON}")

    config = {
        "chosen_min_area_floors": {"MA": best_ma["floor"], "HE": best_he["floor"]},
        "v1_shared_floor_for_reference": V1_SHARED_FLOOR,
        "resolution": BEN_GRAHAM_SIZE,
        "patch_size": PATCH_SIZE,
        "num_classes": NUM_CLASSES,
        "class_map": {"0": "background", "1": "microaneurysm", "2": "haemorrhage"},
        "train_ids": sorted(r.img_id for r in train_recs),
        "val_ids": sorted(r.img_id for r in val_recs),
        "seed": SEED,
        "checkpoint": str(CHECKPOINT),
        "note": ("Phase 1 artifact - training + evaluation only. NOT wired into inference/, "
                "segInfer.py, MATLAB, or the rule engine. Per the M5 plan, redFloor/"
                "grade3QuadMin recalibration is a separate, later step once this model is "
                "actually adopted for inference."),
    }
    with open(CONFIG_JSON, "w") as f:
        json.dump(config, f, indent=2)
    print(f"  Wrote config JSON: {CONFIG_JSON}")

    print("\n" + "=" * 70)
    print("  DONE")
    print("=" * 70)
    print(f"  best epoch / val merged Dice : {best_epoch} / {best_val_dice:.4f}")
    print(f"  v1 val Dice for comparison   : {V1_BEST_VAL_DICE:.4f}  "
          f"(delta {best_val_dice - V1_BEST_VAL_DICE:+.4f})")
    if best_val_dice < V1_BEST_VAL_DICE - STOP_CONDITION_MARGIN:
        print(f"  *** STOP CONDITION TRIGGERED: merged Dice is more than "
              f"{STOP_CONDITION_MARGIN} below v1's {V1_BEST_VAL_DICE:.4f}. "
              f"Do not propose downstream integration. ***")
    print(f"  wall time                    : {(time.time() - t_start) / 60:.1f} min")
    print("=" * 70)


if __name__ == "__main__":
    main()
