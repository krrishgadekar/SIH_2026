function report = calibrateBranchA(opts)
% CALIBRATEBRANCHA  Fit and persist the calibration for Branch A (Model1).
%
%   report = calibrateBranchA()
%   report = calibrateBranchA(opts)
%
%   opts:
%     .alpha      0.10  - conformal miscoverage; 1-alpha is the coverage target
%     .versionId  'branchA_v1'
%     .quiet      false
%
%   Does three things that were built long ago and never fitted, because until
%   Branch A arrived there was nothing to fit them on:
%
%     Task 2.5  temperature scaling      -> models/temperature_v1.mat
%     Task 6.2  conformal tier boundaries -> models/conformal_v1.mat
%     Task 9.1  evaluation                -> models/evaluation_<id>.{mat,txt}
%
%   Run exportModel1Predictions.py first.
%
%   ── SPLIT DISCIPLINE, WHICH IS THE WHOLE POINT ─────────────────────────────
%   Temperature and the conformal quantile are FITTED ON val. Everything
%   reported as a result is measured on TEST. Those must never be the same
%   data: a temperature fitted on test makes test ECE look excellent and mean
%   nothing, because the calibration was tuned on the numbers it is scored
%   against. Same for the conformal quantile — fit it on test and the coverage
%   guarantee degenerates into a description of the fitting set.
%
%   The honest caveat: val is not perfectly held out. The training script picks
%   its best epoch on val QWK, so val has already steered the model through
%   early stopping, which makes calibration fitted on it mildly optimistic. It
%   is still the right choice of the two splits that exist, and test is
%   genuinely untouched.
%
%   ── WHAT THIS DOES NOT DO ──────────────────────────────────────────────────
%   It does not train, retrain, or modify the network in any way. Temperature
%   scaling fits ONE scalar on frozen predictions; conformal calibration
%   computes a quantile of them. Both are post-hoc: the model's weights and its
%   argmax decisions are untouched, and the confusion matrix is identical
%   before and after.

if nargin < 1, opts = struct(); end
alpha     = getdef(opts, 'alpha', 0.10);
versionId = getdef(opts, 'versionId', 'branchA_v1');
quiet     = getdef(opts, 'quiet', false);

thisDir   = fileparts(mfilename('fullpath'));
modelsDir = fullfile(thisDir, 'models');
predDir   = fullfile(modelsDir, 'Model1');

addpath(fullfile(thisDir, 'calibration'));
addpath(fullfile(thisDir, 'training'));

need = {'val_logits.csv','val_labels.csv','test_logits.csv','test_labels.csv'};
for k = 1:numel(need)
    if exist(fullfile(predDir, need{k}), 'file') ~= 2
        error('calibrateBranchA:noPredictions', ...
              ['Missing %s. Run:\n  python exportModel1Predictions.py'], need{k});
    end
end

valLogits  = readmatrix(fullfile(predDir, 'val_logits.csv'));
valLabels  = readmatrix(fullfile(predDir, 'val_labels.csv'));
testLogits = readmatrix(fullfile(predDir, 'test_logits.csv'));
testLabels = readmatrix(fullfile(predDir, 'test_labels.csv'));

report.n = struct('val', numel(valLabels), 'test', numel(testLabels));

% ── Task 2.5: temperature, fitted on val ───────────────────────────────────
% Minimise negative log-likelihood of softmax(logits/T) against the labels.
% Golden-section over log(T): one dimension, smooth, and log space keeps T
% positive by construction.
nll = @(logT) meanNLL(valLogits, valLabels, exp(logT));
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
report.nllBefore = meanNLL(valLogits, valLabels, 1);
report.nllAfter  = meanNLL(valLogits, valLabels, T);

save(fullfile(modelsDir, 'temperature_v1.mat'), 'T');

% ── Calibrated probabilities ───────────────────────────────────────────────
valProbs  = softmaxRows(valLogits  / T);
testProbs = softmaxRows(testLogits / T);

% ── Task 6.2: conformal quantile, also on val ──────────────────────────────
calib = conformalCalibrate(valProbs, valLabels, struct('alpha', alpha));
save(fullfile(modelsDir, 'conformal_v1.mat'), 'calib');
report.conformal = calib;

% ── Task 9.1: evaluation, on test, which nothing was fitted on ─────────────
% UNCALIBRATED probabilities go in, deliberately. evaluateMetrics fits its own
% temperature from the calibration fold and reports ECE before and after, so
% handing it probabilities that are already tempered makes it fit a second
% temperature on top of the first: it lands on ~1.0, and "before" and "after"
% print the identical number. That happened on the first run here, and it
% reads as "temperature scaling achieved nothing" rather than "the input was
% already scaled".
%
% Sensitivity, specificity and kappa are unaffected either way — temperature
% is monotone and cannot reorder a row — so only the calibration figures were
% ever wrong, which is exactly the kind of error that survives a casual read.
rawTestProbs = softmaxRows(testLogits);
rawValProbs  = softmaxRows(valLogits);

