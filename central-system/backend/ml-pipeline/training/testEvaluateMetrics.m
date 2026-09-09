function testEvaluateMetrics()
% TESTEVALUATEMETRICS  Unit tests for Task 9.1.
%
%   Run: matlab -batch "testEvaluateMetrics"
%
%   Every expected number below was computed BY HAND from an 8-case confusion
%   matrix, written into this file, and only then compared against the code.
%   Not one of them was obtained by running computeDrMetrics and recording what
%   it produced -- a test written that way passes by construction and would
%   have certified an arithmetic error just as happily as correct arithmetic.
%
%   The worked example, for anyone auditing this:
%
%     idx  true  pred  conf     referable(>=2)?      correct?
%      1    0     0    0.95     no  / no  -> TN        yes
%      2    0     0    0.95     no  / no  -> TN        yes
%      3    0     0    0.85     no  / no  -> TN        yes
%      4    1     0    0.85     no  / no  -> TN        no
%      5    2     2    0.55     yes / yes -> TP        yes
%      6    2     2    0.55     yes / yes -> TP        yes
%      7    3     1    0.95     yes / no  -> FN        no
%      8    4     4    0.85     yes / yes -> TP        yes
%
%     TP=3 FN=1 TN=4 FP=0  ->  sensitivity 3/4 = 0.75, specificity 4/4 = 1.00
%     PPV 3/3 = 1.00, NPV 4/5 = 0.80, prevalence 4/8 = 0.50, accuracy 6/8 = 0.75
%
%     Confusion matrix (rows truth, cols prediction):
%        [3 0 0 0 0; 1 0 0 0 0; 0 0 2 0 0; 0 1 0 0 0; 0 0 0 0 1]
%
%     Quadratic-weighted kappa, w_ij = (i-j)^2/16, n = 8:
%       observed  = (1*(1/16) + 1*(4/16)) / 8 = (5/16)/8 = 0.0390625
%       row marginals [3 1 2 1 1]/8, col marginals [4 1 2 0 1]/8
%       sum_ij w_ij E_ij = 256/64/16 = 0.25
%       kappa = 1 - 0.0390625/0.25 = 0.84375
%
%     ECE over 10 bins:
%       [0.5,0.6): n=2, conf 0.55, acc 2/2 = 1.0000, gap 0.450000, weight 2/8
%       [0.8,0.9): n=3, conf 0.85, acc 2/3 = 0.6667, gap 0.183333, weight 3/8
%       [0.9,1.0]: n=3, conf 0.95, acc 2/3 = 0.6667, gap 0.283333, weight 3/8
%       ECE = 0.25*0.45 + 0.375*0.183333 + 0.375*0.283333 = 0.2875

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);

fprintf('\n===== Task 9.1: evaluation harness =====\n');
n = 0; f = 0;
TOL = 1e-9;

% ── The worked example ──────────────────────────────────────────────────────
trueGrades = [0 0 0 1 2 2 3 4]';
predGrades = [0 0 0 0 2 2 1 4]';
confs      = [0.95 0.95 0.85 0.85 0.55 0.55 0.95 0.85]';
probs = buildProbs(predGrades, confs);

m = computeDrMetrics(trueGrades, probs);

fprintf('\n--- referable DR, from the hand-built matrix ---\n');
[n,f] = tnum(n, f, 'TP = 3',  m.referable.TP, 3, TOL);
[n,f] = tnum(n, f, 'FN = 1',  m.referable.FN, 1, TOL);
[n,f] = tnum(n, f, 'TN = 4',  m.referable.TN, 4, TOL);
[n,f] = tnum(n, f, 'FP = 0',  m.referable.FP, 0, TOL);
[n,f] = tnum(n, f, 'sensitivity = 3/4', m.sensitivity, 0.75, TOL);
[n,f] = tnum(n, f, 'specificity = 4/4', m.specificity, 1.00, TOL);
[n,f] = tnum(n, f, 'PPV = 3/3',         m.ppv, 1.00, TOL);
[n,f] = tnum(n, f, 'NPV = 4/5',         m.npv, 0.80, TOL);
[n,f] = tnum(n, f, 'prevalence = 4/8',  m.prevalence, 0.50, TOL);
[n,f] = tnum(n, f, 'accuracy = 6/8',    m.accuracy, 0.75, TOL);

