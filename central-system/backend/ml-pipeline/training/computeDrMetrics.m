function m = computeDrMetrics(trueGrades, probs, opts)
% COMPUTEDRMETRICS  Every reported metric, from labels and probabilities.
%
%   m = computeDrMetrics(trueGrades, probs)
%   m = computeDrMetrics(trueGrades, probs, opts)
%
%   Inputs:
%     trueGrades - Nx1, integers 0-4, the reference standard.
%     probs      - Nx5 double, each row a class posterior summing to 1.
%                  Column k is grade k-1.
%     opts - optional struct:
%              .referableThreshold 2   - grade >= this is referable
%              .eceBins            10  - reliability-diagram bin count
%              .z                  1.96 - 95% CI
%
%   Output: struct with sensitivity, specificity, their CIs, quadratic-weighted
%   kappa, per-grade recall, NV recall, ECE, the reliability diagram, and the
%   confusion matrix.
%
%   Task 9.1.
%
%   ── WHY THIS IS A SEPARATE FILE FROM evaluateMetrics ───────────────────────
%   Pure: labels and numbers in, metrics out. No model, no datastore, no file
%   I/O, no randomness. That is what makes it testable TODAY, against cases
%   whose answers are worked out by hand, months before a trained model exists.
%
%   It matters that these are right. These numbers are the project's headline
%   claim, they populate model_versions, and model_versions is what the
%   continual-learning gate compares against — so an error here does not just
%   misreport, it silently changes which models get deployed.
%
%   ── ON CONFIDENCE INTERVALS ────────────────────────────────────────────────
%   Sensitivity and specificity are reported WITH intervals, never bare. Design
%   doc §16 is explicit: report achieved numbers with confidence intervals
%   rather than promising the target. On a test split of a few hundred images a
%   point estimate of 0.91 can be entirely consistent with a true value below
%   0.85, and quoting it alone would overstate what was measured.
%
%   Wilson score intervals, not the normal approximation. The normal
%   approximation degrades badly exactly where these values live — near 0.9,
%   with a modest n — and can produce bounds above 1.0, which is not a
%   defensible thing to put in a report.

if nargin < 3, opts = struct(); end
refThreshold = getdef(opts, 'referableThreshold', 2);
eceBins      = getdef(opts, 'eceBins', 10);
z            = getdef(opts, 'z', 1.96);

trueGrades = double(trueGrades(:));
N = numel(trueGrades);

if size(probs, 1) ~= N
    error('computeDrMetrics:sizeMismatch', ...
          '%d labels but %d probability rows.', N, size(probs, 1));
end
if size(probs, 2) ~= 5
    error('computeDrMetrics:badProbs', 'probs must be Nx5, got Nx%d.', size(probs, 2));
end
if any(trueGrades < 0 | trueGrades > 4 | mod(trueGrades, 1) ~= 0)
    error('computeDrMetrics:badLabels', 'trueGrades must be integers in 0..4.');
end

[~, idx] = max(probs, [], 2);
predGrades = idx - 1;                    % 1-indexed argmax -> 0-indexed grade
confidence = max(probs, [], 2);

% ── Referable DR: the PS's headline ─────────────────────────────────────────
% The 5-class problem collapsed to the binary decision the system actually
% makes: does this patient need to see someone.
trueRef = trueGrades >= refThreshold;
predRef = predGrades >= refThreshold;

TP = sum( trueRef &  predRef);
FN = sum( trueRef & ~predRef);
TN = sum(~trueRef & ~predRef);
FP = sum(~trueRef &  predRef);

m.referable = struct('TP', TP, 'FN', FN, 'TN', TN, 'FP', FP, ...
                     'positives', TP + FN, 'negatives', TN + FP);

[m.sensitivity, m.sensitivityCI] = proportionWithCI(TP, TP + FN, z);
[m.specificity, m.specificityCI] = proportionWithCI(TN, TN + FP, z);

% PPV and NPV depend on prevalence, so they are reported alongside the
% prevalence they were measured at. Quoting them without it invites the reader
% to transfer them to a population where they do not hold — and screening
% prevalence differs sharply from clinic prevalence, which is the whole reason
% this system exists.
[m.ppv, m.ppvCI] = proportionWithCI(TP, TP + FP, z);
[m.npv, m.npvCI] = proportionWithCI(TN, TN + FN, z);
m.prevalence = (TP + FN) / max(1, N);

m.accuracy = sum(predGrades == trueGrades) / N;

% ── Confusion matrix and per-grade recall ───────────────────────────────────
C = zeros(5, 5);
for i = 1:N
    C(trueGrades(i) + 1, predGrades(i) + 1) = C(trueGrades(i) + 1, predGrades(i) + 1) + 1;
end
m.confusionMatrix = C;                   % rows = truth, cols = prediction

m.perGradeRecall = nan(1, 5);
m.perGradeSupport = zeros(1, 5);
for g = 1:5
    support = sum(C(g, :));
    m.perGradeSupport(g) = support;
    if support > 0
        m.perGradeRecall(g) = C(g, g) / support;
    end
end

