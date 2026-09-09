"""Test augmentation transforms individually with proper OMP env vars set."""
import sys
import os

# MUST set these before ANY import of cv2/torch/numpy
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'
os.environ['OMP_NUM_THREADS'] = '1'
os.environ['MKL_NUM_THREADS'] = '1'

import numpy as np
import cv2
cv2.setNumThreads(0)
cv2.ocl.setUseOpenCL(False)

print("cv2 OK", flush=True)

import albumentations as A
print(f"albumentations {A.__version__} OK", flush=True)

from albumentations.pytorch import ToTensorV2
print("ToTensorV2 OK", flush=True)

# Dummy data matching training data
img  = np.random.randint(0, 255, (512, 512), dtype=np.uint8)
mask = np.zeros((512, 512), dtype=np.uint8)
mask[100:400, 100:400] = 255

print("Testing A.Rotate...", flush=True)
try:
    t = A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] Rotate -> img shape:", r['image'].shape, flush=True)
except Exception as e:
    print(f"  [FAIL] Rotate: {e}", flush=True)
    sys.exit(1)

print("Testing A.HorizontalFlip...", flush=True)
try:
    t = A.HorizontalFlip(p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] HorizontalFlip", flush=True)
except Exception as e:
    print(f"  [FAIL] HFlip: {e}", flush=True)
    sys.exit(1)

print("Testing A.ElasticTransform...", flush=True)
try:
    t = A.ElasticTransform(alpha=120, sigma=6, p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] ElasticTransform -> img shape:", r['image'].shape, flush=True)
except Exception as e:
    print(f"  [FAIL] ElasticTransform: {e}", flush=True)
    sys.exit(1)

print("Testing A.Normalize...", flush=True)
try:
    t = A.Normalize(mean=(0.5,), std=(0.5,), max_pixel_value=255.0)
    r = t(image=img.astype(np.float32), mask=mask)
    print("  [OK] Normalize -> img dtype:", r['image'].dtype, flush=True)
except Exception as e:
    print(f"  [FAIL] Normalize: {e}", flush=True)
    sys.exit(1)

print("Testing ToTensorV2...", flush=True)
try:
    norm = (img.astype(np.float32) / 255.0 - 0.5) / 0.5
    t = ToTensorV2()
    r = t(image=norm, mask=mask)
    print("  [OK] ToTensorV2 -> img:", r['image'].shape, r['image'].dtype,
          "mask:", r['mask'].shape, r['mask'].dtype, flush=True)
except Exception as e:
    print(f"  [FAIL] ToTensorV2: {e}", flush=True)
    sys.exit(1)

print("\nAll OK! Testing full Compose...", flush=True)
try:
    transform = A.Compose([
        A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=1.0),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.ElasticTransform(alpha=120, sigma=6, p=0.3),
        A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=0.5),
        A.Normalize(mean=(0.5,), std=(0.5,), max_pixel_value=255.0),
        ToTensorV2(),
    ])
    r = transform(image=img, mask=mask)
    print("  [OK] Full Compose", flush=True)
    print(f"  image: {r['image'].shape} {r['image'].dtype}", flush=True)
    print(f"  mask:  {r['mask'].shape}  {r['mask'].dtype}", flush=True)
except Exception as e:
    print(f"  [FAIL] Compose: {e}", flush=True)
    sys.exit(1)

print("\nSUCCESS", flush=True)
