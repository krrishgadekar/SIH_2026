"""
conformalCrossFitValidation.py
================================
Cross-fit validation of conformal policy v3 (score v3, referable-stratified
Mondrian, referable-threshold safety gate) -- CPU-only, reads only saved
arrays, never retrains, never touches the deployed calibration_*.json files
(it fits its OWN temporary calibration inside each fold).

    CUDA_VISIBLE_DEVICES= python experiments/conformalCrossFitValidation.py

Writes diagnostics/out/conformal_v3_crossfit_report.{json,txt}.

── WHY CROSS-FIT, AND WHY THIS REUSES PRODUCTION CODE DIRECTLY ─────────────
calibrateBranchA.m fits the SHIPPED calibration on the full pooled val+test
(1,161 for v2a) -- more data, a more stable quantile. That number is not,
by itself, evidence of how the fitting PROCEDURE generalises to unseen
data: it is one fit, evaluated implicitly on the data it was fit from.
Cross-fitting (10 repeats x 5-fold, refit INSIDE every fold, evaluate only
on that fold's held-out fifth) gives 50 independent calibrate/evaluate
splits instead of one, so every metric below is a mean with a real
interval, not a single anecdote -- the same reasoning the v2 policy sweep
(experiments/conformalPolicySweep.py) used to justify pooling over a
single val-only fit in the first place.

Every fold's per-point metrics use inference/branchAInfer.assign_tier() and
ordinal_mode_interval_score() DIRECTLY -- the actual shipped functions, not
a separate reimplementation -- so this validates the real production
tiering code path, not a parallel copy of it that could silently drift.
Only the FITTING step (temperature + qhatPerStratum + referableThreshold)
is replicated here, because conformalCalibrate.m's fitting algorithm has no
Python equivalent in the production path (Python only ever LOADS a fitted
calibration, it never fits one) -- that replica was independently validated
against calibrateBranchA.m/conformalCalibrate.m to agree on qhat to
essentially machine epsilon and produce IDENTICAL tier/set assignments on
all 1,161 real pooled v2a cases (see the policy-v3 installation report).

── THE FOUR NAMED PDR CASES: NOT A CROSS-FIT NUMBER ─────────────────────────
Item 4's request for the 4 argmax-missed true-PDR cases' P(g>=2)/tier/
rescue status is a per-CASE report, not an aggregate -- it is evaluated
against the FINAL DEPLOYED calibration_branchA_v2a.json (what a real
prediction for these patients actually gets today), not a cross-fit fold's
temporary refit.
"""

import json
import os
import sys

import numpy as np
from scipy.special import softmax as _softmax
from scipy.stats import t as _t_dist

HERE = os.path.dirname(os.path.abspath(__file__))
ML_ROOT = os.path.dirname(HERE)
INFERENCE_DIR = os.path.join(ML_ROOT, "inference")
sys.path.insert(0, INFERENCE_DIR)
sys.path.insert(0, ML_ROOT)

from branchAInfer import assign_tier, ordinal_mode_interval_score, STRATUM_OF_CLASS  # noqa: E402

V2A_DIR = os.path.join(ML_ROOT, "models", "Model1", "v2a")
V1_DIR = os.path.join(ML_ROOT, "models", "Model1")
OUT_DIR = os.path.join(ML_ROOT, "diagnostics", "out")
FINAL_CALIB_V2A = os.path.join(ML_ROOT, "models", "calibration_branchA_v2a.json")

NUM_CLASSES = 5
REFERABLE_FROM = 2
N_REPEATS = 10
N_FOLDS = 5
ALPHA_PER_STRATUM = [0.30, 0.05]
REFERABLE_TARGET_SENS = 0.05

FOUR_PDR_ID_SUFFIXES = ["4bd941611343", "bfdee9be1f1d", "eaa0dfbd5024", "fce93caa4758"]

