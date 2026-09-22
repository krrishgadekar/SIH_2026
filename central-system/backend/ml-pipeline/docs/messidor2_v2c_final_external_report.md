# Messidor-2 External Validation — Final Report for branchA_v2c

**Model under report:** `branchA_v2c` (TAG = v2c)

**Why v2c, not v2b, and why this report does not change that:** `branchA_v2c` is the currently *deployed* default (`BRANCH_A_MODEL_VERSION` in `inference/branchAInfer.py`), but it is **not** the model the pre-declared selection rule picks as incumbent. That rule was already fixed and applied **on the selection half only**, before this report's REPORT-half numbers existed: `v2c` vs. incumbent `v2b`, selection-half best-of-two-heads AUC gain **−0.0089** (paired 95% CI **[−0.0287, +0.0117]**), in-domain VAL AUC delta **+0.0008**, VAL QWK delta **+0.0088** — no path fires → **v2b stays the rule-selected incumbent** (`diagnostics/out/messidor2_compare_v2b_v2c.json`, unchanged by anything run for this report). `v2b` was itself promoted over `v2a` earlier under Path 2. Nothing below — the v2c `--final` run, the production-policy stress test, or the new site-recalibration experiment — touches the selection half or the decision rule; it only computes the REPORT half and two new adaptation experiments for the model that happens to be deployed today, so both v2b's and v2c's real-world behavior are on record.

**Peek audit trail** (`diagnostics/out/final_report_log.txt`, append-only):
```
v2a   2026-09-20T15:34:04.840699Z
v2b   2026-09-21T14:34:25.261985Z
v2c   2026-09-21T15:36:22.078498Z
```
This report's REPORT-half numbers come from the `v2c` line above — `experiments/evalMessidor2Candidate.py --checkpoint models/Model1/v2c/branchA_v2c.pt --tag v2c --final` was run **once**, producing that audit line and the REPORT-half point estimates + patient-bootstrap CIs used below. v2b's `--final` line above predates this report (a prior parallel-run race already used it, as its own report documents); it is not re-peeked here, only read from the record.

**Shipped calibration used throughout** (`models/calibration_branchA_v2c.json`, exactly as installed): method `ordinal_mode_interval_stratified_v3`, temperature **1.5438**, `qhatPerStratum` **[0, 0.90691]**, `alphaPerStratum` **[0.30, 0.05]**, **referableThreshold = 0.38729** (≈0.3873), target referable sensitivity ≈95%, fitted on pooled val+test (n=1161: val=533, test=628), fitted 2026-09-21T14:33:48Z.

**Messidor-2 split:** 1,744 gradable images / 874 patients, split once by patient-id parity (pre-declared, no tuning): **SELECTION** (even patient_id) = 872 images / 437 patients; **REPORT** (odd patient_id) = 872 images / 437 patients. All numbers below are patient-level (bootstrap resampling by patient, n_boot=2000) except the false-auto-clear rows, which use exact Clopper-Pearson intervals on pooled counts (see headline table note).

---

## Method notes (what was run for this report)

- `experiments/evalMessidor2Candidate.py --checkpoint models/Model1/v2c/branchA_v2c.pt --tag v2c --final` — run **once** (item 1). Produced the REPORT-half point estimates + patient-bootstrap CIs (rows 1, 3–6, 9 below) and the audit line above. Output: `diagnostics/out/messidor2_v2c_candidate_report.json`.
- `experiments/messidor2ShiftStressTest.py --tag v2c` — Part B (production-installed policy, `calibration_branchA_v2c.json` through `inference/branchAInfer.assign_tier`, the real shipped tiering function) on SELECTION and REPORT halves **separately**; Part D (site-calibration threshold adaptation) unchanged from its existing, tag-generic form. Output: `diagnostics/out/messidor2_shift_stress_test_v2c.{json,txt}`.
- **NEW** `experiments/messidor2SiteConformalRecal.py --tag v2c` (Part E, below) — a new, standalone file that does not modify or rerun `messidor2ShiftStressTest.py`, so v2a/v2b's existing shift-stress-test records are untouched. Output: `diagnostics/out/messidor2_site_conformal_recal_v2c.{json,txt}`.
- `experiments/messidor2ShiftStressTest.py --tag v2b` and `experiments/messidor2SiteConformalRecal.py --tag v2b` — Part E was run fresh for v2b (cheap, <1s; new output file, does not overwrite anything). Part B for v2b was **not** rerun: it is already on record (`diagnostics/out/messidor2_shift_stress_test_v2b.json`, from the run underlying `docs/messidor2_v2b_final_external_report.md`) and rerunning it would only overwrite that existing tracked file with numerically identical output (same code, same cached logits, no randomness in that path) — reused as-is instead.
- No production code was modified. Nothing was committed. No existing v2a/v2b report or diagnostics file was overwritten — every new output above is written under a `v2c`- or new-script-specific path.