% ── Neovascularization, reported separately ─────────────────────────────────
% Grade 4 is rare, subtle, and has the least labelled data of any class. Design
% doc §16 requires its own metric rather than folding it into an aggregate that
% hides the weakness — an overall accuracy of 0.92 can coexist with grade-4
% recall of 0.0, and that combination is precisely the dangerous one.
nvSupport = m.perGradeSupport(5);
m.nv = struct('recall', m.perGradeRecall(5), 'support', nvSupport);
if nvSupport == 0
    m.nv.note = ['NO grade-4 cases in this split -- NV recall is UNMEASURED, ' ...
                 'not zero and not good. Do not report a figure for it.'];
elseif nvSupport < 10
    m.nv.note = sprintf(['only %d grade-4 case(s) -- this recall is too small to ' ...
                         'be meaningful; report it with n, never alone'], nvSupport);
else
    m.nv.note = sprintf('measured on %d grade-4 cases', nvSupport);
end

% ── Quadratic-weighted kappa ────────────────────────────────────────────────
% The convention for ordinal DR grading, and the number APTOS/IDRiD results are
% quoted in, so it is what makes this comparable to published work. Quadratic
% weights mean confusing grade 0 with 4 costs far more than 0 with 1, which
% matches the clinical reality plain accuracy ignores entirely.
m.quadraticWeightedKappa = quadraticKappa(C);

% ── Calibration ─────────────────────────────────────────────────────────────
% Evidences "calibrated confidence scores" in PS requirement 4. Accuracy says
% nothing about whether a stated 0.9 confidence means anything — and the whole
% Tier A/B/C routing is built on those numbers being trustworthy.
[m.ece, m.reliability] = expectedCalibrationError( ...
    confidence, predGrades == trueGrades, eceBins);

m.n = N;
m.meanConfidence = mean(confidence);
% A large gap between mean confidence and accuracy is over- or under-confidence
% in one number, and it is the quickest read on whether calibration is working.
m.confidenceAccuracyGap = m.meanConfidence - m.accuracy;

% ── Whether the PS targets were met ─────────────────────────────────────────
% Judged on the LOWER CONFIDENCE BOUND, not the point estimate. "We measured
% 0.91" and "we can defend >0.90" are different claims, and only the second
% survives someone asking how many images that was over.
m.targets = struct( ...
    'sensitivityTarget', 0.90, 'specificityTarget', 0.85, ...
    'sensitivityMet',    m.sensitivityCI(1) >= 0.90, ...
    'specificityMet',    m.specificityCI(1) >= 0.85, ...
    'basis', 'lower 95% confidence bound, not the point estimate');
end

% ── Helpers ─────────────────────────────────────────────────────────────────
function [p, ci] = proportionWithCI(successes, trials, z)
% Wilson score interval. Returns NaN with a [NaN NaN] interval when there are no
% trials — a proportion of zero successes out of zero cases is undefined, and
% returning 0 would read as a measured failure rather than an absent measurement.
if trials == 0
    p = NaN; ci = [NaN NaN]; return;
end
p = successes / trials;
n = trials;
denom  = 1 + z^2 / n;
centre = (p + z^2 / (2*n)) / denom;
half   = (z / denom) * sqrt(p*(1-p)/n + z^2/(4*n^2));
ci = [max(0, centre - half), min(1, centre + half)];
end

function k = quadraticKappa(C)
% Cohen's kappa with quadratic weights, from the confusion matrix.
n = sum(C(:));
if n == 0, k = NaN; return; end

nClasses = size(C, 1);
[I, J] = meshgrid(1:nClasses, 1:nClasses);
W = ((I' - J').^2) / (nClasses - 1)^2;   % quadratic disagreement weights

O = C / n;                                % observed, normalised
rowMarg = sum(C, 2) / n;
colMarg = sum(C, 1) / n;
E = rowMarg * colMarg;                    % expected under independence

denom = sum(W(:) .* E(:));
if denom == 0
    % Every prediction and every label in one class: no disagreement is
    % possible, so kappa is undefined rather than perfect.
    k = NaN;
    return;
end
k = 1 - sum(W(:) .* O(:)) / denom;
end

function [ece, reliability] = expectedCalibrationError(confidence, correct, nBins)
% Bin by confidence; compare each bin's accuracy to its mean confidence.
% ECE is the support-weighted mean of those gaps.
confidence = confidence(:);
correct = double(correct(:));
n = numel(confidence);

edges = linspace(0, 1, nBins + 1);
reliability = struct('binLower', [], 'binUpper', [], 'count', [], ...
                     'meanConfidence', [], 'accuracy', []);
ece = 0;

for b = 1:nBins
    lo = edges(b); hi = edges(b + 1);
    if b == nBins
        inBin = confidence >= lo & confidence <= hi;   % include the endpoint
    else
        inBin = confidence >= lo & confidence < hi;
    end
    cnt = sum(inBin);

    reliability.binLower(end+1) = lo;
    reliability.binUpper(end+1) = hi;
    reliability.count(end+1)    = cnt;

    if cnt == 0
        reliability.meanConfidence(end+1) = NaN;
        reliability.accuracy(end+1)       = NaN;
        continue;
    end

    binConf = mean(confidence(inBin));
    binAcc  = mean(correct(inBin));
    reliability.meanConfidence(end+1) = binConf;
    reliability.accuracy(end+1)       = binAcc;

    ece = ece + (cnt / n) * abs(binAcc - binConf);
end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