# ── Guard thresholds (task item 5) ───────────────────────────────────────────
GUARD_REFERABLE_COVERAGE_LOWER_MIN = 0.93
GUARD_GRADE4_COVERAGE_LOWER_MIN = 0.90
GUARD_FALSE_AUTOCLEAR_REFERABLE_UPPER_MAX = 0.05
GUARD_MEAN_SET_SIZE_MAX = 2.5


# ── Temperature fit: bit-for-bit port of calibrateBranchA.m (independently
#    validated against it already -- see module docstring) ─────────────────
def mean_nll(logits, labels, T):
    s = logits / T
    s = s - s.max(axis=1, keepdims=True)
    logZ = np.log(np.exp(s).sum(axis=1))
    idx = labels.astype(int)
    true_logit = s[np.arange(len(labels)), idx]
    return float(-(true_logit - logZ).mean())


def fit_temperature(logits, labels):
    phi = (np.sqrt(5) - 1) / 2
    a, b = np.log(0.05), np.log(20)
    c, d = b - phi * (b - a), a + phi * (b - a)
    fc, fd = mean_nll(logits, labels, np.exp(c)), mean_nll(logits, labels, np.exp(d))
    for _ in range(200):
        if fc < fd:
            b, d, fd = d, c, fc
            c = b - phi * (b - a)
            fc = mean_nll(logits, labels, np.exp(c))
        else:
            a, c, fc = c, d, fd
            d = a + phi * (b - a)
            fd = mean_nll(logits, labels, np.exp(d))
        if (b - a) < 1e-10:
            break
    return float(np.exp((a + b) / 2))


def predicted_mode(probs):
    max_val = probs.max(axis=1, keepdims=True)
    is_max = probs == max_val
    rev_idx = is_max[:, ::-1].argmax(axis=1)
    return NUM_CLASSES - 1 - rev_idx


def true_scores_v3(probs, labels):
    """score v3 at the TRUE label, vectorised -- calibration-fitting side
    only (matches ordinalModeIntervalScore.m / branchAInfer.
    ordinal_mode_interval_score exactly; independently validated)."""
    n = probs.shape[0]
    mode = predicted_mode(probs)
    lo = np.minimum(mode, labels)
    hi = np.maximum(mode, labels)
    cdf = np.hstack([np.zeros((n, 1)), np.cumsum(probs, axis=1)])
    interval = cdf[np.arange(n), hi + 1] - cdf[np.arange(n), lo]
    p_true = probs[np.arange(n), labels]
    return interval - p_true, mode


def fit_qhat_per_stratum(cal_probs, cal_labels, alpha_per_stratum):
    """conformalCalibrate.m's stratified fit, replicated (see module
    docstring for the validation this replica underwent)."""
    scores, _ = true_scores_v3(cal_probs, cal_labels)
    stratum_of = np.array(STRATUM_OF_CLASS)
    true_stratum = stratum_of[cal_labels]
    qhat = np.zeros(2)
    n_g = np.zeros(2, dtype=int)
    for s in range(2):
        mask = true_stratum == s
        ns = int(mask.sum())
        n_g[s] = ns
        rank = int(np.ceil((ns + 1) * (1 - alpha_per_stratum[s])))
        if ns == 0 or rank > ns:
            qhat[s] = 1.0
        else:
            qhat[s] = np.sort(scores[mask])[rank - 1]
    return qhat, n_g


def fit_referable_threshold(cal_probs, cal_labels, target_sens):
    ref_mask = cal_labels >= REFERABLE_FROM
    p_ref = cal_probs[ref_mask, 2:5].sum(axis=1)
    n_ref = len(p_ref)
    rank = int(np.ceil((n_ref + 1) * target_sens))
    if n_ref == 0 or rank > n_ref:
        return 0.0, n_ref, True
    return float(np.sort(p_ref)[rank - 1]), n_ref, False


