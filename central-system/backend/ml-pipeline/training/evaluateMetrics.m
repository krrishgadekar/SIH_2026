function metrics = evaluateMetrics(net, testImds, opts)
% EVALUATEMETRICS  Task 9.1 -- the evaluation harness for Branch A.
%
%   metrics = evaluateMetrics(net, testImds)
%   metrics = evaluateMetrics(net, testImds, opts)
%   metrics = evaluateMetrics([], [], opts)   % from stored predictions
%
%   Runs the classifier over the held-out TEST split, computes every metric the
%   problem statement and the design doc ask for, fits a temperature on a
%   separate calibration fold, writes a .mat and a plain-text summary, and emits
%   the three numbers that populate model_versions.
%
%   opts fields (all optional):
%     .calibrationImds   datastore for fitting the temperature. MUST NOT be the
%                        test split -- see "On the calibration fold" below.
%     .temperature       a temperature already fitted elsewhere; skips fitting.
%     .probs, .trueGrades   supply predictions directly and skip inference
%                        entirely (net and testImds may then be []).
%     .preprocessFn      default @preprocessForBranchA -- see "On preprocessing".
%     .outputDir         where the .mat and .txt go. Default: pwd.
%     .versionId         e.g. 'branchA_v2'. Names the output files and the
%                        model_versions row.
%     .referableThreshold, .eceBins, .z   passed through to computeDrMetrics.
%
%   ---------------------------------------------------------------------------
%   ON THE CALIBRATION FOLD
%   ---------------------------------------------------------------------------
%   The temperature is a parameter fitted to data. Fit it on the test split and
%   the reported ECE is a training-set number: it will look good and mean
%   nothing, because the calibration was tuned on the same images it is scored
%   on. This function therefore never fits a temperature on the test set, and if
%   no calibration fold is supplied it reports the uncalibrated numbers and says
%   so, rather than quietly producing a flattering figure.
%
%   ---------------------------------------------------------------------------
%   ON PREPROCESSING
%   ---------------------------------------------------------------------------
%   Evaluation must run the SAME chain as inference: preprocessForBranchA. If
%   evaluation preprocesses differently from gradingOrchestrator, the reported
%   sensitivity describes a pipeline that never runs in production -- the
%   train/serve skew failure this project treats as its highest silent risk.
%   The default is deliberately the canonical chain, and overriding it is
%   recorded in the output so a mismatched number can be traced later.
%
%   ---------------------------------------------------------------------------
%   ON WHAT TEMPERATURE SCALING DOES AND DOES NOT CHANGE
%   ---------------------------------------------------------------------------
%   Temperature scaling is monotone: it cannot reorder a row's classes. The
%   argmax is therefore identical before and after, and so are accuracy,
%   sensitivity, specificity, kappa and the confusion matrix. ONLY the
%   confidence values move, and so only ECE, the reliability diagram and the
%   Tier A/B/C split change. That is the point -- it fixes what the confidence
%   MEANS without touching what the model decides -- but it also means a
%   temperature will never rescue a model that grades badly.
%
%   See also COMPUTEDRMETRICS, PREPROCESSFORBRANCHA.

if nargin < 3, opts = struct(); end

outputDir = getdef(opts, 'outputDir', pwd);
versionId = getdef(opts, 'versionId', 'branchA_unversioned');
metricOpts = struct( ...
    'referableThreshold', getdef(opts, 'referableThreshold', 2), ...
    'eceBins',            getdef(opts, 'eceBins', 10), ...
    'z',                  getdef(opts, 'z', 1.96));

provenance = struct('evaluatedAt', datetime('now', 'TimeZone', 'UTC'), ...
                    'versionId', versionId);

% -- 1. Obtain predictions -------------------------------------------------
if isfield(opts, 'probs') && isfield(opts, 'trueGrades')
    probs      = opts.probs;
    trueGrades = opts.trueGrades(:);
    provenance.source = 'supplied predictions (no inference run)';
    provenance.preprocessing = 'unknown -- predictions were supplied, not computed here';
else
    if isempty(net) || isempty(testImds)
        error('evaluateMetrics:noInput', ...
              ['Supply either (net, testImds) or opts.probs and opts.trueGrades. ' ...
               'Got neither.']);
    end
    preprocessFn = getdef(opts, 'preprocessFn', @preprocessForBranchA);
    [probs, trueGrades] = runInference(net, testImds, preprocessFn);
    provenance.source = 'inference over testImds';
    if isequal(preprocessFn, @preprocessForBranchA)
        provenance.preprocessing = 'preprocessForBranchA (canonical -- matches inference)';
    else
        provenance.preprocessing = ['CUSTOM preprocessFn -- does NOT necessarily match ' ...
                                    'the inference chain; these numbers may not describe ' ...
                                    'the deployed pipeline'];
    end
