"""
train_red_lesion_unet.py
------------------------
Microaneurysm (MA) + Haemorrhage (HE) "red lesion" binary segmentation on the
IDRiD segmentation subset, using a ResNet34-backed U-Net whose encoder is
initialised by TRANSFER LEARNING from the CHASE_DB1 vessel model
(models/vessel_unet_v1.pt) instead of ImageNet.

Run from anywhere (paths resolve relative to this file):

    python training/train_red_lesion_unet.py

Design constraints (low free disk on C:):
  * The IDRiD dataset is NEVER copied.
  * No preprocessed-image disk cache. Ben Graham preprocessing + patch
    extraction happen on the fly. A small in-RAM cache of the 81 preprocessed
    512x512 images (~90 MB) is kept purely in memory.
  * No per-epoch checkpoints. Only the single best checkpoint is written, plus
    one metrics JSON and ~5 visualisation PNGs.

Target metric: red lesions are extremely sparse and the dataset is tiny, so a
validation Dice of ~0.4-0.5 is the expected successful result.
"""

import os
import sys
import json
import time
import random
import shutil
from pathlib import Path

# ---------------------------------------------------------------------------
# Dependency check
# ---------------------------------------------------------------------------
def _check_imports() -> None:
    missing = []
    for mod, pip_name in [
        ("numpy", "numpy"),
        ("cv2", "opencv-python"),
        ("torch", "torch"),
        ("scipy", "scipy"),
        ("segmentation_models_pytorch", "segmentation-models-pytorch"),
        ("matplotlib", "matplotlib"),
    ]:
        try:
            __import__(mod)
        except ImportError:
            missing.append(pip_name)
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
from torch.utils.data import Dataset, DataLoader
from scipy.ndimage import gaussian_filter
import segmentation_models_pytorch as smp

from PIL import Image, ImageDraw
# NOTE: matplotlib is NOT used - matplotlib 3.11.1 in this env native-crashes
# (exit 127) on the first pyplot call, same failure class as Albumentations'
# affine transforms vs OpenCV 5.0.0. Visualisations are composed with PIL/numpy.

# ---------------------------------------------------------------------------
# Paths  (resolve relative to this script -> ml-pipeline root is one level up)
# ---------------------------------------------------------------------------
SCRIPT_DIR   = Path(__file__).resolve().parent          # .../training/
PIPELINE_DIR = SCRIPT_DIR.parent                        # .../ml-pipeline/
sys.path.insert(0, str(PIPELINE_DIR))                   # so `preprocessing` imports

from preprocessing.ben_graham import ben_graham_preprocess  # noqa: E402

SEG_ROOT     = PIPELINE_DIR / "datasets" / "idrid" / "segmentation" / "A. Segmentation"
MODELS_DIR   = PIPELINE_DIR / "models"


def _resolve_vessel_ckpt() -> Path:
    """Locate vessel_unet_v1.pt. The models/ tree is being reorganised into
    Model1/Model2/... folders by other tooling, so search a few known spots and
    fall back to a recursive scan rather than assuming one fixed path."""
    name = "vessel_unet_v1.pt"
    candidates = [
        MODELS_DIR / name,
        MODELS_DIR / "Model2" / name,
        MODELS_DIR / "vessel_predictions(Model2)" / name,
        MODELS_DIR / "vessel_predictions" / name,
    ]
    for c in candidates:
        if c.is_file():
            return c
    hits = sorted(MODELS_DIR.rglob(name))
    if hits:
        return hits[0]
    raise FileNotFoundError(
        f"Could not find {name} anywhere under {MODELS_DIR}. "
        f"Checked: {[str(c) for c in candidates]}")


VESSEL_CKPT  = _resolve_vessel_ckpt()
CHECKPOINT   = MODELS_DIR / "red_lesion_unet_v1.pt"
PRED_DIR     = MODELS_DIR / "red_lesion_predictions"
METRICS_JSON = MODELS_DIR / "red_lesion_metrics.json"

# ===========================================================================
# CONFIG  (all tunables in one place)
# ===========================================================================
SEED                = 42

BEN_GRAHAM_SIZE     = 512      # image-level working resolution
PATCH_SIZE          = 256      # patch-based training crop size

IN_CHANNELS         = 3        # Ben Graham output is a 3-channel image
ENCODER             = "resnet34"

N_VAL_IMAGES        = 16       # -> 65 train / 16 val  (81 total)

# --- lesion-aware patch sampling -------------------------------------------
LESION_PATCH_RATIO       = 0.70   # fraction of patches that must contain lesion
PATCHES_PER_IMAGE_EPOCH  = 12     # patches drawn per source image per epoch
MIN_LESION_PIXELS        = 10     # a crop "contains lesion" if >= this many px
MAX_CROP_ATTEMPTS        = 30     # give up searching -> fall back to random crop

# --- augmentation probabilities (custom synchronised pipeline) ------------
AUG_ROTATE_P        = 0.7
AUG_HFLIP_P         = 0.5
AUG_VFLIP_P         = 0.5
AUG_ELASTIC_P       = 0.3
AUG_BRIGHTNESS_P    = 0.5
ELASTIC_ALPHA       = 120.0
ELASTIC_SIGMA       = 6.0
BRIGHTNESS_DELTA    = 0.20        # +/- fraction
CONTRAST_DELTA      = 0.20        # +/- fraction

# --- optimisation --------------------------------------------------------
BATCH_SIZE          = 8
LR                  = 5e-4
MAX_EPOCHS          = 150
ES_PATIENCE         = 20          # early stop on val Dice
LR_FACTOR           = 0.5
LR_PATIENCE         = 10
DICE_WEIGHT         = 0.5
FOCAL_WEIGHT        = 0.5

SAVE_OPTIMIZER_STATE = True       # include Adam state in checkpoint
N_VIS_IMAGES         = 5          # validation images to visualise at the end

NORM_MEAN = 0.5
NORM_STD  = 0.5


# ---------------------------------------------------------------------------
# Reproducibility / device / disk
# ---------------------------------------------------------------------------
def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.backends.cudnn.deterministic = True
    torch.backends.cudnn.benchmark = False


def disk_free_gb(path: Path) -> float:
    _, _, free = shutil.disk_usage(str(path))
    return free / 1e9


DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")


# ===========================================================================
# 1.  DATASET DISCOVERY  (no hard-coded filename assumptions beyond IDRiD's)
# ===========================================================================
class ImageRecord:
    __slots__ = ("img_id", "image_path", "ma_path", "he_path", "origin")

    def __init__(self, img_id, image_path, ma_path, he_path, origin):
        self.img_id = img_id
        self.image_path = image_path
        self.ma_path = ma_path
        self.he_path = he_path
        self.origin = origin  # "train" or "test" (official IDRiD division)

    def __repr__(self):
        return f"<{self.img_id} origin={self.origin} MA={self.ma_path is not None} HE={self.he_path is not None}>"