---

## Headline table (REPORT half, n=872 images / 437 patients — the numbers this submission quotes for the deployed model)

All CIs are 95%. Point/CI rows are patient-level bootstrap (n_boot=2000) **except** the two false-auto-clear rows, which use **exact Clopper-Pearson intervals on the pooled (k, n) counts** — not fold/bootstrap-variance intervals — because several of these counts are small (down to 0/45) and a percentile-bootstrap CI on a rare event degenerates to a point (e.g. `[0.0000, 0.0000]` for 0/45), which understates the true uncertainty; Clopper-Pearson gives an honest upper bound even at zero observed events.

| Metric | **v2c REPORT half** | v2c in-domain reference | v2b REPORT half (on record) | v2a frozen full-set (on record) |
|---|---|---|---|---|
| AUC of P(g≥2), 5-class | **0.9235** [0.8996, 0.9450] | 0.9786 *(in-domain TEST, single split — no cross-fit AUC on record)* | 0.9230 [0.8977, 0.9444] | 0.8678 [0.8422, 0.8918] |
| sens/spec @ **shipped** referableThreshold (0.3873) | sens **0.7523** [0.6861, 0.8143]; spec **0.9388** [0.9181, 0.9579] | sens 0.9458 [0.9378, 0.9537]; spec 0.9131 *(cross-fit, 50 folds, fold-fitted threshold, t-CI)* | sens 0.7844 [0.7177, 0.8433]; spec 0.9128 [0.8891, 0.9355] *(shipped threshold 0.27642)* | sens 0.6718 [0.6194, 0.7207]; spec 0.8974 [0.8778, 0.9160] *(† not v2a's actual shipped threshold — see caveats)* |
| argmax sens/spec | sens **0.7018** [0.6333, 0.7689]; spec **0.9404** [0.9204, 0.9586] | sens 0.9265; spec 0.9242 *(in-domain TEST, single split)* | sens 0.5642 [0.4847, 0.6345]; spec 0.9709 [0.9571, 0.9840] | sens 0.5252 [0.4704, 0.5812]; spec 0.9510 [0.9373, 0.9634] |
| QWK | **0.7166** [0.6590, 0.7644] | 0.8839 *(in-domain TEST, single split)* | 0.6643 [0.5986, 0.7206] | 0.6135 [0.5589, 0.6646] |
| Recall — grade 0 (n) | 0.9038 (520) [0.8773, 0.9283] | 0.9561 (296) | 0.9692 (520) [0.9528, 0.9842] | 0.9420 (1017) [0.9254, 0.9570] |
| Recall — grade 1 (n) | 0.2015 (134) [0.1343, 0.2783] | 0.5500 (60) | 0.0821 (134) [0.0390, 0.1286] | 0.0407 (270) [0.0186, 0.0651] |
| Recall — grade 2 (n) | 0.5896 (173) [0.5093, 0.6667] | 0.7486 (175) | 0.4451 (173) [0.3648, 0.5245] | 0.3026 (347) [0.2528, 0.3594] |
| Recall — grade 3 (n) | 0.3125 (32) [0.1154, 0.5217] | 0.5814 (43) | 0.4375 (32) [0.2083, 0.6522] | 0.3467 (75) [0.2333, 0.4730] |
| Recall — grade 4 (n) | 0.4615 (13) [0.1429, 0.8000] | 0.5741 (54) | 0.1538 (13) [0.0000, 0.3858] | 0.5143 (35) [0.3182, 0.7059] |
| Predicted grade-0 share | **0.6823** [0.6430, 0.7217] | 0.4602 *(in-domain TEST, single split)* | 0.7695 [0.7331, 0.8062] | 0.7838 *(no CI on record)* |
| Tier A / B / C shares | **0.3647** [0.3242, 0.4067] / **0.2202** [0.1844, 0.2552] / **0.4151** [0.3750, 0.4541] | 0.3841 / 0.4375 / 0.1784 *(cross-fit)* | 0.6594 [0.6188, 0.7003] / 0.1628 [0.1320, 0.1947] / 0.1778 [0.1492, 0.2071] | 0.5768 [0.5464, 0.6046] / 0.1737 [0.1519, 0.1974] / 0.2494 [0.2262, 0.2742] *(‡ NOT the shipped policy — see caveats)* |
| False auto-clear, true referable (final Tier A) | **0.0229** (5/218) **CP95 [0.0075, 0.0527]** | 0.0000 [0.0000, 0.0000] *(cross-fit, mean over 50 folds)* | 0.1284 (28/218) **CP95 [0.0871, 0.1803]** | 0.0765 (77/1006) **CP95 [0.0609, 0.0947]** *(‡)* |
| False auto-clear, true grade≥3 (final Tier A) | **0.0000** (0/45) **CP95 [0.0000, 0.0787]** | 0.0000 [0.0000, 0.0000] *(cross-fit)* | 0.0000 (0/45) **CP95 [0.0000, 0.0787]** | 0.0000 (0/1006) **CP95 [0.0000, 0.0037]** *(‡)* |

**† v2a caveat:** as in the v2b report, v2a's actual shipped `referableThreshold` was never applied to Messidor-2 in any on-record report; the column above uses the closest on-record analogue (a 95%-target threshold locked on pooled val+test by a different fitting method), not split by half.

**‡ v2a caveat:** v2a's Tier/false-auto-clear numbers on Messidor-2 were only ever computed with the C5v3-sweep **replica**, not the production-installed policy — see `docs/messidor2_v2b_final_external_report.md` for the full caveat. Not apples-to-apples with v2b's and v2c's production-policy numbers.

**Note on the false-auto-clear guard:** the production guard (`conformalCrossFitValidation.py`, `GUARD_FALSE_AUTOCLEAR_REFERABLE_UPPER_MAX`) is **≤5%**. v2c's REPORT-half point estimate (2.29%) clears it comfortably, but the exact Clopper-Pearson upper bound (5.27%) technically breaches 5% — and the SELECTION half's point estimate (3.77%, below) has an upper bound of 7.03%. Read v2c's false-auto-clear performance as "close to, and on the report half clearing, the guard" rather than a clean pass — see "what the data support" below.

### Selection-half cross-check (n=872 / 437 patients, same production policy) — not the headline, included so the REPORT-half numbers above are not read as a fluke of which half was drawn

| Metric | Value |
|---|---|
| AUC P(g≥2) | 0.9158 [0.8918, 0.9383] |
| sens/spec @ shipped threshold | 0.7615 [0.6983, 0.8207] / 0.9131 [0.8896, 0.9353] |
| argmax sens/spec | 0.7155 [0.6486, 0.7802] / 0.9258 [0.9030, 0.9480] |
| QWK | 0.7645 [0.7117, 0.8084] |
| Predicted grade-0 share | 0.6560 [0.6144, 0.6946] |
| Tier A/B/C | 0.3647 [0.3276, 0.4025] / 0.2500 [0.2138, 0.2870] / 0.3853 [0.3506, 0.4209] |
| False auto-clear, referable / grade≥3 | 0.0377 (9/239) CP95 [0.0174, 0.0703] / 0.0000 (0/65) CP95 [0.0000, 0.0552] |

Selection and report halves agree within noise on ranking, QWK, and grade-0 share. Tier A share is identical (0.3647) to three decimal places across both halves — notably, this is close to (not inflated relative to) v2c's in-domain cross-fit Tier A share of 0.3841, unlike v2b, where the external Tier A share (0.66) roughly doubles the in-domain rate (0.48). False auto-clear is somewhat higher on selection (3.77%, CP upper 7.03%) than report (2.29%, CP upper 5.27%) — both halves are in the same rough range, neither is a clean pass of the 5% guard when read via the exact interval rather than the point estimate.

---

## Part D — site-calibration ADAPTATION experiment (single-threshold lock, not a generalization claim)

Unchanged methodology from the v2b report (a single P(g≥2) threshold locked at 95% target sensitivity on the calibration side, applied unchanged to the eval side — no conformal/tiering machinery here, see Part E below for that).

| Direction | Threshold | Cal sens/spec | Eval sens (95% CI) | Eval spec (95% CI) | AUC (cal / eval) |
|---|---|---|---|---|---|
| A→B (even→odd) | 0.0352 | 0.9540 / 0.4976 | 0.9725 [0.9500, 0.9912] | 0.4969 [0.4497, 0.5472] | 0.9158 / 0.9235 |
| B→A (odd→even) | 0.0515 | 0.9541 / 0.5872 | 0.9372 [0.9067, 0.9672] | 0.5877 [0.5435, 0.6310] | 0.9235 / 0.9158 |

Subsampling calibration patients from half A at increasing size (20 repeats each, always evaluated on the full half B):

| n patients | sens mean (std) | spec mean (std) |
|---|---|---|
| 50 | 0.9436 (0.0493) | 0.5612 (0.1566) |
| 100 | 0.9532 (0.0287) | 0.5476 (0.1064) |
| 200 | 0.9555 (0.0228) | 0.5447 (0.0763) |
| 400 | 0.9644 (0.0074) | 0.5131 (0.0176) |

Same qualitative story as v2b: a single-threshold lock hits the ~95% sensitivity target from as few as 50 labelled patients, but specificity settles around 51–56%, far below in-domain — because a threshold lock alone cannot fix the underlying AUC gap (see "what the data support" below). Part E, next, asks the sharper question: what happens if the *full* production calibration procedure (temperature + stratified conformal qhat + referableThreshold), not just one threshold, is refit on local data?

---

## Part E — site conformal recalibration (NEW, ADAPTATION experiment, not a generalization claim)

Messidor-2's own labels are used to **refit the full production calibration procedure** here, on purpose — `calibrateBranchA.m`'s own fitting algorithm (temperature scaling, referable-stratified conformal qhat, referableThreshold at target referable sensitivity 0.95), via its already MATLAB-validated Python port (`experiments/conformalCrossFitValidation.py`'s `fit_temperature`/`fit_qhat_per_stratum`/`fit_referable_threshold` — the same three calls that script's own 50-fold cross-fit already uses inside each fold). Applied through `inference/branchAInfer.assign_tier` (a vectorised, re-verified replica for the 20-repeat subsampling; the literal production function itself for the two full-437 fits). Split by patient-id parity, same halves as everywhere else in this report.

**Sizes 50/100/200/400** (20 repeats each): the production calibration is refit on a random SITE subset of half A's patients alone, then applied to the **full, fixed** half B. Values are mean (std) over the 20 repeats — these repeats reuse the same 872-image half B against 20 different site-fits, so the spread is not a sampling-error CI; it **is** the finding (how much a small labelled subset's random composition moves the refit policy).

