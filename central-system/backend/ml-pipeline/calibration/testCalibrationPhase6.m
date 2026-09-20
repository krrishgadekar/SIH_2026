function testCalibrationPhase6()
% TESTCALIBRATIONPHASE6  Unit tests for Tasks 6.1 and 6.2.
%
%   Run: matlab -batch "testCalibrationPhase6"
%
%   The conformal fixtures are built so every threshold is computable by hand
%   -- see the Task 6.2 section header below for the v3 (score v3,
%   referable-stratified Mondrian) construction.

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);

fprintf('\n===== Phase 6: uncertainty and conformal tiering =====\n');
n = 0; f = 0;
TOL = 1e-12;

% ═══ Task 6.1: MC-Dropout ══════════════════════════════════════════════════
fprintf('\n--- mcDropoutUncertainty: the zero-variance trap ---\n');

% THE test for this task. A network with no dropout produces identical passes,
% variance 0, and a stored uncertainty of 0 -- which reads downstream as
% MAXIMUM certainty. Branch A's current stub has no dropout layer, so this is
% the live configuration.
stubPath = fullfile(thisDir, '..', 'models', 'branchA_v1.mat');
if exist(stubPath, 'file')
    S = load(stubPath, 'net');
    [n,f] = terr(n, f, 'refuses the real Branch A stub (it has no dropout layers)', ...
        @() mcDropoutUncertainty(S.net, zeros(512, 512, 3, 'single')), 'noDropoutLayers');
    fprintf('        the shipped stub genuinely has none -- this is not hypothetical\n');
else
    fprintf('  SKIP  branchA_v1.mat not present\n');
end

[n,f] = terr(n, f, 'refuses anything with no dropout layers', ...
    @() mcDropoutUncertainty(struct(), zeros(4,4,3)), 'noDropoutLayers');
[n,f] = terr(n, f, 'refuses fewer than 2 passes (variance of one sample is meaningless)', ...
    @() mcDropoutUncertainty([], zeros(4,4,3), ...
        struct('nPasses', 1, 'forwardFn', @(~,~) [1 0 0 0 0])), 'badPasses');
[n,f] = terr(n, f, 'rejects a network that does not return 5 scores', ...
    @() mcDropoutUncertainty([], zeros(4,4,3), ...
        struct('forwardFn', @(~,~) [0.5 0.5])), 'badOutput');

fprintf('\n--- variance and its decomposition ---\n');

% Identical passes: variance exactly 0, entropy == expected entropy, so the
% mutual information (the EPISTEMIC part) is 0. That is the correct reading --
% a model that always says the same thing has no parameter uncertainty --
% which is precisely why the layer check above has to exist.
[u0, d0] = mcDropoutUncertainty([], [], struct( ...
    'forwardFn', @(~,~) [0.2 0.2 0.2 0.2 0.2], 'nPasses', 10));
[n,f] = tnum(n, f, 'identical passes give variance 0', d0.totalVariance, 0, TOL);
[n,f] = tnum(n, f, 'and uncertainty 0', u0, 0, TOL);
[n,f] = tnum(n, f, 'and mutual information 0 (no epistemic uncertainty)', ...
    d0.mutualInformation, 0, 1e-10);
[n,f] = tbool(n, f, 'but the result carries a note that this is unmeasured, not certain', ...
    isfield(d0, 'note') && contains(d0.note, 'not as certain'));

% A uniform distribution has entropy ln(5) = 1.6094379...  TOTAL uncertainty is
% high while EPISTEMIC uncertainty is zero: the image is ambiguous, but the
% model is not confused about its own parameters. Only the second is a
% retraining signal, which is why both are kept.
[n,f] = tnum(n, f, 'predictive entropy of a uniform 5-class output is ln(5)', ...
    d0.predictiveEntropy, log(5), 1e-10);
fprintf('        entropy %.4f (total) vs MI %.4f (epistemic) -- an ambiguous\n', ...
    d0.predictiveEntropy, d0.mutualInformation);
