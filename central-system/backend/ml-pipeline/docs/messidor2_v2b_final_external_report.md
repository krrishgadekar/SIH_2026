# Messidor-2 External Validation — Final Report for branchA_v2b

**Model under report:** `branchA_v2b` (TAG = v2b)
**Why v2b and not v2c:** the v2c integration task fell back — v2c is not installed in production (no `branchA_v2c.mat`/`.onnx`, no `calibration_branchA_v2c.json`, absent from `modelPaths.CHECKPOINTS` and `artifact_manifest.json`), and the pre-declared decision rule agrees with that outcome on the data: `v2c` vs. incumbent `v2b`, selection-half AUC gain **−0.0089** (paired 95% CI **[−0.0287, +0.0117]**), no path fires → **v2b kept**. `v2b` itself was promoted over `v2a` earlier under Path 2 (strong evidence): AUC gain **+0.0572** (CI **[+0.0364, +0.0804]**), in-domain VAL AUC delta **−0.0016**, VAL QWK delta **−0.0107** — all within the strong-evidence thresholds.

**Peek audit trail** (`diagnostics/out/final_report_log.txt`, append-only):
```
v2a   2026-09-20T15:34:04.840699Z
v2b   2026-09-21T14:34:25.261985Z
```
This report's REPORT-half numbers come from the `v2b` line above — one `--final` run, logged once, as required.

**Shipped calibration used throughout** (`models/calibration_branchA_v2b.json`, exactly as installed):
method `ordinal_mode_interval_stratified_v3`, temperature **1.3865**, `qhatPerStratum` **[0, 0.83507]**, `alphaPerStratum` **[0.30, 0.05]**, **referableThreshold = 0.27642**, target referable sensitivity ≈95%, fitted on pooled val+test (n=1161: val=533, test=628), fitted 2026-09-21T14:10:23Z.

**Messidor-2 split:** 1,744 gradable images / 874 patients, split once by patient-id parity (pre-declared, no tuning): **SELECTION** (even patient_id) = 872 images / 437 patients; **REPORT** (odd patient_id) = 872 images / 437 patients. All numbers below are patient-level (bootstrap resampling by patient, n_boot=2000, except where noted).

---

## Method notes (what changed for this report)

- `experiments/evalMessidor2Candidate.py --checkpoint models/Model1/v2b/branchA_v2b.pt --tag v2b --final` was run **once**, producing the REPORT-half point estimates + patient-bootstrap CIs used below (rows 1, 3–6) and the audit line above.
- `experiments/messidor2ShiftStressTest.py` was generalized to take `--tag` (default `v2a`, verified byte-identical to its prior output — see `experiments/messidor2_shift_stress_run.log` vs. a fresh `--parts B` run). For `--tag v2b`, **Part B now evaluates the actual production-installed policy** — `calibration_branchA_v2b.json` applied through `inference/branchAInfer.assign_tier()` (the real shipped tiering function, not a reimplementation) — split into SELECTION and REPORT halves and reported **separately** (rows 7–8, plus the selection-half cross-check table). This is a deliberate change from `v2a`'s Part B, which uses a C5v3-sweep **replica** that `evalMessidor2Candidate.py`'s own docstring already flags as *not* the current production policy. Part D (site-calibration adaptation) needed no logic changes — it was already tag-agnostic.
- Outputs: `diagnostics/out/messidor2_v2b_candidate_report.json`, `diagnostics/out/messidor2_shift_stress_test_v2b.{json,txt}`. No production code was modified; nothing was committed.

---

## Headline table (REPORT half, n=872 images / 437 patients — the numbers this submission quotes)

All CIs are 95%, patient-level bootstrap (n_boot=2000) unless marked otherwise.