**Full 437-patient swap**: both directions, full A refit → applied to full B, and full B refit → applied to full A.

**"Unvalidated camera rule"** (the *0 labelled site patients* anchor point): apply the SHIPPED, unmodified calibration to the REPORT half, but refuse Tier A outright — every would-be Tier A case is demoted to Tier B, on the principle that an unvalidated external camera/site should never auto-clear anything until locally validated.

### v2c

| Site n (patients) | Coverage marginal | Mean set size | Tier A / B / C | FAC true-referable (final Tier A) | FAC true-grade≥3 | Referable sens / spec @ refit threshold |
|---|---|---|---|---|---|---|
| 0 (camera rule) | *(unchanged, 0.8704 — see Part B)* | *(unchanged)* | 0.0000 / 0.5849 / 0.4151 | 0.0000 (0/218) | 0.0000 (0/45) | *(no auto-clear at all; n/a)* |
| 50 | 0.8918 (0.0265) | 2.5979 (0.4984) | 0.2634 (0.1241) / 0.2155 (0.0178) / 0.5211 (0.1231) | 0.0186 (0.0186) | 0.0000 (0.0000) | 0.9452 (0.0499) / 0.5529 (0.1630) |
| 100 | 0.8736 (0.0261) | 2.3394 (0.2619) | 0.3399 (0.1084) / 0.2226 (0.0222) / 0.4375 (0.1113) | 0.0268 (0.0174) | 0.0000 (0.0000) | 0.9539 (0.0287) / 0.5365 (0.1114) |
| 200 | 0.8672 (0.0176) | 2.2609 (0.1581) | 0.3630 (0.0471) / 0.2349 (0.0385) / 0.4021 (0.0640) | 0.0271 (0.0097) | 0.0000 (0.0000) | 0.9571 (0.0232) / 0.5304 (0.0837) |
| 400 | 0.8763 (0.0050) | 2.3437 (0.0347) | 0.3448 (0.0149) / 0.2202 (0.0000) / 0.4350 (0.0149) | 0.0232 (0.0010) | 0.0000 (0.0000) | 0.9649 (0.0086) / 0.5030 (0.0232) |
| 437 (A→B, single fit) | 0.8761 | 2.3440 | 0.3452 / 0.2202 / 0.4346 | 0.0229 (5/218) | 0.0000 (0/45) | 0.9679 / 0.4939 |
| 437 (B→A, single fit) | 0.8383 | 2.1468 | 0.4151 / 0.2500 / 0.3349 | 0.0418 (10/239) | 0.0000 (0/65) | 0.9331 / 0.5877 |

