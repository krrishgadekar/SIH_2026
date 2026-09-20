function report = calibrateBranchA(valLogits, valLabels, testLogits, testLabels, modelVersion, imgSize, opts)
% CALIBRATEBRANCHA  Fit and persist the conformal-policy-v3 calibration for
% Branch A (Model1), for ANY model version, in one command.
%
%   report = calibrateBranchA(valLogits, valLabels, testLogits, testLabels, modelVersion, imgSize)
%   report = calibrateBranchA(valLogits, valLabels, testLogits, testLabels, modelVersion, imgSize, opts)
%
%   Inputs:
%     valLogits, valLabels, testLogits, testLabels - raw pre-softmax logits
%                (Nx5) and integer grades 0-4 (Nx1) for the val and test
%                splits. Arrays in, not file paths -- refitCalibration.m is
%                the thin CSV-loading wrapper that makes this ONE command
%                from the shell; this function itself never touches a file
%                path for its inputs.
%     modelVersion - e.g. 'branchA_v1', 'branchA_v2a'. Written into the JSON
%                and used to pick the output filename (calibration_v1.json
%                for 'branchA_v1', calibration_<modelVersion>.json
%                otherwise -- matches branchAInfer.py's
%                BRANCH_A_MODEL_VERSIONS table exactly; the two must agree
%                on filenames or a re-fit silently writes a file nothing
%                reads).
%     imgSize    - REQUIRED, no default. The checkpoint's own img_size (e.g.
%                384 for v1, 512 for v2a). Written as trainedImgSize so the
%                loaders can refuse a mismatched model.
%     opts:
%       .alphaPerStratum  [0.30 0.05]  - conformal miscoverage, per REFERABLE
%                STRATUM (index 1 = non-referable grades 0-1, index 2 =
%                referable grades 2-4). Passed to conformalCalibrate.m.
%       .referableTargetSensitivity  0.05  - referableThreshold fit target
%                (default targets 95% referable sensitivity).
%       .quiet   false
%
%   ── POLICY v3: WHY POOLED VAL+TEST, NOT VAL-ONLY (protocol change) ─────────
%   The previous protocol (score v2) fitted temperature + qhat on val ONLY
%   and evaluated on test, which nothing was fitted on. That is the more
%   textbook-correct split discipline, but a cross-fit study
%   (experiments/conformalPolicySweep.py, conformalPolicySweep2.py) showed it
%   is NOT trustworthy at the per-stratum/per-grade n a single val split
%   gives (v1's grade 3 calibration fold: n=43) -- coverage measured on a
%   single held-out test split swung meaningfully from the fitted target.
%   Pooling val+test for the FINAL fit (more calibration data = a more
%   stable quantile) and validating the fitting PROCEDURE itself via
%   cross-fitting (10 repeats x 5-fold, refit inside every fold -- a
%   SEPARATE process, experiments/*CrossFitValidation*.py, not this
%   function) is the protocol this calibration is fitted and reported under.
%   calibrationProtocol in the written JSON says so explicitly, and there is
%   deliberately no more a "held-out test evaluation" section in this
%   function's own report -- test is now part of the fitting pool, and
%   reporting a number "on test" here would silently be the same mistake the
%   old marginal-LAC method's fitted-and-scored-on-the-same-data critique
%   was about. The genuinely-out-of-sample numbers live in the cross-fit
%   validation output, not here.
%
%   ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
%   It does not train, retrain, or modify the network in any way. Temperature
%   scaling fits ONE scalar on frozen predictions; conformal calibration
%   computes quantiles of them. Both are post-hoc: the model's weights and
%   its argmax decisions are untouched, and the confusion matrix is
%   identical before and after.

if nargin < 7, opts = struct(); end
alphaPerStratum = getdef(opts, 'alphaPerStratum', [0.30 0.05]);
refTargetSens   = getdef(opts, 'referableTargetSensitivity', 0.05);
quiet           = getdef(opts, 'quiet', false);

if nargin < 6 || isempty(imgSize)
    error('calibrateBranchA:imgSizeRequired', ...
        ['imgSize is required -- pass the checkpoint''s own img_size (e.g. 384 ' ...
         'for v1, 512 for v2a). No default is given on purpose: guessing wrong ' ...
         'here is exactly the failure mode this field exists to prevent -- see ' ...
         'the written JSON''s trainedImgSize and branchAInfer.py''s ' ...
         'load_calibration().']);
end
if nargin < 5 || isempty(modelVersion)
    error('calibrateBranchA:modelVersionRequired', 'modelVersion is required (e.g. ''branchA_v1'').');
end

thisDir   = fileparts(mfilename('fullpath'));
modelsDir = fullfile(thisDir, 'models');
addpath(fullfile(thisDir, 'calibration'));

valLogits = double(valLogits); valLabels = double(valLabels(:));
testLogits = double(testLogits); testLabels = double(testLabels(:));
if size(valLogits,1) ~= numel(valLabels)
    error('calibrateBranchA:sizeMismatch', 'val: %d logit rows but %d labels.', size(valLogits,1), numel(valLabels));
end
if size(testLogits,1) ~= numel(testLabels)
    error('calibrateBranchA:sizeMismatch', 'test: %d logit rows but %d labels.', size(testLogits,1), numel(testLabels));
end

% ── Pool val+test for fitting (see protocol note above) ────────────────────
poolLogits = [valLogits; testLogits];
poolLabels = [valLabels; testLabels];
report.n = struct('val', numel(valLabels), 'test', numel(testLabels), 'pooled', numel(poolLabels));

% ── Temperature, fitted on the POOL ─────────────────────────────────────────
% Minimise negative log-likelihood of softmax(logits/T) against the labels.
% Golden-section over log(T): one dimension, smooth, log space keeps T
% positive by construction. Identical algorithm to the previous (val-only)
% fit -- only the data it is fitted on changed.
nll = @(logT) meanNLL(poolLogits, poolLabels, exp(logT));
phi = (sqrt(5) - 1) / 2;
a = log(0.05); b = log(20);
c = b - phi*(b-a); d = a + phi*(b-a);
fc = nll(c); fd = nll(d);
for it = 1:200
    if fc < fd
        b = d; d = c; fd = fc; c = b - phi*(b-a); fc = nll(c);
    else
        a = c; c = d; fc = fd; d = a + phi*(b-a); fd = nll(d);
    end
    if (b-a) < 1e-10, break; end
end
T = exp((a+b)/2);

report.temperature = T;
report.nllBefore = meanNLL(poolLogits, poolLabels, 1);
report.nllAfter  = meanNLL(poolLogits, poolLabels, T);

poolProbs = softmaxRows(poolLogits / T);

% ── Conformal quantile + referable threshold, also on the pool ─────────────
calib = conformalCalibrate(poolProbs, poolLabels, ...
    struct('alphaPerStratum', alphaPerStratum, 'referableTargetSensitivity', refTargetSens));
report.conformal = calib;

% ── Persist ──────────────────────────────────────────────────────────────────
calJson = struct( ...
    'method',                     'ordinal_mode_interval_stratified_v3', ...
    'modelVersion',               modelVersion, ...
    'trainedImgSize',             imgSize, ...
    'temperature',                T, ...
    'stratumOf',                  calib.stratumOf, ...
    'qhatPerStratum',             calib.qhatPerStratum, ...
    'alphaPerStratum',            calib.alphaPerStratum, ...
    'nCalPerStratum',             calib.nCalPerStratum, ...
    'referableThreshold',         calib.referableThreshold, ...
    'referableTargetSensitivity', calib.referableTargetSensitivity, ...
    'referableFrom',              2, ...
    'fittedOn',                   sprintf('pooled val+test, n=%d (val=%d, test=%d)', ...
                                          report.n.pooled, report.n.val, report.n.test), ...
    'fittedAt',                   char(datetime('now','TimeZone','UTC','Format','yyyy-MM-dd''T''HH:mm:ss''Z''')), ...
    'calibrationProtocol',        'pooled val+test; validated by cross-fitting', ...
    'note', ['fitted by calibrateBranchA.m (score v3, referable-stratified Mondrian). ' ...
             'Do not hand-edit: temperature, qhatPerStratum and referableThreshold come ' ...
             'from one fit on one pool and are only jointly meaningful. Replaces the ' ...
             'v2 per-class schema (ordinal_mode_interval_mondrian_v2, qhatPerClass) -- ' ...
             'both loaders (branchAInfer.py, branchAInferMatlab.m) refuse a file whose ' ...
             'method differs, including v2 and the archived marginal-LAC schema.']);

jsonPath = fullfile(modelsDir, calibFilenameFor(modelVersion));
fid = fopen(jsonPath, 'w');
if fid == -1, error('calibrateBranchA:writeFailed', 'Could not write %s', jsonPath); end
fprintf(fid, '%s', jsonencode(calJson, 'PrettyPrint', true));
fclose(fid);
report.calibrationJson = jsonPath;

% ── Tier distribution the boundaries produce, ON THE FITTING POOL ──────────
% Labelled "seen-by-fit" deliberately -- there is no held-out split left in
% this function under the pooled protocol (see header). This is a fit-
% sanity diagnostic, not a generalisation claim; the cross-fit validation
% script is where the out-of-sample numbers come from.
tiers = repmat(' ', numel(poolLabels), 1);
pRef = zeros(numel(poolLabels), 1);
for i = 1:numel(poolLabels)
    [tiers(i), d] = conformalTiering(poolProbs(i, :), calib);
    pRef(i) = d.pReferable;
end
report.tierCountsSeenByFit = struct('A', sum(tiers=='A'), 'B', sum(tiers=='B'), 'C', sum(tiers=='C'));

refTrue = poolLabels >= 2;
isA = (tiers == 'A');
report.tierASeenByFit = struct( ...
    'count', sum(isA), ...
    'referableMissed', sum(isA & refTrue), ...
    'missRate', safeDiv(sum(isA & refTrue), sum(isA)));

if ~quiet, printReport(report, modelVersion, imgSize); end
end

% ═══════════════════════════════════════════════════════════════════════════
function fname = calibFilenameFor(modelVersion)
% Matches inference/branchAInfer.py's BRANCH_A_MODEL_VERSIONS table exactly.
if strcmp(modelVersion, 'branchA_v1')
    fname = 'calibration_v1.json';
else
    fname = sprintf('calibration_%s.json', modelVersion);
end
end

function v = meanNLL(logits, labels, T)
s = logits / T;
s = s - max(s, [], 2);
logZ = log(sum(exp(s), 2));
idx = sub2ind(size(logits), (1:numel(labels))', double(labels(:)) + 1);
v = -mean(s(idx) - logZ);
end

function p = softmaxRows(s)
s = s - max(s, [], 2);
e = exp(s);
p = e ./ sum(e, 2);
end

function r = safeDiv(a, b)
if b == 0, r = NaN; else, r = a / b; end
end

function printReport(r, modelVersion, imgSize)
fprintf('\n=================================================================\n');
fprintf('  BRANCH A CALIBRATION -- %s (imgSize=%d)\n', modelVersion, imgSize);
fprintf('  fitted on POOLED val+test (n=%d = %d val + %d test)\n', r.n.pooled, r.n.val, r.n.test);
fprintf('=================================================================\n');

fprintf('\n--- temperature scaling ---\n');
fprintf('T                    : %.4f\n', r.temperature);
fprintf('pooled NLL           : %.4f -> %.4f\n', r.nllBefore, r.nllAfter);
fprintf('T > 1 means the model was OVERCONFIDENT and is being softened.\n');

fprintf('\n--- conformal (ordinal_mode_interval_stratified_v3) ---\n');
fprintf('stratum        alpha   n_cal   qhat      coverage-on-pool   saturated\n');
c = r.conformal;
names = {'non-referable(0-1)', 'referable(2-4)'};
for s = 1:2
    cov = c.empiricalCoverageOnCalibrationPoolPerStratum(s);
    if isnan(cov), covStr = '     n/a'; else, covStr = sprintf('%8.4f', cov); end
    fprintf('  %-18s  %5.2f   %5d   %7.4f   %s        %d\n', ...
        names{s}, c.alphaPerStratum(s), c.nCalPerStratum(s), c.qhatPerStratum(s), ...
        covStr, c.saturatedPerStratum(s));
end
fprintf('\nreferableThreshold   : %.4f  (target %.0f%% referable sensitivity, n_ref=%d, rank=%d%s)\n', ...
    c.referableThreshold, 100*(1-c.referableTargetSensitivity), c.nCalReferable, c.rankReferable, ...
    ternaryStr(c.referableThresholdSaturated, ', SATURATED', ''));

fprintf('\ntier split, SEEN-BY-FIT (pooled data; not a held-out claim):  A %d   B %d   C %d\n', ...
        r.tierCountsSeenByFit.A, r.tierCountsSeenByFit.B, r.tierCountsSeenByFit.C);
fprintf('Of the %d Tier A (seen-by-fit), %d were actually referable (%.2f%%).\n', ...
        r.tierASeenByFit.count, r.tierASeenByFit.referableMissed, 100*r.tierASeenByFit.missRate);
fprintf('This is a fit-sanity diagnostic on data the thresholds were fitted from,\n');
fprintf('NOT a generalisation claim -- see the cross-fit validation report for that.\n');

fprintf('\nwritten to %s\n', r.calibrationJson);
fprintf('=================================================================\n');
end

function s = ternaryStr(cond, a, b)
if cond, s = a; else, s = b; end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
