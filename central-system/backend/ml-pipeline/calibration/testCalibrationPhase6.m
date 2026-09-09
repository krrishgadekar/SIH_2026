function testCalibrationPhase6()
% TESTCALIBRATIONPHASE6  Unit tests for Tasks 6.1 and 6.2.
%
%   Run: matlab -batch "testCalibrationPhase6"
%
%   The conformal fixtures are built so every threshold is computable by hand:
%
%     n = 9 calibration points, alpha = 0.10
%     rank = ceil((n+1)(1-alpha)) = ceil(10 * 0.9) = 9
%     true-class probabilities  [0.95 0.90 0.85 0.80 0.75 0.70 0.60 0.50 0.30]
%     nonconformity 1-p         [0.05 0.10 0.15 0.20 0.25 0.30 0.40 0.50 0.70]
%     qhat = 9th smallest = 0.70   ->   probThreshold = 1 - 0.70 = 0.30
%
%   Every tiering case below is then read straight off that 0.30 threshold.

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

% ═══ Task 6.2: conformal calibration ═══════════════════════════════════════
fprintf('\n--- conformalCalibrate: the hand-worked fixture ---\n');

trueP = [0.95 0.90 0.85 0.80 0.75 0.70 0.60 0.50 0.30];
[calProbs, calLabels] = buildCalibrationSet(trueP);
calib = conformalCalibrate(calProbs, calLabels, struct('alpha', 0.10));

[n,f] = tnum(n, f, 'n = 9', calib.n, 9, TOL);
[n,f] = tnum(n, f, 'rank = ceil(10 * 0.9) = 9', calib.rank, 9, TOL);
[n,f] = tnum(n, f, 'qhat = 9th smallest nonconformity = 0.70', calib.qhat, 0.70, 1e-12);
[n,f] = tnum(n, f, 'probThreshold = 1 - qhat = 0.30', calib.probThreshold, 0.30, 1e-12);
[n,f] = tnum(n, f, 'coverage target is 0.90', calib.coverage, 0.90, TOL);

% ── The finite-sample floor ───────────────────────────────────────────────
fprintf('\n--- the finite-sample floor is enforced, not clamped ---\n');
[p8, l8] = buildCalibrationSet(trueP(1:8));
[n,f] = terr(n, f, 'alpha=0.10 with n=8 is refused (needs 9)', ...
    @() conformalCalibrate(p8, l8, struct('alpha', 0.10)), 'tooFewCalibrationPoints');

[p18, l18] = buildCalibrationSet(linspace(0.95, 0.30, 18));
[n,f] = terr(n, f, 'alpha=0.05 with n=18 is refused (needs 19)', ...
    @() conformalCalibrate(p18, l18, struct('alpha', 0.05)), 'tooFewCalibrationPoints');
[p19, l19] = buildCalibrationSet(linspace(0.95, 0.30, 19));
c19 = conformalCalibrate(p19, l19, struct('alpha', 0.05));
[n,f] = tnum(n, f, 'alpha=0.05 with n=19 succeeds (rank 19 of 19)', c19.rank, 19, TOL);
fprintf('        below the floor the required order statistic does not exist;\n');
fprintf('        clamping to the max score would return a threshold that\n');
fprintf('        guarantees nothing while looking calibrated\n');

[n,f] = terr(n, f, 'rejects alpha outside (0,1)', ...
    @() conformalCalibrate(calProbs, calLabels, struct('alpha', 1.5)), 'badAlpha');
[n,f] = terr(n, f, 'rejects a label/probability length mismatch', ...
    @() conformalCalibrate(calProbs, calLabels(1:5)), 'sizeMismatch');