% ── Wilson intervals, computed by hand ──────────────────────────────────────
% sensitivity 3/4, z = 1.96:
%   denom  = 1 + 1.96^2/4                       = 1.9604
%   centre = (0.75 + 1.96^2/8) / 1.9604         = 1.2302/1.9604 = 0.6275250969
%   half   = (1.96/1.9604)*sqrt(0.1875/4 + 3.8416/64)
%          = 0.99979596*sqrt(0.1069)            = 0.3268888...
fprintf('\n--- Wilson confidence intervals ---\n');
[n,f] = tnum(n, f, 'sensitivity CI lower', m.sensitivityCI(1), 0.3006362, 1e-6);
[n,f] = tnum(n, f, 'sensitivity CI upper', m.sensitivityCI(2), 0.9544140, 1e-6);
fprintf('    sensitivity 0.7500  (95%% CI %.7f - %.7f)\n', m.sensitivityCI(1), m.sensitivityCI(2));

% specificity 4/4 -- p = 1 makes the upper bound EXACTLY 1, algebraically:
%   centre + half = (1 + z^2/2n)/denom + z^2/(2n*denom) = (1 + z^2/n)/denom = 1
% so this asserts the true arithmetic, not the min(...,1) clip covering for it.
[n,f] = tnum(n, f, 'specificity CI lower', m.specificityCI(1), 0.5101000, 1e-6);
[n,f] = tnum(n, f, 'specificity CI upper is exactly 1 by algebra, not by clipping', ...
              m.specificityCI(2), 1.0, 1e-12);

% ── The intervals must actually bracket the estimate ────────────────────────
[n,f] = tbool(n, f, 'the sensitivity CI contains the point estimate', ...
    m.sensitivityCI(1) <= m.sensitivity && m.sensitivity <= m.sensitivityCI(2));
[n,f] = tbool(n, f, 'CI bounds stay inside [0,1]', ...
    all(m.sensitivityCI >= 0 & m.sensitivityCI <= 1) && ...
    all(m.specificityCI >= 0 & m.specificityCI <= 1));

% ── Targets judged on the lower bound ───────────────────────────────────────
fprintf('\n--- PS targets, judged on the lower bound ---\n');
[n,f] = tbool(n, f, 'sensitivity 0.75 does not meet the 0.90 target', ...
    m.targets.sensitivityMet == false);
[n,f] = tbool(n, f, 'specificity 1.00 over only 4 negatives does NOT meet 0.85', ...
    m.targets.specificityMet == false);
fprintf('    a point estimate of 1.0000 with a lower bound of %.4f is not\n', m.specificityCI(1));
fprintf('    evidence for >0.85 -- this is the whole reason for the intervals\n');

% ── Confusion matrix and per-grade recall ───────────────────────────────────
fprintf('\n--- confusion matrix ---\n');
expectedC = [3 0 0 0 0; 1 0 0 0 0; 0 0 2 0 0; 0 1 0 0 0; 0 0 0 0 1];
[n,f] = tbool(n, f, 'confusion matrix matches the hand-built one', ...
    isequal(m.confusionMatrix, expectedC));
[n,f] = tbool(n, f, 'rows are truth and columns are prediction (not transposed)', ...
    m.confusionMatrix(4, 2) == 1 && m.confusionMatrix(2, 4) == 0);
[n,f] = tnum(n, f, 'grade 0 recall = 3/3', m.perGradeRecall(1), 1.0, TOL);
[n,f] = tnum(n, f, 'grade 1 recall = 0/1', m.perGradeRecall(2), 0.0, TOL);
[n,f] = tnum(n, f, 'grade 3 recall = 0/1', m.perGradeRecall(4), 0.0, TOL);
[n,f] = tbool(n, f, 'per-grade support sums to n', sum(m.perGradeSupport) == 8);

% ── Kappa ───────────────────────────────────────────────────────────────────
fprintf('\n--- quadratic-weighted kappa ---\n');
[n,f] = tnum(n, f, 'kappa = 0.84375, worked out by hand above', ...
    m.quadraticWeightedKappa, 0.84375, 1e-12);

