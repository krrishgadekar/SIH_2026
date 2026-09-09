"""Test augmentation step by step to isolate crash in albumentations 2.0.8"""
import sys
import traceback
import os
os.environ['KMP_DUPLICATE_LIB_OK'] = 'TRUE'

import numpy as np
import cv2
cv2.setNumThreads(0)

print("cv2 OK", flush=True)

import albumentations as A
print(f"albumentations {A.__version__} OK", flush=True)

from albumentations.pytorch import ToTensorV2
print("ToTensorV2 OK", flush=True)

# Dummy data
img  = np.random.randint(0, 255, (512, 512), dtype=np.uint8)
mask = np.zeros((512, 512), dtype=np.uint8)
mask[100:400, 100:400] = 255

print("Testing transforms one by one...", flush=True)

# Step 1: Rotate
try:
    t = A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] Rotate", flush=True)
except Exception as e:
    print(f"  [FAIL] Rotate: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# Step 2: HFlip
try:
    t = A.HorizontalFlip(p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] HorizontalFlip", flush=True)
except Exception as e:
    print(f"  [FAIL] HorizontalFlip: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# Step 3: VFlip
try:
    t = A.VerticalFlip(p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] VerticalFlip", flush=True)
except Exception as e:
    print(f"  [FAIL] VerticalFlip: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# Step 4: ElasticTransform
try:
    t = A.ElasticTransform(alpha=120, sigma=120*0.05, p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] ElasticTransform", flush=True)
except Exception as e:
    print(f"  [FAIL] ElasticTransform: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# Step 5: RandomBrightnessContrast
try:
    t = A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=1.0)
    r = t(image=img, mask=mask)
    print("  [OK] RandomBrightnessContrast", flush=True)
except Exception as e:
    print(f"  [FAIL] RandomBrightnessContrast: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# Step 6: Normalize
try:
    t = A.Normalize(mean=(0.5,), std=(0.5,), max_pixel_value=255.0)
    r = t(image=img, mask=mask)
    print("  [OK] Normalize", flush=True)
except Exception as e:
    print(f"  [FAIL] Normalize: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# Step 7: ToTensorV2
try:
    t = ToTensorV2()
    # After Normalize, image is float32
    norm_img = (img.astype(np.float32) / 255.0 - 0.5) / 0.5
    r = t(image=norm_img, mask=mask)
    print("  [OK] ToTensorV2", flush=True)
    print(f"       image shape: {r['image'].shape}, dtype: {r['image'].dtype}", flush=True)
    print(f"       mask  shape: {r['mask'].shape},  dtype: {r['mask'].dtype}", flush=True)
except Exception as e:
    print(f"  [FAIL] ToTensorV2: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

# Step 8: Full compose
try:
    transform = A.Compose([
        A.Rotate(limit=20, border_mode=cv2.BORDER_CONSTANT, p=0.7),
        A.HorizontalFlip(p=0.5),
        A.VerticalFlip(p=0.5),
        A.ElasticTransform(alpha=120, sigma=120*0.05, p=0.3),
        A.RandomBrightnessContrast(brightness_limit=0.15, contrast_limit=0.15, p=0.5),
        A.Normalize(mean=(0.5,), std=(0.5,), max_pixel_value=255.0),
        ToTensorV2(),
    ])
    r = transform(image=img, mask=mask)
    print("  [OK] Full Compose pipeline", flush=True)
    print(f"       image: {r['image'].shape} {r['image'].dtype}", flush=True)
    print(f"       mask:  {r['mask'].shape}  {r['mask'].dtype}", flush=True)
except Exception as e:
    print(f"  [FAIL] Full Compose: {e}", flush=True)
    traceback.print_exc()
    sys.exit(1)

print("\nAll transforms OK!", flush=True)