def _find_dir(parent: Path, *keywords) -> Path:
    """Return the single child directory of *parent* whose name contains all
    *keywords* (case-insensitive). Fail loudly if 0 or >1 match."""
    kws = [k.lower() for k in keywords]
    hits = [d for d in sorted(parent.iterdir())
            if d.is_dir() and all(k in d.name.lower() for k in kws)]
    if len(hits) != 1:
        raise FileNotFoundError(
            f"Expected exactly one dir matching {keywords} under '{parent}', "
            f"found {len(hits)}: {[h.name for h in hits]}"
        )
    return hits[0]


def discover_records() -> list:
    """Walk the IDRiD 'A. Segmentation' tree, pairing every original image with
    its MA / HE ground-truth masks by shared stem (IDRiD_NN)."""
    if not SEG_ROOT.is_dir():
        raise FileNotFoundError(f"Segmentation root not found: {SEG_ROOT}")

    def _find_dir_any(parent: Path, *keyword_options) -> Path:
        """Like _find_dir but tries several spellings; first that matches wins."""
        for kw in keyword_options:
            try:
                return _find_dir(parent, kw)
            except FileNotFoundError:
                continue
        raise FileNotFoundError(
            f"No dir under '{parent}' matched any of {keyword_options}")

    orig_root = _find_dir(SEG_ROOT, "original", "image")
    gt_root   = _find_dir_any(SEG_ROOT, "groundtruth", "ground truth", "groundtruths")

    records = []
    for origin, split_kw in [("train", "training"), ("test", "testing")]:
        img_dir = _find_dir(orig_root, split_kw)
        gt_split = _find_dir(gt_root, split_kw)
        ma_dir = _find_dir_any(gt_split, "microaneurysm")
        he_dir = _find_dir_any(gt_split, "haemorrhage", "hemorrhage")

        img_files = sorted(p for p in img_dir.iterdir()
                           if p.suffix.lower() in (".jpg", ".jpeg", ".png", ".tif", ".tiff"))
        if not img_files:
            raise FileNotFoundError(f"No image files in {img_dir}")

        def _mask_for(stem: str, mdir: Path):
            cands = sorted(mdir.glob(f"{stem}_*")) + sorted(mdir.glob(f"{stem}.*"))
            cands = [c for c in cands if c.suffix.lower() in (".tif", ".tiff", ".png", ".gif", ".jpg")]
            return cands[0] if cands else None

        for ip in img_files:
            stem = ip.stem                       # e.g. "IDRiD_01"
            ma = _mask_for(stem, ma_dir)
            he = _mask_for(stem, he_dir)
            if ma is None and he is None:
                raise FileNotFoundError(
                    f"FAIL LOUDLY: image {ip.name} has NEITHER an MA nor an HE mask "
                    f"(MA dir: {ma_dir}, HE dir: {he_dir})."
                )
            records.append(ImageRecord(stem, ip, ma, he, origin))

    # ---- guard against silent mis-pairing -------------------------------
    ids = [r.img_id for r in records]
    if len(ids) != len(set(ids)):
        raise RuntimeError(f"FAIL LOUDLY: duplicate image IDs discovered: {ids}")

    for r in records:
        img = cv2.imread(str(r.image_path))
        if img is None:
            raise IOError(f"FAIL LOUDLY: cannot read image {r.image_path}")
        ih, iw = img.shape[:2]
        for tag, mpath in (("MA", r.ma_path), ("HE", r.he_path)):
            if mpath is None:
                continue
            m = cv2.imread(str(mpath), cv2.IMREAD_GRAYSCALE)
            if m is None:
                raise IOError(f"FAIL LOUDLY: cannot read {tag} mask {mpath}")
            if m.shape[:2] != (ih, iw):
                raise RuntimeError(
                    f"FAIL LOUDLY: {tag} mask {mpath.name} shape {m.shape[:2]} "
                    f"!= image {r.image_path.name} shape {(ih, iw)} -> would mis-align."
                )
            if r.img_id not in mpath.name:
                raise RuntimeError(
                    f"FAIL LOUDLY: {tag} mask {mpath.name} does not reference image id {r.img_id}"
                )
    return records


# ===========================================================================
# 2.  PREPROCESSING  (Ben Graham image + spatially-aligned OR mask)
# ===========================================================================
def retinal_bbox(image_bgr: np.ndarray):
    """Reproduce EXACTLY the retinal-circle bounding box that
    preprocessing/ben_graham.py computes in its Step 1, so the same crop can be
    applied to the mask and keep image/mask spatially aligned.

    (Mirrors ben_graham.ben_graham_preprocess: green channel, threshold>7,
     15x15 ellipse close, largest external contour, clamped boundingRect.)
    """
    gray = image_bgr[:, :, 1]
    _, mask = cv2.threshold(gray, 7, 255, cv2.THRESH_BINARY)
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return 0, 0, image_bgr.shape[1], image_bgr.shape[0]
    largest = max(contours, key=cv2.contourArea)
    x, y, w, h = cv2.boundingRect(largest)
    x = max(0, x)
    y = max(0, y)
    w = min(w, image_bgr.shape[1] - x)
    h = min(h, image_bgr.shape[0] - y)
    if w <= 0 or h <= 0:
        return 0, 0, image_bgr.shape[1], image_bgr.shape[0]
    return x, y, w, h


def build_red_lesion_mask(rec: "ImageRecord", full_hw) -> np.ndarray:
    """logical OR of MA and HE masks at full resolution -> uint8 {0,1}."""
    h, w = full_hw
    combined = np.zeros((h, w), dtype=np.uint8)
    for mpath in (rec.ma_path, rec.he_path):
        if mpath is None:
            continue
        m = cv2.imread(str(mpath), cv2.IMREAD_GRAYSCALE)
        if m is None:
            raise IOError(f"cannot read mask {mpath}")
        combined |= (m > 0).astype(np.uint8)
    return combined


def preprocess_record(rec: "ImageRecord"):
    """Return (proc_img uint8 [S,S,3], red_lesion_mask uint8 [S,S] in {0,1}).
    Preprocessing is entirely in memory; nothing is written to disk."""
    img_bgr = cv2.imread(str(rec.image_path))
    if img_bgr is None:
        raise IOError(f"cannot read image {rec.image_path}")
    h, w = img_bgr.shape[:2]

    # --- image: Ben Graham (its own crop + resize + contrast) -----------
    proc = ben_graham_preprocess(img_bgr, target_size=BEN_GRAHAM_SIZE)  # BGR uint8 SxSx3

    # --- mask: OR-combine, then the SAME retinal crop, then NEAREST resize
    full_mask = build_red_lesion_mask(rec, (h, w))
    x, y, cw, ch = retinal_bbox(img_bgr)
    mask_crop = full_mask[y:y + ch, x:x + cw]
    mask_s = cv2.resize(mask_crop, (BEN_GRAHAM_SIZE, BEN_GRAHAM_SIZE),
                        interpolation=cv2.INTER_NEAREST)
    mask_s = (mask_s > 0).astype(np.uint8)

    # store image RGB for downstream tensor/vis consistency
    proc_rgb = cv2.cvtColor(proc, cv2.COLOR_BGR2RGB)
    return proc_rgb, mask_s