end

if isempty(trueGrades)
    error('evaluateMetrics:emptyTestSet', 'The test set is empty; there is nothing to measure.');
end

% -- 2. Uncalibrated metrics ------------------------------------------------
metrics.beforeTemperature = computeDrMetrics(trueGrades, probs, metricOpts);

% -- 3. Temperature ---------------------------------------------------------
if isfield(opts, 'temperature') && ~isempty(opts.temperature)
    T = opts.temperature;
    tempSource = 'supplied by caller';
elseif isfield(opts, 'calibrationImds') && ~isempty(opts.calibrationImds)
    preprocessFn = getdef(opts, 'preprocessFn', @preprocessForBranchA);
    [calProbs, calGrades] = runInference(net, opts.calibrationImds, preprocessFn);
    T = fitTemperature(calProbs, calGrades);
    tempSource = sprintf('fitted on a separate calibration fold of %d images', numel(calGrades));
elseif isfield(opts, 'calibrationProbs') && isfield(opts, 'calibrationGrades')
    T = fitTemperature(opts.calibrationProbs, opts.calibrationGrades);
    tempSource = sprintf('fitted on %d supplied calibration predictions', ...
                         numel(opts.calibrationGrades));
else
    T = NaN;
    tempSource = ['NOT FITTED -- no calibration fold was supplied. The "after" ' ...
                  'metrics are absent, not neutral. Fitting a temperature on the ' ...
                  'test split is refused by design.'];
end

metrics.temperature = T;
metrics.temperatureSource = tempSource;

if isfinite(T)
    metrics.afterTemperature = computeDrMetrics(trueGrades, applyTemperature(probs, T), metricOpts);
    metrics.eceImprovement = metrics.beforeTemperature.ece - metrics.afterTemperature.ece;
else
    metrics.afterTemperature = [];
    metrics.eceImprovement = NaN;
end

% -- 4. The headline, and the columns the promotion gate reads --------------
% Taken from the UNCALIBRATED metrics. Temperature scaling cannot change any of
% them (see the note above), so either source gives identical values; taking
% them from "before" makes it self-evident that no calibration step is
% inflating the headline.
headline = metrics.beforeTemperature;
metrics.modelVersionsRow = struct( ...
    'version_id',             versionId, ...
    'validation_sensitivity', headline.sensitivity, ...
    'validation_specificity', headline.specificity, ...
    'validation_kappa',       headline.quadraticWeightedKappa);

metrics.provenance = provenance;
metrics.n = headline.n;

% -- 5. Write the artefacts -------------------------------------------------
if ~exist(outputDir, 'dir'), mkdir(outputDir); end
matPath     = fullfile(outputDir, sprintf('evaluation_%s.mat', versionId));
summaryPath = fullfile(outputDir, sprintf('evaluation_%s.txt', versionId));

summary = formatSummary(metrics);
metrics.matPath = matPath;
metrics.summaryPath = summaryPath;
metrics.summary = summary;

save(matPath, 'metrics', '-v7.3');

fid = fopen(summaryPath, 'w');
if fid == -1
    error('evaluateMetrics:writeFailed', 'Could not write %s', summaryPath);
end
fprintf(fid, '%s', summary);
fclose(fid);

if ~getdef(opts, 'quiet', false)
    fprintf('%s', summary);
    fprintf('\nWritten: %s\n         %s\n', matPath, summaryPath);
end
end

% ===========================================================================
function [probs, trueGrades] = runInference(net, imds, preprocessFn)
% Predict over a datastore, one image at a time.
%
% One at a time, not a batch: preprocessForBranchA is inherently per-image (it
% classifies the camera family from the raw frame and picks a calibration
% profile from that), so batching would have to bypass exactly the step that
% must not be bypassed.
files = imds.Files;
n = numel(files);
probs = zeros(n, 5);

if isprop(imds, 'Labels') && ~isempty(imds.Labels)
    trueGrades = double(string(imds.Labels));
else
    error('evaluateMetrics:noLabels', ...
          'The test datastore has no Labels; there is no reference standard to score against.');
end
if any(isnan(trueGrades))
    error('evaluateMetrics:badLabels', ...
          ['Some datastore labels did not parse as grade numbers. Labels must be ' ...
           'the integers 0-4 (as categorical or string), not names like "mild".']);
end

