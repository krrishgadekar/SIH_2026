"""
export_to_onnx.py — Export the 5 trained PyTorch checkpoints to ONNX so MATLAB
(importNetworkFromONNX) can turn them into dlnetworks.

Architectures and preprocessing contracts are taken from the authoritative,
empirically-verified reference:
    central-system/backend/ml-pipeline/diagnostics/MODEL_INTERFACE_REFERENCE.md
NOT from docs/model-handoff-guide.md, whose "net contract" section (512x512x3,
legacy benGrahamCrop->claheEnhance->illuminationNormalize chain) predates the
actual branchA_v1.pt checkpoint and was superseded on 2026-09-09 by
preprocessing/preprocessModel1.m (384x384, ImageNet norm, no CLAHE) -- see that
file's header for the identifyTrainingChain.py logit-reproduction evidence
(0.0050 mean |logit diff|, 100% class agreement at 384; CLAHE variants degrade
agreement to ~50-80%).

Every state_dict is loaded with strict=True and the result is printed before
export. bright_lesion_unet_v1.pt's training script was never recovered, so its
architecture (per MODEL_INTERFACE_REFERENCE.md, reverse-engineered from the
checkpoint + Dice-against-ground-truth probes) is NOT assumed correct here --
if strict=True fails for it, this script stops and reports the mismatch
instead of relaxing to strict=False or guessing a different shape.
"""
import argparse
import sys
from pathlib import Path

import torch
import torch.nn as nn
import timm
import segmentation_models_pytorch as smp

MODELS_DIR = Path(__file__).resolve().parents[1] / "models"
OUT_DIR = Path(__file__).resolve().parent / "onnx_out"


def find_ckpt(filename: str) -> Path:
    matches = list(MODELS_DIR.rglob(filename))
    if not matches:
        raise FileNotFoundError(f"{filename} not found under {MODELS_DIR}")
    if len(matches) > 1:
        raise RuntimeError(f"multiple copies of {filename} found: {matches}")
    return matches[0]


class DRClassifier(nn.Module):
    """Exact wrapper branchA_v1.pt was trained with -- see
    MODEL_INTERFACE_REFERENCE.md 'Model 1'. NOT a bare
    timm.create_model(num_classes=5): the explicit nn.Dropout module is what
    lets MC-Dropout (Task 6.1) toggle dropout at inference, which timm's own
    functional head dropout cannot do."""

    def __init__(self, model_name, num_classes, drop_rate):
        super().__init__()
        self.backbone = timm.create_model(
            model_name, pretrained=False, num_classes=0, drop_rate=0.0
        )
        self.drop = nn.Dropout(p=drop_rate)
        self.head = nn.Linear(self.backbone.num_features, num_classes)

    def forward(self, x):
        return self.head(self.drop(self.backbone(x)))


class DRClassifierV2Export(nn.Module):
    """5-class-only export wrapper for branchA_v2a.pt.

    The trained checkpoint (see train_classifier_kaggle_v2.ipynb's
    DRClassifierV2) is dual-head: backbone -> dropout -> {head5, headBin}.
    This wrapper's forward() returns ONLY head5's output -- the binary head
    is dropped from the graph entirely, per this export's brief (v2a
    integration ships the 5-class grade only; the binary head's conformal/
    deployment story is undecided and out of scope here).

    Module names are deliberately `backbone`/`drop`/`head` -- IDENTICAL to
    DRClassifier above, not `backbone`/`dropout`/`head5` (the checkpoint's
    own names) -- so the exported ONNX graph's node names, and therefore
    every downstream MATLAB layer name importModels.m disconnects/reconnects
    ('x_backbone_global__2', 'x_head_Gemm'), are IDENTICAL to v1's. This is
    what lets the v2a entries in importModels.m/branchAInferMatlab.m follow
    v1's pattern verbatim instead of re-deriving new node names per version.
    """

    def __init__(self, model_name, num_classes, drop_rate):
        super().__init__()
        self.backbone = timm.create_model(
            model_name, pretrained=False, num_classes=0, drop_rate=0.0
        )
        self.drop = nn.Dropout(p=drop_rate)
        self.head = nn.Linear(self.backbone.num_features, num_classes)

    def forward(self, x):
        return self.head(self.drop(self.backbone(x)))


def remap_v2a_state_dict(state_dict: dict) -> dict:
    """head5.* -> head.*, backbone.* unchanged, headBin.* DROPPED.

    Returns a state dict loadable strict=True into DRClassifierV2Export.
    Dropping headBin.* here (not just ignoring it) is deliberate: strict=True
    below must see zero unexpected keys, so headBin's weights are excluded
    before the load, not tolerated by loosening the check.
    """
    out = {}
    for k, v in state_dict.items():
        if k.startswith("headBin."):
            continue
        if k.startswith("head5."):
            out["head" + k[len("head5"):]] = v
        else:
            out[k] = v
    return out


def build_v2a_5class_model(ckpt: dict) -> nn.Module:
    """Load branchA_v2a.pt's checkpoint dict into DRClassifierV2Export,
    strict=True, 5-class head only. Shared by this file's export_v2a() and
    prepare_parity_inputs.py so the wrapper is defined and loaded in exactly
    one place."""
    m = DRClassifierV2Export(ckpt["model_name"], ckpt["num_classes"], ckpt["drop_rate"])
    remapped = remap_v2a_state_dict(ckpt["model_state_dict"])
    strict_load(m, remapped, "M1 branchA_v2a (5-class head only)")
    return m