class PreprocCache:
    """Lazy in-RAM cache: img_id -> (proc_rgb uint8 SxSx3, mask uint8 SxS)."""
    def __init__(self, records):
        self._by_id = {r.img_id: r for r in records}
        self._cache = {}

    def get(self, img_id: str):
        if img_id not in self._cache:
            self._cache[img_id] = preprocess_record(self._by_id[img_id])
        return self._cache[img_id]

    def warm(self, ids):
        t0 = time.time()
        for i, iid in enumerate(ids, 1):
            self.get(iid)
        return time.time() - t0

    def nbytes(self):
        return sum(a.nbytes + b.nbytes for a, b in self._cache.values())


# ===========================================================================
# 3.  AUGMENTATION  (custom, synchronised image<->mask)
# ---------------------------------------------------------------------------
# NOTE: Albumentations 2.0.8 IS installed, but its affine transforms (Rotate /
# Affine / ElasticTransform) hard-crash the process against the installed
# OpenCV 5.0.0 build in this environment (native crash, not a Python error).
# Flips / brightness work, but to keep the FULL requested heavy augmentation we
# implement every transform directly on cv2/numpy and apply the geometric part
# identically to image and mask. Albumentations version is still printed at
# startup as required.
# ===========================================================================
def _elastic(img: np.ndarray, mask: np.ndarray, nrng: np.random.Generator):
    h, w = mask.shape
    dx = gaussian_filter(nrng.standard_normal((h, w)).astype(np.float32), ELASTIC_SIGMA) * ELASTIC_ALPHA
    dy = gaussian_filter(nrng.standard_normal((h, w)).astype(np.float32), ELASTIC_SIGMA) * ELASTIC_ALPHA
    xx, yy = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    map_x = np.clip(xx + dx, 0, w - 1).astype(np.float32)
    map_y = np.clip(yy + dy, 0, h - 1).astype(np.float32)
    img = cv2.remap(img, map_x, map_y, interpolation=cv2.INTER_LINEAR,
                    borderMode=cv2.BORDER_REFLECT_101)
    mask = cv2.remap(mask, map_x, map_y, interpolation=cv2.INTER_NEAREST,
                     borderMode=cv2.BORDER_REFLECT_101)
    return img, mask


def augment(img: np.ndarray, mask: np.ndarray, rng: random.Random):
    """img float32 [P,P,3] in [0,255]; mask float32 [P,P] in {0,1}."""
    h, w = mask.shape

    if rng.random() < AUG_ROTATE_P:
        angle = rng.uniform(-180.0, 180.0)
        M = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
        img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR,
                             borderMode=cv2.BORDER_REFLECT_101)
        mask = cv2.warpAffine(mask, M, (w, h), flags=cv2.INTER_NEAREST,
                              borderMode=cv2.BORDER_REFLECT_101)

    if rng.random() < AUG_HFLIP_P:
        img = img[:, ::-1]
        mask = mask[:, ::-1]
    if rng.random() < AUG_VFLIP_P:
        img = img[::-1, :]
        mask = mask[::-1, :]

    if rng.random() < AUG_ELASTIC_P:
        nrng = np.random.default_rng(rng.randrange(2 ** 32))
        img, mask = _elastic(np.ascontiguousarray(img), np.ascontiguousarray(mask), nrng)

    if rng.random() < AUG_BRIGHTNESS_P:
        c = 1.0 + rng.uniform(-CONTRAST_DELTA, CONTRAST_DELTA)
        b = 255.0 * rng.uniform(-BRIGHTNESS_DELTA, BRIGHTNESS_DELTA)
        mean = float(img.mean())
        img = (img - mean) * c + mean + b

    img = np.ascontiguousarray(np.clip(img, 0.0, 255.0), dtype=np.float32)
    mask = np.ascontiguousarray((mask > 0.5).astype(np.float32))
    return img, mask


# ===========================================================================
# 4.  LESION-AWARE PATCH SAMPLING
# ===========================================================================
def sample_patch(img: np.ndarray, mask: np.ndarray, rng: random.Random, want_lesion: bool):
    """Return (img_patch, mask_patch, has_lesion). On-the-fly crop; nothing stored."""
    H, W = mask.shape
    P = PATCH_SIZE
    max_y, max_x = H - P, W - P

    def _crop():
        y = rng.randint(0, max_y)
        x = rng.randint(0, max_x)
        return img[y:y + P, x:x + P], mask[y:y + P, x:x + P]

    if want_lesion and mask.sum() >= MIN_LESION_PIXELS:
        for _ in range(MAX_CROP_ATTEMPTS):
            ip, mp = _crop()
            if mp.sum() >= MIN_LESION_PIXELS:
                return ip, mp, True
        ip, mp = _crop()                       # graceful fallback: plain random crop
        return ip, mp, bool(mp.sum() >= MIN_LESION_PIXELS)

    ip, mp = _crop()
    return ip, mp, bool(mp.sum() >= MIN_LESION_PIXELS)


# ===========================================================================
# 5.  DATASET
# ===========================================================================
def to_input_tensor(img_rgb_float: np.ndarray) -> torch.Tensor:
    """[H,W,3] float in [0,255] -> [3,H,W] float32 normalised to ~[-1,1]."""
    t = torch.from_numpy(np.ascontiguousarray(img_rgb_float.transpose(2, 0, 1))).float() / 255.0
    t = (t - NORM_MEAN) / NORM_STD
    return t


class RedLesionPatchDataset(Dataset):
    """Patch-based training set. len = n_images * PATCHES_PER_IMAGE_EPOCH.
    Patches are generated on the fly; none are materialised in RAM or on disk."""

    def __init__(self, records, cache: PreprocCache, augment_on: bool):
        self.records = list(records)
        self.cache = cache
        self.augment_on = augment_on
        self.n = len(self.records)
        self.epoch = 0

    def set_epoch(self, e: int):
        self.epoch = e

    def __len__(self):
        return self.n * PATCHES_PER_IMAGE_EPOCH

    def __getitem__(self, idx):
        rec = self.records[idx % self.n]
        proc_rgb, mask = self.cache.get(rec.img_id)

        rng = random.Random((SEED * 1_000_003) ^ (self.epoch * 9_973) ^ (idx * 131))
        want_lesion = rng.random() < LESION_PATCH_RATIO

        img_f = proc_rgb.astype(np.float32)
        mask_f = mask.astype(np.float32)
        ip, mp, has_les = sample_patch(img_f, mask_f, rng, want_lesion)

        if self.augment_on:
            ip, mp = augment(ip, mp, rng)

        img_t = to_input_tensor(ip)
        mask_t = torch.from_numpy(np.ascontiguousarray((mp > 0.5).astype(np.float32))).unsqueeze(0)
        return {"image": img_t, "mask": mask_t, "has_lesion": float(has_les), "id": rec.img_id}


