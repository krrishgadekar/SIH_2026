"""
segInfer.py
===========
Phase 4 segmentation and localization: models M2-M5, one process, one JSON.

    python segInfer.py <imagePath> --outdir DIR

Prints ONE line of JSON to stdout. Errors go to stderr, never stdout, for the
same reason as branchAInfer.py: Node parses stdout as JSON, so a traceback
printed there is read as a malformed result instead of a failure.

Exit codes:  0 success   2 bad arguments   3 inference failed

── WHY ALL FOUR RUN IN ONE PROCESS ─────────────────────────────────────────
Interpreter start plus four model loads dominates the cost; four spawns would
pay it four times. They are also not independent -- M4's optic-disc masking
needs M3's disc centre -- so splitting them would mean passing coordinates
between processes for no gain.

── THE THREE COORDINATE SPACES, WHICH ARE THE WHOLE DIFFICULTY ─────────────
This is the part that silently produces plausible, wrong output.

  ORIGINAL      the photograph as captured, HxW.
  SQUISH-512    original resized to 512x512 ignoring aspect. M3 only.
  CROP-512      ben_graham's retinal crop box, resized to 512x512. M4, M5.
  PAD-512       aspect-preserving resize + centre zero-pad. M2 only.

Every model works in a different one, and NONE of them is the original. A mask
produced in CROP-512 and read as if it were SQUISH-512 still looks like a
lesion mask -- it is just in the wrong place, and since quadrant counts are what
the ICDR rule engine grades on, the grade changes without anything failing.

M4 is the sharp edge: its optic-disc masking is trained-in behaviour that the
model does NOT apply, so the caller must. The disc comes from M3 in SQUISH-512;
the mask must be applied in CROP-512. Mapping between them is via
retinal_crop_box(), which is why that was factored out of ben_graham rather
than reimplemented.

── WHAT IS PROVEN AND WHAT IS NOT ──────────────────────────────────────────
M3's recipe is PROVEN: it reproduces the model's own published predictions on
77/78 images (verifyModel3.py). That verification also established that
interpolation is not a detail -- INTER_AREA agrees 98.7% of the time and
OpenCV's default INTER_LINEAR only 28.2%.

M2, M4 and M5 preprocessing is taken from the checkpoints' own metadata strings
and Tanuj's handover, and is NOT independently reproduced here. The
interpolation used for M2's aspect-preserving resize in particular is not
recorded anywhere, and the M3 result is direct evidence that guessing it wrong
is not a rounding error. Treat their masks as unvalidated until each has its
own verify script. Nothing downstream should present them otherwise.
"""

import argparse
import json
import os
import sys

import cv2
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ML_ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)
sys.path.insert(0, ML_ROOT)

INPUT_SIZE = 512
IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], np.float32)

# M4's trained-in optic-disc mask radius, in CROP-512 pixels. From the
# checkpoint's own od_mask_radius field. The model does not apply it.
OD_MASK_RADIUS = 58

_MODELS = {}


def _fail(msg, code=3):
    print(f"segInfer: {msg}", file=sys.stderr)
    sys.exit(code)


# ── Model construction ─────────────────────────────────────────────────────
# Architectures come from each checkpoint's own metadata, and every load is
# strict=True. A non-strict load would silently accept a shape mismatch and
# leave randomly initialised weights in place, which produces a mask that looks
# like noise-flecked anatomy rather than an error.
_ARCH = {
    "vessel":        dict(encoder_name="resnet34", in_channels=1, classes=1),
    "localization":  dict(encoder_name="resnet18", in_channels=3, classes=2),
    "bright_lesion": dict(encoder_name="resnet34", in_channels=3, classes=1),
    "red_lesion":    dict(encoder_name="resnet34", in_channels=3, classes=1),
}


def load(role):
    if role in _MODELS:
        return _MODELS[role]
    import torch
    import segmentation_models_pytorch as smp
    from modelPaths import resolve, CheckpointMissing
    try:
        path = resolve(role)
    except CheckpointMissing as exc:
        _fail(str(exc))
    ckpt = torch.load(path, map_location="cpu", weights_only=False)
    model = smp.Unet(encoder_weights=None, activation=None, **_ARCH[role])
    model.load_state_dict(ckpt["model_state_dict"], strict=True)
    model.eval()
    _MODELS[role] = (model, ckpt)
    return model, ckpt


