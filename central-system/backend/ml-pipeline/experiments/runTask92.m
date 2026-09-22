function report = runTask92(csvPath, varargin)
% RUNTASK92  Task 9.2 on real predictions: integrated pipeline vs Branch A alone.
%
%   report = runTask92()
%   report = runTask92('task92_inputs.csv')
%   report = runTask92('', 'Parallel', true)   % force the parallel path
%
%   Reads the paired predictions collectTask92Inputs.py wrote, runs the REAL
%   ruleEngineGrade and branchesAgree over them, and hands the result to
%   compareToBaseline.
%
%   compareToBaseline has existed and been unit-tested since 2026-09-09 but was
%   never run on real predictions, because until Branch B was wired there was no
%   integrated pipeline to compare against. This is that run.
%
%   ── THE DEFER RULE IS THE PRODUCTION ONE ───────────────────────────────────
%   compareToBaseline defaults deferMask to branch disagreement. That default is
%   no longer what this system actually does, so it is passed explicitly:
%
%     - branches disagree (agree == false)                    -> defer
%     - Branch A grades ABOVE the rule engine's ceiling       -> defer
%       (no second opinion is possible on grade 4 at all)
%
%   A capped rule grade with Branch A at or above it returns [] from
%   branchesAgree — consistent but unconfirmed — and does NOT defer. Scoring the
%   comparison against a defer rule the deployed system does not use would
%   measure a pipeline nobody is running.

if nargin < 1 || isempty(csvPath)
    csvPath = fullfile(fileparts(mfilename('fullpath')), 'task92_inputs.csv');
end

thisDir = fileparts(mfilename('fullpath'));
mlRoot  = fileparts(thisDir);
addpath(fullfile(mlRoot, 'grading'));
addpath(fullfile(mlRoot, 'training'));

T = readtable(csvPath, 'TextType', 'string');
n = height(T);

trueGrades = double(T.true_grade);
cnnProbs   = [T.p0 T.p1 T.p2 T.p3 T.p4];
cnnGrades  = zeros(n, 1);
for i = 1:n
    [~, k] = max(cnnProbs(i, :));
    cnnGrades(i) = k - 1;
end

ruleGrades = nan(n, 1);
deferMask  = false(n, 1);
% 0 = Branch B could not run, 1 = agree, 2 = disagree, 3 = unconfirmed.
% Per-case outcomes are recorded in an array and TALLIED AFTERWARDS rather
% than incremented inside the loop: counters accumulated across iterations are
% the one thing a parfor cannot do in loop order, and a reduction here would
% be a subtler way of writing the same tally with more ways to get it wrong.
outcome = zeros(n, 1);

% ── Parallel only when it pays ─────────────────────────────────────────────
% Each case is one rule-engine call and one agreement check: microseconds. On
% the 52-image held-out split the pool takes longer to START than the whole
% loop takes to run, so the default is serial and the parfor is for the corpus
% this becomes when Tanuj's M5 lands and every case needs re-grading against
% recalibrated thresholds. Claiming a speed-up on 52 cases would be a lie the
% timing at the end of this function would immediately expose.
usePar = shouldParallelise(n, varargin{:});

t0 = tic;
if usePar
    parfor i = 1:n
        [ruleGrades(i), deferMask(i), outcome(i)] = ...
            gradeOne(T.red_q(i), T.bright_q(i), cnnGrades(i));
    end
else
    for i = 1:n
        [ruleGrades(i), deferMask(i), outcome(i)] = ...
            gradeOne(T.red_q(i), T.bright_q(i), cnnGrades(i));
    end
end
elapsed = toc(t0);

agreeCount       = sum(outcome == 1);
disagreeCount    = sum(outcome == 2);
unconfirmedCount = sum(outcome == 3);

fprintf('\n=================================================================\n');
fprintf('  TASK 9.2 -- integrated pipeline vs single-technique baseline\n');
fprintf('  n = %d held-out images, real predictions from both branches\n', n);
fprintf('=================================================================\n');
fprintf('Branch B produced a grade on %d of %d\n', sum(~isnan(ruleGrades)), n);
fprintf('  branches agree            : %d\n', agreeCount);
fprintf('  branches disagree         : %d   (deferred)\n', disagreeCount);
fprintf('  consistent but unconfirmed: %d   (rule grade at its ceiling)\n', unconfirmedCount);
fprintf('  total deferred            : %d\n', sum(deferMask));
fprintf('  graded in %.3f s (%s)\n', elapsed, ternary(usePar, 'parfor', 'serial'));

inputs = struct('trueGrades', trueGrades, 'cnnProbs', cnnProbs, ...
                'ruleGrades', ruleGrades, 'deferMask', deferMask);
report = compareToBaseline(inputs, struct( ...
    'outputDir', thisDir, 'versionId', 'task92_real'));
end

% ─────────────────────────────────────────────────────────────────────────────
function v = parseCounts(s)
% "4 3 5 3" -> [4 3 5 3]; empty or malformed -> [] so the caller can tell.
if ismissing(s) || strlength(strtrim(s)) == 0
    v = []; return;
end
v = str2double(split(strtrim(s)))';
if numel(v) ~= 4 || any(~isfinite(v))
    v = [];
end
end

% ─────────────────────────────────────────────────────────────────────────────
function [ruleGrade, defer, outcome] = gradeOne(redStr, brightStr, cnnGrade)
% One case: the real rule engine and the real agreement rule, nothing else.
% Pure in, pure out, so it behaves identically under for and parfor.
ruleGrade = NaN; defer = false; outcome = 0;

red    = parseCounts(redStr);
bright = parseCounts(brightStr);
if isempty(red) || isempty(bright)
    % NaN, not 0: the rule engine could not run. compareToBaseline treats NaN
    % as "no Branch B opinion" and excludes it from integrated coverage, which
    % is the honest accounting.
    return;
end

[g, ev] = ruleEngineGrade(red, bright, 0);
ruleGrade = g;

agree = branchesAgree(cnnGrade, g, ev.isLowerBound);
if isempty(agree)
    outcome = 3;
    % A CNN grade above the ceiling has no second opinion at all, so the
    % deployed system escalates it. Mirrored here.
    if cnnGrade > ev.maxGrade
        defer = true;
    end
elseif agree
    outcome = 1;
else
    outcome = 2;
    defer = true;
end
end

function tf = shouldParallelise(n, varargin)
q = inputParser;
q.addParameter('Parallel', 'auto');
q.addParameter('MinCases', 200);
q.parse(varargin{:});
o = q.Results;

hasPCT = ~isempty(ver('parallel')) && license('test', 'Distrib_Computing_Toolbox');
if islogical(o.Parallel)
    tf = o.Parallel && hasPCT;
else
    tf = hasPCT && n >= o.MinCases;
end
if tf && isempty(gcp('nocreate'))
    c = parcluster('Processes');
    parpool(c, min(4, c.NumWorkers));
end
end

function v = ternary(c, a, b)
if c, v = a; else, v = b; end
end