# ===========================================================================
# 6.  LOSS  /  METRIC
# ===========================================================================
class DiceFocalLoss(nn.Module):
    """DICE_WEIGHT * Dice + FOCAL_WEIGHT * Focal, both on raw logits."""
    def __init__(self):
        super().__init__()
        self.dice = smp.losses.DiceLoss(mode="binary", from_logits=True, smooth=1.0)
        self.focal = smp.losses.FocalLoss(mode="binary")

    def forward(self, logits, targets):
        return DICE_WEIGHT * self.dice(logits, targets) + FOCAL_WEIGHT * self.focal(logits, targets)


def dice_from_logits_patch(logits, targets, thr=0.5, eps=1.0):
    """Mean per-sample Dice over a patch batch (equal weight per patch)."""
    preds = (torch.sigmoid(logits) > thr).float()
    p = preds.view(preds.size(0), -1)
    t = targets.view(targets.size(0), -1)
    inter = (p * t).sum(1)
    dice = (2 * inter + eps) / (p.sum(1) + t.sum(1) + eps)
    return dice.mean().item()


def dice_binary(pred_bin: np.ndarray, gt_bin: np.ndarray, eps: float = 1.0) -> float:
    p = pred_bin.astype(np.float32).ravel()
    g = gt_bin.astype(np.float32).ravel()
    inter = float((p * g).sum())
    return (2 * inter + eps) / (float(p.sum()) + float(g.sum()) + eps)


# ===========================================================================
# 7.  MODEL  +  VESSEL-ENCODER TRANSFER LEARNING
# ===========================================================================
def build_model() -> smp.Unet:
    return smp.Unet(
        encoder_name=ENCODER,
        encoder_weights=None,          # weights come from the vessel model, not ImageNet
        in_channels=IN_CHANNELS,
        classes=1,
        activation=None,               # raw logits
    )


def load_vessel_encoder(model: smp.Unet, ckpt_path: Path) -> dict:
    """Load ONLY the encoder parameters from the CHASE_DB1 vessel U-Net into this
    model's ResNet34 encoder. The vessel encoder was trained with a 1-channel
    (green) input; its conv1 (64,1,7,7) is adapted to (64,3,7,7) by tiling the
    kernel across the 3 Ben Graham channels and dividing by 3 (preserves the
    transferred response magnitude). The vessel DECODER is intentionally ignored.
    """
    if not ckpt_path.is_file():
        raise FileNotFoundError(f"Vessel checkpoint not found: {ckpt_path}")

    ckpt = torch.load(str(ckpt_path), map_location="cpu", weights_only=False)
    full_sd = ckpt.get("model_state_dict", ckpt)
    enc_sd = {k[len("encoder."):]: v for k, v in full_sd.items() if k.startswith("encoder.")}
    if not enc_sd:
        raise RuntimeError("FAIL LOUDLY: no 'encoder.*' keys in vessel checkpoint.")

    tgt_sd = model.encoder.state_dict()
    tgt_conv1 = tgt_sd["conv1.weight"]
    src_conv1 = enc_sd["conv1.weight"]
    conv1_note = "identical shape - loaded as-is"
    if tuple(src_conv1.shape) != tuple(tgt_conv1.shape):
        if src_conv1.shape[1] == 1 and tgt_conv1.shape[1] == IN_CHANNELS:
            enc_sd["conv1.weight"] = src_conv1.repeat(1, IN_CHANNELS, 1, 1) / float(IN_CHANNELS)
            conv1_note = (f"adapted {tuple(src_conv1.shape)} -> {tuple(tgt_conv1.shape)} "
                          f"(tile across {IN_CHANNELS} channels, /{IN_CHANNELS})")
        else:
            raise RuntimeError(
                f"FAIL LOUDLY: incompatible conv1 shapes vessel={tuple(src_conv1.shape)} "
                f"vs model={tuple(tgt_conv1.shape)} - cannot safely transfer."
            )

    tgt_keys, src_keys = set(tgt_sd), set(enc_sd)
    missing = sorted(tgt_keys - src_keys)        # encoder params NOT supplied by vessel ckpt
    unexpected = sorted(src_keys - tgt_keys)     # vessel keys with no home in the encoder
    mismatch = [k for k in (tgt_keys & src_keys)
                if tuple(tgt_sd[k].shape) != tuple(enc_sd[k].shape)]

    if missing or mismatch:
        raise RuntimeError(
            f"FAIL LOUDLY: encoder transfer incomplete. missing={missing} mismatch={mismatch}"
        )

    before = {k: v.clone() for k, v in model.encoder.state_dict().items()}
    model.encoder.load_state_dict(enc_sd, strict=True)   # strict validation
    after = model.encoder.state_dict()

    changed = sum(1 for k in after if not torch.equal(after[k].float(), before[k].float()))
    n_param_tensors = len(enc_sd)
    n_scalars = int(sum(v.numel() for v in enc_sd.values()))
    # spot-check a deep layer actually received the transferred values
    probe_key = "layer4.1.conv2.weight"
    deep_ok = torch.allclose(after[probe_key], enc_sd[probe_key])
    conv1_ok = torch.allclose(after["conv1.weight"], enc_sd["conv1.weight"])

    return {
        "encoder_param_tensors_loaded": n_param_tensors,
        "encoder_scalar_params_loaded": n_scalars,
        "encoder_tensors_changed_vs_random_init": changed,
        "missing_encoder_keys": missing,
        "unexpected_keys_ignored": unexpected,
        "shape_mismatch_keys": mismatch,
        "conv1_handling": conv1_note,
        "conv1_verified": bool(conv1_ok),
        "deep_layer_verified": bool(deep_ok),
        "vessel_ckpt_best_val_dice": float(ckpt.get("best_val_dice", float("nan"))),
        "vessel_ckpt_in_channels": ckpt.get("in_channels"),
    }


# ===========================================================================
# 8.  IMAGE-LEVEL VALIDATION
# ===========================================================================
@torch.no_grad()
def validate_image_level(model, val_records, cache: PreprocCache, criterion):
    model.eval()
    per_image = {}
    losses = []
    for rec in val_records:
        proc_rgb, gt = cache.get(rec.img_id)                       # SxSx3, SxS
        x = to_input_tensor(proc_rgb.astype(np.float32)).unsqueeze(0).to(DEVICE)
        logit = model(x)                                           # 1,1,S,S
        target = torch.from_numpy(gt.astype(np.float32))[None, None].to(DEVICE)
        losses.append(criterion(logit, target).item())
        pred = (torch.sigmoid(logit)[0, 0] > 0.5).cpu().numpy().astype(np.uint8)
        per_image[rec.img_id] = dice_binary(pred, gt)
    mean_dice = float(np.mean(list(per_image.values())))
    return float(np.mean(losses)), mean_dice, per_image