def _forward(model, x):
    import torch
    with torch.no_grad():
        return model(torch.from_numpy(x))[0].numpy()


# ── Backend switch (backend plan §S) ───────────────────────────────────────
# SEG_INFERENCE_BACKEND=matlab|python. With matlab, the forward pass of the
# three MATLAB-converted models runs in the persistent MATLAB session; every
# pre- and post-processing step below is unchanged, so both backends share one
# copy of it. M5 (red_lesion) is NOT converted for serving -- its conversion is
# the old 2-class model the 3-class retrain replaces -- so it always runs here.
#
# A session failure falls back to PyTorch for that call and is RECORDED in the
# output (segBackend), never silent: tensor parity was verified at 2e-6..4e-5,
# so the fallback changes where the numbers came from, not what they are, and
# losing Branch B entirely over a restarting session would be worse.
SEG_BACKEND = os.environ.get("SEG_INFERENCE_BACKEND", "matlab").strip().lower()
_MATLAB_NETS = {
    "vessel": "vessel_unet_v1",
    "localization": "localization_v1",
    "bright_lesion": "bright_lesion_unet_v1",
}
BACKEND_USED = {}


def _run(role, x):
    """Forward pass for `role` on NCHW float32 x; returns C x H x W."""
    if SEG_BACKEND == "matlab" and role in _MATLAB_NETS:
        try:
            from matlabSessionClient import forward
            out = forward(_MATLAB_NETS[role], x)
            BACKEND_USED[role] = "matlab"
            return out
        except Exception as exc:  # noqa: BLE001 - recorded, then fall back
            print(f"segInfer: MATLAB session failed for {role} ({exc}); "
                  "falling back to PyTorch", file=sys.stderr)
            BACKEND_USED[role] = f"python (matlab failed: {exc})"
    else:
        BACKEND_USED[role] = "python"
    return _forward(load(role)[0], x)