metrics = evaluateMetrics([], [], struct( ...
    'probs', rawTestProbs, 'trueGrades', testLabels, ...
    'calibrationProbs', rawValProbs, 'calibrationGrades', valLabels, ...
    'outputDir', modelsDir, 'versionId', versionId, 'quiet', true));
report.metrics = metrics;
report.modelVersionsRow = metrics.modelVersionsRow;

% ── Tier distribution the conformal boundaries actually produce ────────────
% The point of Tier A is skipping the ophthalmologist queue, so how many cases
% land there is an operational fact, not a statistic: it is the review workload
% this calibration implies.
tiers = repmat(' ', numel(testLabels), 1);
for i = 1:numel(testLabels)
    tiers(i) = conformalTiering(testProbs(i, :), calib);
end
report.tierCounts = struct('A', sum(tiers=='A'), 'B', sum(tiers=='B'), 'C', sum(tiers=='C'));

% Of the cases Tier A would auto-clear, how many were actually referable? That
% is the number the whole guarantee exists to bound, and it is measurable here.
refTrue = testLabels >= 2;
isA = (tiers == 'A');
report.tierA = struct( ...
    'count', sum(isA), ...
    'referableMissed', sum(isA & refTrue), ...
    'missRate', safeDiv(sum(isA & refTrue), sum(isA)));

if ~quiet, printReport(report, alpha, modelsDir); end
end

% ═══════════════════════════════════════════════════════════════════════════
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

function printReport(r, alpha, modelsDir)
m = r.metrics.beforeTemperature;
fprintf('\n=================================================================\n');
fprintf('  BRANCH A CALIBRATION AND EVALUATION -- Model1\n');
fprintf('  fitted on val (n=%d), measured on test (n=%d)\n', r.n.val, r.n.test);
fprintf('=================================================================\n');

fprintf('\n--- Task 2.5: temperature scaling ---\n');
fprintf('T                    : %.4f   (was 1.0, a placeholder)\n', r.temperature);
fprintf('val NLL              : %.4f -> %.4f\n', r.nllBefore, r.nllAfter);
fprintf('T > 1 means the model was OVERCONFIDENT and is being softened.\n');

fprintf('\n--- Task 6.2: conformal tiers ---\n');
fprintf('alpha                : %.2f  (target coverage %.0f%%)\n', alpha, 100*(1-alpha));
fprintf('qhat                 : %.4f\n', r.conformal.qhat);
fprintf('probability threshold: %.4f\n', r.conformal.probThreshold);
fprintf('coverage on the fitting fold: %.4f (exactly rank/n by construction)\n', ...
        r.conformal.empiricalCoverageOnCalibrationFold);
fprintf('\ntier split on the test set:  A %d   B %d   C %d\n', ...
        r.tierCounts.A, r.tierCounts.B, r.tierCounts.C);
fprintf('Tier A auto-clears without an ophthalmologist. Of the %d it would\n', r.tierA.count);
fprintf('clear, %d were actually referable (%.2f%%).\n', ...
        r.tierA.referableMissed, 100*r.tierA.missRate);
fprintf('That miss rate is the number the guarantee exists to bound, and it\n');
fprintf('is the one to look at before letting Tier A skip review.\n');

fprintf('\n--- Task 9.1: evaluation on the held-out test split ---\n');
fprintf('sensitivity          : %.4f  [%.4f - %.4f]   target > 0.90  %s\n', ...
    m.sensitivity, m.sensitivityCI(1), m.sensitivityCI(2), tf(m.targets.sensitivityMet));
fprintf('specificity          : %.4f  [%.4f - %.4f]   target > 0.85  %s\n', ...
    m.specificity, m.specificityCI(1), m.specificityCI(2), tf(m.targets.specificityMet));
fprintf('quadratic kappa      : %.4f\n', m.quadraticWeightedKappa);
fprintf('NV (grade 4) recall  : %.4f on %d cases\n', m.nv.recall, m.nv.support);
fprintf('ECE                  : %.4f -> %.4f after temperature (T=%.4f)\n', ...
    m.ece, r.metrics.afterTemperature.ece, r.metrics.temperature);

fprintf('\n--- model_versions (the Task 7.2 promotion gate) ---\n');
fprintf('  validation_sensitivity = %.6f\n', r.modelVersionsRow.validation_sensitivity);
fprintf('  validation_specificity = %.6f\n', r.modelVersionsRow.validation_specificity);
fprintf('  validation_kappa       = %.6f\n', r.modelVersionsRow.validation_kappa);

fprintf('\nwritten to %s:\n  temperature_v1.mat\n  conformal_v1.mat\n  evaluation_*.mat/.txt\n', modelsDir);
fprintf('=================================================================\n');
end

function s = tf(v)
if v, s = 'MET'; else, s = 'NOT MET'; end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