def build_calib(qhat_per_stratum, referable_threshold):
    return {
        "calibrated": True,
        "qhatPerStratum": list(qhat_per_stratum),
        "stratumOf": STRATUM_OF_CLASS,
        "referableThreshold": float(referable_threshold),
        "referableTargetSensitivity": REFERABLE_TARGET_SENS,
        "referableFrom": REFERABLE_FROM,
    }


# ── Stats ────────────────────────────────────────────────────────────────────
def wilson_ci(k, n, z=1.959963984540054):
    if n == 0:
        return (float("nan"), float("nan"))
    phat = k / n
    denom = 1 + z * z / n
    center = phat + z * z / (2 * n)
    adj = z * np.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n))
    return (float((center - adj) / denom), float((center + adj) / denom))


def rate_with_ci(k, n):
    lo, hi = wilson_ci(k, n)
    return {"k": int(k), "n": int(n), "rate": (k / n if n else float("nan")), "ci95": [lo, hi]}


def mean_ci95_over_samples(values):
    values = np.asarray([v for v in values if np.isfinite(v)], dtype=float)
    n = len(values)
    if n == 0:
        return {"mean": float("nan"), "ci95": [float("nan"), float("nan")], "n_folds": 0}
    if n == 1:
        return {"mean": float(values[0]), "ci95": [float("nan"), float("nan")], "n_folds": 1}
    m = float(values.mean())
    se = float(values.std(ddof=1) / np.sqrt(n))
    tcrit = float(_t_dist.ppf(0.975, df=n - 1))
    return {"mean": m, "ci95": [m - tcrit * se, m + tcrit * se], "n_folds": n}


# ── Per-fold evaluation, via PRODUCTION assign_tier() ────────────────────────
def evaluate_fold(eval_probs, eval_labels, calib):
    n = len(eval_labels)
    set_sizes = np.zeros(n, dtype=int)
    tiers = np.empty(n, dtype="<U1")
    los = np.zeros(n, dtype=int)
    his = np.zeros(n, dtype=int)
    for i in range(n):
        tier, pred_set, _reason, lo, hi, _contig = assign_tier(list(eval_probs[i]), calib)
        set_sizes[i] = len(pred_set)
        tiers[i] = tier
        los[i] = lo
        his[i] = hi
    return {"set_size": set_sizes, "tier": tiers, "low": los, "high": his}


def fold_metrics(eval_out, eval_labels):
    n = len(eval_labels)
    tiers = eval_out["tier"]
    set_sizes = eval_out["set_size"]
    low, high = eval_out["low"], eval_out["high"]
    covered = (low <= eval_labels) & (eval_labels <= high)

    m = {
        "mean_set_size": float(set_sizes.mean()),
        "frac_size1": float((set_sizes == 1).mean()),
        "frac_size2": float((set_sizes == 2).mean()),
        "frac_size_ge3": float((set_sizes >= 3).mean()),
        "tierA_share": float((tiers == "A").mean()),
        "tierB_share": float((tiers == "B").mean()),
        "tierC_share": float((tiers == "C").mean()),
        "coverage_marginal": float(covered.mean()),
    }

    stratum_of = np.array(STRATUM_OF_CLASS)
    true_stratum = stratum_of[eval_labels]
    m["coverage_per_stratum"] = {}
    for s, name in enumerate(["non_referable", "referable"]):
        mask = true_stratum == s
        nk = int(mask.sum())
        m["coverage_per_stratum"][name] = {
            "coverage": float(covered[mask].mean()) if nk else float("nan"), "n_k": nk}

    m["coverage_per_grade"] = {}
    for k in range(5):
        mask = eval_labels == k
        nk = int(mask.sum())
        m["coverage_per_grade"][str(k)] = {
            "coverage": float(covered[mask].mean()) if nk else float("nan"), "n_k": nk}

    true_ref = eval_labels >= REFERABLE_FROM
    true_ge3 = eval_labels >= 3
    set_within_01 = high < REFERABLE_FROM   # "auto-clear-able" SET, before Tier/override logic

    n_ref, n_ge3 = int(true_ref.sum()), int(true_ge3.sum())
    m["false_autoclear_set_ref_k"] = int((true_ref & set_within_01).sum())
    m["false_autoclear_set_ref_n"] = n_ref
    m["false_autoclear_set_ge3_k"] = int((true_ge3 & set_within_01).sum())
    m["false_autoclear_set_ge3_n"] = n_ge3

    is_tierA = tiers == "A"
    m["false_autoclear_tierA_ref_k"] = int((true_ref & is_tierA).sum())
    m["false_autoclear_tierA_ref_n"] = n_ref
    m["false_autoclear_tierA_ge3_k"] = int((true_ge3 & is_tierA).sum())
    m["false_autoclear_tierA_ge3_n"] = n_ge3

    m["false_autoclear_set_ref_rate"] = (m["false_autoclear_set_ref_k"] / n_ref) if n_ref else float("nan")
    m["false_autoclear_tierA_ref_rate"] = (m["false_autoclear_tierA_ref_k"] / n_ref) if n_ref else float("nan")
    m["false_autoclear_set_ge3_rate"] = (m["false_autoclear_set_ge3_k"] / n_ge3) if n_ge3 else float("nan")
    m["false_autoclear_tierA_ge3_rate"] = (m["false_autoclear_tierA_ge3_k"] / n_ge3) if n_ge3 else float("nan")

    return m


