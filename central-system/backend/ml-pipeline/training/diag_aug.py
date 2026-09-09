"""Quick diagnostic: test augmentation pipeline and find the crash point."""
import sys
import traceback
from pathlib import Path

import cv2
import numpy as np

print("--- Import check ---")
import albumentations as A
from albumentations.pytorch import ToTensorV2
import torch
print(f"albumentations : {A.__version__}")
print(f"torch          : {torch.__version__}")

INPUT_SIZE = 512
DATASET_DIR = Path(__file__).resolve().parent.parent / "datasets" / "chasedb1"


def resize_and_pad(image, target, interp):
    h, w = image.shape[:2]
    scale = target / max(h, w)
    new_h, new_w = int(round(h * scale)), int(round(w * scale))
    resized = cv2.resize(image, (new_w, new_h), interpolation=interp)
    if image.ndim == 3:
        canvas = np.zeros((target, target, image.shape[2]), dtype=image.dtype)
    else:
        canvas = np.zeros((target, target), dtype=image.dtype)
    pad_top  = (target - new_h) // 2
    pad_left = (target - new_w) // 2
    canvas[pad_top:pad_top + new_h, pad_left:pad_left + new_w] = resized
    return canvas


img_path  = DATASET_DIR / "Image_01L.jpg"
mask_path = DATASET_DIR / "Image_01L_1stHO.png"

img   = cv2.imread(str(img_path))
green = img[:, :, 1]
image = resize_and_pad(green, INPUT_SIZE, cv2.INTER_LINEAR)
mask_raw = cv2.imread(str(mask_path), cv2.IMREAD_GRAYSCALE)
mask     = resize_and_pad(mask_raw, INPUT_SIZE, cv2.INTER_NEAREST)
mask     = (mask > 127).astype(np.float32)

print(f"\nimage shape: {image.shape}  dtype: {image.dtype}")
print(f"mask  shape: {mask.shape}   dtype: {mask.dtype}")

# --- Test each transform step individually ---
transforms_to_test = [
    ("Rotate",                    A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=1.0)),
    ("HorizontalFlip",            A.HorizontalFlip(p=1.0)),
    ("VerticalFlip",              A.VerticalFlip(p=1.0)),
    ("ElasticTransform",          A.ElasticTransform(alpha=120, sigma=120 * 0.05, p=1.0)),
    ("RandomBrightnessContrast",  A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=1.0)),
    ("Normalize",                 A.Normalize(mean=(0.5,), std=(0.5,), max_pixel_value=255.0)),
    ("ToTensorV2",                ToTensorV2()),
]

print("\n--- Testing transforms individually ---")
cur_image = image.copy()
cur_mask  = mask.copy()
for name, tfm in transforms_to_test:
    try:
        compose = A.Compose([tfm])
        out = compose(image=cur_image, mask=cur_mask)
        cur_image = out["image"]
        cur_mask  = out["mask"]
        if isinstance(cur_image, torch.Tensor):
            print(f"  [OK] {name:30s}  image={tuple(cur_image.shape)} {cur_image.dtype}  mask={tuple(cur_mask.shape) if isinstance(cur_mask, torch.Tensor) else cur_mask.shape}")
        else:
            print(f"  [OK] {name:30s}  image={cur_image.shape} {cur_image.dtype}  mask={cur_mask.shape}")
    except Exception as e:
        print(f"  [FAIL] {name}: {type(e).__name__}: {e}")
        traceback.print_exc()
        sys.exit(1)

print("\nAll transforms passed individually.")

# --- Test full pipeline ---
print("\n--- Testing full Compose pipeline ---")
try:
    full = A.Compose([
        A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=0.7),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.ElasticTransform(alpha=120, sigma=120 * 0.05, p=0.3),
        A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=0.5),
        A.Normalize(mean=(0.5,), std=(0.5,), max_pixel_value=255.0),
        ToTensorV2(),
    ])
    out2 = full(image=image, mask=mask)
    img_t  = out2["image"]
    mask_t = out2["mask"]
    print(f"  image tensor: {tuple(img_t.shape)}  {img_t.dtype}")
    print(f"  mask  tensor: {tuple(mask_t.shape)}  {mask_t.dtype}")
    print("Full pipeline OK")
except Exception as e:
    print(f"FULL PIPELINE FAIL: {type(e).__name__}: {e}")
    traceback.print_exc()
    sys.exit(1)