def strict_load(model: nn.Module, state_dict: dict, label: str) -> None:
    # stderr, not stdout: this function is also called from branchAInfer.py's
    # live inference path (BRANCH_A_MODEL_VERSION=branchA_v2a ->
    # build_v2a_5class_model() -> here), which documents "prints ONE line of
    # JSON to stdout and nothing else on success" -- a stray stdout print
    # here would violate that contract on every v2a request. Node's caller
    # happens to defensively re-find the first '{' (gradingOrchestrator.js),
    # but this file should not rely on every caller doing that.
    try:
        result = model.load_state_dict(state_dict, strict=True)
    except RuntimeError as e:
        print(f"\n[{label}] STRICT LOAD FAILED -- architecture mismatch:\n{e}\n", file=sys.stderr)
        raise
    missing, unexpected = result.missing_keys, result.unexpected_keys
    assert not missing and not unexpected, (missing, unexpected)
    print(f"[{label}] strict=True load OK "
          f"({sum(p.numel() for p in model.parameters())/1e6:.2f} M params)", file=sys.stderr)


def export(model: nn.Module, dummy: torch.Tensor, out_path: Path,
           input_names, output_names):
    model.eval()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    dynamic_axes = {n: {0: "batch"} for n in input_names + output_names}
    with torch.no_grad():
        torch.onnx.export(
            model, dummy, str(out_path),
            input_names=input_names, output_names=output_names,
            opset_version=17, do_constant_folding=True,
            dynamic_axes=dynamic_axes, dynamo=False,
        )
    print(f"  -> exported {out_path.name}  (input {tuple(dummy.shape)})")


def export_m1():
    ckpt_path = find_ckpt("branchA_v1.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    m = DRClassifier("efficientnet_b0", 5, 0.3)
    strict_load(m, ckpt["model_state_dict"], "M1 branchA_v1")
    dummy = torch.randn(1, 3, 384, 384)
    export(m, dummy, OUT_DIR / "branchA_v1.onnx", ["input"], ["logits"])


def export_m1_v2a():
    """branchA_v2a.pt -> models/Model1/branchA_v2a.onnx (NOT training/onnx_out/,
    per this export's brief -- v1's other 4 models stay in onnx_out/, only
    v2a's output path differs). 5-class logits only (DRClassifierV2Export
    drops the binary head); same opset/conventions/input size convention as
    v1 (1x3xHxH, H = ckpt["img_size"])."""
    ckpt_path = find_ckpt("branchA_v2a.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    m = build_v2a_5class_model(ckpt)
    size = ckpt["img_size"]
    dummy = torch.randn(1, 3, size, size)
    out_path = MODELS_DIR / "Model1" / "branchA_v2a.onnx"
    export(m, dummy, out_path, ["input"], ["logits"])
    return ckpt, m


def export_m2():
    ckpt_path = find_ckpt("vessel_unet_v1.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    m = smp.Unet(encoder_name="resnet34", encoder_weights=None,
                 in_channels=1, classes=1, activation=None)
    strict_load(m, ckpt["model_state_dict"], "M2 vessel_unet_v1")
    dummy = torch.randn(1, 1, 512, 512)
    export(m, dummy, OUT_DIR / "vessel_unet_v1.onnx", ["input"], ["logits"])


def export_m3():
    ckpt_path = find_ckpt("localization_v1.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    m = smp.Unet(encoder_name="resnet18", encoder_weights=None,
                 in_channels=3, classes=2, activation=None)
    strict_load(m, ckpt["model_state_dict"], "M3 localization_v1")
    dummy = torch.randn(1, 3, 512, 512)
    export(m, dummy, OUT_DIR / "localization_v1.onnx", ["input"], ["heatmaps"])


def export_m4():
    """bright_lesion_unet_v1.pt -- training script never recovered. Do NOT
    relax strict=True or guess a different shape if this fails; stop and
    report the mismatch."""
    ckpt_path = find_ckpt("bright_lesion_unet_v1.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    m = smp.Unet(encoder_name="resnet34", encoder_weights=None,
                 in_channels=3, classes=1, activation=None)
    strict_load(m, ckpt["model_state_dict"], "M4 bright_lesion_unet_v1")
    dummy = torch.randn(1, 3, 512, 512)
    export(m, dummy, OUT_DIR / "bright_lesion_unet_v1.onnx", ["input"], ["logits"])


def export_m5():
    ckpt_path = find_ckpt("red_lesion_unet_v1.pt")
    ckpt = torch.load(ckpt_path, map_location="cpu", weights_only=False)
    m = smp.Unet(encoder_name="resnet34", encoder_weights=None,
                 in_channels=3, classes=1, activation=None)
    strict_load(m, ckpt["model_state_dict"], "M5 red_lesion_unet_v1")
    dummy = torch.randn(1, 3, 512, 512)
    export(m, dummy, OUT_DIR / "red_lesion_unet_v1.onnx", ["input"], ["logits"])


ALL = {
    "m1": export_m1, "m2": export_m2, "m3": export_m3,
    "m4": export_m4, "m5": export_m5, "m1_v2a": export_m1_v2a,
}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", choices=list(ALL), default=None)
    args = ap.parse_args()
    targets = args.only or list(ALL)

    failures = []
    for key in targets:
        print(f"\n=== {key} ===")
        try:
            ALL[key]()
        except Exception as e:
            failures.append((key, str(e)))
            print(f"[{key}] FAILED: {e}", file=sys.stderr)

    print("\n" + "=" * 60)
    if failures:
        print(f"{len(failures)} export(s) failed:")
        for k, msg in failures:
            print(f"  - {k}: {msg}")
        sys.exit(1)
    print("All requested exports succeeded.")