def aggregate_fold_metrics(fold_metric_list):
    keys_mean = ["mean_set_size", "frac_size1", "frac_size2", "frac_size_ge3",
                 "tierA_share", "tierB_share", "tierC_share", "coverage_marginal",
                 "false_autoclear_set_ref_rate", "false_autoclear_tierA_ref_rate",
                 "false_autoclear_set_ge3_rate", "false_autoclear_tierA_ge3_rate"]
    agg = {k: mean_ci95_over_samples([fm[k] for fm in fold_metric_list]) for k in keys_mean}

    for key_k, key_n in [("false_autoclear_set_ref_k", "false_autoclear_set_ref_n"),
                          ("false_autoclear_tierA_ref_k", "false_autoclear_tierA_ref_n"),
                          ("false_autoclear_set_ge3_k", "false_autoclear_set_ge3_n"),
                          ("false_autoclear_tierA_ge3_k", "false_autoclear_tierA_ge3_n")]:
        agg[key_k.replace("_k", "_pooled")] = {
            "k_total": sum(fm[key_k] for fm in fold_metric_list),
            "n_total": sum(fm[key_n] for fm in fold_metric_list),
        }

    for group, names in [("coverage_per_stratum", ["non_referable", "referable"]),
                         ("coverage_per_grade", [str(k) for k in range(5)])]:
        agg[group] = {}
        for name in names:
            cov_vals = [fm[group][name]["coverage"] for fm in fold_metric_list]
            n_ks = [fm[group][name]["n_k"] for fm in fold_metric_list]
            agg[group][name] = {"coverage": mean_ci95_over_samples(cov_vals),
                                "mean_n_k": float(np.mean(n_ks)), "total_n_k": int(np.sum(n_ks))}
    return agg


def referable_sens_spec_at_threshold(eval_probs, eval_labels, referable_threshold):
    p_ref = eval_probs[:, 2:5].sum(axis=1)
    pred_ref = p_ref >= referable_threshold
    true_ref = eval_labels >= REFERABLE_FROM
    tp = int((true_ref & pred_ref).sum())
    fn = int((true_ref & ~pred_ref).sum())
    tn = int((~true_ref & ~pred_ref).sum())
    fp = int((~true_ref & pred_ref).sum())
    return {"sensitivity": rate_with_ci(tp, tp + fn), "specificity": rate_with_ci(tn, tn + fp)}


