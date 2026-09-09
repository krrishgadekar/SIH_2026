function report = compareToBaseline(inputs, opts)
% COMPARETOBASELINE  Integrated pipeline vs single-technique baselines.
%
%   report = compareToBaseline(inputs)
%   report = compareToBaseline(inputs, opts)
%
%   inputs (struct), all on the SAME held-out test split:
%     .trueGrades   Nx1 integers 0-4, the reference standard
%     .cnnProbs     Nx5 calibrated Branch A probabilities
%     .ruleGrades   Nx1 Branch B grades, NaN where the rule engine could not
%                   run (no lesion counts for that case)
%     .deferMask    Nx1 logical, optional — cases the integrated system sends
%                   to a human. Defaults to branch disagreement.
%   opts:
%     .outputDir    where the .mat and summary go
%     .versionId    names the outputs
%
%   Task 9.2. Answers the PS's expected-solution claim that "the integrated
%   pipeline outperforms any single technique approach".
%
%   ══ THE COMPARISON THIS FILE EXISTS TO GET RIGHT ═══════════════════════════
%   The integrated pipeline DEFERS. When the two branches disagree the case
%   goes to an ophthalmologist and the system returns no autonomous answer.
%   Branch A alone defers nothing — it answers every case.
%
%   So comparing their accuracies directly is comparing different things, and
%   it flatters the integrated system automatically: deferring is how you
%   improve accuracy without improving anything. A pipeline that answered only
%   the 30% of cases it found easiest would post a spectacular number and be
%   near-useless, and that is the shape of result an unguarded comparison
%   would produce and a judge would immediately puncture.
%
%   Three things therefore travel together in this report, and the summary
%   refuses to print an accuracy without them:
%
%     1. COVERAGE — what fraction each configuration actually answered.
%     2. METRICS ON THE ANSWERED SUBSET — honest, but not comparable across
%        configurations with different coverage.
%     3. THE MATCHED-COVERAGE COMPARISON — Branch A forced to defer its
%        least-confident cases until its coverage equals the integrated
%        system's, then re-scored. THIS is the head-to-head. If the integrated
%        pipeline wins here, it has earned it: both systems answered the same
%        number of cases and gave up on the same number.
%
%   If the integrated pipeline only wins at unmatched coverage, the honest
%   reading is that deferral did the work, not the second branch — and the
%   report says so in those words.
%
%   ── THE OTHER EVIDENCE, WHICH IS STRONGER THAN THE ACCURACY DELTA ──────────
%   The dual-branch design's real claim (design doc §1.11, §14) is not that it
%   grades better. It is that DISAGREEMENT IS A USEFUL ALARM — that cases where
%   the CNN and the rule engine differ are disproportionately cases where the
%   CNN is wrong.
%
%   That is directly measurable on a labelled test split, without any review
%   capacity: compare P(Branch A wrong | branches disagree) against the base
%   rate P(Branch A wrong). The ratio is the lift. A lift near 1 means the flag
%   is firing at random and the second branch is costing reviewer time for
%   nothing, however good the accuracy numbers look.
%
%   ── AND IF THE INTEGRATED PIPELINE LOSES ───────────────────────────────────
%   It is reported as a loss, in the summary, in those words. A measured
%   negative is a finding. A fabricated positive is misconduct and does not
%   survive one technically literate question.

if nargin < 2, opts = struct(); end

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);
addpath(fullfile(thisDir, '..', 'grading'));

outputDir = getdef(opts, 'outputDir', pwd);
versionId = getdef(opts, 'versionId', 'comparison_unversioned');

trueGrades = double(inputs.trueGrades(:));
cnnProbs   = inputs.cnnProbs;
N = numel(trueGrades);

if size(cnnProbs, 1) ~= N || size(cnnProbs, 2) ~= 5
    error('compareToBaseline:badCnnProbs', ...
          'cnnProbs must be %dx5, got %dx%d.', N, size(cnnProbs, 1), size(cnnProbs, 2));
end

ruleGrades = getfielddef(inputs, 'ruleGrades', nan(N, 1));
ruleGrades = double(ruleGrades(:));
if numel(ruleGrades) ~= N
    error('compareToBaseline:badRuleGrades', ...
          '%d ruleGrades for %d cases.', numel(ruleGrades), N);
