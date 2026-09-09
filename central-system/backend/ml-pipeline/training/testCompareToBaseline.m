function testCompareToBaseline()
% TESTCOMPARETOBASELINE  Unit tests for Task 9.2.
%
%   Run: matlab -batch "testCompareToBaseline"
%
%   The fixtures are constructed so the ANSWER IS KNOWN BEFORE THE CODE RUNS —
%   in particular the two cases that matter most and are easiest to get wrong:
%
%     - a pipeline that wins ONLY by deferring must be reported as not winning;
%     - a pipeline that genuinely loses must be reported as losing.
%
%   Both are checked here against hand-built inputs, because a comparison
%   harness that cannot produce a negative result is not measuring anything.

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);

fprintf('\n===== Task 9.2: integrated vs single-technique =====\n');
n = 0; f = 0;
TOL = 1e-12;
OUT = fullfile(tempdir, 'dr_compare_test');

% ═══ Coverage bookkeeping ══════════════════════════════════════════════════
fprintf('\n--- coverage is tracked per configuration ---\n');

% 10 cases. Branch B ran on 7 of them (3 NaN). The branches disagree on 2.
trueGrades = [0 0 1 1 2 2 3 3 4 4]';
cnnGrades  = [0 0 1 1 2 2 3 3 4 4]';        % Branch A is perfect here
cnnProbs = buildProbs(cnnGrades, [0.95 0.90 0.85 0.80 0.75 0.70 0.65 0.60 0.55 0.50]');
ruleGrades = [0 0 1 NaN NaN NaN 3 2 4 0]';  % 7 available, disagrees on #8 and #10

r = compareToBaseline(struct('trueGrades', trueGrades, 'cnnProbs', cnnProbs, ...
    'ruleGrades', ruleGrades), struct('outputDir', OUT, 'versionId', 'cov', 'quiet', true));

[n,f] = tnum(n, f, 'Branch A answers everything (coverage 1.0)', r.branchA.coverage, 1.0, TOL);
[n,f] = tnum(n, f, 'Branch B coverage is 7/10 (3 cases had no lesion counts)', r.branchB.coverage, 0.7, TOL);
[n,f] = tnum(n, f, 'integrated defers the 2 disagreements', r.integrated.deferred, 2, TOL);
[n,f] = tnum(n, f, 'integrated coverage is 8/10', r.integrated.coverage, 0.8, TOL);

% ═══ THE CENTRAL TEST: winning by deferral alone must not count ════════════
fprintf('\n--- a pipeline that wins ONLY by deferring must not be credited ---\n');

% 40 cases. Branch A is wrong on exactly the 8 it is least confident about.
% The "integrated" system defers precisely those 8 — so on what it answers it
% is perfect, while Branch A alone scores 32/40.
%
% That looks like a decisive win and is entirely an artefact of deferral: a
% matched-coverage Branch A, deferring its own 8 least-confident cases, drops
% exactly the same 8 and is also perfect. The verdict must therefore be "no
% difference demonstrated", NOT a win.
nCase = 40;
tg = repmat([0 1 2 3]', 10, 1);
pg = tg;
conf = linspace(0.99, 0.55, nCase)';
wrongIdx = (nCase-7):nCase;                  % the 8 least confident
pg(wrongIdx) = mod(tg(wrongIdx) + 2, 5);     % make Branch A wrong there
probs = buildProbs(pg, conf);
deferSame = false(nCase, 1); deferSame(wrongIdx) = true;

rDefer = compareToBaseline(struct('trueGrades', tg, 'cnnProbs', probs, ...
    'ruleGrades', nan(nCase, 1), 'deferMask', deferSame), ...
    struct('outputDir', OUT, 'versionId', 'defer', 'quiet', true));

[n,f] = tnum(n, f, 'unmatched: integrated answers 32 of 40', ...
    rDefer.integrated.answered, 32, TOL);
[n,f] = tnum(n, f, 'unmatched: integrated accuracy is a perfect 1.0', ...
    rDefer.integrated.metrics.accuracy, 1.0, TOL);
[n,f] = tnum(n, f, 'unmatched: Branch A alone scores 32/40', ...
    rDefer.branchA.metrics.accuracy, 0.8, TOL);
fprintf('        unmatched, this reads as 1.000 vs 0.800 -- a crushing win\n');

[n,f] = tbool(n, f, 'matched-coverage comparison is applicable', rDefer.matched.applicable);
[n,f] = tnum(n, f, 'matched: the baseline also answers 32', ...
    rDefer.matched.branchA.answered, 32, TOL);
[n,f] = tnum(n, f, 'matched: and is ALSO perfect -- the delta vanishes', ...
    rDefer.matched.branchA.metrics.accuracy, 1.0, TOL);
[n,f] = tnum(n, f, 'matched: sensitivity delta is exactly 0', ...
    rDefer.matched.sensitivityDelta, 0, TOL);
[n,f] = tbool(n, f, 'VERDICT: no win is claimed', ...
    rDefer.verdict.integratedBeatsBaseline == false);
[n,f] = tbool(n, f, 'and the verdict says the difference is not demonstrated', ...
    contains(rDefer.verdict.statement, 'No difference is demonstrated'));
fprintf('        matched, the same 8 cases are dropped by both and the\n');
fprintf('        delta is 0.0000 -- deferral did the work, not the second branch\n');

% ═══ A genuine loss must be reported as a loss ═════════════════════════════
fprintf('\n--- and a genuine loss is reported as a loss ---\n');

% The integrated system defers cases Branch A got RIGHT and keeps ones it got
% WRONG, while Branch A's own confidence-based deferral drops exactly its
% errors. A comparison harness that cannot say "worse" is not measuring
% anything, so this fixture is built to make it say so.
%
% 60 cases:
%   1..40  Branch A correct,   confidence 0.95
%   41..60 Branch A WRONG,     confidence 0.55  <- its least confident
%   integrated defers 1..20    (correct, high confidence) and keeps the errors
%   matched baseline defers 41..60 (its 20 least confident) = exactly its errors
% So the baseline answers 40 cases perfectly; the integrated answers 40 of
% which 20 are wrong.
%
% The first version of this fixture failed to produce a loss: Branch A's
% least-confident cases turned out to be the very ones the integrated system
% deferred, so both configurations dropped the same rows and scored an
% identical 0.500. Worth recording — a fixture that cannot distinguish the two
% arms proves nothing about a comparison harness.
nL = 60;
tgL = repmat([0 1 2 3]', 15, 1);
pgL = tgL;
badIdx = 41:60;
pgL(badIdx) = mod(tgL(badIdx) + 2, 5);
confL = [repmat(0.95, 40, 1); repmat(0.55, 20, 1)];
probsL = buildProbs(pgL, confL);
deferGood = false(nL, 1); deferGood(1:20) = true;   % defer 20 CORRECT cases

rLoss = compareToBaseline(struct('trueGrades', tgL, 'cnnProbs', probsL, ...
    'ruleGrades', nan(nL, 1), 'deferMask', deferGood), ...
    struct('outputDir', OUT, 'versionId', 'loss', 'quiet', true));

[n,f] = tbool(n, f, 'the integrated config scores worse than the matched baseline', ...
    rLoss.integrated.metrics.accuracy < rLoss.matched.branchA.metrics.accuracy, ...
    sprintf('%.3f vs %.3f', rLoss.integrated.metrics.accuracy, ...
            rLoss.matched.branchA.metrics.accuracy));
[n,f] = tbool(n, f, 'no win is claimed', rLoss.verdict.integratedBeatsBaseline == false);
[n,f] = tbool(n, f, 'the summary contains the word WORSE, not a hedge', ...
    contains(rLoss.summary, 'WORSE'));
fprintf('        "%s"\n', firstSentence(rLoss.verdict.statement));

% ═══ Verdicts rest on intervals, not point estimates ═══════════════════════
fprintf('\n--- a small point-estimate gap is NOT a win ---\n');

% 20 cases, integrated one case better. The intervals overlap enormously at
% this n, so the claim must be refused.
nS = 20;
tgS = repmat([0 2]', 10, 1);
pgS = tgS; pgS(1) = 2;                        % one Branch A error
probsS = buildProbs(pgS, linspace(0.9, 0.6, nS)');
deferOne = false(nS, 1); deferOne(1) = true;

rSmall = compareToBaseline(struct('trueGrades', tgS, 'cnnProbs', probsS, ...
    'ruleGrades', nan(nS, 1), 'deferMask', deferOne), ...
    struct('outputDir', OUT, 'versionId', 'small', 'quiet', true));
[n,f] = tbool(n, f, 'overlapping intervals -> no claim', ...
    rSmall.verdict.claimIsSupported == false);
[n,f] = tbool(n, f, 'and the basis names the overlap', ...
    contains(rSmall.verdict.basis, 'overlapping'));

% ═══ Disagreement lift ═════════════════════════════════════════════════════
fprintf('\n--- disagreement lift: is the alarm worth anything? ---\n');

% 20 cases. Branch A is wrong on 4. The branches disagree on exactly those 4
% and nowhere else, so the flag is a perfect error detector.
%   P(wrong) = 4/20 = 0.20 ; P(wrong | disagree) = 4/4 = 1.00 ; lift = 5.0
nD = 20;
tgD = repmat([0 1 2 3]', 5, 1);
pgD = tgD;
errIdx = [3 7 11 15];
pgD(errIdx) = mod(tgD(errIdx) + 1, 5);
probsD = buildProbs(pgD, repmat(0.8, nD, 1));
rgD = pgD;                       % rule agrees with the CNN everywhere...
rgD(errIdx) = tgD(errIdx);       % ...except the 4 errors, where it is right

rLift = compareToBaseline(struct('trueGrades', tgD, 'cnnProbs', probsD, ...
    'ruleGrades', rgD), struct('outputDir', OUT, 'versionId', 'lift', 'quiet', true));

[n,f] = tnum(n, f, 'P(Branch A wrong) = 4/20', rLift.agreement.branchAErrorRate, 0.20, TOL);
[n,f] = tnum(n, f, 'P(wrong | disagreement) = 4/4', ...
    rLift.agreement.branchAErrorGivenDisagree, 1.0, TOL);
[n,f] = tnum(n, f, 'P(wrong | agreement) = 0/16', ...
    rLift.agreement.branchAErrorGivenAgree, 0.0, TOL);
[n,f] = tnum(n, f, 'lift = 1.00 / 0.20 = 5.0', rLift.agreement.disagreementLift, 5.0, TOL);
fprintf('        a perfect alarm scores lift 5.0 on this fixture\n');

% A USELESS alarm must score lift near 1. Disagreements placed on cases Branch
% A got right: the flag fires, and catches nothing.
rgU = pgD;
rgU([1 5 9 13]) = mod(pgD([1 5 9 13]) + 1, 5);   % disagree on 4 CORRECT cases
rUseless = compareToBaseline(struct('trueGrades', tgD, 'cnnProbs', probsD, ...
    'ruleGrades', rgU), struct('outputDir', OUT, 'versionId', 'useless', 'quiet', true));
[n,f] = tnum(n, f, 'an alarm that fires only on CORRECT cases scores lift 0', ...
    rUseless.agreement.disagreementLift, 0, TOL);
fprintf('        lift 0 -- the flag is pure reviewer cost, whatever the\n');
fprintf('        accuracy numbers happen to say\n');

% ═══ Branch B calibration must not be quoted ═══════════════════════════════
fprintf('\n--- Branch B has no confidence, and the report says so ---\n');
[n,f] = tbool(n, f, 'Branch B is flagged as having meaningless calibration', ...
    r.branchB.calibrationIsMeaningless == true);
[n,f] = tbool(n, f, 'and the summary refuses to print its ECE', ...
    contains(r.summary, 'NOT REPORTED'));
[n,f] = tbool(n, f, 'the note explains the one-hot encoding', ...
    contains(r.branchB.calibrationNote, 'one-hot'));

% ═══ Artefacts and edge cases ══════════════════════════════════════════════
fprintf('\n--- artefacts and edges ---\n');
[n,f] = tbool(n, f, 'writes a .mat', exist(r.matPath, 'file') == 2);
[n,f] = tbool(n, f, 'writes a readable summary', exist(r.summaryPath, 'file') == 2);
[n,f] = tbool(n, f, 'the summary states coverage before any metric', ...
    contains(r.summary, 'COVERAGE IS PART OF EVERY NUMBER'));

% Deferring nothing: the matched comparison is not applicable and must say so
% rather than silently comparing a config against itself.
rNone = compareToBaseline(struct('trueGrades', trueGrades, 'cnnProbs', cnnProbs, ...
    'ruleGrades', nan(10, 1)), struct('outputDir', OUT, 'versionId', 'none', 'quiet', true));
[n,f] = tbool(n, f, 'deferring nothing -> matched comparison not applicable', ...
    rNone.matched.applicable == false);
[n,f] = tbool(n, f, 'and no rule engine -> agreement rate is NaN, not 0', ...
    isnan(rNone.agreement.agreementRate));
fprintf('        (0%% agreement and "the rule engine never ran" are different\n');
fprintf('         facts; reporting the second as the first would be a lie)\n');

[n,f] = terr(n, f, 'rejects a probability matrix of the wrong size', ...
    @() compareToBaseline(struct('trueGrades', [0 1]', 'cnnProbs', zeros(2, 3))), ...
    'badCnnProbs');
[n,f] = terr(n, f, 'rejects a ruleGrades vector of the wrong length', ...
    @() compareToBaseline(struct('trueGrades', [0 1]', ...
        'cnnProbs', buildProbs([0 1]', [0.9 0.9]'), 'ruleGrades', [0 1 2]')), ...
    'badRuleGrades');
[n,f] = terr(n, f, 'rejects an out-of-range rule grade', ...
    @() compareToBaseline(struct('trueGrades', [0 1]', ...
        'cnnProbs', buildProbs([0 1]', [0.9 0.9]'), 'ruleGrades', [0 9]')), ...
    'badRuleGrade');

fprintf('\n===== %d checks, %d failed =====\n', n, f);
fprintf(['NOTE: run on synthetic fixtures. No trained Branch A and no lesion\n' ...
         'counts exist, so this comparison has never been run on real\n' ...
         'predictions and NO comparative claim is currently supported.\n']);
if f > 0
    error('testCompareToBaseline:failed', '%d check(s) failed.', f);
end
end

% ── Helpers ────────────────────────────────────────────────────────────────
function probs = buildProbs(predGrades, confs)
nRows = numel(predGrades);
probs = zeros(nRows, 5);
for i = 1:nRows
    rest = (1 - confs(i)) / 4;
    probs(i, :) = rest;
    probs(i, predGrades(i) + 1) = confs(i);
end
end

function s = firstSentence(t)
k = strfind(t, '. ');
if isempty(k), s = t; else, s = t(1:k(1)); end
end

function [n, f] = tnum(n, f, label, actual, expected, tol)
n = n + 1;
if (isnan(expected) && isnan(actual)) || abs(actual - expected) <= tol
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
