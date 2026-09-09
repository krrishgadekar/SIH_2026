"""
branchAInfer.py
===============
Branch A inference. Reads a fundus image, returns a graded result as JSON.

    python branchAInfer.py <imagePath>

Prints ONE line of JSON to stdout and nothing else on success:

    {"drGradeCnn": 2, "confidenceScore": 0.71, "conformalTier": "B", ...}

Exit codes:
    0  success, JSON on stdout
    2  wrong arguments
    3  inference failed (unreadable image, missing model, ...)

── WHY THIS IS PYTHON AND NOT MATLAB ───────────────────────────────────────
The design doc requires MATLAB for the image-analysis and modelling code,
including both grading branches, and that was tested rather than waived.
MATLAB's official converter imports this network and computes the WRONG
NUMBERS: on identical input tensors it agrees with the model's published
logits on 8-11% of cases with a correlation of -0.25, while Python reproduces
them to 0.0050 with 100% agreement. The structure imports correctly, which is
what makes it dangerous -- only running it against known-good outputs catches
it. See testImportedNetwork.m; re-run it when the converter is updated.

So Branch A runs here. Everything that does not need the model's internals
stays in MATLAB: quality gate, camera calibration, the ICDR rule engine,
conformal tiering, the evidence report, Simulink.

── ERRORS GO TO STDERR, NEVER STDOUT ───────────────────────────────────────
Node parses stdout as JSON. A traceback printed there would be read as a
malformed result rather than a failure, and the orchestrator would report a
parse error instead of the real cause. stdout carries exactly one thing.

── THE PREPROCESSING IS NOT A CHOICE ───────────────────────────────────────
ben_graham_preprocess is imported from the training code, not reimplemented.
A model only ever sees what preprocessing hands it, and this project has
already measured what a mismatched chain costs: adding a CLAHE stage that
training never used dropped agreement with the model's own outputs from 100%
to 57.7%. If the training preprocessing changes, this import follows it
automatically -- which is the entire reason it is an import.
"""

import argparse
import json
import os
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ML_ROOT = os.path.dirname(HERE)
sys.path.insert(0, ML_ROOT)

MODEL_DIR = os.path.join(ML_ROOT, "models")
CKPT_PATH = os.path.join(MODEL_DIR, "Model1", "branchA_v1.pt")
CALIB_PATH = os.path.join(MODEL_DIR, "calibration_v1.json")

# Cached across calls within one process. Loading EfficientNet-B0 and its
# weights costs a second or so; a long-lived worker should pay that once.
_MODEL = None
_CKPT = None
_CALIB = None


def _fail(msg, code=3):
    print(f"branchAInfer: {msg}", file=sys.stderr)
    sys.exit(code)


def load_calibration():
    """Temperature and conformal threshold, fitted by calibrateBranchA.m.

    Absent calibration is NOT silently treated as "no calibration needed".
    T defaults to 1.0 only with an explicit flag in the output, because an
    uncalibrated confidence flowing into the Tier A/B/C routing would look
    exactly like a calibrated one and would route cases on numbers that mean
    something different.
    """
    if not os.path.exists(CALIB_PATH):
        return {"temperature": 1.0, "probThreshold": None, "calibrated": False,
                "warning": "calibration_v1.json missing; run calibrateBranchA.m. "
                           "Confidences are UNCALIBRATED."}
    with open(CALIB_PATH, "r", encoding="utf-8") as f:
        c = json.load(f)
    c["calibrated"] = True
    return c


def load_model():
    global _MODEL, _CKPT
    if _MODEL is not None:
        return _MODEL, _CKPT

    import torch
    import torch.nn as nn
    import timm

    if not os.path.exists(CKPT_PATH):
        _fail(f"no model at {CKPT_PATH}")

    ckpt = torch.load(CKPT_PATH, map_location="cpu", weights_only=False)

    class DRClassifier(nn.Module):
        """Rebuilt from the checkpoint's own `arch` string:
        timm(model_name, num_classes=0, drop_rate=0) -> Dropout -> Linear
        """

        def __init__(self, model_name, num_classes, num_features, drop_rate):
            super().__init__()
            self.backbone = timm.create_model(model_name, pretrained=False,
                                              num_classes=0, drop_rate=0)
            self.dropout = nn.Dropout(drop_rate)
            self.head = nn.Linear(num_features, num_classes)

        def forward(self, x):
            return self.head(self.dropout(self.backbone(x)))

    model = DRClassifier(ckpt["model_name"], ckpt["num_classes"],
                         ckpt["num_features"], ckpt["drop_rate"])
    model.load_state_dict(ckpt["model_state_dict"], strict=True)

    # eval() is not cosmetic: drop_rate is 0.3, and in train mode every call
    # would sample a different dropout mask and return a different grade for
    # the same photograph.
    model.eval()

    _MODEL, _CKPT = model, ckpt
    return model, ckpt


