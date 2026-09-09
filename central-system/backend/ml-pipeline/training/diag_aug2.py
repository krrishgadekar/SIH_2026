"""Diagnostic to isolate albumentations crash causes."""
import sys
import traceback
from pathlib import Path

import cv2
cv2.setNumThreads(0) # Often fixes native OpenCV crashes on Windows
import numpy as np

import albumentations as A
from albumentations.pytorch import ToTensorV2
import torch

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

print("Testing with mask as float32")
mask_float = (mask > 127).astype(np.float32)
try:
    tfm = A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=1.0)
    out = tfm(image=image, mask=mask_float)
    print("  [OK] Rotate with float32 mask passed")
except Exception as e:
    print(f"  [FAIL] Rotate float32: {e}")

print("Testing with mask as uint8")
mask_uint8 = (mask > 127).astype(np.uint8)
try:
    tfm = A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=1.0)
    out = tfm(image=image, mask=mask_uint8)
    print("  [OK] Rotate with uint8 mask passed")
except Exception as e:
    print(f"  [FAIL] Rotate uint8: {e}")

print("Testing full pipeline with uint8 mask")
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
    out = full(image=image, mask=mask_uint8)
    print("  [OK] Full pipeline with uint8 mask passed")
except Exception as e:
    print(f"  [FAIL] Full pipeline: {e}")