end

[~, idx] = max(cnnProbs, [], 2);
cnnGrades = idx - 1;
cnnConfidence = max(cnnProbs, [], 2);
cnnWrong = cnnGrades ~= trueGrades;

haveRule = ~isnan(ruleGrades);
agree = haveRule & (ruleGrades == cnnGrades);
disagree = haveRule & (ruleGrades ~= cnnGrades);

% ── Configuration 1: Branch A alone, the single-technique baseline ──────────
report.branchA = scoreConfig(trueGrades, cnnProbs, true(N, 1), ...
    'Branch A CNN alone (single technique)');

% ── Configuration 2: Branch B alone ────────────────────────────────────────
% One-hot probabilities, because the rule engine produces a grade and no
% confidence at all. That is faithful, and it makes Branch B's ECE and mean
% confidence MEANINGLESS — a one-hot vector claims certainty on every case by
% construction. The report marks them so nobody quotes an ECE of 0.08 for a
% branch that has no notion of confidence.
ruleProbs = zeros(N, 5);
for i = 1:N
    if haveRule(i)
        g = ruleGrades(i);
        if isfinite(g) && g >= 0 && g <= 4
            ruleProbs(i, g + 1) = 1;
        else
            error('compareToBaseline:badRuleGrade', ...
                  'ruleGrades(%d) = %g is not an integer grade 0-4 or NaN.', i, g);
        end
    end
end
report.branchB = scoreConfig(trueGrades, ruleProbs, haveRule, ...
    'Branch B rule engine alone (single technique)');
report.branchB.calibrationIsMeaningless = true;
report.branchB.calibrationNote = ['Branch B emits a grade, not a distribution. Its ' ...
    'probabilities here are one-hot, so ECE and mean confidence are artefacts ' ...
    'of that encoding and must not be reported as calibration results.'];

% ── Configuration 3: the integrated pipeline ───────────────────────────────
% Defers on disagreement by default: that IS the integration — two branches,
% an agreement check, and a human for the cases they cannot settle.
deferMask = getfielddef(inputs, 'deferMask', disagree);
deferMask = logical(deferMask(:));
if numel(deferMask) ~= N
    error('compareToBaseline:badDeferMask', ...
          '%d deferMask entries for %d cases.', numel(deferMask), N);
end
answeredMask = ~deferMask;

report.integrated = scoreConfig(trueGrades, cnnProbs, answeredMask, ...
    'Integrated: dual-branch + agreement check, deferring disagreements');
report.integrated.deferred = sum(deferMask);

% ── The matched-coverage head-to-head ──────────────────────────────────────
% Branch A forced to defer exactly as many cases as the integrated system,
% choosing its LEAST CONFIDENT — which is the strongest deferral rule available
% to a single-branch system, so this is the baseline at its best rather than a
% straw man.
nDefer = sum(deferMask);
report.matched = matchedCoverageComparison( ...
    trueGrades, cnnProbs, cnnConfidence, nDefer, report.integrated);

% ── Branch agreement, and whether disagreement is a useful alarm ───────────
report.agreement = struct( ...
    'ruleEngineAvailable', sum(haveRule), ...
    'agreementRate',       safeDiv(sum(agree), sum(haveRule)), ...
    'disagreementRate',    safeDiv(sum(disagree), sum(haveRule)), ...
    'nDisagreements',      sum(disagree));

baseErrorRate = mean(cnnWrong);
if sum(disagree) > 0
    errorGivenDisagree = mean(cnnWrong(disagree));
else
    errorGivenDisagree = NaN;
end
if sum(agree) > 0
    errorGivenAgree = mean(cnnWrong(agree));
else
    errorGivenAgree = NaN;
end

report.agreement.branchAErrorRate            = baseErrorRate;
report.agreement.branchAErrorGivenDisagree   = errorGivenDisagree;
report.agreement.branchAErrorGivenAgree      = errorGivenAgree;
report.agreement.disagreementLift            = errorGivenDisagree / baseErrorRate;
report.agreement.liftInterpretation = ['lift = P(Branch A wrong | branches disagree) / ' ...
    'P(Branch A wrong). Above 1 means the flag concentrates real errors; at or ' ...
    'below 1 the second branch is spending reviewer time at random, whatever ' ...
    'the accuracy delta says.'];

