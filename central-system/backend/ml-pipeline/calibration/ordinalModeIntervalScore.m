function [scores, mode] = ordinalModeIntervalScore(probs)
% ORDINALMODEINTERVALSCORE  Ordinal mode-interval nonconformity score, v3.
%
%   [scores, mode] = ordinalModeIntervalScore(probs)
%
%   probs  - Nx5 (or 1x5) calibrated probabilities over grades 0..4.
%   mode   - Nx1 (or scalar) argmax grade, 0-based. Ties broken to the
%            HIGHER grade (an ambivalent-but-plausibly-worse call should not
%            resolve toward the lower, more reassuring reading). Unchanged
%            from v2.
%   scores - Nx5. scores(i, mode(i)+1) = 0 by definition. For k != mode(i),
%            scores(i,k+1) = (probability mass of the smallest interval
%            around mode(i) that contains grade k) MINUS probs(i,k+1) --
%            i.e. the mass strictly BETWEEN the mode and k, excluding both
%            endpoints' own probability is still included for intermediate
%            grades; only k's OWN mass is subtracted, not the mode's. This is
%            nondecreasing as k moves away from the mode in either direction.
%
%   ── v2 -> v3: WHY THIS CHANGED (score v3, defect found and fixed) ─────────
%   v2's score included k's own probability mass in its own score:
%   scores(i, mode(i)+1) == probs(i, mode(i)+1), which for a confident,
%   correctly-classified case is close to 1 -- i.e. the MODE'S OWN
%   nonconformity score was close to the WORST possible value (1), backwards
%   from what a nonconformity score should mean (low = conforms well). This
%   silently inflated qhat far more than intended and was masked in practice
%   only because the mode is unconditionally added to the prediction set
%   regardless of its own score, so the defect never showed up in mode
%   membership -- it showed up as needlessly wide qhat thresholds admitting
%   far more neighbouring grades than the requested alpha should have,
%   because non-mode calibration points with the true grade AT the mode
%   contributed a near-1 score into that grade's own quantile fit. v3 fixes
%   this at the definition: s(mode)=0 (the mode conforms perfectly with
%   itself by construction), and s(k) for k != mode is the interval mass
%   MINUS k's own probability -- the mass strictly on the far side of k,
%   which is what "how far outside the interval ending at k" should mean.
%   See experiments/conformalPolicySweep2.py's true_scores_v3/row_scores_v3
%   and its hand-worked unit-test vectors, reproduced in
%   tests/conformal_golden_vectors.json.
%
%   Shared by conformalCalibrate.m (fits qhatPerStratum from
%   scores(i, trueGrade(i)+1)) and conformalTiering.m (tests
%   scores(k) against qhatPerStratum(stratumOf(k)) at inference). Kept as one
%   function so the two call sites cannot drift into scoring cases
%   differently -- the exact failure mode duplicated logic invites.
%
%   branchAInfer.py's ordinal_mode_interval_score() must compute the
%   identical function; golden vectors in tests/conformal_golden_vectors.json
%   are what verifies the two never drift apart.

probs = double(probs);
if isvector(probs), probs = probs(:)'; end
[n, g] = size(probs);
if g ~= 5
    error('ordinalModeIntervalScore:badProbs', 'probs must have 5 columns, got %d.', g);
end

maxVal = max(probs, [], 2);
isMax = probs == maxVal;                        % exact: maxVal comes from these rows
[~, revIdx] = max(fliplr(isMax), [], 2);        % first true from the right ...
modeIdx = g - revIdx + 1;                       % ... = last true from the left = highest tied grade
mode = modeIdx - 1;

scores = zeros(n, g);
for i = 1:n
    m = modeIdx(i);
    for k = 1:g
        if k == m
            scores(i, k) = 0;
            continue;
        end
        lo = min(m, k); hi = max(m, k);
        scores(i, k) = sum(probs(i, lo:hi)) - probs(i, k);
    end
end
end
