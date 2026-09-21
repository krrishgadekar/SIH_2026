"""
prepare_parity_inputs.py — build the shared parity-check fixtures.

For 10 real fundus photos (IDRiD grading set), apply EACH model's own exact
training preprocessing (per diagnostics/MODEL_INTERFACE_REFERENCE.md /
ben_graham.py / train_vessel_unet.py), run the original PyTorch checkpoint,
and save both the preprocessed input tensor and the PyTorch output to .mat
files that parityCheck.m loads.

Feeding MATLAB the *same already-preprocessed tensor* (rather than having it
redo image loading independently) is deliberate: this check's job is to prove
the ONNX export/import round-trip preserved the network's numerics. Whether a
MATLAB port of each model's preprocessing matches Python pixel-for-pixel is a
separate, already-solved problem for M1 (preprocessModel1.m, verified to 2.98
grey levels / SSIM 0.98) and an open one for M2-M5, which have no MATLAB
preprocessing ports at all yet -- conflating the two would make it impossible
to tell which one a large diff came from.

Inputs are saved pre-permuted to MATLAB's SSCB layout (H, W, C, N) so
parityCheck.m can wrap them directly with dlarray(x, 'SSCB').
"""
import argparse
from pathlib import Path
import sys

import cv2
import numpy as np
import scipy.io as sio
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "preprocessing"))
from ben_graham import ben_graham_preprocess  # noqa: E402

import export_to_onnx as ex  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[4]
IDRID_DIR = (Path(__file__).resolve().parents[1] / "datasets" / "idrid" /
             "grading" / "B. Disease Grading" / "1. Original Images" / "a. Training Set")
OUT_DIR = Path(__file__).resolve().parent / "parity_data"

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def list_images(n=10):
    files = sorted(IDRID_DIR.glob("*.jpg"))[:n]
    if len(files) < n:
        raise RuntimeError(f"only found {len(files)} images under {IDRID_DIR}")
    return files


# ---------------------------------------------------------------------------
# Per-model preprocessing -- copied 1:1 from the training code / reference doc
# ---------------------------------------------------------------------------
def preprocess_m1(bgr):
    """Ben Graham 384 -> RGB -> ImageNet norm. (M1, DRClassifier eval_tf)"""
    bg = ben_graham_preprocess(bgr, 384)
    rgb = cv2.cvtColor(bg, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    x = (rgb - IMAGENET_MEAN) / IMAGENET_STD
    return x.transpose(2, 0, 1)  # C,H,W


def resize_and_pad(image, target, interp):
    """Exact port of train_vessel_unet.py's resize_and_pad."""
    h, w = image.shape[:2]
    scale = target / max(h, w)
    new_h, new_w = int(round(h * scale)), int(round(w * scale))
    resized = cv2.resize(image, (new_w, new_h), interpolation=interp)
    if image.ndim == 3:
        canvas = np.zeros((target, target, image.shape[2]), dtype=image.dtype)
    else:
        canvas = np.zeros((target, target), dtype=image.dtype)
    pad_top, pad_left = (target - new_h) // 2, (target - new_w) // 2
    canvas[pad_top:pad_top + new_h, pad_left:pad_left + new_w] = resized
    return canvas


def preprocess_m2(bgr):
    """green channel -> aspect-resize + center-pad 512 -> (x-0.5)/0.5. (M2)"""
    green = bgr[:, :, 1]
    padded = resize_and_pad(green, 512, cv2.INTER_LINEAR).astype(np.float32) / 255.0
    x = (padded - 0.5) / 0.5
    return x[np.newaxis, :, :]  # 1,H,W


def preprocess_m3(bgr):
    """plain squished resize 512 -> RGB -> ImageNet norm. (M3)"""
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (512, 512)).astype(np.float32) / 255.0
    x = (resized - IMAGENET_MEAN) / IMAGENET_STD
    return x.transpose(2, 0, 1)


