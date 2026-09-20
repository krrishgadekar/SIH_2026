function testConformalV2()
% TESTCONFORMALV2  Golden-vector and property tests for conformal policy v3
% (score v3, referable-stratified Mondrian, referable-threshold safety
% gate; conformalCalibrate.m / conformalTiering.m), method
% 'ordinal_mode_interval_stratified_v3'.
%
%   Run: matlab -batch "addpath('tests'); testConformalV2"
%
%   Part 1 reproduces every case in conformal_golden_vectors.json (generated
%   against models/calibration_branchA_v2a.json -- v2a, the model behind the
%   switch this policy round is for) exactly. test_conformal_v2.py
%   reproduces the SAME cases in Python -- together these are what verifies
%   conformalTiering.m and branchAInfer.py's assign_tier() have not drifted
%   apart, since both are checked against one MATLAB-generated ground truth.
%
%   Part 2 is a property test over 10,000 random points on the probability
%   simplex (uniform, i.e. Dirichlet(1,1,1,1,1), sampled via the standard
%   stick-breaking/order-statistics construction so it needs no toolbox):
%   for every one, the returned prediction set must be (a) contiguous,
%   (b) contain the mode, and (c) never be Tier A when
%   P(g>=2) >= referableThreshold. The matching Python property test
%   (test_conformal_v2.py) draws its own 10,000 points independently -- the
%   two do not need to share random draws, only to both satisfy the
%   invariant on their own draws.
%
%   Part 3 is a STANDALONE synthetic unit test of the referable-threshold
%   demotion logic against a hand-built calibration struct, not the real
%   deployed one. Why: the demotion can only trigger from a Tier-A-eligible
%   case (mode in {0,1}), which requires P(g>=2) < 1-qhatPerStratum
%   (referable) -- with the REAL fitted numbers (qhat ~0.87-0.88), that
%   forces P(g>=2) < ~0.12-0.13, comfortably below referableThreshold
%   (~0.23-0.32). Checked empirically too: 0/531 real v2a Tier-A cases ever
%   reach the demotion condition. So the golden vectors (real calibration)
%   structurally cannot exercise this branch -- it is unit-tested here in
%   isolation instead, against a calibration deliberately built to make it
%   reachable.

thisDir = fileparts(mfilename('fullpath'));
mlRoot  = fullfile(thisDir, '..');
addpath(fullfile(mlRoot, 'calibration'));

calib = jsondecode(fileread(fullfile(mlRoot, 'models', 'calibration_branchA_v2a.json')));
if ~strcmp(calib.method, 'ordinal_mode_interval_stratified_v3')
    error('testConformalV2:wrongMethod', ...
          'models/calibration_branchA_v2a.json is not the expected method.');
end

golden = jsondecode(fileread(fullfile(thisDir, 'conformal_golden_vectors.json')));

fprintf('\n===== Conformal v3: golden vectors (%d cases) =====\n', numel(golden.cases));
n = 0; f = 0;