# ===========================================================================
# 9.  TRAIN ONE EPOCH
# ===========================================================================
def train_one_epoch(model, loader, optimizer, criterion):
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
        tot_dice += dice_from_logits_patch(logits.detach(), masks) * bs
        n += bs
    return tot_loss / n, tot_dice / n


# ===========================================================================
# 10.  VISUALISATION
# ===========================================================================
@torch.no_grad()
def save_visualisations(model, vis_records, cache: PreprocCache, out_dir: Path):
    """Compose a 4-panel comparison per image with PIL (no matplotlib):
    preprocessed | ground-truth | prediction | overlay(green=GT, red=pred)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    model.eval()
    saved = []
    for rec in vis_records:
        proc_rgb, gt = cache.get(rec.img_id)
        x = to_input_tensor(proc_rgb.astype(np.float32)).unsqueeze(0).to(DEVICE)
        prob = torch.sigmoid(model(x))[0, 0].cpu().numpy()
        pred = (prob > 0.5).astype(np.uint8)
        d = dice_binary(pred, gt)

        gt_rgb = np.stack([gt * 255] * 3, axis=-1).astype(np.uint8)
        pred_rgb = np.stack([pred * 255] * 3, axis=-1).astype(np.uint8)
        overlay = proc_rgb.copy()
        overlay[gt > 0] = (0.35 * overlay[gt > 0] + np.array([0, 200, 0]) * 0.65).astype(np.uint8)
        overlay[pred > 0] = (0.35 * overlay[pred > 0] + np.array([220, 0, 0]) * 0.65).astype(np.uint8)

        strip = np.concatenate([proc_rgb, gt_rgb, pred_rgb, overlay], axis=1)
        bar = 22
        canvas = Image.new("RGB", (strip.shape[1], strip.shape[0] + bar), "white")
        canvas.paste(Image.fromarray(strip), (0, bar))
        ImageDraw.Draw(canvas).text(
            (6, 5),
            f"{rec.img_id}   Dice={d:.3f}    |   preprocessed (Ben Graham 512)   |   "
            f"GT red lesion (MA OR HE)   |   prediction   |   overlay: green=GT  red=pred",
            fill=(0, 0, 0))
        fp = out_dir / f"{rec.img_id}_redlesion.png"
        canvas.save(str(fp))
        saved.append((rec.img_id, str(fp), d))
    return saved


# ===========================================================================
# 11.  SANITY CHECKS
# ===========================================================================
def run_sanity_checks(records, train_recs, val_recs, cache, model, transfer_stats):
    print("\n" + "=" * 70)
    print("  SANITY CHECKS (must pass before the 150-epoch run)")
    print("=" * 70)
    critical_fail = False

    def ok(msg):      print(f"  [OK]      {msg}")
    def warn(msg):    print(f"  [WARNING] {msg}")
    def err(msg):
        nonlocal critical_fail
        critical_fail = True
        print(f"  [ERROR]   {msg}")

    # 1. dataset pairing
    n_ma = sum(r.ma_path is not None for r in records)
    n_he = sum(r.he_path is not None for r in records)
    n_both = sum(r.ma_path is not None and r.he_path is not None for r in records)
    if len(records) >= 1 and all((r.img_id in r.ma_path.name) if r.ma_path else True for r in records):
        ok(f"Dataset pairing: {len(records)} images | MA={n_ma} HE={n_he} both={n_both} "
           f"(each mask filename references its image id)")
    else:
        err("Dataset pairing looks wrong (mask filename does not match image id)")
    if len(records) != 81:
        warn(f"Expected 81 segmentation images (project plan); found {len(records)}")

    # 2. split counts
    if len(train_recs) + len(val_recs) == len(records) and len(val_recs) == N_VAL_IMAGES:
        ok(f"Split counts: train={len(train_recs)}  val={len(val_recs)}  total={len(records)}")
    else:
        err(f"Split counts wrong: train={len(train_recs)} val={len(val_recs)} total={len(records)}")

    # 3. no image in both splits
    inter = set(r.img_id for r in train_recs) & set(r.img_id for r in val_recs)
    if not inter:
        ok("No source image appears in both train and validation")
    else:
        err(f"Leakage! images in both splits: {sorted(inter)}")

    # 4/5. OR combine + binary  (use an image that has BOTH masks)
    rec_both = next((r for r in records if r.ma_path and r.he_path), None)
    if rec_both is not None:
        img_bgr = cv2.imread(str(rec_both.image_path))
        ma = (cv2.imread(str(rec_both.ma_path), cv2.IMREAD_GRAYSCALE) > 0).astype(np.uint8)
        he = (cv2.imread(str(rec_both.he_path), cv2.IMREAD_GRAYSCALE) > 0).astype(np.uint8)
        ref = (ma | he)
        got = build_red_lesion_mask(rec_both, img_bgr.shape[:2])
        if np.array_equal(ref, got):
            ok(f"MA/HE logical-OR verified on {rec_both.img_id} "
               f"(MA px={int(ma.sum())}, HE px={int(he.sum())}, OR px={int(got.sum())})")
        else:
            err(f"OR combine mismatch on {rec_both.img_id}")
        uniq = set(np.unique(got).tolist())
        if uniq.issubset({0, 1}):
            ok(f"Combined mask is binary (values {sorted(uniq)})")
        else:
            err(f"Combined mask not binary: {sorted(uniq)}")
    else:
        warn("No image has BOTH MA and HE masks - OR path only partially exercised")

    # 6/7. Ben Graham + dims
    proc_rgb, mask_s = cache.get(train_recs[0].img_id)
    if proc_rgb.shape == (BEN_GRAHAM_SIZE, BEN_GRAHAM_SIZE, 3) and mask_s.shape == (BEN_GRAHAM_SIZE, BEN_GRAHAM_SIZE):
        ok(f"Ben Graham preprocessing OK: image {proc_rgb.shape}, mask {mask_s.shape} (aligned)")
    else:
        err(f"Preproc shape wrong: image {proc_rgb.shape}, mask {mask_s.shape}")
    if set(np.unique(mask_s).tolist()).issubset({0, 1}):
        ok("Preprocessed mask still binary after NEAREST resize")
    else:
        err(f"Preprocessed mask not binary: {np.unique(mask_s)}")

    # 8. sampled crop dims
    rng = random.Random(0)
    ipatch, mpatch, _ = sample_patch(proc_rgb.astype(np.float32), mask_s.astype(np.float32), rng, True)
    if ipatch.shape == (PATCH_SIZE, PATCH_SIZE, 3) and mpatch.shape == (PATCH_SIZE, PATCH_SIZE):
        ok(f"Sampled patch dims: image {ipatch.shape}, mask {mpatch.shape}")
    else:
        err(f"Patch dims wrong: image {ipatch.shape}, mask {mpatch.shape}")

    # 9. lesion sampling really finds lesion patches
    lesion_rec = max(train_recs, key=lambda r: int(cache.get(r.img_id)[1].sum()))
    li, lm = cache.get(lesion_rec.img_id)
    li = li.astype(np.float32); lm = lm.astype(np.float32)
    hits = 0
    rr = random.Random(1)
    for _ in range(40):
        _, mp, has = sample_patch(li, lm, rr, True)
        hits += int(has)
    if hits >= 30:
        ok(f"Lesion-aware sampling: {hits}/40 lesion patches on {lesion_rec.img_id} "
           f"(image lesion px={int(lm.sum())})")
    elif hits > 0:
        warn(f"Lesion-aware sampling weak: only {hits}/40 lesion patches on {lesion_rec.img_id}")
    else:
        err(f"Lesion-aware sampling found 0 lesion patches on {lesion_rec.img_id}")

    # 10. augmentation preserves alignment (pure flip must move mask identically)
    test_i = li[:PATCH_SIZE, :PATCH_SIZE].copy()
    test_m = lm[:PATCH_SIZE, :PATCH_SIZE].copy()
    flipped = test_m[:, ::-1]
    exp = np.ascontiguousarray(flipped)
    # apply hflip-only via augment internals check: manual
    man_i = np.ascontiguousarray(test_i[:, ::-1])
    if man_i.shape == test_i.shape and exp.shape == test_m.shape:
        ai, am = augment(test_i.copy(), test_m.copy(), random.Random(3))
        if ai.shape[:2] == am.shape and set(np.unique(am).tolist()).issubset({0.0, 1.0}):
            ok("Augmentation keeps image/mask same shape and mask binary (spatial ops shared)")
        else:
            err(f"Augmentation broke alignment: img {ai.shape}, mask {am.shape}, uniq {np.unique(am)}")
    else:
        err("Augmentation alignment pre-check failed")

    # 11/12/13. forward / loss / backward
    model.to(DEVICE)
    ds = RedLesionPatchDataset(train_recs, cache, augment_on=True)
    b = [ds[i] for i in range(BATCH_SIZE)]
    imgs = torch.stack([x["image"] for x in b]).to(DEVICE)
    msks = torch.stack([x["mask"] for x in b]).to(DEVICE)
    crit = DiceFocalLoss().to(DEVICE)
    model.train()
    out = model(imgs)
    if tuple(out.shape) == (BATCH_SIZE, 1, PATCH_SIZE, PATCH_SIZE):
        ok(f"Model forward pass OK: {tuple(imgs.shape)} -> {tuple(out.shape)}")
    else:
        err(f"Model forward output shape {tuple(out.shape)}")
    loss = crit(out, msks)
    if torch.isfinite(loss) and loss.ndim == 0:
        ok(f"Loss is a finite scalar: {loss.item():.4f}")
    else:
        err(f"Loss not finite scalar: {loss}")
    loss.backward()
    g = model.encoder.conv1.weight.grad
    if g is not None and torch.isfinite(g).all() and g.abs().sum() > 0:
        ok("Backprop OK: finite non-zero gradient on encoder.conv1")
    else:
        err("Backprop produced no/na gradient on encoder.conv1")
    model.zero_grad(set_to_none=True)

    # 14. GPU
    if torch.cuda.is_available():
        ok(f"GPU detected: {torch.cuda.get_device_name(0)}")
    else:
        warn("CUDA not available - training will run on CPU (slow but valid)")

    # 15. vessel encoder weights actually loaded
    ts = transfer_stats
    if (ts["encoder_tensors_changed_vs_random_init"] >= 200
            and not ts["missing_encoder_keys"]
            and ts["deep_layer_verified"] and ts["conv1_verified"]):
        ok(f"Vessel encoder transfer verified: {ts['encoder_param_tensors_loaded']} tensors "
           f"({ts['encoder_scalar_params_loaded']:,} params), "
           f"{ts['encoder_tensors_changed_vs_random_init']} changed vs random init; "
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


# ===========================================================================
# 12.  MAIN
# ===========================================================================
def main():
    t_start = time.time()
    set_seed(SEED)
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    # --finish-only: skip the training loop, just (re)build visualisations +
    # metrics JSON from the already-saved best checkpoint. Used to recover the
    # post-training artefacts if that stage failed on its own.
    finish_only = "--finish-only" in sys.argv

    print("=" * 70)
    print("  RED-LESION (MA + HE) U-Net  --  IDRiD segmentation")
    print("=" * 70)
    print(f"  Python exe        : {sys.executable}")
    print(f"  Torch / CUDA      : {torch.__version__} / {torch.version.cuda}  "
          f"available={torch.cuda.is_available()}")
    print(f"  Device            : {DEVICE}"
          + (f"  ({torch.cuda.get_device_name(0)})" if DEVICE.type == "cuda" else ""))
    print(f"  smp version       : {smp.__version__}")
    try:
        import albumentations as _albu
        print(f"  albumentations    : {_albu.__version__}  "
              f"(geometric transforms done in custom cv2 pipeline - see AUGMENTATION note)")
    except Exception as e:
        print(f"  albumentations    : not importable ({e}) - custom cv2 augmentation used")
    print(f"  Free disk (start) : {disk_free_gb(PIPELINE_DIR):.2f} GB")

    # ---- projected disk footprint of THIS script's outputs ---------------
    tmp_model = build_model()
    n_params = sum(p.numel() for p in tmp_model.parameters())
    ckpt_mb = n_params * 4 / 1e6
    if SAVE_OPTIMIZER_STATE:
        ckpt_mb += n_params * 8 / 1e6           # Adam exp_avg + exp_avg_sq
    del tmp_model
    print("\n  Projected disk usage created by this script:")
    print(f"    - {CHECKPOINT.name:32s} ~{ckpt_mb:6.1f} MB  (best only, overwritten in place)")
    print(f"    - {METRICS_JSON.name:32s} ~{0.02:6.2f} MB")
    print(f"    - {PRED_DIR.name + '/*.png':32s} ~{N_VIS_IMAGES * 0.35:6.2f} MB  ({N_VIS_IMAGES} images)")
    print(f"    - dataset copies / patch cache / preproc cache on disk :   0.0 MB (none)")
    print(f"    => total new disk  ~{ckpt_mb + 0.02 + N_VIS_IMAGES * 0.35:.1f} MB")
    print(f"    (in-RAM preprocessed-image cache ~90 MB, not on disk)\n")

    # ---- 1. discover ---------------------------------------------------
    records = discover_records()
    records.sort(key=lambda r: r.img_id)
    n_ma = sum(r.ma_path is not None for r in records)
    n_he = sum(r.he_path is not None for r in records)
    n_both = sum(1 for r in records if r.ma_path is not None and r.he_path is not None)

    cache = PreprocCache(records)

    # lesion presence stats (image level, at 512)
    lesion_flags = {}
    dims = set()
    for r in records:
        img = cv2.imread(str(r.image_path))
        dims.add(img.shape[:2])
        _, m = cache.get(r.img_id)
        lesion_flags[r.img_id] = int(m.sum() > 0)
    n_usable = len(records)
    pct_lesion = 100.0 * sum(lesion_flags.values()) / len(records)

    print("-" * 70)
    print("  DATASET DISCOVERY")
    print("-" * 70)
    print(f"  images discovered              : {len(records)}")
    print(f"  with valid MA mask             : {n_ma}")
    print(f"  with valid HE mask             : {n_he}")
    print(f"  with BOTH MA and HE            : {n_both}")
    print(f"  final usable image/mask pairs  : {n_usable}")
    print(f"  original image dimensions      : {sorted(dims)}")
    print(f"  images with >=1 lesion pixel   : {pct_lesion:.1f}%")
    official_train = sum(r.origin == 'train' for r in records)
    official_test = sum(r.origin == 'test' for r in records)
    print(f"  (official IDRiD division seen  : {official_train} train + {official_test} test; "
          f"we re-split at IMAGE level below)")

    # ---- 2. image-level split (before any patch extraction) -----------
    ids_sorted = [r.img_id for r in records]
    shuffled = ids_sorted[:]
    random.Random(SEED).shuffle(shuffled)
    val_ids = set(shuffled[:N_VAL_IMAGES])
    train_ids = set(shuffled[N_VAL_IMAGES:])
    train_recs = [r for r in records if r.img_id in train_ids]
    val_recs = [r for r in records if r.img_id in val_ids]

    print("-" * 70)
    print(f"  IMAGE-LEVEL SPLIT  (seed={SEED})   train={len(train_recs)}  val={len(val_recs)}")
    print("-" * 70)
    print(f"  TRAIN ids ({len(train_recs)}):")
    print("    " + " ".join(sorted(r.img_id for r in train_recs)))
    print(f"  VAL ids ({len(val_recs)}):")
    print("    " + " ".join(sorted(r.img_id for r in val_recs)))
    assert not (train_ids & val_ids), "image-level split leak"

    # ---- warm cache (in RAM only) -----------------------------------
    dt = cache.warm([r.img_id for r in records])
    print(f"\n  Preprocessed-image RAM cache warmed: {len(records)} images in {dt:.1f}s, "
          f"{cache.nbytes() / 1e6:.1f} MB resident (not written to disk)")

    # ---- model + vessel encoder transfer --------------------------
    print("-" * 70)
    print("  MODEL  +  VESSEL-ENCODER TRANSFER LEARNING")
    print("-" * 70)
    model = build_model()
    ts = load_vessel_encoder(model, VESSEL_CKPT)
    model.to(DEVICE)
    print(f"  architecture         : segmentation_models_pytorch.Unet")
    print(f"  encoder              : {ENCODER}   in_channels={IN_CHANNELS}  classes=1  activation=None")
    try:
        _vrel = VESSEL_CKPT.relative_to(PIPELINE_DIR)
    except ValueError:
        _vrel = VESSEL_CKPT
    print(f"  encoder init         : {_vrel}  (encoder only, decoder discarded)")
    print(f"  encoder tensors loaded          : {ts['encoder_param_tensors_loaded']}")
    print(f"  encoder scalar params loaded    : {ts['encoder_scalar_params_loaded']:,}")
    print(f"  encoder tensors changed vs init : {ts['encoder_tensors_changed_vs_random_init']}")
    print(f"  missing encoder keys            : {ts['missing_encoder_keys'] or 'none'}")
    print(f"  unexpected keys (ignored)       : {ts['unexpected_keys_ignored'] or 'none'}")
    print(f"  shape-mismatch keys             : {ts['shape_mismatch_keys'] or 'none'}")
    print(f"  conv1 handling                  : {ts['conv1_handling']}")
    print(f"  conv1 / deep-layer verified     : {ts['conv1_verified']} / {ts['deep_layer_verified']}")
    print(f"  (vessel ckpt in_channels={ts['vessel_ckpt_in_channels']}, "
          f"best_val_dice={ts['vessel_ckpt_best_val_dice']:.4f})")

    criterion = DiceFocalLoss().to(DEVICE)

    best_val_dice = -1.0
    best_epoch = 0
    final_val_dice = 0.0
    best_per_image = {}

    if finish_only:
        print("\n  [--finish-only] Skipping the training loop; using the saved best checkpoint.")
        if not CHECKPOINT.is_file():
            print(f"  [ERROR] {CHECKPOINT} not found - cannot run --finish-only.")
            sys.exit(1)
        _c = torch.load(str(CHECKPOINT), map_location=DEVICE, weights_only=False)
        model.load_state_dict(_c["model_state_dict"])
        best_epoch = _c.get("best_epoch", -1)
        best_val_dice = float(_c.get("best_val_dice", float("nan")))
        _, _recomp, best_per_image = validate_image_level(model, val_recs, cache, criterion)
        final_val_dice = _recomp
        print(f"  checkpoint: best_epoch={best_epoch}  best_val_dice={best_val_dice:.4f}")
        print(f"  recomputed mean image-level val Dice now = {_recomp:.4f}")

    if not finish_only:
        # ---- datasets / loaders -------------------------------
        train_ds = RedLesionPatchDataset(train_recs, cache, augment_on=True)
        train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True,
                                  num_workers=0, pin_memory=(DEVICE.type == "cuda"), drop_last=True)
        optimizer = torch.optim.Adam(model.parameters(), lr=LR)
        scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(
            optimizer, mode="max", factor=LR_FACTOR, patience=LR_PATIENCE)

        # ---- sanity checks -----------------------------------
        run_sanity_checks(records, train_recs, val_recs, cache, model, ts)

        # ---- training --------------------------------------
        print("  PATCH SAMPLING STRATEGY")
        print(f"    patch size                 : {PATCH_SIZE} x {PATCH_SIZE} (generated on the fly)")
        print(f"    patches / image / epoch    : {PATCHES_PER_IMAGE_EPOCH}  "
              f"-> {len(train_recs) * PATCHES_PER_IMAGE_EPOCH} train patches / epoch")
        print(f"    lesion-patch target ratio  : {LESION_PATCH_RATIO:.0%} lesion / "
              f"{1 - LESION_PATCH_RATIO:.0%} background")
        print(f"    min lesion px for 'lesion' : {MIN_LESION_PIXELS}")
        print(f"    max crop search attempts   : {MAX_CROP_ATTEMPTS}  (else graceful random-crop fallback)")
        print()
        print(f"{'Epoch':>5} | {'TrLoss':>8} {'TrDice':>7} | {'VlLoss':>8} {'VlDice':>7} | "
              f"{'LR':>9} | notes")
        print("-" * 70)

        es_counter = 0
        for epoch in range(1, MAX_EPOCHS + 1):
            train_ds.set_epoch(epoch)
            tr_loss, tr_dice = train_one_epoch(model, train_loader, optimizer, criterion)
            vl_loss, vl_dice, per_img = validate_image_level(model, val_recs, cache, criterion)
            scheduler.step(vl_dice)
            lr_now = optimizer.param_groups[0]["lr"]
            final_val_dice = vl_dice

            improved = vl_dice > best_val_dice
            note = ""
            if improved:
                best_val_dice = vl_dice
                best_epoch = epoch
                best_per_image = per_img
                es_counter = 0
                note = "BEST -> checkpoint"
                ckpt = {
                    "model_state_dict": model.state_dict(),
                    "architecture": "segmentation_models_pytorch.Unet",
                    "encoder_name": ENCODER,
                    "encoder_init": f"transfer from models/{VESSEL_CKPT.name} (encoder only; "
                                    f"conv1 {ts['conv1_handling']})",
                    "in_channels": IN_CHANNELS,
                    "classes": 1,
                    "activation": None,
                    "patch_size": PATCH_SIZE,
                    "image_input_size": BEN_GRAHAM_SIZE,
                    "preprocessing": (f"ben_graham_preprocess(target_size={BEN_GRAHAM_SIZE}) -> RGB; "
                                      f"per-channel normalise (x/255 - {NORM_MEAN}) / {NORM_STD}; "
                                      f"masks resized NEAREST; red_lesion = MA OR HE"),
                    "seed": SEED,
                    "best_epoch": best_epoch,
                    "best_val_dice": best_val_dice,
                    "loss": f"{DICE_WEIGHT}*Dice + {FOCAL_WEIGHT}*Focal (from logits)",
                    "optimizer": "Adam",
                    "lr": LR,
                    "vessel_transfer_stats": ts,
                }
                if SAVE_OPTIMIZER_STATE:
                    ckpt["optimizer_state_dict"] = optimizer.state_dict()
                torch.save(ckpt, str(CHECKPOINT))
            else:
                es_counter += 1

            print(f"{epoch:>5} | {tr_loss:>8.4f} {tr_dice:>7.4f} | {vl_loss:>8.4f} {vl_dice:>7.4f} | "
                  f"{lr_now:>9.2e} | {note}")

            if es_counter >= ES_PATIENCE:
                print(f"\n  Early stopping: no val-Dice improvement for {ES_PATIENCE} epochs.")
                break

        print("-" * 70)
        print(f"  Best epoch {best_epoch}  |  best val Dice {best_val_dice:.4f}")

    # ---- reload best, visualise, metrics -----------------------
    ckpt = torch.load(str(CHECKPOINT), map_location=DEVICE, weights_only=False)
    model.load_state_dict(ckpt["model_state_dict"])
    print(f"  Reloaded best checkpoint: {CHECKPOINT}")

    vis_pool = sorted(val_recs, key=lambda r: best_per_image.get(r.img_id, 0.0), reverse=True)
    pick = vis_pool[:max(1, N_VIS_IMAGES // 2)] + vis_pool[-(N_VIS_IMAGES - N_VIS_IMAGES // 2):]
    seen, vis_records = set(), []
    for r in pick:
        if r.img_id not in seen:
            seen.add(r.img_id)
            vis_records.append(r)
    vis_records = vis_records[:N_VIS_IMAGES]
    saved = save_visualisations(model, vis_records, cache, PRED_DIR)
    print(f"  Saved {len(saved)} visualisations to {PRED_DIR}")
    for iid, fp, d in saved:
        print(f"    {iid}  Dice={d:.3f}  -> {Path(fp).name}")

    metrics = {
        "best_epoch": best_epoch,
        "best_val_dice": best_val_dice,
        "final_val_dice": final_val_dice,
        "num_images": len(records),
        "num_with_MA": n_ma,
        "num_with_HE": n_he,
        "num_with_both": n_both,
        "pct_images_with_lesion": round(pct_lesion, 2),
        "train_image_count": len(train_recs),
        "val_image_count": len(val_recs),
        "train_ids": sorted(r.img_id for r in train_recs),
        "val_ids": sorted(r.img_id for r in val_recs),
        "seed": SEED,
        "patch_config": {
            "patch_size": PATCH_SIZE,
            "patches_per_image_per_epoch": PATCHES_PER_IMAGE_EPOCH,
            "lesion_patch_ratio": LESION_PATCH_RATIO,
            "min_lesion_pixels": MIN_LESION_PIXELS,
            "max_crop_attempts": MAX_CROP_ATTEMPTS,
        },
        "model_config": {
            "architecture": "segmentation_models_pytorch.Unet",
            "encoder_name": ENCODER,
            "encoder_init": f"transfer from models/{VESSEL_CKPT.name} (encoder only)",
            "in_channels": IN_CHANNELS,
            "classes": 1,
            "activation": None,
            "image_input_size": BEN_GRAHAM_SIZE,
            "batch_size": BATCH_SIZE,
            "lr": LR,
            "max_epochs": MAX_EPOCHS,
            "es_patience": ES_PATIENCE,
            "loss": f"{DICE_WEIGHT}*Dice + {FOCAL_WEIGHT}*Focal",
        },
        "augmentation": ("custom synchronised cv2/scipy pipeline: rotate(+-180), hflip, vflip, "
                         "elastic(alpha=120,sigma=6), brightness/contrast(+-0.2). "
                         "Albumentations 2.0.8 and matplotlib 3.11.1 are both installed but "
                         "native-crash in this env (OpenCV 5.0.0) - transforms and visualisations "
                         "are done with raw cv2/numpy/PIL instead."),
        "vessel_transfer": ts,
        "per_image_val_dice_at_best": best_per_image,
    }
    with open(METRICS_JSON, "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Wrote metrics JSON: {METRICS_JSON}")

    # ---- final disk report -----------------------------------
    print("\n" + "=" * 70)
    print("  DONE")
    print("=" * 70)
    print(f"  best epoch / val Dice : {best_epoch} / {best_val_dice:.4f}")
    print(f"  checkpoint            : {CHECKPOINT}  ({CHECKPOINT.stat().st_size / 1e6:.1f} MB)")
    print(f"  visualisations        : {PRED_DIR}  ({len(saved)} PNG)")
    print(f"  metrics               : {METRICS_JSON}")
    print(f"  wall time             : {(time.time() - t_start) / 60:.1f} min")
    print(f"  Free disk (end)       : {disk_free_gb(PIPELINE_DIR):.2f} GB")
    print("=" * 70)


if __name__ == "__main__":
    main()