def run_crossfit(pool_logits, pool_labels, label):
    from sklearn.model_selection import StratifiedKFold
    fold_metrics_list = []
    fold_refsensspec_list = []
    n_folds_run = 0
    for repeat in range(N_REPEATS):
        skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=repeat)
        for cal_idx, eval_idx in skf.split(pool_logits, pool_labels):
            cal_logits, cal_labels = pool_logits[cal_idx], pool_labels[cal_idx]
            eval_logits, eval_labels = pool_logits[eval_idx], pool_labels[eval_idx]

            T = fit_temperature(cal_logits, cal_labels)
            cal_probs = _softmax(cal_logits / T, axis=1)
            eval_probs = _softmax(eval_logits / T, axis=1)

            qhat, _n_g = fit_qhat_per_stratum(cal_probs, cal_labels, ALPHA_PER_STRATUM)
            ref_thr, _n_ref, _sat = fit_referable_threshold(cal_probs, cal_labels, REFERABLE_TARGET_SENS)
            calib = build_calib(qhat, ref_thr)

            ev = evaluate_fold(eval_probs, eval_labels, calib)
            fold_metrics_list.append(fold_metrics(ev, eval_labels))
            fold_refsensspec_list.append(referable_sens_spec_at_threshold(eval_probs, eval_labels, ref_thr))
            n_folds_run += 1

    agg = aggregate_fold_metrics(fold_metrics_list)
    agg["referable_sensitivity"] = mean_ci95_over_samples(
        [f["sensitivity"]["rate"] for f in fold_refsensspec_list])
    agg["referable_specificity"] = mean_ci95_over_samples(
        [f["specificity"]["rate"] for f in fold_refsensspec_list])
    agg["referable_sens_pooled"] = {
        "k_total": sum(f["sensitivity"]["k"] for f in fold_refsensspec_list),
        "n_total": sum(f["sensitivity"]["n"] for f in fold_refsensspec_list)}
    agg["referable_spec_pooled"] = {
        "k_total": sum(f["specificity"]["k"] for f in fold_refsensspec_list),
        "n_total": sum(f["specificity"]["n"] for f in fold_refsensspec_list)}
    agg["n_folds_run"] = n_folds_run
    agg["label"] = label
    return agg


def print_agg(out, agg):
    out(f"\n-- {agg['label']}: {agg['n_folds_run']} folds --")
    for key in ["mean_set_size", "frac_size1", "frac_size2", "frac_size_ge3",
               "tierA_share", "tierB_share", "tierC_share", "coverage_marginal"]:
        v = agg[key]
        out(f"  {key:<28s} = {v['mean']:.4f} [{v['ci95'][0]:.4f},{v['ci95'][1]:.4f}]")
    out("  coverage per stratum:")
    for name, d in agg["coverage_per_stratum"].items():
        c = d["coverage"]
        out(f"    {name:<15s} coverage={c['mean']:.4f} [{c['ci95'][0]:.4f},{c['ci95'][1]:.4f}]  "
            f"mean_n_k={d['mean_n_k']:.1f}  total_n_k={d['total_n_k']}")
    out("  coverage per grade:")
    for k in range(5):
        d = agg["coverage_per_grade"][str(k)]
        c = d["coverage"]
        out(f"    grade {k}  coverage={c['mean']:.4f} [{c['ci95'][0]:.4f},{c['ci95'][1]:.4f}]  "
            f"mean_n_k={d['mean_n_k']:.1f}  total_n_k={d['total_n_k']}")
    out("  false auto-clear (on the conformal SET, before Tier/override logic):")
    for key, label_ in [("false_autoclear_set_ref_rate", "true referable"),
                        ("false_autoclear_set_ge3_rate", "true grade>=3")]:
        v = agg[key]
        out(f"    {label_:<15s} = {v['mean']:.4f} [{v['ci95'][0]:.4f},{v['ci95'][1]:.4f}]")
    out("  false auto-clear (on the FINAL Tier A label -- includes the referableThreshold gate):")
    for key, label_ in [("false_autoclear_tierA_ref_rate", "true referable"),
                        ("false_autoclear_tierA_ge3_rate", "true grade>=3")]:
        v = agg[key]
        out(f"    {label_:<15s} = {v['mean']:.4f} [{v['ci95'][0]:.4f},{v['ci95'][1]:.4f}]")
    rs, rp = agg["referable_sensitivity"], agg["referable_specificity"]
    out(f"  referable sens/spec at fold-fitted referableThreshold: "
        f"sens={rs['mean']:.4f} [{rs['ci95'][0]:.4f},{rs['ci95'][1]:.4f}]  "
        f"spec={rp['mean']:.4f} [{rp['ci95'][0]:.4f},{rp['ci95'][1]:.4f}]")