# ── M3: optic disc and fovea ───────────────────────────────────────────────
def localize(bgr):
    """Disc and fovea in ORIGINAL image pixels.

    The proven recipe -- see verifyModel3.py. INTER_AREA is load-bearing.
    """
    h, w = bgr.shape[:2]
    resized = cv2.resize(bgr, (INPUT_SIZE, INPUT_SIZE), interpolation=cv2.INTER_AREA)
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
    x = (rgb.astype(np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
    hm = _run("localization", np.ascontiguousarray(x.transpose(2, 0, 1)[None, ...]))

    pts = {}
    for idx, name in ((0, "opticDisc"), (1, "fovea")):
        iy, ix = np.unravel_index(hm[idx].argmax(), hm[idx].shape)
        pts[name] = {
            # 512-space is what the model emits; original-space is what every
            # other stage needs. Both are reported so a disagreement between
            # them is visible rather than inferred.
            "x512": float(ix), "y512": float(iy),
            "x": float(ix) * w / INPUT_SIZE,
            "y": float(iy) * h / INPUT_SIZE,
            "peak": float(hm[idx].max()),
        }
    return pts


# ── M2: vessels ────────────────────────────────────────────────────────────
def _aspect_pad(gray, size=INPUT_SIZE):
    """Aspect-preserving resize then centre zero-pad. Returns (padded, geom)."""
    h, w = gray.shape[:2]
    scale = size / max(h, w)
    nw, nh = int(round(w * scale)), int(round(h * scale))
    # INTER_LINEAR, and this is NOT the same choice M3 makes. M3 needs
    # INTER_AREA (98.7% agreement vs 28.2% for LINEAR); M2 needs INTER_LINEAR
    # (100.000% exact pixel agreement vs 99.756% for AREA). Neither checkpoint
    # records its interpolation, and the two models disagree -- so it cannot be
    # set once globally and must be verified per model. See verifySegModels.py.
    resized = cv2.resize(gray, (nw, nh), interpolation=cv2.INTER_LINEAR)
    out = np.zeros((size, size), resized.dtype)
    ox, oy = (size - nw) // 2, (size - nh) // 2
    out[oy:oy + nh, ox:ox + nw] = resized
    return out, (ox, oy, nw, nh)


def vessels(bgr):
    """Vessel mask in ORIGINAL image pixels.

    Trained on CHASE_DB1, which is near-square, so the centre pad barely showed
    there. A 3:2 fundus photograph gets large black bands, and the pad must be
    reproduced exactly or the model sees an input unlike anything it was
    trained on. This is the highest train/serve-skew risk of the four.
    """
    h, w = bgr.shape[:2]
    green = bgr[:, :, 1]
    padded, (ox, oy, nw, nh) = _aspect_pad(green)
    x = ((padded.astype(np.float32) / 255.0) - 0.5) / 0.5
    logits = _run("vessel", np.ascontiguousarray(x[None, None, ...]))[0]
    prob = 1.0 / (1.0 + np.exp(-logits))
    # Undo the pad BEFORE resizing back: the padding is not part of the image,
    # and resizing it in would drag black bands into the retina.
    inner = prob[oy:oy + nh, ox:ox + nw]
    full = cv2.resize(inner, (w, h), interpolation=cv2.INTER_LINEAR)
    return full > 0.5


# ── M4 / M5: lesions, in ben_graham CROP-512 space ─────────────────────────
def _crop512(bgr):
    """ben_graham at 512 plus the crop box needed to map coordinates."""
    from preprocessing.ben_graham import ben_graham_preprocess, retinal_crop_box
    proc = ben_graham_preprocess(bgr, target_size=INPUT_SIZE)
    return cv2.cvtColor(proc, cv2.COLOR_BGR2RGB), retinal_crop_box(bgr)


def _to_crop512(px, py, box):
    """ORIGINAL pixel -> CROP-512 pixel."""
    x0, y0, bw, bh = box
    return (px - x0) * INPUT_SIZE / bw, (py - y0) * INPUT_SIZE / bh


def _lesion_prob(role, rgb512):
    # Both lesion models use (x/255 - 0.5)/0.5, NOT ImageNet. M4's checkpoint
    # says encoder_weights='imagenet', which describes only how the encoder was
    # initialised -- it is not the input normalization, and reading it as such
    # is the single easiest mistake here. Tanuj resolved it by Dice against
    # ground truth: this norm 0.49, ImageNet norm 0.33. Note the failure mode:
    # 0.33 still yields a plausible-looking mask, so it degrades quietly.
    x = ((rgb512.astype(np.float32) / 255.0) - 0.5) / 0.5
    logits = _run(role, np.ascontiguousarray(x.transpose(2, 0, 1)[None, ...]))[0]
    return 1.0 / (1.0 + np.exp(-logits))


def lesions(bgr, disc_xy):
    """Red and bright lesion masks, both in ORIGINAL image pixels."""
    h, w = bgr.shape[:2]
    rgb512, box = _crop512(bgr)

    red = _lesion_prob("red_lesion", rgb512) > 0.5
    bright = _lesion_prob("bright_lesion", rgb512) > 0.5

    # M4's optic-disc masking: trained-in behaviour the model does not apply.
    # The disc is bright and round and the bright-lesion model fires on it, so
    # without this every image gains a large false exudate exactly where the
    # disc is -- which, with redFloor now at 3, is enough to move a grade.
    od_masked = False
    if disc_xy is not None:
        cx, cy = _to_crop512(disc_xy[0], disc_xy[1], box)
        if np.isfinite(cx) and np.isfinite(cy):
            yy, xx = np.ogrid[:INPUT_SIZE, :INPUT_SIZE]
            bright = bright & (((xx - cx) ** 2 + (yy - cy) ** 2) > OD_MASK_RADIUS ** 2)
            od_masked = True

    # Restrict to the retina. A "lesion" outside the retinal circle is a
    # camera artefact by definition -- the vignette edge and the black surround
    # are high-contrast boundaries and both lesion models fire along them. On a
    # real image this was the majority of all detections, concentrated in a band
    # at the image edge. Left in, they are counted as lesions by the rule
    # engine, and with redFloor at 3 that alone can manufacture a grade.
    #
    # Same green>7 rule ben_graham crops with and Grad-CAM's ROI safeguard
    # uses, so "inside the retina" means one thing across the pipeline.
    from gradcam import retinal_mask
    roi512 = retinal_mask(cv2.cvtColor(rgb512, cv2.COLOR_RGB2BGR))
    red = red & roi512
    bright = bright & roi512

    def to_original(mask):
        x0, y0, bw, bh = box
        full = np.zeros((h, w), bool)
        # INTER_NEAREST: a binary mask must stay binary. Interpolating it
        # produces fractional values that a >0.5 threshold then re-binarises
        # along resampled edges, quietly changing lesion areas and counts.
        back = cv2.resize(mask.astype(np.uint8), (bw, bh),
                          interpolation=cv2.INTER_NEAREST).astype(bool)
        full[y0:y0 + bh, x0:x0 + bw] = back
        return full

    # The 512-space masks are returned ALONGSIDE the original-space ones, and
    # counting must use the 512 ones.
    #
    # min_area is 10 px AT 512. Applied to an upsampled original-space mask it
    # means something completely different: mapping a 512 mask back onto a
    # 4288-wide photograph scales areas by ~70x, so a 10 px floor there keeps
    # blobs of 0.14 px at 512 -- i.e. no filtering at all. Measured, that
    # inflated IDRiD_212 from 1 red lesion to 11, and every count with it.
    #
    # Original-space masks stay for overlays and for anything that has to line
    # up with the photograph; counts come from the space the thresholds were
    # calibrated in.
    return to_original(red), to_original(bright), od_masked, red, bright, box


# ── Reporting ──────────────────────────────────────────────────────────────
def quadrant_counts(components, fovea_xy, disc_xy):
    """Lesions per quadrant, in the frame the ICDR thresholds were fitted in.

    Centred on the FOVEA, x-axis pointing fovea -> optic disc (nasal), y-axis
    perpendicular. Returns [q_++, q_+-, q_-+, q_--].

    This reproduces diagnostics/check_agreement.py's convention exactly, and
    that is the point: redFloor and grade3QuadMin were calibrated against these
    counts, and a threshold is only meaningful paired with the procedure it was
    fitted on. A different-but-reasonable partition would silently shift what
    "3 lesions in all four quadrants" means.

    The quadrants are NOT named here. fundusQuadrants.m does the anatomical
    naming (superior-temporal and so on) for the evidence report, including the
    mirrored-eye case where superior and inferior swap; that logic is tested
    there and is not duplicated.
    """
    axis = np.array(disc_xy, float) - np.array(fovea_xy, float)
    norm = np.linalg.norm(axis)
    if norm < 1e-6:
        # Disc and fovea on top of each other means localization failed. Fall
        # back to image axes rather than dividing by ~0 and scattering lesions
        # into essentially random quadrants.
        axis = np.array([1.0, 0.0])
        norm = 1.0
    axis = axis / norm
    perp = np.array([-axis[1], axis[0]])

    counts = [0, 0, 0, 0]
    for comp in components:
        d = np.array([comp["x"], comp["y"]], float) - np.array(fovea_xy, float)
        u, v = float(d @ axis), float(d @ perp)
        counts[(0 if u >= 0 else 2) + (0 if v >= 0 else 1)] += 1
    return counts


def describe(mask, min_area=1):
    """Connected-component summary. Counts LESIONS, not pixels.

    The rule engine grades on lesion counts, and a pixel count is a different
    quantity: one large haemorrhage and forty microaneurysms can cover the same
    area and mean completely different things clinically.
    """
    n, _labels, stats, cents = cv2.connectedComponentsWithStats(
        mask.astype(np.uint8), connectivity=8)
    comps = []
    for i in range(1, n):                       # 0 is background
        area = int(stats[i, cv2.CC_STAT_AREA])
        if area < min_area:
            continue
        comps.append({"x": float(cents[i][0]), "y": float(cents[i][1]), "area": area})
    return comps


def summarise(mask, min_area=1):
    """Compact counts for the JSON payload.

    The full component list is deliberately NOT returned. On a real image it
    ran to hundreds of entries and tens of kilobytes, and nothing downstream
    consumes it: quadrant assignment happens in MATLAB from the mask PNG plus
    the disc/fovea axis, because that geometry is already written and tested
    there (including the mirrored-eye case). Shipping the list as well would be
    a second copy of the same facts, free to drift from the first.
    """
    comps = describe(mask, min_area)
    areas = sorted((c["area"] for c in comps), reverse=True)
    return {
        "count": len(comps),
        "totalAreaPx": int(sum(areas)),
        "largestAreaPx": int(areas[0]) if areas else 0,
        "medianAreaPx": float(np.median(areas)) if areas else 0.0,
        "minAreaFilter": int(min_area),
    }


def save_mask(mask, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    if not cv2.imwrite(path, (mask.astype(np.uint8) * 255)):
        raise RuntimeError(f"could not write {path}")
    return path


# 10 px at 512, matching diagnostics/check_agreement.py's MIN_BLOB_AREA. This
# is NOT a free parameter: redFloor and grade3QuadMin were calibrated against
# counts produced with this exact filter, so changing it silently rescales what
# those thresholds mean. Verified to reproduce that script's red counts 14/14
# on its own images.
DEFAULT_MIN_AREA = 10


def run_one(image, outdir=None, min_area=DEFAULT_MIN_AREA):
    """Segment one image; returns the result dict, raises on failure.

    Split out of main() so the persistent worker (segSession/runSegWorker.py)
    can call it in a process that has already paid for the torch import and the
    model load -- about 17 s of the ~19 s a one-shot run costs, against 2 s of
    actual work.

    It RAISES rather than exiting, so one unreadable image cannot take a
    long-lived worker down with it. main() still turns a failure into the same
    stderr line and exit code the Node side has always read.
    """
    # Cleared per CALL, not per process: BACKEND_USED records which backend
    # served each network, and in a long-lived worker a stale entry would
    # report the PREVIOUS image's MATLAB fallback as this one's.
    BACKEND_USED.clear()

    if not os.path.exists(image):
        raise FileNotFoundError(f"no file at {image}")
    bgr = cv2.imread(image, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError(f"could not read image: {image}")
    h, w = bgr.shape[:2]

    pts = localize(bgr)
    disc = (pts["opticDisc"]["x"], pts["opticDisc"]["y"])

    vessel = vessels(bgr)
    red, bright, od_masked, red512, bright512, box = lesions(bgr, disc)
    rgb512_for_roi, _ = _crop512(bgr)

    # Counting and quadrant assignment both happen in CROP-512, the space
    # the ICDR thresholds were calibrated in, so the landmarks are mapped
    # into it too rather than the masks being mapped out of it.
    fovea = (pts["fovea"]["x"], pts["fovea"]["y"])
    disc512 = _to_crop512(disc[0], disc[1], box)
    fovea512 = _to_crop512(fovea[0], fovea[1], box)
    red_comps = describe(red512, min_area)
    bright_comps = describe(bright512, min_area)
    red_q = quadrant_counts(red_comps, fovea512, disc512)
    bright_q = quadrant_counts(bright_comps, fovea512, disc512)

    out = {
        "image": os.path.abspath(image),
        "imageSize": [int(h), int(w)],
        "opticDisc": pts["opticDisc"],
        "fovea": pts["fovea"],
        # Backend plan §I. The flag is produced by localize() -- a peak-
        # confidence gate on the fovea heatmap -- and is PROMOTED to the top
        # level here because that is where the contract says the backend reads
        # it (docs/api-contracts.md, agreed with Tanuj).
        #
        # This line exists because the two facts fit together badly: `out` does
        # not splat `pts`, it copies two named keys out of it. A flag added to
        # the localization result would therefore never reach the backend, the
        # backend would store NULL, and NULL is deliberately not false -- so a
        # case whose fovea could not be found would be graded on quadrants
        # nobody could place, and auto-cleared at Tier A. Nothing would error.
        #
        # Absent from `pts` -> absent here, still not false. "Not reported" and
        # "reported reliable" must stay different values all the way through.
        **({"foveaUnreliable": bool(pts["foveaUnreliable"])}
           if isinstance(pts.get("foveaUnreliable"), (bool, np.bool_)) else {}),
        "vessel": {"pixels": int(vessel.sum()),
                   "fraction": float(vessel.mean())},
        "redLesions": summarise(red512, min_area),
        "brightLesions": summarise(bright512, min_area),
        "odMaskApplied": od_masked,
        "odMaskRadiusCrop512": OD_MASK_RADIUS,
        # Stated in the payload, not only in a doc: anything that renders
        # or reports these masks should be able to see that three of the
        # four recipes have not been reproduced against known-good output.
        "verified": {"localization": True, "vessel": True,
                     "redLesion": True, "brightLesion": "normalization only"},
        "verificationNote": ("M2 100.000% exact vs published CHASE masks; "
                             "M3 77/78 exact vs published predictions; "
                             "M5 per-image val Dice reproduced to 4dp. "
                             "M4's normalization is confirmed (1.42x over "
                             "ImageNet) but its val split is not recorded, "
                             "so its exact Dice cannot be reproduced. "
                             "See verifySegModels.py / verifyModel3.py."),
        # Which backend actually ran each network (backend plan §S). A
        # fallback to PyTorch after a MATLAB failure is visible here.
        "segBackend": {"requested": SEG_BACKEND, "used": dict(BACKEND_USED)},
        # Quadrant counts, in the frame the ICDR thresholds were fitted in.
        "redPerQuadrant": red_q,
        "brightPerQuadrant": bright_q,
        "countingProcedure": (
            "prob > 0.5, 8-connectivity, components >= %d px at 512, "
            "quadrants centred on the fovea with the x-axis along "
            "fovea->disc. Reproduces diagnostics/check_agreement.py "
            "exactly: 14/14 red counts on its own images." % min_area),
    }

    if outdir:
        base = os.path.splitext(os.path.basename(image))[0]
        # Lesion union and retina, at Branch A's 384 geometry.
        #
        # Task 7.1 compares Grad-CAM against a lesion mask, and the two live
        # in different spaces: the CAM is 12x12 over ben_graham's crop at
        # 384, the masks above are in ORIGINAL image pixels. Both of these
        # are written in the CAM's own frame so the comparison needs no
        # re-derivation of the crop geometry on the MATLAB side, where
        # getting it wrong would silently score attention against a
        # misaligned mask and still return a plausible number.
        #
        # NEAREST on the way down: a binary mask must stay binary.
        union384 = cv2.resize((red512 | bright512).astype(np.uint8),
                              (384, 384), interpolation=cv2.INTER_NEAREST)
        from gradcam import retinal_mask
        roi512 = retinal_mask(cv2.cvtColor(rgb512_for_roi, cv2.COLOR_RGB2BGR))
        roi384 = cv2.resize(roi512.astype(np.uint8), (384, 384),
                            interpolation=cv2.INTER_NEAREST)
        out["masks"] = {
            "lesion384": save_mask(union384.astype(bool),
                                   os.path.join(outdir, base + "_lesion384.png")),
            "roi384": save_mask(roi384.astype(bool),
                                os.path.join(outdir, base + "_roi384.png")),
            "vessel": save_mask(vessel, os.path.join(outdir, base + "_vessel.png")),
            "red":    save_mask(red,    os.path.join(outdir, base + "_red.png")),
            "bright": save_mask(bright, os.path.join(outdir, base + "_bright.png")),
        }

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", nargs="?")
    ap.add_argument("--outdir", default=None,
                    help="write vessel/red/bright mask PNGs here")
    ap.add_argument("--min-area", type=int, default=DEFAULT_MIN_AREA,
                    help="drop components smaller than this many pixels (512-space)")
    args = ap.parse_args()

    if not args.image:
        print("usage: segInfer.py <imagePath> [--outdir DIR]", file=sys.stderr)
        sys.exit(2)

    try:
        print(json.dumps(run_one(args.image, args.outdir, args.min_area)))
        return 0
    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - must not leak a traceback to stdout
        _fail(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    raise SystemExit(main())