fprintf('        image, not a model that does not know\n');

% Maximum disagreement: passes alternate between two one-hot corners. Per-class
% unbiased variance over 10 ones and 10 zeros is (20 * 0.25)/19 = 0.2632, in
% two classes = 0.5263, over the 0.5 normaliser = 1.05 -> clamped to 1.
alt = @(~, k) circshift([1 0 0 0 0], mod(k, 2));
[u1, d1] = mcDropoutUncertainty([], [], struct('forwardFn', alt, 'nPasses', 20));
[n,f] = tnum(n, f, 'maximal disagreement clamps the score to 1.0', u1, 1.0, TOL);
[n,f] = tbool(n, f, 'raw total variance does exceed the 0.5 normaliser', ...
    d1.totalVariance > 0.5, d1.totalVariance);
[n,f] = tbool(n, f, 'and mutual information is large', d1.mutualInformation > 0.6, ...
    d1.mutualInformation);

% A middling case must land strictly between.
wobble = @(~, k) normaliseRow([0.5 + 0.1*mod(k,2), 0.3 - 0.1*mod(k,2), 0.1, 0.05, 0.05]);
[u2, ~] = mcDropoutUncertainty([], [], struct('forwardFn', wobble, 'nPasses', 20));
[n,f] = tbool(n, f, 'a partially-varying model scores strictly between 0 and 1', ...
    u2 > 0 && u2 < 1, u2);
[n,f] = tbool(n, f, 'and orders correctly against the two extremes', u0 < u2 && u2 < u1);
fprintf('        %.4f (identical) < %.4f (wobbling) < %.4f (alternating)\n', u0, u2, u1);