def main():
    lines = []

    def out(s=""):
        print(s)
        lines.append(s)

    out("=" * 78)
    out("conformalCrossFitValidation.py -- policy v3 cross-fit validation")
    out("=" * 78)

    val_labels_v2a = np.load(os.path.join(V2A_DIR, "branchA_v2a_val_labels.npy")).astype(int)
    val_logits_v2a = np.load(os.path.join(V2A_DIR, "branchA_v2a_val_logits.npy")).astype(np.float64)
    test_ids_v2a = np.load(os.path.join(V2A_DIR, "branchA_v2a_test_ids.npy"), allow_pickle=True)
    test_labels_v2a = np.load(os.path.join(V2A_DIR, "branchA_v2a_test_labels.npy")).astype(int)
    test_logits_v2a = np.load(os.path.join(V2A_DIR, "branchA_v2a_test_logits.npy")).astype(np.float64)
    pool_logits_v2a = np.concatenate([val_logits_v2a, test_logits_v2a])
    pool_labels_v2a = np.concatenate([val_labels_v2a, test_labels_v2a])

    val_labels_v1 = np.load(os.path.join(V1_DIR, "branchA_v1_val_labels.npy")).astype(int)
    val_logits_v1 = np.load(os.path.join(V1_DIR, "branchA_v1_val_logits.npy")).astype(np.float64)
    test_labels_v1 = np.load(os.path.join(V1_DIR, "branchA_v1_test_labels.npy")).astype(int)
    test_logits_v1 = np.load(os.path.join(V1_DIR, "branchA_v1_test_logits.npy")).astype(np.float64)
    pool_logits_v1 = np.concatenate([val_logits_v1, test_logits_v1])
    pool_labels_v1 = np.concatenate([val_labels_v1, test_labels_v1])

    out(f"\nv2a pool: n={len(pool_labels_v2a)}  grade counts="
        f"{dict(zip(*np.unique(pool_labels_v2a, return_counts=True)))}")
    out(f"v1  pool: n={len(pool_labels_v1)}  grade counts="
        f"{dict(zip(*np.unique(pool_labels_v1, return_counts=True)))}")

    out(f"\nRunning {N_REPEATS}x{N_FOLDS} cross-fit for branchA_v2a (the ship candidate) ...")
    agg_v2a = run_crossfit(pool_logits_v2a, pool_labels_v2a, "branchA_v2a")
    print_agg(out, agg_v2a)

    out(f"\nRunning {N_REPEATS}x{N_FOLDS} cross-fit for branchA_v1 (comparison) ...")
    agg_v1 = run_crossfit(pool_logits_v1, pool_labels_v1, "branchA_v1")
    print_agg(out, agg_v1)

    # ── grade-4 tier distribution (v2a, cross-fit pooled across all folds where
    #    the grade-4 fold-eval sample fell) -- report via a dedicated pass since
    #    fold_metrics() does not carry per-point tier breakdowns for a single
    #    grade forward into the aggregate ─────────────────────────────────────
    out("\n" + "=" * 78)
    out("GRADE-4 TIER DISTRIBUTION (v2a, cross-fit: aggregated over all folds)")
    out("=" * 78)
    from sklearn.model_selection import StratifiedKFold
    g4_tier_counts = {"A": 0, "B": 0, "C": 0}
    for repeat in range(N_REPEATS):
        skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=repeat)
        for cal_idx, eval_idx in skf.split(pool_logits_v2a, pool_labels_v2a):
            cal_logits, cal_labels = pool_logits_v2a[cal_idx], pool_labels_v2a[cal_idx]
            eval_logits, eval_labels = pool_logits_v2a[eval_idx], pool_labels_v2a[eval_idx]
            T = fit_temperature(cal_logits, cal_labels)
            cal_probs = _softmax(cal_logits / T, axis=1)
            eval_probs = _softmax(eval_logits / T, axis=1)
            qhat, _ = fit_qhat_per_stratum(cal_probs, cal_labels, ALPHA_PER_STRATUM)
            ref_thr, _, _ = fit_referable_threshold(cal_probs, cal_labels, REFERABLE_TARGET_SENS)
            calib = build_calib(qhat, ref_thr)
            g4_mask = eval_labels == 4
            for i in np.where(g4_mask)[0]:
                tier, _ps, _r, _lo, _hi, _c = assign_tier(list(eval_probs[i]), calib)
                g4_tier_counts[tier] += 1
    out(f"grade-4 (n={int((pool_labels_v2a == 4).sum())} total across the pool, "
        f"each case appears in exactly 1 of the 10 repeats' folds -> "
        f"{sum(g4_tier_counts.values())} tier assignments over 10 repeats):")
    out(f"  {g4_tier_counts}")

    # ── The four named PDR cases: FINAL deployed calibration, not cross-fit ──
    out("\n" + "=" * 78)
    out("FOUR NAMED TRUE-PDR CASES THE ARGMAX RULE MISSED (final deployed calibration)")
    out("=" * 78)
    with open(FINAL_CALIB_V2A) as fh:
        final_calib = json.load(fh)
    final_calib["calibrated"] = True
    T_final = float(final_calib["temperature"])
    test_probs_final = _softmax(test_logits_v2a / T_final, axis=1)

    four_cases = []
    for suffix in FOUR_PDR_ID_SUFFIXES:
        idx = [i for i, tid in enumerate(test_ids_v2a) if suffix in str(tid)]
        if not idx:
            out(f"  {suffix}: NOT FOUND in test_ids")
            continue
        i = idx[0]
        probs = test_probs_final[i]
        p_ref = float(probs[2] + probs[3] + probs[4])
        tier, pred_set, reason, lo, hi, _c = assign_tier(list(probs), final_calib)
        rescued = p_ref >= float(final_calib["referableThreshold"])
        argmax_grade = int(probs.argmax())
        rec = {
            "id": str(test_ids_v2a[i]), "true_grade": int(test_labels_v2a[i]),
            "argmax_grade": argmax_grade, "P(g>=2)": p_ref, "tier": tier,
            "predictionSet": pred_set,
            "rescued_by_referable_threshold": bool(rescued and tier != "A"),
            "referableThreshold": float(final_calib["referableThreshold"]),
        }
        four_cases.append(rec)
        out(f"  {rec['id']}: true_grade=4  argmax_grade={argmax_grade}  P(g>=2)={p_ref:.4f}  "
            f"tier={tier}  set={pred_set}  referableThreshold={rec['referableThreshold']:.4f}  "
            f"{'RESCUED (not Tier A)' if tier != 'A' else 'STILL TIER A -- NOT rescued'}")

    # ── Guards (task item 5) ────────────────────────────────────────────────
    out("\n" + "=" * 78)
    out("GUARD CHECK (branchA_v2a cross-fit numbers)")
    out("=" * 78)
    ref_cov_lower = agg_v2a["coverage_per_stratum"]["referable"]["coverage"]["ci95"][0]
    g4_cov_lower = agg_v2a["coverage_per_grade"]["4"]["coverage"]["ci95"][0]
    fac_ref_upper = agg_v2a["false_autoclear_tierA_ref_rate"]["ci95"][1]
    mean_set_size = agg_v2a["mean_set_size"]["mean"]

    guard_hits = []
    if not (ref_cov_lower == ref_cov_lower) or ref_cov_lower < GUARD_REFERABLE_COVERAGE_LOWER_MIN:
        guard_hits.append(f"referable-stratum coverage lower CI ({ref_cov_lower:.4f}) < "
                          f"{GUARD_REFERABLE_COVERAGE_LOWER_MIN}")
    if not (g4_cov_lower == g4_cov_lower) or g4_cov_lower < GUARD_GRADE4_COVERAGE_LOWER_MIN:
        guard_hits.append(f"grade-4 coverage lower CI ({g4_cov_lower:.4f}) < "
                          f"{GUARD_GRADE4_COVERAGE_LOWER_MIN}")
    if not (fac_ref_upper == fac_ref_upper) or fac_ref_upper > GUARD_FALSE_AUTOCLEAR_REFERABLE_UPPER_MAX:
        guard_hits.append(f"false auto-clear (referable, Tier A) upper CI ({fac_ref_upper:.4f}) > "
                          f"{GUARD_FALSE_AUTOCLEAR_REFERABLE_UPPER_MAX}")
    if mean_set_size > GUARD_MEAN_SET_SIZE_MAX:
        guard_hits.append(f"mean set size ({mean_set_size:.4f}) > {GUARD_MEAN_SET_SIZE_MAX}")

    out(f"referable-stratum coverage lower CI: {ref_cov_lower:.4f}  (guard: >= {GUARD_REFERABLE_COVERAGE_LOWER_MIN})")
    out(f"grade-4 coverage lower CI:           {g4_cov_lower:.4f}  (guard: >= {GUARD_GRADE4_COVERAGE_LOWER_MIN})")
    out(f"false auto-clear (referable) upper CI (Tier A): {fac_ref_upper:.4f}  "
        f"(guard: <= {GUARD_FALSE_AUTOCLEAR_REFERABLE_UPPER_MAX})")
    out(f"mean set size:                       {mean_set_size:.4f}  (guard: <= {GUARD_MEAN_SET_SIZE_MAX})")

    if guard_hits:
        out("\n*** GUARD TRIPPED -- REPORTING INSTEAD OF FINISHING ***")
        for h in guard_hits:
            out(f"  - {h}")
    else:
        out("\nAll guards clear.")

    report = {
        "crossfit_v2a": agg_v2a,
        "crossfit_v1": agg_v1,
        "grade4_tier_distribution_v2a": g4_tier_counts,
        "four_pdr_cases": four_cases,
        "guards": {
            "referable_coverage_lower_ci": ref_cov_lower,
            "grade4_coverage_lower_ci": g4_cov_lower,
            "false_autoclear_referable_upper_ci": fac_ref_upper,
            "mean_set_size": mean_set_size,
            "guard_hits": guard_hits,
        },
    }

    def _default(o):
        if isinstance(o, np.generic):
            return o.item()
        if isinstance(o, np.ndarray):
            return o.tolist()
        raise TypeError(f"Object of type {o.__class__.__name__} is not JSON serializable")

    os.makedirs(OUT_DIR, exist_ok=True)
    json_path = os.path.join(OUT_DIR, "conformal_v3_crossfit_report.json")
    txt_path = os.path.join(OUT_DIR, "conformal_v3_crossfit_report.txt")
    with open(json_path, "w") as fh:
        json.dump(report, fh, indent=2, default=_default)
    with open(txt_path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    print(f"\nWrote {json_path}")
    print(f"Wrote {txt_path}")

    return 1 if guard_hits else 0


if __name__ == "__main__":
    raise SystemExit(main())