for i = 1:numel(golden.cases)
    % jsondecode turns a JSON array of same-shaped objects into a struct
    % array (indexed with parens); it only falls back to a cell array when
    % the objects' field sets differ. Handle both since that choice is an
    % implementation detail of jsondecode, not something to depend on.
    if iscell(golden.cases)
        tc = golden.cases{i};
    else
        tc = golden.cases(i);
    end
    probs = tc.probs(:)';
    exp_ = tc.expected;

    [tier, details] = conformalTiering(probs, calib);

    ok = strcmp(tier, exp_.tier) ...
      && isequal(details.predictionSet(:)', toRow(exp_.predictionSet)) ...
      && details.low == exp_.low ...
      && details.high == exp_.high ...
      && details.setSize == exp_.setSize ...
      && details.contiguous == exp_.contiguous ...
      && details.mode == exp_.mode ...
      && abs(details.pReferable - exp_.pReferable) < 1e-9;

    n = n + 1;
    if ok
        fprintf('  PASS  %s\n', tc.id);
    else
        f = f + 1;
        fprintf('  FAIL  %s\n', tc.id);
        fprintf('        expected tier=%s set=%s low=%d high=%d contiguous=%d mode=%d pRef=%.6f\n', ...
            exp_.tier, mat2str(toRow(exp_.predictionSet)), exp_.low, exp_.high, ...
            exp_.contiguous, exp_.mode, exp_.pReferable);
        fprintf('        got      tier=%s set=%s low=%d high=%d contiguous=%d mode=%d pRef=%.6f\n', ...
            tier, mat2str(details.predictionSet(:)'), details.low, details.high, ...
            details.contiguous, details.mode, details.pReferable);
    end
end
fprintf('----- %d/%d golden cases passed -----\n', n - f, n);

fprintf('\n===== Conformal v3: property test (10,000 random simplex points) =====\n');
rng(0);
NTRIALS = 10000;
propFail = 0;
for i = 1:NTRIALS
    u = sort(rand(1, 4));
    p = diff([0, u, 1]);   % uniform (Dirichlet(1,1,1,1,1)) point on the 5-simplex

    [tier, details] = conformalTiering(p, calib);
    expectedHull = details.low:details.high;
    isContig = isequal(details.predictionSet(:)', expectedHull);
    containsMode = details.mode >= details.low && details.mode <= details.high;
    neverAutoClearAboveThreshold = ~(strcmp(tier, 'A') && details.pReferable >= calib.referableThreshold);

    if ~(isContig && containsMode && neverAutoClearAboveThreshold)
        propFail = propFail + 1;
        if propFail <= 5
            fprintf('  FAIL  trial %d: p=%s -> tier=%s set=%s mode=%d pRef=%.4f\n', ...
                i, mat2str(p), tier, mat2str(details.predictionSet(:)'), details.mode, details.pReferable);
        end
    end
end
fprintf('----- %d/%d random points: contiguous, contain the mode, never Tier A above referableThreshold -----\n', ...
    NTRIALS - propFail, NTRIALS);

fprintf('\n===== Conformal v3: standalone referable-threshold demotion unit test =====\n');
% Hand-built calibration where the demotion IS reachable (see header): a
% much smaller referable-stratum qhat than the real fitted one, so a
% mode-0 case can clear the Tier-A set-boundary test AND still have
% P(g>=2) >= referableThreshold.
synthCalib = struct( ...
    'method', 'ordinal_mode_interval_stratified_v3', ...
    'stratumOf', [0 0 1 1 1], ...
    'qhatPerStratum', [1.0, 0.3], ...   % referable stratum qhat = 0.3, deliberately small
    'referableThreshold', 0.2, ...
    'referableTargetSensitivity', 0.05, ...
    'referableFrom', 2);

demoTests = { ...
    ... id, probs, expectTier, expectDemoted
    {'demotion_fires', [0.65 0.10 0.15 0.05 0.05], 'B', true}, ...    % s(2)=p0+p1=0.75>0.3 -> hi<2 eligible; pRef=0.25>=0.2 -> demoted
    {'demotion_does_not_fire_below_threshold', [0.65 0.30 0.03 0.01 0.01], 'A', false} ... % pRef=0.05<0.2 -> stays A
};
demoFail = 0;
for i = 1:numel(demoTests)
    tc = demoTests{i};
    [tier, details] = conformalTiering(tc{2}, synthCalib);
    ok = strcmp(tier, tc{3});
    if ~ok
        demoFail = demoFail + 1;
        fprintf('  FAIL  %s: expected tier=%s got tier=%s (pRef=%.4f, low=%d, high=%d)\n', ...
            tc{1}, tc{3}, tier, details.pReferable, details.low, details.high);
    else
        fprintf('  PASS  %s: tier=%s pRef=%.4f (demoted=%d)\n', tc{1}, tier, details.pReferable, tc{4});
    end
end
fprintf('----- %d/%d synthetic demotion cases passed -----\n', numel(demoTests) - demoFail, numel(demoTests));

totalFail = f + propFail + demoFail;
fprintf('\n===== %d golden failures, %d property failures, %d demotion-unit failures =====\n', ...
    f, propFail, demoFail);
if totalFail > 0
    error('testConformalV2:failed', '%d check(s) failed.', totalFail);
end
end

function r = toRow(v)
if iscell(v), v = cell2mat(v); end
r = double(v(:))';
end