% ═══ Task 6.2: conformal calibration (ordinal_mode_interval_stratified_v3) ═
% NOTE (2026-09-20, policy v3): this section replaces the v2 per-CLASS
% Mondrian fixtures (alphaPerClass, qhatPerClass, score = interval mass
% INCLUDING k's own mass) with the v3 REFERABLE-STRATIFIED scheme
% (alphaPerStratum, qhatPerStratum, score = interval mass MINUS k's own
% mass, s(mode)=0). The exhaustive cross-implementation checks live in
% tests/testConformalV2.m + tests/test_conformal_v2.py, reproducing >=80
% golden vectors generated from the real fitted branchA_v2a model plus a
% 10,000-trial contiguity/mode-membership/never-Tier-A-above-threshold
% property test AND a standalone synthetic referable-threshold-demotion
% unit test in BOTH MATLAB and Python -- this section stays a compact,
% hand-computable sanity check of the same arithmetic, kept alongside
% Task 6.1 in this original test file.
fprintf('\n--- conformalCalibrate: the hand-worked stratified fixture ---\n');

% Stratum 0 (non-referable, grades 0-1): 9 calibration points, ALL true
% grade 0, mode FIXED at grade 1 for every point (mode != true grade, so
% the v3 score is non-trivial -- unlike v2, s(mode)=0 means a "mode==true"
% fixture would trivially score 0 for everything and lose the
% order-statistic structure this fixture needs).
%
% Construction: probs = [t, m, r, r, r] with grade0=t (true, small and
% FIXED), grade1=m (mode, the TARGET score value), grades 2-4 each get
% r=(1-m-t)/3 (a "sink" split three ways so no single one exceeds m and
% steals the mode). Because mode(1) and true(0) are ADJACENT, score(0) =
% interval[0,1] - p(0) = (t+m) - t = m exactly -- the target value,
% independent of t and the sink split. t=0.01 fixed throughout.
%   rank = ceil((9+1)*(1-0.30)) = ceil(7.0) = 7  (7th of 9 smallest)
targetScores0 = [0.95 0.90 0.85 0.80 0.75 0.70 0.60 0.50 0.30];
t0 = 0.01;
p0 = zeros(9, 5);
for i = 1:9
    m = targetScores0(i);
    r = (1 - m - t0) / 3;
    p0(i, :) = [t0, m, r, r, r];
end
l0 = zeros(9, 1);   % true grade 0 for all

% Stratum 1 (referable, grades 2-4): NO calibration points at all.
% rank = ceil(1*(1-0.05)) = 1 > n_k = 0, so it SATURATES to qhat=1 --
% saturating to 1 means "unconditionally admit", the conservative
% direction, which matters most on exactly the rare/high-stakes stratum
% most likely to hit it (see conformalCalibrate.m's docstring).
calProbs2  = p0;
calLabels2 = l0;
calib2 = conformalCalibrate(calProbs2, calLabels2, ...
    struct('alphaPerStratum', [0.30 0.05]));

[n,f] = tbool(n, f, 'method is ordinal_mode_interval_stratified_v3', ...
    strcmp(calib2.method, 'ordinal_mode_interval_stratified_v3'));
[n,f] = tnum(n, f, 'n = 9', calib2.n, 9, TOL);
[n,f] = tbool(n, f, 'nCalPerStratum = [9 0]', ...
    isequal(calib2.nCalPerStratum, [9 0]), mat2str(calib2.nCalPerStratum));
[n,f] = tnum(n, f, 'stratum 0 rank = ceil(10*0.70) = 7', calib2.rankPerStratum(1), 7, TOL);
[n,f] = tnum(n, f, 'stratum 1 rank = ceil(1*0.95) = 1 (> n_k=0)', calib2.rankPerStratum(2), 1, TOL);

[n,f] = tbool(n, f, 'stratum 1 (referable) SATURATES (no calibration points, not an error)', ...
    isequal(calib2.saturatedPerStratum, logical([0 1])), ...
    mat2str(calib2.saturatedPerStratum));
[n,f] = tnum(n, f, 'a saturated stratum gets qhat = 1 (unconditionally admitted)', ...
    calib2.qhatPerStratum(2), 1, TOL);
[n,f] = tnum(n, f, 'stratum 0 qhat = 7th-smallest-of-9 = 0.85', ...
    calib2.qhatPerStratum(1), 0.85, 1e-9);

fprintf('        saturation, not an error, is the floor behaviour -- see\n');
fprintf('        conformalCalibrate.m''s docstring for why erroring here would\n');
fprintf('        make calibration fail outright on the rarest, highest-stakes stratum\n');

% ── Input validation, updated for alphaPerStratum ─────────────────────────
[n,f] = terr(n, f, 'rejects alphaPerStratum with the wrong number of entries', ...
    @() conformalCalibrate(calProbs2, calLabels2, struct('alphaPerStratum', [0.1 0.1 0.1])), 'badAlpha');
[n,f] = terr(n, f, 'rejects an alphaPerStratum entry outside (0,1)', ...
    @() conformalCalibrate(calProbs2, calLabels2, ...
        struct('alphaPerStratum', [1.5 0.1])), 'badAlpha');
[n,f] = terr(n, f, 'rejects a label/probability length mismatch', ...
    @() conformalCalibrate(calProbs2, calLabels2(1:5)), 'sizeMismatch');
[n,f] = terr(n, f, 'rejects a grade of 7', ...
    @() conformalCalibrate(calProbs2(1:9,:), [7; zeros(8,1)]), 'badLabels');

% ═══ Task 6.2: tiering ═════════════════════════════════════════════════════
fprintf('\n--- conformalTiering: the mode is always in, gaps get hulled ---\n');

% mode = grade 0 (p=0.90). Moving away from the mode toward grade 1:
% score(1) = p0 = 0.90 (mode and grade1 adjacent -- see the construction
% note above), which EXCEEDS stratum 0's threshold (qhat0 = 0.85) ->
% EXCLUDED. Grades 2-4 are stratum 1, saturated to qhat=1 -> always
% INCLUDED regardless of their own score. Raw membership is therefore
% {0, 2, 3, 4} -- grade 1 is a HOLE strictly between two included grades,
% possible because stratum 0's and stratum 1's thresholds are fit
% independently and need not agree, even though the underlying score is
% ordinal -- and the returned set must be the contiguous hull [0,4], not
% the gapped raw set.
gapProbs = [0.90 0.02 0.03 0.03 0.02];
[gapScores, gapMode] = ordinalModeIntervalScore(gapProbs);
[tGap, dGap] = conformalTiering(gapProbs, calib2);
[n,f] = tnum(n, f, 'mode is grade 0', dGap.mode, 0, TOL);
[n,f] = tnum(n, f, 'mode agrees with ordinalModeIntervalScore directly', gapMode, 0, TOL);
[n,f] = tnum(n, f, 'score(mode)=0 by construction (v3)', gapScores(1), 0, TOL);
[n,f] = tbool(n, f, 'grade 1''s raw score exceeds stratum 0''s threshold -- excluded', ...
    gapScores(2) > calib2.qhatPerStratum(1), ...
    sprintf('score=%.4f qhat0=%.4f', gapScores(2), calib2.qhatPerStratum(1)));
[n,f] = tbool(n, f, 'grade 2''s raw score is under stratum 1''s SATURATED threshold -- included', ...
    gapScores(3) <= calib2.qhatPerStratum(2) + 1e-9);
[n,f] = tbool(n, f, 'the raw set had a hole at grade 1 (contiguous == false)', ...
    dGap.contiguous == false);
[n,f] = tbool(n, f, 'the returned set is the contiguous hull {0,1,2,3,4}', ...
    isequal(dGap.predictionSet(:)', 0:4), mat2str(dGap.predictionSet));
[n,f] = tbool(n, f, 'a hulled set spanning the referable boundary -> Tier C', ...
    strcmp(tGap, 'C'), tGap);
fprintf('        the hull only ever ADDS grades -- coverage cannot decrease\n');
fprintf('        by widening a set, only the guarantee''s tightness does\n');

% The mode is a member even when every other grade would otherwise exclude
% it -- "the model must be allowed to believe itself" (conformalTiering.m).
% With score v3, s(mode)=0 by construction, so this is trivially satisfied,
% but is still checked as a regression guard on the membership-building code.
modeAlwaysProbs = [0.02 0.02 0.02 0.02 0.92];   % mode = grade 4
[~, dMode] = conformalTiering(modeAlwaysProbs, calib2);
[n,f] = tbool(n, f, 'the mode (grade 4) is always a member of its own set', ...
    ismember(4, dMode.predictionSet));

% ── Overrides, and the real fitted calibration for a clean Tier A/B split ──
% calib2's stratum 1 is saturated to qhat=1, which (by the same "always
% included" logic just tested) makes Tier A unreachable from it -- a
% saturated referable stratum always drags the hull up to include referable
% grades. The models/calibration_v1.json calibration ACTUALLY fitted for
% branchA_v1 is not saturated this way, so it is used here for the override
% tests, which need a genuine Tier A case to downgrade or force away from.
fprintf('\n--- what overrides the guarantee (real calibration_v1.json) ---\n');
mlRoot = fullfile(thisDir, '..');
calibPath = fullfile(mlRoot, 'models', 'calibration_v1.json');
if isfile(calibPath)
    realCalib = jsondecode(fileread(calibPath));
    autoClearProbs = [1 0 0 0 0];   % onehot grade 0 -> Tier A, see
                                     % tests/conformal_golden_vectors.json

    [tA0, dA0] = conformalTiering(autoClearProbs, realCalib);
    [n,f] = tbool(n, f, 'a one-hot grade-0 case is Tier A under the real calibration', ...
        strcmp(tA0, 'A'), tA0);

    [tD, dD] = conformalTiering(autoClearProbs, realCalib, struct('branchAgreement', false));
    [n,f] = tbool(n, f, 'branch disagreement forces C over an otherwise Tier-A set', ...
        strcmp(tD, 'C'), tD);
    [n,f] = tbool(n, f, 'and says why', contains(dD.reason, 'branch disagreement'));

    tNull = conformalTiering(autoClearProbs, realCalib, struct('branchAgreement', []));
    [n,f] = tbool(n, f, 'a NULL branchAgreement does NOT force C (Branch B has not run)', ...
        strcmp(tNull, 'A'), tNull);
    fprintf('        treating null as disagreement would push every case to Tier C\n');
    fprintf('        and drown the review queue -- Branch B needs Phase 4 counts\n');

    tQ = conformalTiering(autoClearProbs, realCalib, struct('qualityForced', true));
    [n,f] = tbool(n, f, 'a force-flagged poor capture forces C', strcmp(tQ, 'C'), tQ);

    % High epistemic uncertainty withholds the auto-clear but does not force C:
    % one extra review is cheap, a missed referral is not.
    tU = conformalTiering(autoClearProbs, realCalib, struct('uncertainty', 0.8));
    [n,f] = tbool(n, f, 'high MC-Dropout uncertainty downgrades A to B, not to C', ...
        strcmp(tU, 'B'), tU);
    tU2 = conformalTiering(autoClearProbs, realCalib, struct('uncertainty', 0.1));
    [n,f] = tbool(n, f, 'low uncertainty leaves Tier A intact', strcmp(tU2, 'A'), tU2);
else
    fprintf('  SKIP  models/calibration_v1.json not present -- override tests need a real fit\n');
end

[n,f] = terr(n, f, 'refuses to assign a tier with no calibration struct', ...
    @() conformalTiering(gapProbs, struct()), 'noCalibration');
fprintf('        a tier assigned without a calibration would carry the authority\n');
fprintf('        of a conformal guarantee while being a bare threshold\n');
[n,f] = terr(n, f, 'refuses a calibration whose qhatPerStratum is the wrong length', ...
    @() conformalTiering(gapProbs, struct('qhatPerStratum', [1 1 1], 'stratumOf', [0 0 1 1 1], ...
        'referableThreshold', 0.5)), 'badCalibration');

% ── The guarantee must describe its own scope ─────────────────────────────
[n,f] = tbool(n, f, 'the calibration records that coverage is stratum-conditional, not per-case', ...
    contains(calib2.guaranteeScope, 'not conditional'));
[n,f] = tbool(n, f, 'and that it does not survive camera or site shift', ...
    contains(calib2.guaranteeScope, 'shift'));

fprintf('\n===== %d checks, %d failed =====\n', n, f);
if f > 0
    error('testCalibrationPhase6:failed', '%d check(s) failed.', f);
end
end

% ── Helpers ────────────────────────────────────────────────────────────────
function r = normaliseRow(r)
r = r / sum(r);
end

function [n, f] = tnum(n, f, label, actual, expected, tol)
n = n + 1;
if abs(actual - expected) <= tol
    fprintf('  PASS  %s\n', label);
else
    fprintf('  FAIL  %s  (expected %.10g, got %.10g)\n', label, expected, actual);
    f = f + 1;
end
end

function [n, f] = tbool(n, f, label, cond, detail)
n = n + 1;
if cond
    fprintf('  PASS  %s\n', label);
else
    fprintf('  FAIL  %s\n', label);
    if nargin > 4, fprintf('        %s\n', string(detail)); end
    f = f + 1;
end
end

function [n, f] = terr(n, f, label, fn, idFragment)
n = n + 1;
try
    fn();
    fprintf('  FAIL  %s  (no error raised)\n', label);
    f = f + 1;
catch err
    if contains(err.identifier, idFragment)
        fprintf('  PASS  %s\n', label);
    else
        fprintf('  FAIL  %s  (wrong error: %s)\n', label, err.identifier);
        f = f + 1;
    end
end
end