[n,f] = terr(n, f, 'rejects a grade of 7', ...
    @() conformalCalibrate(calProbs, [7 0 0 0 0 0 0 0 0]'), 'badLabels');

% ── Coverage actually holds on the calibration fold ───────────────────────
% Coverage on the fitting fold is EXACTLY rank/n -- qhat is the rank-th
% smallest score, so exactly that many points satisfy s_i <= qhat. Asserting
% the identity catches the floating-point boundary bug that comparing
% p >= 1-qhat introduced: 1 - 0.70 is 0.30000000000000004, which excluded the
% very point that produced qhat and quietly under-covered by 1/n.
[n,f] = tnum(n, f, 'coverage on the fitting fold is exactly rank/n = 9/9', ...
    calib.empiricalCoverageOnCalibrationFold, 9/9, 1e-12);
[n,f] = tbool(n, f, 'and it meets the 1-alpha guarantee', ...
    calib.empiricalCoverageOnCalibrationFold >= 0.90 - 1e-12, ...
    calib.empiricalCoverageOnCalibrationFold);

% The same identity at a different alpha, where rank/n (7/9 = 0.778) is nowhere
% near 1-alpha (0.70). That gap is the finite-sample correction working, not an
% error -- at n=9 coverage can only move in steps of 1/9, so 0.70 is not an
% attainable value and a tolerance-based check on 1-alpha would misfire here.
calibA30 = conformalCalibrate(calProbs, calLabels, struct('alpha', 0.30));
[n,f] = tnum(n, f, 'at alpha=0.30, rank = 7 and coverage is exactly 7/9', ...
    calibA30.empiricalCoverageOnCalibrationFold, 7/9, 1e-12);
[n,f] = tbool(n, f, 'still at or above the 1-alpha guarantee', ...
    calibA30.empiricalCoverageOnCalibrationFold >= 0.70 - 1e-12);

% The boundary case itself: the calibration point whose score IS qhat must be
% inside its own prediction set.
boundaryProbs = zeros(1, 5); boundaryProbs(1) = 0.30; boundaryProbs(2:5) = 0.175;
[~, dBoundary] = conformalTiering(boundaryProbs, calib);
[n,f] = tbool(n, f, 'a case sitting exactly on qhat is INSIDE the set', ...
    ismember(0, dBoundary.predictionSet), mat2str(dBoundary.predictionSet));

% Larger alpha must give a LOOSER threshold (smaller sets, fewer guarantees).
calibLoose = conformalCalibrate(calProbs, calLabels, struct('alpha', 0.30));
[n,f] = tbool(n, f, 'a larger alpha raises the probability threshold', ...
    calibLoose.probThreshold > calib.probThreshold, ...
    sprintf('%.3f vs %.3f', calibLoose.probThreshold, calib.probThreshold));

% ═══ Task 6.2: tiering ═════════════════════════════════════════════════════
fprintf('\n--- conformalTiering, read off the 0.30 threshold ---\n');

% {0,1} -- both non-referable -> Tier A (the NPV guarantee)
[tA, dA] = conformalTiering([0.60 0.35 0.03 0.01 0.01], calib);
[n,f] = tbool(n, f, 'set {0,1} -> Tier A (auto-clear)', strcmp(tA, 'A'), tA);
[n,f] = tbool(n, f, 'and the set is exactly {0,1}', isequal(dA.predictionSet(:)', [0 1]), ...
    mat2str(dA.predictionSet));

% {2,3} -- both referable -> Tier B (the PPV side)
[tB, dB] = conformalTiering([0.05 0.05 0.50 0.35 0.05], calib);
[n,f] = tbool(n, f, 'set {2,3} -> Tier B (assisted review)', strcmp(tB, 'B'), tB);
[n,f] = tbool(n, f, 'and the set is exactly {2,3}', isequal(dB.predictionSet(:)', [2 3]));

% {0,2} -- spans the referable boundary -> Tier C
[tC, dC] = conformalTiering([0.40 0.05 0.35 0.10 0.10], calib);
[n,f] = tbool(n, f, 'a set spanning the referable boundary -> Tier C', strcmp(tC, 'C'), tC);
[n,f] = tbool(n, f, 'and the reason says the data does not separate them', ...
    contains(dC.reason, 'does not separate'));

% Empty set -- nothing cleared the threshold. Out-of-distribution, not merely
% uncertain, and a plain threshold rule cannot express this state at all.
[tE, dE] = conformalTiering([0.25 0.25 0.20 0.20 0.10], calib);
[n,f] = tbool(n, f, 'an empty prediction set -> Tier C', strcmp(tE, 'C'), tE);
[n,f] = tnum(n, f, 'and the set really is empty', dE.setSize, 0, TOL);
[n,f] = tbool(n, f, 'reported as out-of-distribution, not as low confidence', ...
    contains(dE.reason, 'out-of-distribution'));
fprintf('        a threshold rule always returns some confident-looking grade;\n');
fprintf('        only a set-valued predictor can say "none of these"\n');

% ── Overrides ─────────────────────────────────────────────────────────────
fprintf('\n--- what overrides the guarantee ---\n');
autoClearProbs = [0.60 0.35 0.03 0.01 0.01];

[tD, dD] = conformalTiering(autoClearProbs, calib, struct('branchAgreement', false));
[n,f] = tbool(n, f, 'branch disagreement forces C over an otherwise Tier-A set', ...
    strcmp(tD, 'C'), tD);
[n,f] = tbool(n, f, 'and says why', contains(dD.reason, 'branch disagreement'));

tNull = conformalTiering(autoClearProbs, calib, struct('branchAgreement', []));
[n,f] = tbool(n, f, 'a NULL branchAgreement does NOT force C (Branch B has not run)', ...
    strcmp(tNull, 'A'), tNull);
fprintf('        treating null as disagreement would push every case to Tier C\n');
fprintf('        and drown the review queue -- Branch B needs Phase 4 counts\n');

tQ = conformalTiering(autoClearProbs, calib, struct('qualityForced', true));
[n,f] = tbool(n, f, 'a force-flagged poor capture forces C', strcmp(tQ, 'C'), tQ);

% High epistemic uncertainty withholds the auto-clear but does not force C:
% one extra review is cheap, a missed referral is not.
tU = conformalTiering(autoClearProbs, calib, struct('uncertainty', 0.8));
[n,f] = tbool(n, f, 'high MC-Dropout uncertainty downgrades A to B, not to C', ...
    strcmp(tU, 'B'), tU);
tU2 = conformalTiering(autoClearProbs, calib, struct('uncertainty', 0.1));
[n,f] = tbool(n, f, 'low uncertainty leaves Tier A intact', strcmp(tU2, 'A'), tU2);

[n,f] = terr(n, f, 'refuses to assign a tier with no calibration struct', ...
    @() conformalTiering(autoClearProbs, struct()), 'noCalibration');
fprintf('        a tier assigned without a calibration would carry the authority\n');
fprintf('        of a conformal guarantee while being a bare threshold\n');

% ── The guarantee must describe its own scope ─────────────────────────────
[n,f] = tbool(n, f, 'the calibration records that coverage is marginal, not per-case', ...
    contains(calib.guaranteeScope, 'not conditional'));
[n,f] = tbool(n, f, 'and that it does not survive camera or site shift', ...
    contains(calib.guaranteeScope, 'shift'));

fprintf('\n===== %d checks, %d failed =====\n', n, f);
fprintf(['NOTE: no conformal calibration has been FITTED. Branch A is an\n' ...
         'untrained stub and no labelled calibration fold exists, so\n' ...
         'gradingOrchestrator still uses its placeholder threshold rule.\n' ...
         'What is verified here is the arithmetic and the tier logic.\n']);
if f > 0
    error('testCalibrationPhase6:failed', '%d check(s) failed.', f);
end
end

% ── Helpers ────────────────────────────────────────────────────────────────
function [probs, labels] = buildCalibrationSet(trueClassProbs)
% N rows whose TRUE-class probability is the given value, the remainder spread
% evenly. Lets a test say "the model gave the right answer 0.85" directly.
N = numel(trueClassProbs);
probs = zeros(N, 5);
labels = zeros(N, 1);
for i = 1:N
    g = mod(i - 1, 5);                 % cycle through the grades
    labels(i) = g;
    rest = (1 - trueClassProbs(i)) / 4;
    probs(i, :) = rest;
    probs(i, g + 1) = trueClassProbs(i);
end
end

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