% Quadratic weighting must PUNISH DISTANCE. Same number of errors, further
% away: kappa has to fall. Plain accuracy cannot tell these two apart, which is
% exactly why kappa is the reported figure for ordinal grading.
nearMiss = computeDrMetrics([0 0 4 4]', buildProbs([0 0 3 4]', [0.9 0.9 0.9 0.9]'));
farMiss  = computeDrMetrics([0 0 4 4]', buildProbs([0 0 0 4]', [0.9 0.9 0.9 0.9]'));
[n,f] = tbool(n, f, 'a 4->0 error costs more kappa than a 4->3 error', ...
    farMiss.quadraticWeightedKappa < nearMiss.quadraticWeightedKappa);
[n,f] = tbool(n, f, 'both have identical plain accuracy (kappa sees what accuracy cannot)', ...
    abs(nearMiss.accuracy - farMiss.accuracy) < TOL);
fprintf('    accuracy %.3f both; kappa %.4f (near) vs %.4f (far)\n', ...
    nearMiss.accuracy, nearMiss.quadraticWeightedKappa, farMiss.quadraticWeightedKappa);

perfect = computeDrMetrics([0 1 2 3 4]', buildProbs([0 1 2 3 4]', 0.8*ones(5,1)));
[n,f] = tnum(n, f, 'a perfect classifier scores kappa = 1', ...
    perfect.quadraticWeightedKappa, 1.0, TOL);
[n,f] = tnum(n, f, 'a perfect classifier scores sensitivity = 1', perfect.sensitivity, 1.0, TOL);
[n,f] = tnum(n, f, 'a perfect classifier scores specificity = 1', perfect.specificity, 1.0, TOL);

% Everything in one class: no disagreement is expressible, so kappa is
% UNDEFINED. Returning 1.0 here would let a model that always says "grade 0"
% look perfect on a split that happens to be all grade 0.
degenerate = computeDrMetrics([0 0 0]', buildProbs([0 0 0]', [0.9 0.9 0.9]'));
[n,f] = tbool(n, f, 'kappa is NaN, not 1, when every case is the same class', ...
    isnan(degenerate.quadraticWeightedKappa));

% ── Calibration ─────────────────────────────────────────────────────────────
fprintf('\n--- expected calibration error ---\n');
[n,f] = tnum(n, f, 'ECE = 0.2875, worked out by hand above', m.ece, 0.2875, 1e-12);
[n,f] = tnum(n, f, 'mean confidence = 6.50/8', m.meanConfidence, 0.8125, TOL);
[n,f] = tnum(n, f, 'confidence-accuracy gap = +0.0625', m.confidenceAccuracyGap, 0.0625, TOL);

% The three occupied bins, and only those three.
occupied = find(m.reliability.count > 0);
[n,f] = tbool(n, f, 'exactly three bins are occupied (6th, 9th, 10th)', ...
    isequal(occupied, [6 9 10]));
[n,f] = tnum(n, f, 'bin [0.5,0.6) accuracy = 2/2', m.reliability.accuracy(6), 1.0, TOL);
[n,f] = tnum(n, f, 'bin [0.8,0.9) accuracy = 2/3', m.reliability.accuracy(9), 2/3, 1e-12);
[n,f] = tnum(n, f, 'bin [0.9,1.0] accuracy = 2/3', m.reliability.accuracy(10), 2/3, 1e-12);
[n,f] = tbool(n, f, 'empty bins report NaN accuracy, not 0', ...
    all(isnan(m.reliability.accuracy(m.reliability.count == 0))));
[n,f] = tbool(n, f, 'bin counts sum to n', sum(m.reliability.count) == 8);

% A confidence of exactly 1.0 must land in the last bin, not fall off the end.
edgeCase = computeDrMetrics([0 0]', [1 0 0 0 0; 1 0 0 0 0]);
[n,f] = tbool(n, f, 'confidence of exactly 1.0 is counted (top bin closes)', ...
    sum(edgeCase.reliability.count) == 2);
[n,f] = tnum(n, f, 'a perfectly confident and perfectly correct model has ECE 0', ...
    edgeCase.ece, 0, TOL);

% ── Neovascularization, reported separately ─────────────────────────────────
fprintf('\n--- NV (grade 4) ---\n');
[n,f] = tnum(n, f, 'NV recall = 1/1 in the worked example', m.nv.recall, 1.0, TOL);
[n,f] = tnum(n, f, 'NV support = 1', m.nv.support, 1, TOL);
[n,f] = tbool(n, f, 'a support of 1 is flagged as too small to be meaningful', ...
    contains(m.nv.note, 'too small'));

noNv = computeDrMetrics([0 1 2 3]', buildProbs([0 1 2 3]', 0.9*ones(4,1)));
[n,f] = tbool(n, f, 'with no grade-4 cases NV recall is NaN, not 0', isnan(noNv.nv.recall));
[n,f] = tbool(n, f, 'and the note says UNMEASURED rather than reporting a figure', ...
    contains(noNv.nv.note, 'UNMEASURED'));
fprintf('    "%s"\n', strtrim(noNv.nv.note));

% ── Input validation ────────────────────────────────────────────────────────
fprintf('\n--- rejects bad input ---\n');
[n,f] = terr(n, f, 'rejects a label/probability length mismatch', ...
    @() computeDrMetrics([0 1 2]', buildProbs([0 1]', [0.9 0.9]')), 'sizeMismatch');
[n,f] = terr(n, f, 'rejects a probability matrix that is not Nx5', ...
    @() computeDrMetrics([0 1]', [0.5 0.5; 0.5 0.5]), 'badProbs');
[n,f] = terr(n, f, 'rejects a grade of 5', ...
    @() computeDrMetrics([0 5]', buildProbs([0 0]', [0.9 0.9]')), 'badLabels');
[n,f] = terr(n, f, 'rejects a non-integer grade', ...
    @() computeDrMetrics([0 1.5]', buildProbs([0 0]', [0.9 0.9]')), 'badLabels');

% ── The harness end to end ──────────────────────────────────────────────────
fprintf('\n===== evaluateMetrics, end to end =====\n');
outDir = fullfile(tempdir, 'dr_eval_test');
if exist(outDir, 'dir'), rmdir(outDir, 's'); end

res = evaluateMetrics([], [], struct( ...
    'probs', probs, 'trueGrades', trueGrades, ...
    'outputDir', outDir, 'versionId', 'branchA_test', 'quiet', true));

[n,f] = tnum(n, f, 'the harness reproduces the hand-computed sensitivity', ...
    res.beforeTemperature.sensitivity, 0.75, TOL);
[n,f] = tbool(n, f, 'a .mat was written', exist(res.matPath, 'file') == 2);
[n,f] = tbool(n, f, 'a human-readable summary was written', exist(res.summaryPath, 'file') == 2);

txt = fileread(res.summaryPath);
[n,f] = tbool(n, f, 'the summary states the sensitivity', contains(txt, '0.7500'));
[n,f] = tbool(n, f, 'the summary carries the confidence interval, not a bare number', ...
    contains(txt, '95% CI'));
[n,f] = tbool(n, f, 'the summary prints the confusion matrix', contains(txt, 'pred0'));
[n,f] = tbool(n, f, 'the summary reports NV separately', contains(txt, 'NV recall'));
[n,f] = tbool(n, f, 'the summary reports the reliability diagram', contains(txt, 'Reliability diagram'));
[n,f] = tbool(n, f, 'the summary names the split it describes as the only claim made', ...
    contains(txt, 'THIS test split only'));

% ── model_versions: the columns the promotion gate reads ────────────────────
fprintf('\n--- model_versions row ---\n');
[n,f] = tnum(n, f, 'validation_sensitivity', res.modelVersionsRow.validation_sensitivity, 0.75, TOL);
[n,f] = tnum(n, f, 'validation_specificity', res.modelVersionsRow.validation_specificity, 1.00, TOL);
[n,f] = tnum(n, f, 'validation_kappa',       res.modelVersionsRow.validation_kappa, 0.84375, 1e-12);
[n,f] = tbool(n, f, 'version_id is carried through', ...
    strcmp(res.modelVersionsRow.version_id, 'branchA_test'));
[n,f] = tbool(n, f, 'all three gate columns are present and finite', ...
    isfinite(res.modelVersionsRow.validation_sensitivity) && ...
    isfinite(res.modelVersionsRow.validation_specificity) && ...
    isfinite(res.modelVersionsRow.validation_kappa));
fprintf('    continualLearningService.js gates on exactly these three columns\n');

% An unmeasurable metric must reach the database as NULL. The gate refuses to
% promote on a missing metric; a 0 would read as a measured catastrophe, and
% "no data" is neither of those things.
allSame = evaluateMetrics([], [], struct( ...
    'probs', buildProbs([0 0 0]', [0.9 0.9 0.9]'), 'trueGrades', [0 0 0]', ...
    'outputDir', outDir, 'versionId', 'branchA_degenerate', 'quiet', true));
[n,f] = tbool(n, f, 'an unmeasurable kappa stays NaN in the row', ...
    isnan(allSame.modelVersionsRow.validation_kappa));
[n,f] = tbool(n, f, 'and is written as NULL in the summary, never as 0', ...
    contains(fileread(allSame.summaryPath), 'validation_kappa       = NULL'));

% ── Temperature scaling ─────────────────────────────────────────────────────
fprintf('\n--- temperature scaling ---\n');

noCal = evaluateMetrics([], [], struct( ...
    'probs', probs, 'trueGrades', trueGrades, ...
    'outputDir', outDir, 'versionId', 'branchA_nocal', 'quiet', true));
[n,f] = tbool(n, f, 'with no calibration fold, no temperature is invented', ...
    isnan(noCal.temperature));
[n,f] = tbool(n, f, 'and the "after" metrics are absent rather than a copy of "before"', ...
    isempty(noCal.afterTemperature));
[n,f] = tbool(n, f, 'and the summary says the test split will not be used to fit one', ...
    contains(fileread(noCal.summaryPath), 'refused by design'));

% T = 1 must be the identity.
identity = evaluateMetrics([], [], struct( ...
    'probs', probs, 'trueGrades', trueGrades, 'temperature', 1.0, ...
    'outputDir', outDir, 'versionId', 'branchA_t1', 'quiet', true));
[n,f] = tnum(n, f, 'T = 1 leaves ECE unchanged (it is the identity)', ...
    identity.afterTemperature.ece, identity.beforeTemperature.ece, 1e-12);
[n,f] = tnum(n, f, 'T = 1 leaves mean confidence unchanged', ...
    identity.afterTemperature.meanConfidence, identity.beforeTemperature.meanConfidence, 1e-12);

% Monotonicity: no temperature can reorder a row, so the decision metrics are
% invariant. If this ever fails, temperature scaling is silently changing
% diagnoses, which would be a far worse bug than a bad ECE.
for T = [0.5 2.0 5.0]
    scaled = evaluateMetrics([], [], struct( ...
        'probs', probs, 'trueGrades', trueGrades, 'temperature', T, ...
        'outputDir', outDir, 'versionId', sprintf('branchA_t%g', T), 'quiet', true));
    [n,f] = tbool(n, f, sprintf('T = %.1f does not change the confusion matrix', T), ...
        isequal(scaled.afterTemperature.confusionMatrix, expectedC));
    [n,f] = tbool(n, f, sprintf('T = %.1f does not change sensitivity or kappa', T), ...
        abs(scaled.afterTemperature.sensitivity - 0.75) < TOL && ...
        abs(scaled.afterTemperature.quadraticWeightedKappa - 0.84375) < 1e-12);
end

% T > 1 softens confidence, T < 1 sharpens it. This is the direction check;
% getting it backwards would make an overconfident model MORE overconfident.
soft = evaluateMetrics([], [], struct('probs', probs, 'trueGrades', trueGrades, ...
    'temperature', 3.0, 'outputDir', outDir, 'versionId', 'soft', 'quiet', true));
sharp = evaluateMetrics([], [], struct('probs', probs, 'trueGrades', trueGrades, ...
    'temperature', 0.4, 'outputDir', outDir, 'versionId', 'sharp', 'quiet', true));
[n,f] = tbool(n, f, 'T > 1 lowers mean confidence', ...
    soft.afterTemperature.meanConfidence < m.meanConfidence);
[n,f] = tbool(n, f, 'T < 1 raises mean confidence', ...
    sharp.afterTemperature.meanConfidence > m.meanConfidence);
fprintf('    mean confidence: %.4f at T=0.4, %.4f at T=1, %.4f at T=3\n', ...
    sharp.afterTemperature.meanConfidence, m.meanConfidence, soft.afterTemperature.meanConfidence);

% ── Fitting a temperature on a separate fold ────────────────────────────────
fprintf('\n--- fitting the temperature ---\n');
% An overconfident calibration set: it claims 0.99 but is right only 60% of the
% time. The fitted temperature must exceed 1 -- that is the correction.
rng(7);
nCal = 400;
calGrades = zeros(nCal, 1);
calPred   = zeros(nCal, 1);
for i = 1:nCal
    calGrades(i) = mod(i, 5);
    if rand() < 0.6, calPred(i) = calGrades(i); else, calPred(i) = mod(calGrades(i) + 1, 5); end
end
calProbs = buildProbs(calPred, 0.99*ones(nCal, 1));

fitted = evaluateMetrics([], [], struct( ...
    'probs', probs, 'trueGrades', trueGrades, ...
    'calibrationProbs', calProbs, 'calibrationGrades', calGrades, ...
    'outputDir', outDir, 'versionId', 'branchA_fitted', 'quiet', true));
[n,f] = tbool(n, f, 'an overconfident calibration fold fits a temperature > 1', ...
    fitted.temperature > 1);
[n,f] = tbool(n, f, 'the summary records where the temperature came from', ...
    contains(fileread(fitted.summaryPath), 'calibration predictions'));
fprintf('    fitted T = %.4f from a fold that claims 0.99 and is right ~60%%\n', fitted.temperature);

% The fitted T must actually reduce ECE ON THE FOLD IT WAS FIT ON. That is the
% weakest possible claim -- it says the optimiser worked, nothing about
% generalisation -- but if even this fails the optimiser is broken.
calBefore = computeDrMetrics(calGrades, calProbs);
calAfter  = computeDrMetrics(calGrades, applyT(calProbs, fitted.temperature));
[n,f] = tbool(n, f, 'the fitted temperature reduces ECE on its own fold', ...
    calAfter.ece < calBefore.ece);
fprintf('    ECE on the calibration fold: %.4f -> %.4f\n', calBefore.ece, calAfter.ece);

% A well-calibrated fold needs almost no correction.
calibratedProbs = zeros(500, 5);
calibratedGrades = zeros(500, 1);
for i = 1:500
    g = mod(i, 5);
    calibratedGrades(i) = g;
    if rand() < 0.8, p = g; else, p = mod(g + 1 + floor(rand()*4), 5); end
    calibratedProbs(i, :) = (0.2/4) * ones(1, 5);
    calibratedProbs(i, p + 1) = 0.8;
end
calT = fitTemperatureVia(calibratedProbs, calibratedGrades, outDir);
[n,f] = tbool(n, f, 'a well-calibrated fold fits T near 1', abs(calT - 1) < 0.35);
fprintf('    fitted T = %.4f on a fold that claims 0.80 and is right ~80%%\n', calT);

% ── Refuses to run with nothing to measure ──────────────────────────────────
fprintf('\n--- refuses to fabricate ---\n');
[n,f] = terr(n, f, 'refuses without either a model or predictions', ...
    @() evaluateMetrics([], [], struct('outputDir', outDir, 'quiet', true)), 'noInput');
[n,f] = terr(n, f, 'refuses on an empty test set', ...
    @() evaluateMetrics([], [], struct('probs', zeros(0,5), 'trueGrades', [], ...
        'outputDir', outDir, 'quiet', true)), 'emptyTestSet');

% ── Result ──────────────────────────────────────────────────────────────────
fprintf('\n===== %d checks, %d failed =====\n', n, f);
fprintf('Artefacts in %s\n', outDir);
fprintf(['NOTE: these tests verify the ARITHMETIC. No Branch A model has been\n' ...
         'trained and no grading dataset is present, so no accuracy, sensitivity\n' ...
         'or kappa has been measured for this system. Do not quote one.\n']);
if f > 0
    error('testEvaluateMetrics:failed', '%d check(s) failed.', f);
end
end

% ── Helpers ─────────────────────────────────────────────────────────────────
function probs = buildProbs(predGrades, confs)
% Rows whose argmax is predGrades and whose max is confs, remainder spread
% evenly. Lets a test state "predicted grade 2 with confidence 0.55" directly.
nRows = numel(predGrades);
probs = zeros(nRows, 5);
for i = 1:nRows
    rest = (1 - confs(i)) / 4;
    probs(i, :) = rest;
    probs(i, predGrades(i) + 1) = confs(i);
end
end

function p = applyT(probs, T)
logits = log(max(probs, realmin)) / T;
logits = logits - max(logits, [], 2);
e = exp(logits);
p = e ./ sum(e, 2);
end

function T = fitTemperatureVia(calProbs, calGrades, outDir)
% fitTemperature is a local function inside evaluateMetrics, so it is reached
% through the public entry point rather than duplicated here.
r = evaluateMetrics([], [], struct( ...
    'probs', calProbs, 'trueGrades', calGrades, ...
    'calibrationProbs', calProbs, 'calibrationGrades', calGrades, ...
    'outputDir', outDir, 'versionId', 'fitprobe', 'quiet', true));
T = r.temperature;
end

function [n, f] = tnum(n, f, label, actual, expected, tol)
n = n + 1;
if isnan(expected) && isnan(actual)
    fprintf('  PASS  %s\n', label);
    return;
end
if abs(actual - expected) <= tol
    fprintf('  PASS  %s\n', label);
else
    fprintf('  FAIL  %s  (expected %.10g, got %.10g)\n', label, expected, actual);
    f = f + 1;
end
end

function [n, f] = tbool(n, f, label, cond)
n = n + 1;
if cond
    fprintf('  PASS  %s\n', label);
else
    fprintf('  FAIL  %s\n', label);
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
