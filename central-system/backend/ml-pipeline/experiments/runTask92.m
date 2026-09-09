function report = runTask92(csvPath)
% RUNTASK92  Task 9.2 on real predictions: integrated pipeline vs Branch A alone.
%
%   report = runTask92()
%   report = runTask92('task92_inputs.csv')
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
agreeCount = 0; disagreeCount = 0; unconfirmedCount = 0;

for i = 1:n
    red    = parseCounts(T.red_q(i));
    bright = parseCounts(T.bright_q(i));
    if isempty(red) || isempty(bright)
        % NaN, not 0: the rule engine could not run. compareToBaseline treats
        % NaN as "no Branch B opinion" and excludes it from integrated
        % coverage, which is the honest accounting.
        continue;
    end

    [g, ev] = ruleEngineGrade(red, bright, 0);
    ruleGrades(i) = g;

    agree = branchesAgree(cnnGrades(i), g, ev.isLowerBound);

    if isempty(agree)
        unconfirmedCount = unconfirmedCount + 1;
        % A CNN grade above the ceiling has no second opinion at all, so the
        % deployed system escalates it. Mirrored here.
        if cnnGrades(i) > ev.maxGrade
            deferMask(i) = true;
        end
    elseif agree
        agreeCount = agreeCount + 1;
    else
        disagreeCount = disagreeCount + 1;
        deferMask(i) = true;
    end
end

fprintf('\n=================================================================\n');
fprintf('  TASK 9.2 -- integrated pipeline vs single-technique baseline\n');
fprintf('  n = %d held-out images, real predictions from both branches\n', n);
fprintf('=================================================================\n');
fprintf('Branch B produced a grade on %d of %d\n', sum(~isnan(ruleGrades)), n);
fprintf('  branches agree            : %d\n', agreeCount);
fprintf('  branches disagree         : %d   (deferred)\n', disagreeCount);
fprintf('  consistent but unconfirmed: %d   (rule grade at its ceiling)\n', unconfirmedCount);
fprintf('  total deferred            : %d\n', sum(deferMask));

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