*(In-domain nominal reference, for comparison: coverage 0.9236 [0.9198, 0.9274], Tier A 0.3841.)*

### v2b

| Site n (patients) | Coverage marginal | Mean set size | Tier A / B / C | FAC true-referable (final Tier A) | FAC true-grade≥3 | Referable sens / spec @ refit threshold |
|---|---|---|---|---|---|---|
| 0 (camera rule) | *(unchanged, 0.8337 — see v2b's Part B)* | *(unchanged)* | 0.0000 / 0.8222 / 0.1778 | 0.0000 (0/218) | 0.0000 (0/45) | *(no auto-clear at all; n/a)* |
| 50 | 0.9238 (0.0416) | 2.5860 (0.6713) | 0.3338 (0.1899) / 0.1611 (0.0077) / 0.5051 (0.1890) | 0.0401 (0.0379) | 0.0000 (0.0000) | 0.9328 (0.0468) / 0.6034 (0.1598) |
| 100 | 0.9360 (0.0254) | 2.5935 (0.3965) | 0.3031 (0.1382) / 0.1610 (0.0080) / 0.5359 (0.1391) | 0.0284 (0.0225) | 0.0000 (0.0000) | 0.9530 (0.0246) / 0.5138 (0.1543) |
| 200 | 0.9179 (0.0194) | 2.3088 (0.2095) | 0.4029 (0.0830) / 0.1628 (0.0000) / 0.4342 (0.0830) | 0.0447 (0.0168) | 0.0000 (0.0000) | 0.9466 (0.0160) / 0.5754 (0.0863) |
| 400 | 0.9194 (0.0058) | 2.3209 (0.0688) | 0.3962 (0.0266) / 0.1628 (0.0000) / 0.4410 (0.0266) | 0.0443 (0.0046) | 0.0000 (0.0000) | 0.9525 (0.0022) / 0.5381 (0.0210) |
| 437 (A→B, single fit) | 0.9174 | 2.2947 | 0.4060 / 0.1628 / 0.4312 | 0.0459 (10/218) | 0.0000 (0/45) | 0.9541 / 0.5260 |
| 437 (B→A, single fit) | 0.9128 | 2.3268 | 0.3807 / 0.1927 / 0.4266 | 0.0418 (10/239) | 0.0154 (1/65) | 0.9498 / 0.5276 |

*(In-domain nominal reference, for comparison: coverage ≈0.9371, Tier A 0.4818 — see `docs/messidor2_v2b_final_external_report.md`.)*

**Reading the two tables together:** for **v2b**, the shipped (0-labelled-patients) policy badly breaches the false-auto-clear guard (12.84% report-half) and under-covers (83.37% vs ≈93.71% nominal). Refitting the *full* production calibration on as few as **50 site-labelled patients** already brings both close to target: mean false-auto-clear 4.01% (std 3.79pp — noisy at this size, but centred under the 5% guard) and mean coverage 92.38% (within 1.3pp of nominal) — a materially better fix than Part D's single-threshold lock, which left specificity/coverage broken even though it hit the sensitivity target. The Tier A share needed to get there (≈30–40%, both at n=50 and at the full 437-patient swap) is *below* both the shipped 65.94% and the in-domain 48.18% — i.e. the workload cost of restoring safety is routing noticeably more cases to assisted review than even the in-domain rate.

For **v2c**, the story is different: the *shipped, unmodified* policy already sits close to the false-auto-clear guard (2.29% report-half point estimate, though the exact CP upper bound 5.27% just breaches 5%) and its Tier A share barely differs from in-domain (36.47% vs 38.41%) — so v2c did not need the same rescue v2b did. What site recalibration does **not** fix for v2c, at any size up to and including the full 437-patient swap, is coverage: it stays in the 84–89% range throughout, 3–9 points under the 92.36% in-domain nominal — the same AUC-gap-bounded ceiling Part D already showed for v2b.

**Unvalidated camera rule, both models:** forcing Tier A → B costs v2c **36.5%** of report-half cases (318/872) moved from auto-clear to assisted review, and v2b **65.9%** (575/872) — exactly each model's own shipped Tier A share, since that is definitionally what gets redirected. This is the "0 labelled patients, but also 0% false auto-clear" floor both site-recalibration curves above are compared against.

---

## What the data support, and what they don't

**The rule-selected incumbent is still v2b, and this report does not change that.** The selection-half decision rule was fixed on selection-half data and in-domain VAL before any REPORT-half number existed, exactly as required; v2c's paired AUC-gain CI against v2b spans zero, so no path fires. Everything below describes v2c's *external* behavior as the currently deployed model, not a re-argument for promoting it.

**Ranking (AUC) is essentially unchanged between v2b and v2c, and both still degrade materially from in-domain.** v2c in-domain TEST AUC 0.9786 → Messidor-2 REPORT half 0.9235, a **−0.055** absolute drop, statistically indistinguishable from v2b's own **−0.056** drop. Neither model closes v2a's larger **−0.115** in-domain-to-external gap, but neither is meaningfully different from the other on this axis either — the AUC story from the v2b report carries over unchanged to v2c.

**v2c's shipped, unmodified policy generalizes its safety margin (false auto-clear, Tier A share) far better than v2b's does — this is the headline new finding.** v2b's shipped Tier A share roughly doubles externally (48.18% in-domain → 65.94% report-half) and its false-auto-clear rate rises 6–9× (1.69% → 12.84%), a clear breach of the 5% guard in both halves with CIs entirely above it. v2c's shipped Tier A share is essentially unchanged externally (38.41% in-domain → 36.47% report-half, 36.47% selection-half — identical to three decimals across halves) and its false-auto-clear point estimate (2.29% report / 3.77% selection) sits close to, and on the report half within, the 5% guard — though the exact Clopper-Pearson upper bounds (5.27% / 7.03%) mean this should be read as "close to a pass," not a clean one. This is a real, reproducible (both halves agree, small CIs) difference between the two models on the metric that matters most for a false-negative-averse auto-clear system, and it runs in the *opposite* direction from the AUC comparison that keeps v2b as the rule-selected incumbent — the two models trade off differently on ranking-quality-driving-promotion versus calibration-transfer, and the promotion rule was never designed to look at the second axis.

**Coverage under-runs nominal for both models, and site recalibration does not fully fix it for v2c.** v2c's marginal coverage on Messidor-2 (85–87% across halves) sits well under its 92.36% in-domain nominal, and Part E's site-refit experiment shows this gap persists at every calibration-subset size up to and including a full 437-patient swap (peak 87.6%) — the same residual-AUC-gap ceiling Part D already demonstrated for v2b via a cruder single-threshold experiment. Recalibration on more local data changes *where* the tiering boundaries sit, not how well the underlying score ranks referable-vs-not on this population.

**Part E answers the report's own question directly, and differently for the two models.** *v2b*: as few as **50 labelled local patients**, refitting the full production calibration (not just a threshold), already brings both false-auto-clear (mean 4.01%, under the 5% guard on average though noisy at this size) and marginal coverage (92.4%, within ~1.3pp of the 93.71% nominal) close to target — at a resulting Tier A share of roughly **30–40%** of cases, below both v2b's own shipped rate (65.94%) and the in-domain rate (48.18%), i.e. materially more caution than either. *v2c*: **0 additional labelled patients** are needed to keep false-auto-clear near the 5% guard (it already is, on the report half, if only just), and the shipped Tier A share (36.47%) is already close to in-domain — but no amount of site recalibration tested (up to 437 patients, both directions) brings marginal coverage within reach of the 92.36% in-domain nominal; it tops out at 87.6%. In short: v2b's problem (calibration transfer) is the kind Part E's full recalibration fixes cheaply; v2c's residual problem (a ranking/AUC gap that caps achievable coverage) is not.

**Bottom line:** the promotion decision (v2b over v2c) stands, made correctly and before any of this report's numbers existed. But `branchA_v2c` is what is actually deployed today, and on the metric a screening system's safety case rests on most — how often the auto-clear tier is wrong about a referable or severe case — its shipped, unmodified behavior on Messidor-2 is markedly better than v2b's, close to (not a clean pass of) the 5% guard rather than 2.5–3× over it. Site conformal recalibration (Part E) is the more effective fix than a single-threshold lock (Part D) for whichever model needs external correction — for v2b, it closes both the false-auto-clear and coverage gaps from as few as 50 local labels; for v2c, it closes neither further, because what remains broken there is ranking quality, which no amount of recalibration on any of these sample sizes can repair.