def preprocess(image_path, ckpt):
    """The training chain, imported rather than reimplemented."""
    import cv2
    from preprocessing.ben_graham import ben_graham_preprocess

    # cv2.imread returns BGR, which is what ben_graham was written against.
    # Handing it RGB would swap red and blue -- and in a fundus photograph the
    # red channel carries most of the signal, so the result looks plausible
    # and is completely wrong.
    bgr = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if bgr is None:
        _fail(f"could not read image: {image_path}")

    proc = ben_graham_preprocess(bgr, target_size=ckpt["img_size"])

    if ckpt["channel_order"] == "RGB":
        proc = cv2.cvtColor(proc, cv2.COLOR_BGR2RGB)

    x = proc.astype(np.float32) / 255.0
    x = (x - np.array(ckpt["normalize_mean"], np.float32)) \
        / np.array(ckpt["normalize_std"], np.float32)
    return x.transpose(2, 0, 1)[None, ...]      # HWC -> NCHW


def softmax(v):
    e = np.exp(v - v.max())
    return e / e.sum()


def assign_tier(probs, calib):
    """Conformal tier from the prediction set (Task 6.2).

    Membership is tested on the NONCONFORMITY scale -- (1-p) <= qhat -- not by
    comparing p against 1-qhat. The two are algebraically identical and
    numerically are not: 1 - 0.8432 is 0.15679999999999994, so a case sitting
    exactly on the boundary falls outside its own set. The same bug was found
    and fixed in conformalTiering.m; it must not reappear here.

    Branch disagreement and forced-poor-quality overrides are applied by the
    orchestrator, which is the only place that knows about Branch B.
    """
    if not calib.get("calibrated") or calib.get("qhat") is None:
        return None, [], "no calibration available"

    qhat = float(calib["qhat"])
    referable_from = int(calib.get("referableFrom", 2))

    in_set = [g for g in range(5) if (1.0 - probs[g]) <= qhat]

    if not in_set:
        return "C", in_set, ("empty prediction set: no grade cleared the conformal "
                             "threshold, so this image is unlike the calibration "
                             "data -- out of distribution, not merely uncertain")
    if all(g < referable_from for g in in_set):
        return "A", in_set, "prediction set contains no referable grade"
    if all(g >= referable_from for g in in_set):
        return "B", in_set, "prediction set is entirely referable"
    return "C", in_set, "prediction set spans referable and non-referable grades"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image", nargs="?", help="path to the fundus image")
    args = ap.parse_args()

    if not args.image:
        print("usage: branchAInfer.py <imagePath>", file=sys.stderr)
        sys.exit(2)
    if not os.path.exists(args.image):
        _fail(f"no file at {args.image}")

    try:
        import torch
        model, ckpt = load_model()
        calib = load_calibration()

        x = preprocess(args.image, ckpt)
        with torch.no_grad():
            logits = model(torch.from_numpy(x)).numpy()[0]

        raw = softmax(logits)
        T = float(calib.get("temperature", 1.0))
        cal = softmax(logits / T)

        grade = int(cal.argmax())
        tier, pred_set, tier_reason = assign_tier(cal, calib)

        out = {
            "drGradeCnn": grade,
            "confidenceScore": float(cal[grade]),
            "calibratedProbabilities": [float(v) for v in cal],
            "rawProbabilities": [float(v) for v in raw],
            "logits": [float(v) for v in logits],
            "referable": bool(grade >= int(calib.get("referableFrom", 2))),
            "conformalTier": tier,
            "predictionSet": pred_set,
            "tierReason": tier_reason,
            "temperature": T,
            "calibrated": bool(calib.get("calibrated", False)),
            "modelVersion": calib.get("modelVersion", "branchA_v1"),
            "imgSize": int(ckpt["img_size"]),
            "preprocessing": ckpt.get("preprocessing", ""),
        }
        if calib.get("warning"):
            out["calibrationWarning"] = calib["warning"]

        print(json.dumps(out))
        return 0

    except SystemExit:
        raise
    except Exception as exc:  # noqa: BLE001 - the boundary must not leak a traceback to stdout
        _fail(f"{type(exc).__name__}: {exc}")


if __name__ == "__main__":
    raise SystemExit(main())