% ── The verdict, stated on intervals rather than point estimates ───────────
report.verdict = buildVerdict(report);

report.n = N;
report.versionId = versionId;
report.evaluatedAt = datetime('now', 'TimeZone', 'UTC');

% ── Artefacts ──────────────────────────────────────────────────────────────
if ~exist(outputDir, 'dir'), mkdir(outputDir); end
matPath     = fullfile(outputDir, sprintf('comparison_%s.mat', versionId));
summaryPath = fullfile(outputDir, sprintf('comparison_%s.txt', versionId));

summary = formatComparison(report);
report.summary = summary;
report.matPath = matPath;
report.summaryPath = summaryPath;

save(matPath, 'report', '-v7.3');
fid = fopen(summaryPath, 'w');
if fid == -1
    error('compareToBaseline:writeFailed', 'Could not write %s', summaryPath);
end
fprintf(fid, '%s', summary);
fclose(fid);

if ~getdef(opts, 'quiet', false)
    fprintf('%s', summary);
    fprintf('\nWritten: %s\n         %s\n', matPath, summaryPath);
end
end

% ═══════════════════════════════════════════════════════════════════════════
function cfg = scoreConfig(trueGrades, probs, mask, label)
% Metrics on the cases this configuration actually answered.
mask = logical(mask(:));
cfg = struct('label', label, ...
             'coverage', mean(mask), ...
             'answered', sum(mask), ...
             'total', numel(mask));

if sum(mask) == 0
    cfg.metrics = [];
    cfg.note = 'answered no cases; nothing to score';
    return;
end
cfg.metrics = computeDrMetrics(trueGrades(mask), probs(mask, :));
end

% ═══════════════════════════════════════════════════════════════════════════
function matched = matchedCoverageComparison(trueGrades, cnnProbs, confidence, nDefer, integrated)
% Branch A, deferring its nDefer least-confident cases.
%
% Ties in confidence are broken by original order, deterministically. With
% synthetic or heavily quantised confidences ties are common, and a random
% tie-break would make the headline comparison irreproducible run to run.
N = numel(trueGrades);
matched = struct('nDeferred', nDefer);

if nDefer <= 0
    matched.applicable = false;
    matched.note = ['the integrated pipeline deferred nothing, so its coverage ' ...
                    'already equals Branch A''s and the unmatched comparison is ' ...
                    'the matched one'];
    matched.branchA = [];
    return;
end
if nDefer >= N
    matched.applicable = false;
    matched.note = 'the integrated pipeline deferred every case; nothing to compare';
    matched.branchA = [];
    return;
end

matched.applicable = true;
[~, order] = sort(confidence, 'ascend');
deferIdx = order(1:nDefer);
keep = true(N, 1);
keep(deferIdx) = false;

matched.branchA = scoreConfig(trueGrades, cnnProbs, keep, ...
    'Branch A alone, deferring its least-confident cases to match coverage');
matched.integrated = integrated;

if ~isempty(matched.branchA.metrics) && ~isempty(integrated.metrics)
    matched.sensitivityDelta = integrated.metrics.sensitivity - matched.branchA.metrics.sensitivity;
    matched.specificityDelta = integrated.metrics.specificity - matched.branchA.metrics.specificity;
    matched.kappaDelta = integrated.metrics.quadraticWeightedKappa ...
                       - matched.branchA.metrics.quadraticWeightedKappa;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function v = buildVerdict(report)
% Decides what may honestly be claimed. Deliberately conservative: it reports
% "not demonstrated" far more readily than "wins", because the cost of the two
% errors is not symmetric here — an overstated comparative claim is the kind
% that collapses under one question at a demo.
v = struct('integratedBeatsBaseline', false, ...
           'claimIsSupported', false, ...
           'basis', '', 'statement', '');

if isempty(report.integrated.metrics) || ~report.matched.applicable ...
        || isempty(report.matched.branchA) || isempty(report.matched.branchA.metrics)
    v.statement = ['No comparative claim can be made: there is no matched-coverage ' ...
                   'baseline to compare against.'];
    v.basis = 'matched comparison unavailable';
    return;