| Metric | **v2b REPORT half** | v2b in-domain reference | v2a frozen full-set (on record) |
|---|---|---|---|
| AUC of P(g≥2), 5-class | **0.9230** [0.8977, 0.9444] | 0.9791 *(in-domain TEST, single split — no cross-fit AUC is on record)* | 0.8678 [0.8422, 0.8918] |
| sens/spec @ **shipped** referableThreshold | sens **0.7844** [0.7177, 0.8433]; spec **0.9128** [0.8891, 0.9355] | sens 0.9475 [0.9396, 0.9555]; spec 0.9008 [0.8959, 0.9056] *(cross-fit, 50 folds, t-CI)* | sens 0.6718 [0.6194, 0.7207]; spec 0.8974 [0.8778, 0.9160] *(† not v2a's actual shipped threshold — see caveats)* |
| argmax sens/spec | sens **0.5642** [0.4847, 0.6345]; spec **0.9709** [0.9571, 0.9840] | sens 0.8493; spec 0.9466 *(in-domain TEST, single split)* | sens 0.5252 [0.4704, 0.5812]; spec 0.9510 [0.9373, 0.9634] |
| QWK | **0.6643** [0.5986, 0.7206] | 0.8849 *(in-domain TEST, single split)* | 0.6135 [0.5589, 0.6646] |
| Recall — grade 0 (n) | 0.9692 (520) [0.9528, 0.9842] | 0.9628 (296) | 0.9420 (1017) [0.9254, 0.9570] |
| Recall — grade 1 (n) | 0.0821 (134) [0.0390, 0.1286] | 0.6333 (60) | 0.0407 (270) [0.0186, 0.0651] |
| Recall — grade 2 (n) | 0.4451 (173) [0.3648, 0.5245] | 0.6114 (175) | 0.3026 (347) [0.2528, 0.3594] |
| Recall — grade 3 (n) | 0.4375 (32) [0.2083, 0.6522] | 0.6047 (43) | 0.3467 (75) [0.2333, 0.4730] |
| Recall — grade 4 (n) | 0.1538 (13) [0.0000, 0.3858] | 0.4630 (54) | 0.5143 (35) [0.3182, 0.7059] |
| Predicted grade-0 share | **0.7695** [0.7331, 0.8062] | 0.4682 *(in-domain TEST, single split)* | 0.7838 *(no CI on record)* |
| Tier A / B / C shares | **0.6594** [0.6188, 0.7003] / **0.1628** [0.1320, 0.1947] / **0.1778** [0.1492, 0.2071] | 0.4818 [0.4778, 0.4858] / 0.3936 [0.3885, 0.3987] / 0.1245 [0.1197, 0.1294] *(cross-fit)* | 0.5768 [0.5464, 0.6046] / 0.1737 [0.1519, 0.1974] / 0.2494 [0.2262, 0.2742] *(‡ NOT the shipped policy — see caveats)* |
| False auto-clear, true referable (final Tier A) | **0.1284** (28/218) [0.0825, 0.1837] | 0.0169 [0.0131, 0.0206] *(cross-fit)* | 0.0765 (77/1006) [0.0583, 0.0971] *(‡)* |
| False auto-clear, true grade≥3 (final Tier A) | **0.0000** (0/45) [0.0000, 0.0000] | 0.0056 [0.0024, 0.0087] *(cross-fit)* | 0.0000 (0/1006) [0.0000, 0.0000] *(‡)* |

**† v2a caveat:** v2a's actual shipped `referableThreshold` (0.32462) was never applied to Messidor-2 in any on-record report; the column above uses the closest on-record analogue (95%-target threshold locked on pooled val+test, 0.2968), which is a *different* fitting method (order-statistic Mondrian fit vs. a direct percentile lock) and not split by half.

**‡ v2a caveat:** v2a's Tier/false-auto-clear numbers on Messidor-2 were only ever computed with the C5v3-sweep **replica** (`conformalPolicySweep2.py`), which `evalMessidor2Candidate.py`'s own docstring states is explicitly *not* the current production tiering policy. No production-policy tiering numbers exist for v2a on Messidor-2; do not treat the v2a column here as apples-to-apples with v2b's production-policy numbers.

### Selection-half cross-check (n=872 / 437 patients, same production policy) — not the headline, included so the REPORT-half numbers above are not read as a fluke of which half was drawn

| Metric | Value |
|---|---|
| AUC P(g≥2) | 0.9170 [0.8893, 0.9432] |
| sens/spec @ shipped threshold | 0.7741 [0.7073, 0.8382] / 0.9005 [0.8748, 0.9243] |
| argmax sens/spec | 0.5983 [0.5210, 0.6773] / 0.9605 [0.9431, 0.9764] |
| QWK | 0.7108 [0.6398, 0.7703] |
| Predicted grade-0 share | 0.7489 [0.7107, 0.7847] |
| Tier A/B/C | 0.6399 [0.5986, 0.6797] / 0.1927 [0.1594, 0.2282] / 0.1674 [0.1402, 0.1952] |
| False auto-clear, referable / grade≥3 | 0.1506 (36/239) [0.0968, 0.2075] / 0.0154 (1/65) [0.0000, 0.0562] |

Selection and report halves agree within noise everywhere — the headline numbers are not an artifact of which half happened to be drawn as "report."

---

## Part D — site-calibration ADAPTATION experiment (not a generalization claim)

Messidor-2's own labels are used to *fit* a threshold here, on purpose, to ask "if we had local labels, how much data would it take to recalibrate."

| Direction | Threshold | Cal sens/spec | Eval sens (95% CI) | Eval spec (95% CI) | AUC (cal / eval) |
|---|---|---|---|---|---|
| A→B (even→odd) | 0.0152 | 0.9540 / 0.5355 | 0.9587 [0.9303, 0.9817] | 0.5382 [0.4932, 0.5845] | 0.9170 / 0.9230 |
| B→A (odd→even) | 0.0159 | 0.9541 / 0.5459 | 0.9498 [0.9153, 0.9798] | 0.5419 [0.4961, 0.5863] | 0.9230 / 0.9170 |

Subsampling calibration patients from half A at increasing size (20 repeats each, always evaluated on the full half B):

| n patients | sens mean (std) | spec mean (std) |
|---|---|---|
| 50 | 0.9319 (0.0500) | 0.6211 (0.1578) |
| 100 | 0.9555 (0.0226) | 0.5267 (0.1475) |
| 200 | 0.9468 (0.0162) | 0.5876 (0.0938) |
| 400 | 0.9548 (0.0055) | 0.5470 (0.0303) |

Even with only 50–100 locally labelled patients, a Messidor-2-site-fit threshold hits the ~95% sensitivity target — but specificity settles around 52–62%, far below the ~90% in-domain gives at the same sensitivity. This is the direct consequence of the AUC gap below: recalibration fixes *where* the threshold sits, not how well the score ranks referable vs. non-referable cases on this population.

---

## What the data support, and what they don't

**Ranking (AUC) generalizes better for v2b than v2a, but still degrades materially.** In-domain TEST AUC 0.9791 → Messidor-2 REPORT half 0.9230, a **−0.056** absolute drop. v2a's equivalent drop (in-domain 0.9826 → Messidor-2 full-set 0.8678) was **−0.115** — roughly double. This is real, supportable evidence that v2b transfers better than v2a, and is consistent with v2b's selection-half AUC win driving its promotion. It is not evidence that the ranking gap is closed: a 0.056 AUC drop still caps how well any single threshold can trade off sensitivity and specificity externally (see Part D).

**The ~95% referable-sensitivity target does NOT hold externally.** In-domain cross-fit sensitivity at the fold-fitted threshold is 94.75% [93.96, 95.55] — on target. Applying the single shipped threshold (0.27642) to Messidor-2 gives sensitivity **78.44%** [71.77, 84.33] on the report half and 77.41% [70.73, 83.82] on the selection half — the CI's upper bound doesn't reach 95% in either half. This is a clear, reproducible (both halves agree) miss of the safety target the calibration was designed to hit, not a bootstrap artifact.

**Specificity at the shipped threshold DOES hold up externally** — 91.28% [88.91, 93.55] on the report half vs. 90.08% [89.59, 90.56] in-domain cross-fit, overlapping CIs, if anything slightly higher externally. This is the one claim in this report that generalizes essentially unchanged. It should be read alongside the sensitivity miss above, not as an offsetting positive: the policy is trading away the safety margin (sensitivity) it was explicitly tuned for while specificity is not under stress at all.

**The false-auto-clear story is worse externally, and breaches the in-domain guard.** In-domain cross-fit false-auto-clear (true referable, on the final Tier A label) is 1.69% [1.31, 2.06] — comfortably inside the ≤5% guard `conformalCrossFitValidation.py` enforces. On Messidor-2 it is **12.84%** (28/218) [8.25, 18.37] on the report half and 15.06% (36/239) [9.68, 20.75] on the selection half — roughly **6–9× higher**, and the CI is entirely above the 5% guard ceiling in both halves. This is the headline risk finding: externally, more cases are being placed in the auto-clear tier (Tier A share 65.94% vs. 48.18% in-domain) *and* a much larger fraction of those auto-cleared cases are actually referable. The grade≥3 false-auto-clear rate is 0/45 = 0.00% on the report half, nominally better than in-domain's 0.56% — but n=45 true grade≥3 cases is too small to support a "safe" claim either way (zero observed events at this n is statistically consistent with rates well above the in-domain 0.56%); treat this specific number as inconclusive, not reassuring.

**Coverage under-runs its nominal target externally, as expected under distribution shift.** Marginal conformal coverage drops from 93.71% [93.35, 94.08] in-domain to 83.37% (report) / 81.88% (selection) on Messidor-2. The conformal guarantee assumes exchangeability with the calibration population; Messidor-2 breaks that assumption by construction, so this under-coverage is the expected signature of covariate shift, not a separate bug — but it is further, independent evidence (on top of the AUC drop) that the policy's statistical guarantees do not transfer to this external population as-is.

**One caveat already visible before Messidor-2 was even considered:** the in-domain cross-fit itself trips one guard — grade-4 coverage lower CI 0.8825 < the 0.90 floor. The shipped v2b calibration was already flagged as imperfect for the rarest, most severe grade domestically; the external results above should be read as compounding that known weakness, not introducing an unrelated one.

**Bottom line:** v2b is the right call over v2a and v2c on the data available (better in-domain metrics, a smaller external AUC drop, and v2c does not clear the promotion bar) — but none of that makes the *shipped calibration* externally valid. The sensitivity target and the false-auto-clear safety margin both fail to transfer to Messidor-2, by wide, non-overlapping margins in both independent halves. Specificity is the one number that does transfer. Site-recalibration (Part D) can restore the sensitivity target from as few as 50–100 local patients, but not simultaneously with in-domain specificity — that trade-off is bounded by the external AUC gap itself, which recalibration cannot fix.