def preprocess_m4_m5(bgr):
    """Ben Graham 512 -> RGB -> (x-0.5)/0.5. (M4, M5)"""
    bg = ben_graham_preprocess(bgr, 512)
    rgb = cv2.cvtColor(bg, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    x = (rgb - 0.5) / 0.5
    return x.transpose(2, 0, 1)


MODEL_SPECS = {
    "branchA_v1": dict(preprocess=preprocess_m1, build="m1", ckpt="branchA_v1.pt"),
    "vessel_unet_v1": dict(preprocess=preprocess_m2, build="m2", ckpt="vessel_unet_v1.pt"),
    "localization_v1": dict(preprocess=preprocess_m3, build="m3", ckpt="localization_v1.pt"),
    "bright_lesion_unet_v1": dict(preprocess=preprocess_m4_m5, build="m4", ckpt="bright_lesion_unet_v1.pt"),
    "red_lesion_unet_v1": dict(preprocess=preprocess_m4_m5, build="m5", ckpt="red_lesion_unet_v1.pt"),
    # M5 phase 2 (Gate 3): SAME preprocessing as v1 (Ben Graham 512, RGB,
    # (x-0.5)/0.5 -- confirmed against the checkpoint's own 'preprocessing'
    # metadata string), 3-class logits instead of 1. Downstream (parity
    # check) applies SOFTMAX to these, not sigmoid -- see
    # parityCheckRedLesionV2.m.
    "red_lesion_unet_v2": dict(preprocess=preprocess_m4_m5, build="m5_v2", ckpt="red_lesion_unet_v2.pt"),
}


def build_model(tag):
    if tag == "m1":
        ckpt = torch.load(ex.find_ckpt("branchA_v1.pt"), map_location="cpu", weights_only=False)
        m = ex.DRClassifier("efficientnet_b0", 5, 0.3)
        m.load_state_dict(ckpt["model_state_dict"], strict=True)
        return m
    import segmentation_models_pytorch as smp
    fname, enc, inc, cls = {
        "m2": ("vessel_unet_v1.pt", "resnet34", 1, 1),
        "m3": ("localization_v1.pt", "resnet18", 3, 2),
        "m4": ("bright_lesion_unet_v1.pt", "resnet34", 3, 1),
        "m5": ("red_lesion_unet_v1.pt", "resnet34", 3, 1),
        "m5_v2": ("red_lesion_unet_v2.pt", "resnet34", 3, 3),
    }[tag]
    ckpt = torch.load(ex.find_ckpt(fname), map_location="cpu", weights_only=False)
    m = smp.Unet(encoder_name=enc, encoder_weights=None, in_channels=inc, classes=cls, activation=None)
    m.load_state_dict(ckpt["model_state_dict"], strict=True)
    return m


def preprocess_v2a(bgr, size):
    """Ben Graham `size` -> RGB -> ImageNet norm. Identical pattern to
    preprocess_m1, at v2a's own img_size (512) instead of v1's 384 -- see
    train_classifier_kaggle_v2.ipynb cells 3/4 (ben_graham_preprocess,
    parameterised only by IMG_SIZE=512, otherwise byte-identical to
    preprocessing/ben_graham.py) and cell 10 (_preprocess_and_cache: exactly
    this crop -> BGR2RGB, cached as the eval_tf input) -- confirmed against
    the notebook, the source of truth for v2a's preprocessing."""
    bg = ben_graham_preprocess(bgr, size)
    rgb = cv2.cvtColor(bg, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
    x = (rgb - IMAGENET_MEAN) / IMAGENET_STD
    return x.transpose(2, 0, 1)


def softmax_rows(x):
    e = np.exp(x - x.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)


def prepare_v2a(bgrs, image_names):
    """v2a parity fixtures (GATE 3) + GATE 1's onnxruntime-vs-PyTorch softmax
    check on the same 10 images/preprocessing. v1's fixtures/entries are not
    touched by this function."""
    print("\n=== branchA_v2a ===")
    import export_to_onnx as ex

    ckpt_path = ex.find_ckpt("branchA_v2a.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    model = ex.build_v2a_5class_model(ckpt).eval()
    size = ckpt["img_size"]

    chw_batch = np.stack([preprocess_v2a(bgr, size) for bgr in bgrs]).astype(np.float32)
    with torch.no_grad():
        torch_out = model(torch.from_numpy(chw_batch)).numpy()  # N,5 logits

    hwcn_in = np.transpose(chw_batch, (2, 3, 1, 0))
    sio.savemat(OUT_DIR / "branchA_v2a_input.mat", {"x": hwcn_in})
    sio.savemat(OUT_DIR / "branchA_v2a_torch_output.mat", {"y": torch_out})
    print(f"  input  {hwcn_in.shape}  ->  torch_output {torch_out.shape}")
    print(f"  Saved branchA_v2a parity fixtures to {OUT_DIR}")

    # ── GATE 1: onnxruntime vs PyTorch, on the SAME preprocessed batch ──────
    import onnxruntime as ort
    onnx_path = ex.MODELS_DIR / "Model1" / "branchA_v2a.onnx"
    sess = ort.InferenceSession(str(onnx_path), providers=["CPUExecutionProvider"])
    input_name = sess.get_inputs()[0].name
    ort_out = sess.run(None, {input_name: chw_batch})[0]  # N,5 logits

    torch_probs = softmax_rows(torch_out)
    ort_probs = softmax_rows(ort_out)
    diff = np.abs(torch_probs - ort_probs)
    per_image_max = diff.max(axis=1)

    print("\n  -- GATE 1: onnxruntime vs PyTorch, softmax max|diff| --")
    for name, p in zip(image_names, per_image_max):
        print(f"  {name:>14}   max|diff| = {p:.8f}")
    overall_max = float(diff.max())
    THRESH = 1e-4
    if overall_max < THRESH:
        print(f"  PASS  overall max|diff| = {overall_max:.8f}  (threshold {THRESH})")
    else:
        print(f"  FAIL  overall max|diff| = {overall_max:.8f}  EXCEEDS threshold {THRESH}")
        raise RuntimeError(
            f"GATE 1 FAILED: onnxruntime vs PyTorch softmax max|diff|={overall_max:.8f} "
            f">= {THRESH}. Stopping per the brief -- do not work around this.")
    return overall_max


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", choices=list(MODEL_SPECS) + ["v2a"],
                    default=["v2a"],
                    help="which fixtures to (re)generate; default v2a only, "
                         "so v1's existing fixtures are never touched unless "
                         "explicitly requested")
    args = ap.parse_args()

    OUT_DIR.mkdir(exist_ok=True)
    images = list_images(10)
    print(f"Using {len(images)} images:")
    for p in images:
        print(" ", p.name)

    bgrs = [cv2.imread(str(p)) for p in images]
    if any(b is None for b in bgrs):
        raise RuntimeError("failed to read one or more images")

    for model_name in args.only:
        if model_name == "v2a":
            prepare_v2a(bgrs, [p.name for p in images])
            continue

        spec = MODEL_SPECS[model_name]
        print(f"\n=== {model_name} ===")
        model = build_model(spec["build"]).eval()

        chw_batch = np.stack([spec["preprocess"](bgr) for bgr in bgrs]).astype(np.float32)  # N,C,H,W
        with torch.no_grad():
            torch_out = model(torch.from_numpy(chw_batch)).numpy()  # N,C,H,W or N,5

        # MATLAB SSCB layout: H,W,C,N
        hwcn_in = np.transpose(chw_batch, (2, 3, 1, 0))
        sio.savemat(OUT_DIR / f"{model_name}_input.mat", {"x": hwcn_in})

        if torch_out.ndim == 2:  # classifier: N,5 logits -> save as N x 5
            sio.savemat(OUT_DIR / f"{model_name}_torch_output.mat", {"y": torch_out})
        else:  # segmentation/heatmap: N,C,H,W -> H,W,C,N
            hwcn_out = np.transpose(torch_out, (2, 3, 1, 0))
            sio.savemat(OUT_DIR / f"{model_name}_torch_output.mat", {"y": hwcn_out})

        print(f"  input  {hwcn_in.shape}  ->  torch_output {torch_out.shape}")

    print(f"\nSaved parity fixtures to {OUT_DIR}")


if __name__ == "__main__":
    main()
