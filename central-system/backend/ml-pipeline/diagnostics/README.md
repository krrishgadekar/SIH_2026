# diagnostics/ — throwaway model sanity checks

Ad-hoc diagnostic scripts requested 2026-09-09. **Not production code.**
Saad owns the real Grad-CAM / rule-engine / calibration modules in
`grading/`, `calibration/`, `explainability/` — nothing here should be
imported by or merged into those. Safe to delete this whole folder.

- `check_dropout.py`     — is there an MC-Dropout-able layer in branchA_v1.pt?
- `check_gradcam.py`     — Grad-CAM heatmaps for 5 IDRiD val images (hand-rolled, no extra deps)
- `check_agreement.py`   — rule-engine grade vs classifier grade on IDRiD val images
- `recalibrate_rule.py`  — re-score check_agreement's saved counts with data-calibrated
                           thresholds (RED_FLOOR=3, GRADE3_QUAD_MIN=3, hard cap at grade 3)
- `MODEL_INTERFACE_REFERENCE.md` — exact load / preprocessing / output spec for all 5
                           checkpoints, verified against the training code + ground truth
- `out/`                 — generated PNGs / CSV tables

These calibrate the rule engine's *parameters* from collected data. The production
`rule_engine` module is still Saad's to write.
