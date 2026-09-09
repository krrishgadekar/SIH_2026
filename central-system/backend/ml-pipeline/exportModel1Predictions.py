"""
exportModel1Predictions.py
==========================
Bridge Branch A's saved predictions from .npy into CSV, so the MATLAB
calibration and evaluation code can read them.

    python exportModel1Predictions.py

Writes into models/Model1/:
    val_logits.csv   val_labels.csv     -> calibration fold (Tasks 2.5, 6.2)
    test_logits.csv  test_labels.csv    -> held-out evaluation (Task 9.1)

── WHY LOGITS AND NOT PROBABILITIES ────────────────────────────────────────
Temperature scaling divides LOGITS by T before the softmax. Handing it
probabilities means taking a log to recover the logits, which is lossy where
a probability has already saturated to 1.0 or underflowed to 0. The
checkpoint saved raw pre-softmax logits precisely so this step is exact, and
fitTemperature.m's header asks for them in those words.

── WHICH SPLIT DOES WHAT, AND WHY IT MATTERS ───────────────────────────────
val is the calibration fold; test is the evaluation set. They must not be
swapped or merged. Fitting the temperature on test and then reporting test
ECE would produce an excellent number that means nothing, because the
calibration was tuned on the data it is scored against.

One honest caveat: val is not perfectly held out either. The training script
selects its best epoch on val QWK, so val has already influenced the model
through early stopping. That makes calibration fitted on it mildly
optimistic. It is still the correct choice of the two available, and the
evaluation split stays genuinely untouched.
"""

import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(HERE, "models", "Model1")


def main() -> int:
    for split in ("val", "test"):
        logits = np.load(os.path.join(MODEL_DIR, f"branchA_v1_{split}_logits.npy"))
        labels = np.load(os.path.join(MODEL_DIR, f"branchA_v1_{split}_labels.npy"))

        if logits.shape[0] != labels.shape[0]:
            raise SystemExit(
                f"{split}: {logits.shape[0]} logit rows but {labels.shape[0]} labels")
        if logits.shape[1] != 5:
            raise SystemExit(f"{split}: expected 5 classes, got {logits.shape[1]}")

        # %.17g round-trips a float64 exactly. Fewer digits would quietly
        # change the fitted temperature in the last decimal places, which is
        # a silly way to introduce a discrepancy into a calibration constant.
        np.savetxt(os.path.join(MODEL_DIR, f"{split}_logits.csv"),
                   logits, delimiter=",", fmt="%.17g")
        np.savetxt(os.path.join(MODEL_DIR, f"{split}_labels.csv"),
                   labels.astype(int), delimiter=",", fmt="%d")

        counts = np.bincount(labels.astype(int), minlength=5)
        print(f"{split:5s}  n={len(labels):4d}  grade counts {counts.tolist()}")

    print(f"\nwritten to {MODEL_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