for i = 1:n
    img = imread(files{i});
    if ~isempty(preprocessFn)
        img = preprocessFn(img);
    end
    scores = predict(net, single(img));
    scores = double(scores(:))';
    if numel(scores) ~= 5
        error('evaluateMetrics:badOutput', ...
              'The network returned %d scores; Branch A must output 5 (grades 0-4).', ...
              numel(scores));
    end
    probs(i, :) = scores / sum(scores);
end
trueGrades = trueGrades(:);
end

% ===========================================================================
function T = fitTemperature(probs, trueGrades)
% Single-parameter temperature scaling: minimise NLL over T.
%
% Golden-section search over log(T) rather than a gradient method -- the
% objective is one-dimensional, smooth and unimodal, so this converges in a few
% dozen cheap evaluations with no gradients and no extra toolbox. Searching in
% log space keeps T positive by construction.
trueGrades = double(trueGrades(:));
logits = log(max(probs, realmin));       % probabilities back into log space
idx = sub2ind(size(probs), (1:numel(trueGrades))', trueGrades + 1);

nll = @(logT) meanNLL(logits, idx, exp(logT));

phi = (sqrt(5) - 1) / 2;
a = log(0.05); b = log(20);
c = b - phi*(b - a); d = a + phi*(b - a);
fc = nll(c); fd = nll(d);
for k = 1:100
    if fc < fd
        b = d; d = c; fd = fc;
        c = b - phi*(b - a); fc = nll(c);
    else
        a = c; c = d; fc = fd;
        d = a + phi*(b - a); fd = nll(d);
    end
    if (b - a) < 1e-8, break; end
end
T = exp((a + b) / 2);
end

function v = meanNLL(logits, idx, T)
scaled = logits / T;
scaled = scaled - max(scaled, [], 2);            % stabilise before exp
logZ = log(sum(exp(scaled), 2));
logp = scaled(idx) - logZ;
v = -mean(logp);
end

% ===========================================================================
function p = applyTemperature(probs, T)
% Softmax of log-probabilities divided by T.
logits = log(max(probs, realmin)) / T;
logits = logits - max(logits, [], 2);
e = exp(logits);
p = e ./ sum(e, 2);
end

% ===========================================================================
function s = formatSummary(metrics)
b = metrics.beforeTemperature;
L = {};
L{end+1} = '===========================================================';
L{end+1} = sprintf('  Branch A evaluation -- %s', metrics.provenance.versionId);
L{end+1} = sprintf('  %s UTC', string(metrics.provenance.evaluatedAt, 'yyyy-MM-dd HH:mm:ss'));
L{end+1} = '===========================================================';
L{end+1} = sprintf('Test images        : %d', b.n);
L{end+1} = sprintf('Predictions from   : %s', metrics.provenance.source);
L{end+1} = sprintf('Preprocessing      : %s', metrics.provenance.preprocessing);
L{end+1} = '';
L{end+1} = '--- Referable DR (grade >= 2) -----------------------------';
L{end+1} = sprintf('Sensitivity        : %s   [target > 0.90]', pctCI(b.sensitivity, b.sensitivityCI));
L{end+1} = sprintf('Specificity        : %s   [target > 0.85]', pctCI(b.specificity, b.specificityCI));
L{end+1} = sprintf('PPV                : %s', pctCI(b.ppv, b.ppvCI));
L{end+1} = sprintf('NPV                : %s', pctCI(b.npv, b.npvCI));
L{end+1} = sprintf('  measured at prevalence %.3f (%d referable of %d)', ...
                   b.prevalence, b.referable.positives, b.n);
L{end+1} = sprintf('  TP %d  FN %d  TN %d  FP %d', ...
                   b.referable.TP, b.referable.FN, b.referable.TN, b.referable.FP);
L{end+1} = '';
L{end+1} = 'Targets are judged on the LOWER confidence bound, not the point';
L{end+1} = 'estimate -- a measured 0.91 over 60 images does not support a';
L{end+1} = 'claim of >0.90.';
L{end+1} = sprintf('  sensitivity target met : %s', tf(b.targets.sensitivityMet));
L{end+1} = sprintf('  specificity target met : %s', tf(b.targets.specificityMet));
L{end+1} = '';
L{end+1} = '--- Agreement across all 5 grades -------------------------';
L{end+1} = sprintf('Quadratic-weighted kappa : %.4f', b.quadraticWeightedKappa);
L{end+1} = sprintf('Plain accuracy           : %.4f', b.accuracy);
L{end+1} = '';
L{end+1} = '--- Confusion matrix (rows = truth, cols = prediction) ----';
L{end+1} = '           pred0  pred1  pred2  pred3  pred4    recall';
for g = 1:5
    row = b.confusionMatrix(g, :);
    if isnan(b.perGradeRecall(g))
        rec = '    --';
    else
        rec = sprintf('%6.3f', b.perGradeRecall(g));
    end
    L{end+1} = sprintf('  true%d  %6d %6d %6d %6d %6d    %s', ...
                       g-1, row(1), row(2), row(3), row(4), row(5), rec);
end
L{end+1} = '';
L{end+1} = '--- Neovascularization (grade 4), reported separately -----';
if isnan(b.nv.recall)
    L{end+1} = sprintf('NV recall          : UNMEASURED  (%s)', b.nv.note);
else
    L{end+1} = sprintf('NV recall          : %.3f  (%s)', b.nv.recall, b.nv.note);
end
L{end+1} = '';
L{end+1} = '--- Calibration -------------------------------------------';
L{end+1} = sprintf('Temperature        : %s', temperatureText(metrics.temperature));
L{end+1} = sprintf('  %s', metrics.temperatureSource);
L{end+1} = sprintf('ECE before         : %.4f', b.ece);
if ~isempty(metrics.afterTemperature)
    a = metrics.afterTemperature;
    L{end+1} = sprintf('ECE after          : %.4f   (improvement %+.4f)', a.ece, metrics.eceImprovement);
    L{end+1} = sprintf('Mean confidence    : %.4f -> %.4f  (accuracy %.4f)', ...
                       b.meanConfidence, a.meanConfidence, b.accuracy);
    L{end+1} = 'Sensitivity, specificity, kappa and the confusion matrix are';
    L{end+1} = 'unchanged by temperature scaling -- it is monotone, so it cannot';
    L{end+1} = 'reorder a row. Only the confidence values move.';
else
    L{end+1} = 'ECE after          : not computed';
    L{end+1} = sprintf('Mean confidence    : %.4f  (accuracy %.4f, gap %+.4f)', ...
                       b.meanConfidence, b.accuracy, b.confidenceAccuracyGap);
end
L{end+1} = '';
L{end+1} = 'Reliability diagram (bin: n, mean confidence, accuracy)';
r = b.reliability;
for i = 1:numel(r.count)
    % The top bin is closed, not half-open: a confidence of exactly 1.0 belongs
    % in it. Printing it as "[0.9,1.0)" would misdescribe where those cases went.
    if i == numel(r.count), close = ']'; else, close = ')'; end
    if r.count(i) == 0
        L{end+1} = sprintf('  [%.1f,%.1f%s      0        --        --', ...
                           r.binLower(i), r.binUpper(i), close);
    else
        L{end+1} = sprintf('  [%.1f,%.1f%s %6d    %.4f    %.4f', ...
                           r.binLower(i), r.binUpper(i), close, r.count(i), ...
                           r.meanConfidence(i), r.accuracy(i));
    end
end
L{end+1} = '';
L{end+1} = '--- model_versions ----------------------------------------';
L{end+1} = 'These three columns are the continual-learning promotion gate.';
L{end+1} = sprintf('  version_id             = %s', metrics.modelVersionsRow.version_id);
L{end+1} = sprintf('  validation_sensitivity = %s', numOrNull(metrics.modelVersionsRow.validation_sensitivity));
L{end+1} = sprintf('  validation_specificity = %s', numOrNull(metrics.modelVersionsRow.validation_specificity));
L{end+1} = sprintf('  validation_kappa       = %s', numOrNull(metrics.modelVersionsRow.validation_kappa));
L{end+1} = '';
L{end+1} = 'Every number above describes THIS test split only. It is not a claim';
L{end+1} = 'about performance on a population the split does not represent -- a';
L{end+1} = 'different camera, a different clinic, a different prevalence.';
L{end+1} = '===========================================================';
s = strjoin(L, newline);
s = [s newline];
end

% ===========================================================================
function s = pctCI(p, ci)
if isnan(p)
    s = 'UNMEASURED (no cases of this kind in the split)';
else
    s = sprintf('%.4f  (95%% CI %.4f - %.4f)', p, ci(1), ci(2));
end
end

function s = tf(v)
if v, s = 'YES'; else, s = 'no'; end
end

function s = temperatureText(T)
if isnan(T), s = 'none'; else, s = sprintf('%.4f', T); end
end

function s = numOrNull(v)
% A metric that could not be measured is written as NULL, never as 0. The
% promotion gate treats a missing metric as "refuse to promote"; a 0 would read
% as a measured catastrophe, and both are wrong descriptions of "no data".
if isnan(v), s = 'NULL'; else, s = sprintf('%.6f', v); end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