end

intM  = report.integrated.metrics;
baseM = report.matched.branchA.metrics;

% Compared on CONFIDENCE INTERVALS, not point estimates. Two systems scored on
% a few hundred images routinely differ by a couple of points with wholly
% overlapping intervals, and calling that a win is the single most common way a
% comparative claim turns out to be noise.
sensSeparated = intM.sensitivityCI(1) > baseM.sensitivityCI(2);
specSeparated = intM.specificityCI(1) > baseM.specificityCI(2);

% BOTH metrics are checked in BOTH directions. Testing only sensitivity for a
% loss was a real bug here: this fixture's integrated arm scored specificity
% 0.50 against the baseline's 1.00, with intervals nowhere near overlapping,
% and the verdict came back "no difference demonstrated". A screening pipeline
% that collapses on specificity floods the referral queue with false positives,
% which in a district programme is a failure of exactly the kind this report
% exists to catch.
sensWorse = intM.sensitivityCI(2) < baseM.sensitivityCI(1);
specWorse = intM.specificityCI(2) < baseM.specificityCI(1);

v.integratedBeatsBaseline = sensSeparated || specSeparated;
v.sensitivityIntervalsSeparated = sensSeparated;
v.specificityIntervalsSeparated = specSeparated;
v.sensitivityWorse = sensWorse;
v.specificityWorse = specWorse;

% A loss is checked BEFORE a win, so a pipeline that gains on one metric while
% collapsing on the other is reported as the mixed result it is rather than
% having the good half quoted.
if sensWorse || specWorse
    losses = {};
    if sensWorse, losses{end+1} = 'sensitivity'; end
    if specWorse, losses{end+1} = 'specificity'; end
    v.basis = sprintf('intervals separated in the baseline''s favour on %s', ...
                      strjoin(losses, ' and '));
    v.statement = sprintf( ...
        ['THE INTEGRATED PIPELINE IS WORSE than the single-technique baseline at ' ...
         'matched coverage, on %s. Report this as measured. It is a finding about ' ...
         'the pipeline, not a reason to change the comparison.'], ...
        strjoin(losses, ' and '));
    if sensSeparated || specSeparated
        v.statement = [v.statement ' (It is better on the other metric; that is a ' ...
                       'trade-off to state, not a win to quote.)'];
    end
elseif sensSeparated || specSeparated
    v.claimIsSupported = true;
    v.basis = 'non-overlapping 95% confidence intervals at matched coverage';
    v.statement = ['The integrated pipeline outperforms the single-technique ' ...
                   'baseline at matched coverage, with non-overlapping intervals.'];
else
    v.basis = 'overlapping 95% confidence intervals';
    v.statement = ['No difference is demonstrated: the confidence intervals overlap ' ...
                   'at matched coverage. The point estimates may differ, and that ' ...
                   'difference is not distinguishable from noise at this sample ' ...
                   'size. Do not claim the integrated pipeline wins.'];
end
end

% ═══════════════════════════════════════════════════════════════════════════
function s = formatComparison(r)
L = {};
L{end+1} = '===============================================================';
L{end+1} = sprintf('  Integrated pipeline vs single-technique baselines');
L{end+1} = sprintf('  %s  |  %d test cases', r.versionId, r.n);
L{end+1} = '===============================================================';
L{end+1} = '';
L{end+1} = 'COVERAGE IS PART OF EVERY NUMBER BELOW. A configuration that';
L{end+1} = 'answers fewer cases will score better on the ones it answers;';
L{end+1} = 'that is deferral working, not grading improving.';
L{end+1} = '';

for cfgName = {'branchA', 'branchB', 'integrated'}
    cfg = r.(cfgName{1});
    L{end+1} = sprintf('--- %s', cfg.label);
    L{end+1} = sprintf('    coverage %.1f%% (%d of %d answered)', ...
        100 * cfg.coverage, cfg.answered, cfg.total);
    if isempty(cfg.metrics)
        L{end+1} = sprintf('    %s', cfg.note);
    else
        m = cfg.metrics;
        L{end+1} = sprintf('    sensitivity %.4f  [%.4f - %.4f]', ...
            m.sensitivity, m.sensitivityCI(1), m.sensitivityCI(2));
        L{end+1} = sprintf('    specificity %.4f  [%.4f - %.4f]', ...
            m.specificity, m.specificityCI(1), m.specificityCI(2));
        L{end+1} = sprintf('    kappa %.4f   accuracy %.4f', ...
            m.quadraticWeightedKappa, m.accuracy);
        if isfield(cfg, 'calibrationIsMeaningless') && cfg.calibrationIsMeaningless
            L{end+1} = '    calibration: NOT REPORTED -- see note (one-hot encoding)';
        else
            L{end+1} = sprintf('    ECE %.4f', m.ece);
        end
    end
    L{end+1} = '';
end

L{end+1} = '--- THE HEAD-TO-HEAD: matched coverage ------------------------';
if ~r.matched.applicable
    L{end+1} = sprintf('    %s', r.matched.note);
else
    b = r.matched.branchA.metrics;
    i = r.integrated.metrics;
    L{end+1} = sprintf('    Both configurations answer %d cases; both defer %d.', ...
        r.matched.branchA.answered, r.matched.nDeferred);
    L{end+1} = '    Branch A defers its least-confident cases -- the strongest';
    L{end+1} = '    deferral rule a single-branch system has, so this is the';
    L{end+1} = '    baseline at its best, not a straw man.';
    L{end+1} = '';
    L{end+1} = '                     baseline          integrated        delta';
    L{end+1} = sprintf('    sensitivity      %.4f            %.4f        %+.4f', ...
        b.sensitivity, i.sensitivity, r.matched.sensitivityDelta);
    L{end+1} = sprintf('    specificity      %.4f            %.4f        %+.4f', ...
        b.specificity, i.specificity, r.matched.specificityDelta);
    L{end+1} = sprintf('    kappa            %.4f            %.4f        %+.4f', ...
        b.quadraticWeightedKappa, i.quadraticWeightedKappa, r.matched.kappaDelta);
end
L{end+1} = '';

L{end+1} = '--- Is disagreement a useful alarm? ---------------------------';
a = r.agreement;
L{end+1} = sprintf('    rule engine ran on %d of %d cases', a.ruleEngineAvailable, r.n);
L{end+1} = sprintf('    agreement %.1f%%, disagreement %.1f%% (%d cases)', ...
    100 * a.agreementRate, 100 * a.disagreementRate, a.nDisagreements);
L{end+1} = sprintf('    P(Branch A wrong)                  = %.4f', a.branchAErrorRate);
L{end+1} = sprintf('    P(Branch A wrong | branches agree) = %s', fmt(a.branchAErrorGivenAgree));
L{end+1} = sprintf('    P(Branch A wrong | disagreement)   = %s', fmt(a.branchAErrorGivenDisagree));
L{end+1} = sprintf('    LIFT                               = %s', fmt(a.disagreementLift));
L{end+1} = '';
L{end+1} = '    Lift above 1 means disagreement concentrates real errors --';
L{end+1} = '    the actual claim of the dual-branch design, and stronger';
L{end+1} = '    evidence for it than any accuracy delta. At or below 1 the';
L{end+1} = '    second branch is spending reviewer time at random.';
L{end+1} = '';

L{end+1} = '--- VERDICT ---------------------------------------------------';
L{end+1} = sprintf('    %s', r.verdict.statement);
L{end+1} = sprintf('    basis: %s', r.verdict.basis);
L{end+1} = '';
L{end+1} = 'Every figure describes THIS test split. Judged on confidence';
L{end+1} = 'intervals, not point estimates: two systems scored on a few';
L{end+1} = 'hundred images routinely differ by a point or two with fully';
L{end+1} = 'overlapping intervals, and calling that a win is how a';
L{end+1} = 'comparative claim turns out to be noise.';
L{end+1} = '===============================================================';
s = [strjoin(L, newline) newline];
end

% ═══════════════════════════════════════════════════════════════════════════
function s = fmt(v)
if isnan(v), s = 'UNMEASURED (no cases of this kind)'; else, s = sprintf('%.4f', v); end
end

function r = safeDiv(a, b)
if b == 0, r = NaN; else, r = a / b; end
end

function v = getfielddef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
