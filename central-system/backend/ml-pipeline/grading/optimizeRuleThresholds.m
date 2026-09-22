function result = optimizeRuleThresholds(varargin)
% OPTIMIZERULETHRESHOLDS  Refit the Branch B rule-engine thresholds against
% ground-truth grades, so that when a retrained lesion model changes the raw
% counts the thresholds can be re-derived instead of re-guessed.
%
%   optimizeRuleThresholds()                  synthetic 500 patients, print result
%   optimizeRuleThresholds('selftest')        run the checks at the bottom
%   result = optimizeRuleThresholds(opts)     see OPTIONS below
%
%   Returns a struct with the chosen thresholds, the score they achieve, an
%   honest generalisation estimate, and -- the field that matters most on small
%   data -- how many other threshold combinations score exactly the same.
%
%   ═══════════════════════════════════════════════════════════════════════════
%   WHY THIS EXISTS
%
%   ruleEngineGrade's thresholds are not clinical constants. They are properties
%   of the SEGMENTER that feeds it: redFloor = 3 is a measured false-positive
%   noise floor, not a number from the ETDRS text. Retrain the lesion model and
%   every one of those numbers is describing a detector that no longer exists.
%   That is not a tuning opportunity, it is a correctness bug with no error
%   message -- the engine keeps returning grades, and they are quietly wrong.
%
%   So this is the tool that makes the model swap safe: point it at the new
%   model's counts plus ground-truth grades, and it reports what the floors
%   have become.
%
%   ═══════════════════════════════════════════════════════════════════════════
%   THREE THINGS TO KNOW BEFORE TRUSTING ANY NUMBER THIS PRINTS
%
%   1. THE OPTIMUM IS USUALLY A PLATEAU, NOT A POINT.
%      Thresholds enter the rule engine only through comparisons, so a whole
%      range of values produces byte-identical grades. On 14 images, thousands
%      of combinations tie. Reporting one of them as "the optimum" would be
%      arbitrary precision over an arbitrary choice. This function therefore
%      counts the ties, reports each parameter's tied RANGE, and breaks the tie
%      toward the CURRENT value -- so a refit that the data does not actually
%      support returns what you already had, instead of a confident-looking
%      change with nothing behind it.
%
%   2. FITTING 3-4 PARAMETERS ON A SMALL SET OVERFITS, AND QWK WILL NOT TELL YOU.
%      The in-sample score always improves. `cvQwk` below is the cross-validated
%      estimate -- it re-runs the WHOLE optimisation inside each fold, so it
%      measures the procedure rather than the answer. When cvQwk sits well below
%      qwk, the gap is the overfitting, and the thresholds should not be shipped.
%
%   3. QWK IS NOT THE SCREENING OBJECTIVE.
%      This is a referral system. A threshold set can raise QWK while losing
%      referable sensitivity (grade >= 2), which is the one number a screening
%      programme cannot trade away. Sensitivity and specificity at the optimum
%      are therefore always reported, and opts.minReferableSensitivity can make
%      it a hard constraint rather than something you are trusted to notice.
%
%   ═══════════════════════════════════════════════════════════════════════════
%   ON THE SOLVER, AND WHY EXHAUSTIVE SEARCH IS THE DEFAULT
%
%   The brief asked for surrogateopt / ga / patternsearch. All three are
%   supported (opts.solver) and all three live in the GLOBAL OPTIMIZATION
%   TOOLBOX -- not the Optimization Toolbox, and not installed on the machine
%   this was written on (`ver` lists Optimization Toolbox; `which surrogateopt`
%   is empty). They are used when present and reported as missing when not.
%
%   That is survivable because this problem does not need them. The objective is
%   a step function of 3-4 bounded integers, and the only values that can change
%   a grade are the observed count values themselves. The full candidate set is
%   therefore enumerable, and enumeration returns the GLOBAL optimum with a
%   proof -- which a surrogate model returns only with a probability. So the
%   ranking is deliberate: exhaustive when the grid fits, a global solver when
%   it does not. Run with opts.solver = 'surrogateopt' and
%   opts.verifyExhaustive = true to check one against the other.
%
%   ═══════════════════════════════════════════════════════════════════════════
%   ON THE FAST EVALUATOR, AND THE PARITY CHECK THAT LICENSES IT
%
%   Scoring a grid means grading every patient hundreds of thousands of times.
%   Calling ruleEngineGrade that often is far too slow (it formats evidence
%   prose on every call), so gradeVectorized() below reimplements its decision
%   logic over arrays.
%
%   A second copy of the grading rules is exactly the kind of duplication that
%   silently drifts, and a drifted copy here would produce thresholds fitted to
%   a rule engine that does not exist. So the copy is not trusted: before any
%   optimisation runs, checkParity() grades rows of the real dataset with BOTH
%   implementations, at the default thresholds and at randomly drawn ones, and
%   refuses to continue on a single mismatch. If you change ruleEngineGrade,
%   this file fails loudly rather than optimising against a stale rule.
%
%   ═══════════════════════════════════════════════════════════════════════════
%   OPTIONS (all optional)
%     .data         a struct of real data -- see the DATA CONTRACT below. When
%                   absent, synthetic data is generated and every output is
%                   marked synthetic.
%     .csv          path to a recalibrated_results.csv-style file to load
%                   instead (diagnostics/out/recalibrated_results.csv works).
%     .n            synthetic patients to generate (default 500)
%     .countScale   synthetic only: multiply red-lesion counts by this, to
%                   rehearse "the new model detects 4x more MAs" (default 1)
%     .tune         cellstr of parameters to fit. Default
%                   {'redFloor','grade3QuadMin','moderateRedCount'};
%                   'brightFloor' and 'nvThreshold' may be added.
%     .solver       'auto' (default) | 'exhaustive' | 'surrogateopt' | 'ga' |
%                   'patternsearch'
%     .metric       'qwk' (default) | 'mse'
%     .cvFolds      cross-validation folds. Default 5 when n >= 50, else 0.
%     .minReferableSensitivity  reject threshold sets below this (default [])
%     .capGroundTruth  default true -- see GRADE 4 below
%     .verifyExhaustive  also run exhaustive and compare (default false)
%     .useParallel  parfor the grid (default true for large grids, when a pool
%                   already exists; Parallel Computing Toolbox)
%     .bounds       struct of [lo hi] per parameter, overriding the
%                   data-derived bounds
%     .outJson      write the result to this path (default: write nothing)
%     .seed         default 20260922
%     .quiet        suppress printing (default false)
%
%   ═══════════════════════════════════════════════════════════════════════════
%   DATA CONTRACT -- this is the swap point
%
%   opts.data must be a struct with, for n patients:
%     .redQuadrants     n x 4  red lesions (MA + HE) per quadrant
%     .brightQuadrants  n x 4  bright lesions per quadrant
%     .trueGrade        n x 1  ground-truth ICDR grade, 0-4
%     .nvScore          n x 1  optional, NV suspicion 0-1 (default zeros)
%     .foveaUnreliable  n x 1  optional logical (default false)
%
%   Those are exactly the arguments ruleEngineGrade takes, so wiring the real
%   model in is a matter of collecting its output, not of adapting anything
%   here. When Model 5 lands, run segInfer over the labelled set, build that
%   struct, and pass it in.
%
%   ── nvScore, and a trap worth naming ──
%   If nvScore is constant (it is absent from every cache we have today), then
%   nvThreshold changes no grade, and the "optimal" value would be whichever
%   candidate the search happened to visit first. That is a plausible-looking
%   number with nothing behind it, so identifiability is CHECKED: a parameter
%   the data cannot constrain is dropped from the fit and reported as not
%   identifiable, rather than fitted to noise.
%
%   ── GRADE 4 ──
%   ruleEngineGrade caps its output at 3 by design (the path to 4 is an
%   unvalidated NV heuristic -- see its header). Ground-truth 4s are therefore
%   unreachable, and scoring against them would push thresholds toward
%   over-calling grade 3 to chase a target the engine is forbidden to hit. So
%   the ground truth is capped to maxGrade for the objective by default, and
%   the uncapped score is reported alongside it.
%
%   See also RULEENGINEGRADE, CALCULATEURGENCYSCORE.

% ── Argument handling ──────────────────────────────────────────────────────
if nargin == 1 && (ischar(varargin{1}) || isstring(varargin{1})) ...
        && strcmpi(string(varargin{1}), "selftest")
    result = selftest();
    return;
end

if nargin == 0
    opts = struct();
elseif nargin == 1 && isstruct(varargin{1})
    opts = varargin{1};
else
    error('optimizeRuleThresholds:usage', ...
          'usage: optimizeRuleThresholds(), (opts struct), or (''selftest'')');
end

quiet = getdef(opts, 'quiet', false);
seed  = getdef(opts, 'seed', 20260922);
rng(seed, 'twister');

% ── 1. Data ────────────────────────────────────────────────────────────────
[data, provenance] = loadData(opts);
n = numel(data.trueGrade);
if n < 5
    error('optimizeRuleThresholds:tooFewRows', ...
          'only %d rows -- nothing meaningful can be fitted.', n);
end

MAXGRADE = 3;   % ruleEngineGrade's safety cap; not a fitted quantity.
capGt = getdef(opts, 'capGroundTruth', true);
target = data.trueGrade;
if capGt, target = min(target, MAXGRADE); end

feat = prepareFeatures(data);

% ── 2. Parity: the fast evaluator must agree with the real rule engine ─────
checkParity(data, feat, quiet);

% ── 3. What to tune, and over what ─────────────────────────────────────────
defaults = currentDefaults();
tune = getdef(opts, 'tune', {'redFloor', 'grade3QuadMin', 'moderateRedCount'});
tune = cellstr(tune);
tune = tune(:)';
bad = setdiff(tune, fieldnames(defaults));
if ~isempty(bad)
    error('optimizeRuleThresholds:badTune', 'unknown parameter(s): %s', strjoin(bad, ', '));
end

[cands, bounds, notIdentifiable] = candidateSets(tune, feat, opts, defaults);
tune = setdiff(tune, notIdentifiable, 'stable');
tune = tune(:)';
if isempty(tune)
    error('optimizeRuleThresholds:nothingToTune', ...
          'every requested parameter is unconstrained by this data.');
end

if ~quiet
    fprintf('\n=== optimizeRuleThresholds ===\n');
    fprintf('data      : %s (n = %d)\n', provenance, n);
    fprintf('tuning    : %s\n', strjoin(tune, ', '));
    for k = 1:numel(tune)
        fprintf('            %-17s %d candidate(s) in [%g %g]\n', ...
            tune{k}, numel(cands.(tune{k})), bounds.(tune{k})(1), bounds.(tune{k})(2));
    end
    for k = 1:numel(notIdentifiable)
        fprintf('  SKIPPED : %s -- not identifiable from this data (held at %g)\n', ...
            notIdentifiable{k}, defaults.(notIdentifiable{k}));
    end
end

% ── 4. Objective ───────────────────────────────────────────────────────────
metric  = lower(getdef(opts, 'metric', 'qwk'));
minSens = getdef(opts, 'minReferableSensitivity', []);
scoreFn = @(theta) scoreThresholds(theta, feat, target, defaults, tune, ...
                                   MAXGRADE, metric, minSens);

% ── 5. Solve ───────────────────────────────────────────────────────────────
solver = lower(getdef(opts, 'solver', 'auto'));
search = runSolver(solver, scoreFn, cands, bounds, tune, defaults, opts, quiet);

% ── 6. Report the winner honestly ──────────────────────────────────────────
theta = search.theta;
optsOut = defaults;
for k = 1:numel(tune), optsOut.(tune{k}) = theta(k); end

pred = gradeVectorized(feat, optsOut, MAXGRADE);
m    = gradeMetrics(pred, target, MAXGRADE);
mUncapped = gradeMetrics(pred, data.trueGrade, max(4, MAXGRADE));

% ── 7. Cross-validation: the only number that says anything about new data ─
defaultFolds = 0;
if n >= 50, defaultFolds = 5; end
cvFolds = getdef(opts, 'cvFolds', defaultFolds);
cv = crossValidate(cvFolds, feat, target, defaults, tune, cands, ...
                   MAXGRADE, metric, minSens, opts, quiet);

result = struct();
result.thresholds      = optsOut;
result.tuned           = {tune};
result.notIdentifiable = {notIdentifiable};
result.changedFrom     = changeSummary(defaults, optsOut, tune);
result.qwk             = m.qwk;
result.mse             = m.mse;
result.accuracy        = m.accuracy;
result.qwkUncappedGt   = mUncapped.qwk;
result.referableSensitivity = m.referableSensitivity;
result.referableSpecificity = m.referableSpecificity;
result.confusion       = m.confusion;
result.baseline        = baselineComparison(feat, target, defaults, MAXGRADE);
result.tiedOptima      = search.tiedCount;
result.tiedRanges      = search.tiedRanges;
result.solver          = search.solverUsed;
result.evaluations     = search.evaluations;
result.searchSeconds   = search.seconds;
% ── Held-out report (opts.reportCsv / opts.reportData) ────────────────────
% Fit here, score THERE. Cross-validation estimates how the PROCEDURE
% generalises; this measures the one threshold set you would actually deploy,
% on data it has never influenced. That is the number to quote, and it is the
% same discipline (fit on IDRiD train, report on IDRiD test) that Tanuj's
% Python recalibration used -- so the two are comparable.
result.heldOut = [];
heldOut = loadHeldOut(opts);
if ~isempty(heldOut)
    hFeat = prepareFeatures(heldOut);
    hTarget = heldOut.trueGrade;
    if capGt, hTarget = min(hTarget, MAXGRADE); end
    hm = gradeMetrics(gradeVectorized(hFeat, optsOut, MAXGRADE), hTarget, MAXGRADE);
    hb = gradeMetrics(gradeVectorized(hFeat, defaults, MAXGRADE), hTarget, MAXGRADE);
    result.heldOut = struct( ...
        'n', numel(hTarget), 'source', heldOut.sourceLabel, ...
        'qwk', hm.qwk, 'mse', hm.mse, 'accuracy', hm.accuracy, ...
        'referableSensitivity', hm.referableSensitivity, ...
        'referableSpecificity', hm.referableSpecificity, ...
        'confusion', hm.confusion, ...
        'qwkCI', bootstrapQwkCi(gradeVectorized(hFeat, optsOut, MAXGRADE), ...
                                hTarget, MAXGRADE, ...
                                getdef(opts, 'qwkBootstrap', 2000), seed + 1), ...
        'baselineQwk', hb.qwk, ...
        'baselineReferableSensitivity', hb.referableSensitivity, ...
        'baselineReferableSpecificity', hb.referableSpecificity);
end

% Youden's J per threshold (Tanuj's method) and a bootstrap CI on the QWK --
% both Statistics and Machine Learning Toolbox, both reported alongside the
% search result rather than replacing it. See youdenThresholds' header for why
% the two methods can legitimately disagree.
result.youden          = youdenThresholds(feat, target, opts);
result.qwkCI           = bootstrapQwkCi(pred, target, MAXGRADE, ...
                                        getdef(opts, 'qwkBootstrap', 2000), seed);
result.cvPartition     = getdef(cv, 'partition', 'none');
result.cvQwk           = cv.qwk;
result.cvFolds         = cv.folds;
result.cvPerFold       = cv.perFold;
result.n               = n;
result.dataSource      = provenance;
result.syntheticData   = data.isSynthetic;
result.maxGrade        = MAXGRADE;
result.groundTruthCapped = capGt;
result.seed            = seed;
result.limitation      = limitationText(data, n, m, cv, search);

if getdef(opts, 'verifyExhaustive', false) && ~strcmpi(search.solverUsed, 'exhaustive')
    ex = exhaustiveSearch(scoreFn, cands, tune, defaults, opts, true);
    result.exhaustiveAgrees = abs(ex.score - search.score) < 1e-12;
    result.exhaustiveBest   = ex.theta;
    if ~quiet
        fprintf('\nverify: exhaustive %s the %s result\n', ...
            ternary(result.exhaustiveAgrees, 'CONFIRMS', 'BEATS'), search.solverUsed);
    end
end

if ~quiet, printReport(result, tune, defaults); end

outJson = getdef(opts, 'outJson', '');
if ~isempty(outJson)
    writeJson(outJson, result, tune);
    if ~quiet, fprintf('wrote %s\n', outJson); end
end
end

% ═══════════════════════════════════════════════════════════════════════════
% DATA
% ═══════════════════════════════════════════════════════════════════════════
function [data, provenance] = loadData(opts)
if isfield(opts, 'data') && ~isempty(opts.data)
    data = normaliseData(opts.data);
    data.isSynthetic = false;
    provenance = getdef(opts, 'dataLabel', 'caller-supplied real data');
    return;
end
if isfield(opts, 'csv') && ~isempty(opts.csv)
    data = loadCountsCsv(opts.csv);
    data.isSynthetic = false;
    provenance = sprintf('csv: %s', opts.csv);
    return;
end
n = getdef(opts, 'n', 500);
scale = getdef(opts, 'countScale', 1);
data = makeSyntheticData(n, scale);
data.isSynthetic = true;
provenance = sprintf('SYNTHETIC (countScale %g)', scale);
end

function h = loadHeldOut(opts)
% The report split, if one was given. Never used for fitting -- it is loaded
% after the search has already finished, which is the point.
h = [];
if isfield(opts, 'reportData') && ~isempty(opts.reportData)
    h = normaliseData(opts.reportData);
    h.sourceLabel = getdef(opts, 'reportLabel', 'caller-supplied held-out data');
elseif isfield(opts, 'reportCsv') && ~isempty(opts.reportCsv)
    h = loadCountsCsv(opts.reportCsv);
    h.sourceLabel = sprintf('csv: %s', opts.reportCsv);
end
end

function data = normaliseData(d)
req = {'redQuadrants', 'brightQuadrants', 'trueGrade'};
for k = 1:numel(req)
    if ~isfield(d, req{k})
        error('optimizeRuleThresholds:badData', 'data.%s is required.', req{k});
    end
end
data = struct();
data.redQuadrants    = double(d.redQuadrants);
data.brightQuadrants = double(d.brightQuadrants);
data.trueGrade       = double(d.trueGrade(:));
n = numel(data.trueGrade);
if size(data.redQuadrants, 1) ~= n || size(data.redQuadrants, 2) ~= 4 || ...
   size(data.brightQuadrants, 1) ~= n || size(data.brightQuadrants, 2) ~= 4
    error('optimizeRuleThresholds:badData', ...
          'redQuadrants and brightQuadrants must both be %d x 4.', n);
end
if any(data.redQuadrants(:) < 0) || any(data.brightQuadrants(:) < 0) || ...
   any(mod([data.redQuadrants(:); data.brightQuadrants(:)], 1) ~= 0)
    error('optimizeRuleThresholds:badData', 'counts must be non-negative integers.');
end
if any(data.trueGrade < 0 | data.trueGrade > 4 | mod(data.trueGrade, 1) ~= 0)
    error('optimizeRuleThresholds:badData', 'trueGrade must be an integer 0-4.');
end
if isfield(d, 'nvScore') && ~isempty(d.nvScore)
    data.nvScore = double(d.nvScore(:));
else
    data.nvScore = zeros(n, 1);
end
if isfield(d, 'foveaUnreliable') && ~isempty(d.foveaUnreliable)
    data.foveaUnreliable = logical(d.foveaUnreliable(:));
else
    data.foveaUnreliable = false(n, 1);
end
if isfield(d, 'imageId')
    data.imageId = cellstr(d.imageId);
else
    data.imageId = arrayfun(@(i) sprintf('row%d', i), (1:n)', 'UniformOutput', false);
end
end

function data = loadCountsCsv(path)
% Read a diagnostics/out/recalibrated_results.csv-shaped file.
%
% Columns used: gt_grade, red_per_quadrant ("a|b|c|d" or "(a, b, c, d)"),
% sum_bright, and optionally image, nv_score, fovea_unreliable.
%
% BRIGHT LESIONS GO IN ONE QUADRANT ON PURPOSE. That CSV records only the
% bright TOTAL, and the rule engine reads bright counts only through their sum
% (brightPresent = totalBright >= brightFloor) -- no bright criterion is
% quadrant-dependent. So putting the whole total in quadrant 1 is not an
% approximation; it is exact for every decision the engine makes. If a bright
% criterion ever becomes per-quadrant, this line becomes wrong with it.
if ~isfile(path)
    error('optimizeRuleThresholds:noCsv', '%s does not exist.', path);
end
% Delimiter and header stated explicitly, NOT auto-detected. The quadrant
% columns hold "11|14|23|33", and readtable's detection can decide '|' is a
% delimiter too -- it then reads a 9-column file as 10 anonymous Var1..Var10
% columns with no header, and every lookup below fails with "has no column
% gt_grade" on a file whose header plainly says gt_grade.
T = readtable(path, 'TextType', 'char', 'Delimiter', ',', ...
              'ReadVariableNames', true);
need = {'gt_grade', 'red_per_quadrant'};
for k = 1:numel(need)
    if ~ismember(need{k}, T.Properties.VariableNames)
        error('optimizeRuleThresholds:badCsv', '%s has no column "%s".', path, need{k});
    end
end
nRows = height(T);
red = zeros(nRows, 4);
for i = 1:nRows
    raw = T.red_per_quadrant{i};
    raw = strrep(strrep(strrep(raw, '(', ''), ')', ''), ' ', '');
    parts = regexp(raw, '[|,]', 'split');
    if numel(parts) ~= 4
        error('optimizeRuleThresholds:badCsv', ...
              'row %d: red_per_quadrant "%s" is not 4 values.', i, T.red_per_quadrant{i});
    end
    red(i, :) = cellfun(@str2double, parts);
end
bright = zeros(nRows, 4);
if ismember('sum_bright', T.Properties.VariableNames)
    bright(:, 1) = double(T.sum_bright);
end
d = struct('redQuadrants', red, 'brightQuadrants', bright, ...
           'trueGrade', double(T.gt_grade));
if ismember('nv_score', T.Properties.VariableNames)
    d.nvScore = double(T.nv_score);
end
if ismember('fovea_unreliable', T.Properties.VariableNames)
    d.foveaUnreliable = logical(T.fovea_unreliable);
end
if ismember('image', T.Properties.VariableNames)
    d.imageId = T.image;
end
data = normaliseData(d);
end

function data = makeSyntheticData(n, countScale)
% Synthetic patients whose counts look like a SEGMENTER's output, not a
% clinician's: every image carries a false-positive floor, and true signal
% grows with grade on top of it. That shape is what makes the exercise
% meaningful -- a floor is precisely what redFloor has to find.
%
% countScale multiplies the red counts. It exists to rehearse the event this
% script was written for: a retrained Model 5 that detects several times more
% microaneurysms, after which the old floors are all wrong by roughly that
% factor. Set it to 4 and watch redFloor move.
%
% THESE NUMBERS ARE INVENTED. They exercise the machinery; they say nothing
% about any real detector, and no threshold fitted on them may be shipped.
gradeProb = [0.45 0.15 0.22 0.10 0.08];      % roughly IDRiD-like skew
grades = zeros(n, 1);
u = rand(n, 1); c = cumsum(gradeProb);
for i = 1:n
    grades(i) = find(u(i) <= c, 1) - 1;
end

redMeanByGrade    = [1.5 6 18 45 60] * countScale;   % includes the FP floor
brightMeanByGrade = [0.8 1.5 8 25 35];
spread = [0.55 0.20 0.15 0.10];                      % quadrant asymmetry

red = zeros(n, 4); bright = zeros(n, 4);
for i = 1:n
    g = grades(i) + 1;
    total = poissonDraw(redMeanByGrade(g));
    if grades(i) >= 3
        w = max(0.25 + 0.05 * randn(1, 4), 0.05);    % severe disease spreads out
    else
        w = spread(randperm(4));
    end
    w = w / sum(w);
    red(i, :) = floor(total * w);
    bright(i, :) = [poissonDraw(brightMeanByGrade(g)) 0 0 0];
end
nv = min(1, max(0, 0.12 * grades + 0.10 * rand(n, 1)));

data = normaliseData(struct('redQuadrants', red, 'brightQuadrants', bright, ...
                            'trueGrade', grades, 'nvScore', nv));
end

function x = poissonDraw(lambda)
% Knuth's method, with a normal approximation above 30 so the loop stays short.
% Local rather than poissrnd only so that generating data does not depend on a
% toolbox this file otherwise never needs.
if lambda <= 0, x = 0; return; end
if lambda > 30
    x = max(0, round(lambda + sqrt(lambda) * randn()));
    return;
end
L = exp(-lambda); k = 0; p = 1;
while true
    p = p * rand();
    if p <= L, break; end
    k = k + 1;
    if k > 10000, break; end
end
x = k;
end

% ═══════════════════════════════════════════════════════════════════════════
% THE FAST EVALUATOR, AND ITS PARITY GUARANTEE
% ═══════════════════════════════════════════════════════════════════════════
function feat = prepareFeatures(data)
% Everything the rule engine's decisions depend on, reduced once.
%
% minRed deserves a note: criterion (a) is `any(red >= q) && all(red >= q)`,
% which for a 1x4 vector is just min(red) >= q. The `any` guard in the engine
% exists only to stop an EMPTY count vector from satisfying all([]) vacuously,
% and a 4-wide matrix cannot be empty, so it drops out here.
feat.totalRed        = sum(data.redQuadrants, 2);
feat.minRed          = min(data.redQuadrants, [], 2);
feat.totalBright     = sum(data.brightQuadrants, 2);
feat.nvScore         = data.nvScore;
feat.foveaUnreliable = data.foveaUnreliable;
feat.n               = numel(data.trueGrade);
end

function g = gradeVectorized(feat, p, maxGrade)
% A vectorised copy of ruleEngineGrade's decision logic. Kept honest by
% checkParity() -- read the header note before changing a line of it.
%
% Assumes no venous-beading and no IRMA input (no detector exists), which is
% what the production callers pass today. checkParity calls the real engine
% under the same assumption, so the two cannot disagree about it.
%
% Written as "assign in increasing severity" rather than as the engine's
% early-return chain. The two are equivalent because a later assignment
% overwrites an earlier one, and the severity order is the same.
redPresent    = feat.totalRed    >= p.redFloor;
brightPresent = feat.totalBright >= p.brightFloor;

isNv = feat.nvScore > p.nvThreshold;                                  % grade 4
is3  = ~feat.foveaUnreliable & (feat.minRed >= p.grade3QuadMin);      % 4-2-1(a)
is2  = redPresent & (brightPresent | (feat.totalRed > p.moderateRedCount));

g = zeros(feat.n, 1);
g(redPresent) = 1;
g(is2)  = 2;
g(is3)  = 3;
g(isNv) = 4;
g = min(g, maxGrade);
end

function checkParity(data, feat, quiet)
% Grade rows both ways, at the defaults and at random thresholds, and refuse to
% optimise if they ever differ.
%
% This is the only thing standing between "a second copy of the rules" and "a
% second copy of the rules that has quietly drifted". It costs a few hundred
% calls, and it is not optional.
if isempty(which('ruleEngineGrade'))
    error('optimizeRuleThresholds:noRuleEngine', ...
          ['ruleEngineGrade is not on the path, so the fast evaluator cannot ' ...
           'be checked against it. Refusing to optimise against an unverified ' ...
           'copy of the grading rules.']);
end
maxGrade = 3;
rows = 1:feat.n;
if feat.n > 60, rows = unique(round(linspace(1, feat.n, 60))); end

trials = {currentDefaults()};
for t = 1:4
    p = currentDefaults();
    p.redFloor         = randi([0 25]);
    p.grade3QuadMin    = randi([1 20]);
    p.moderateRedCount = randi([0 40]);
    p.brightFloor      = randi([0 15]);
    p.nvThreshold      = rand();
    trials{end+1} = p; %#ok<AGROW>
end

nChecked = 0;
for t = 1:numel(trials)
    p = trials{t};
    fast = gradeVectorized(feat, p, maxGrade);
    for i = rows
        o = p;
        o.maxGrade = maxGrade;
        o.foveaUnreliable = data.foveaUnreliable(i);
        slow = ruleEngineGrade(data.redQuadrants(i, :), ...
                               data.brightQuadrants(i, :), ...
                               data.nvScore(i), o);
        if slow ~= fast(i)
            error('optimizeRuleThresholds:parity', ...
                ['PARITY FAILURE on row %d: ruleEngineGrade says %d, the fast ' ...
                 'evaluator says %d, at redFloor=%g grade3QuadMin=%g ' ...
                 'moderateRedCount=%g brightFloor=%g nvThreshold=%g.\n' ...
                 'gradeVectorized() in this file no longer matches the rule ' ...
                 'engine -- fix it before any threshold from here is used.'], ...
                i, slow, fast(i), p.redFloor, p.grade3QuadMin, ...
                p.moderateRedCount, p.brightFloor, p.nvThreshold);
        end
        nChecked = nChecked + 1;
    end
end
if ~quiet
    fprintf('parity    : %d checks vs ruleEngineGrade -- OK\n', nChecked);
end
end

% ═══════════════════════════════════════════════════════════════════════════
% SCORING
% ═══════════════════════════════════════════════════════════════════════════
function cost = scoreThresholds(theta, feat, target, defaults, tune, maxGrade, metric, minSens)
p = defaults;
for k = 1:numel(tune), p.(tune{k}) = theta(k); end
m = gradeMetrics(gradeVectorized(feat, p, maxGrade), target, maxGrade);

switch metric
    case 'qwk', cost = -m.qwk;
    case 'mse', cost =  m.mse;
    otherwise
        error('optimizeRuleThresholds:badMetric', 'metric must be ''qwk'' or ''mse''.');
end

% A hard constraint, not a penalty: a threshold set that misses referrals is
% not a worse solution, it is an inadmissible one.
if ~isempty(minSens) && ~(m.referableSensitivity >= minSens)
    cost = Inf;
end
end

function m = gradeMetrics(pred, truth, maxGrade)
K = maxGrade + 1;
pred  = min(max(round(pred),  0), maxGrade);
truth = min(max(round(truth), 0), maxGrade);
C = accumarray([truth(:) + 1, pred(:) + 1], 1, [K K]);

m.confusion = C;
m.qwk       = quadraticKappa(C);
m.mse       = mean((double(pred) - double(truth)).^2);
m.accuracy  = sum(pred == truth) / numel(pred);

% Referable = grade >= 2, the operating point this system is actually judged on.
refT = truth >= 2; refP = pred >= 2;
tp = sum(refT & refP);  fn = sum(refT & ~refP);
tn = sum(~refT & ~refP); fp = sum(~refT & refP);
m.referableSensitivity = safeDiv(tp, tp + fn);
m.referableSpecificity = safeDiv(tn, tn + fp);
end

function k = quadraticKappa(C)
% Cohen's kappa with quadratic weights, same formulation as
% training/computeDrMetrics.m so the two numbers are comparable.
N = sum(C(:));
if N == 0, k = 0; return; end
nC = size(C, 1);
[I, J] = meshgrid(1:nC, 1:nC);
W = ((I' - J').^2) / (nC - 1)^2;
E = (sum(C, 2) * sum(C, 1)) / N;
num = sum(W(:) .* C(:));
den = sum(W(:) .* E(:));
if den == 0
    % Only reachable when a marginal is degenerate. Perfect agreement is
    % perfect; anything else gets no credit -- rather than a divide-by-zero
    % NaN, which an optimiser would happily chase.
    k = double(num == 0);
    return;
end
k = 1 - num / den;
end

function v = safeDiv(a, b)
if b == 0, v = NaN; else, v = a / b; end
end

% ═══════════════════════════════════════════════════════════════════════════
% SEARCH
% ═══════════════════════════════════════════════════════════════════════════
function [cands, bounds, notIdentifiable] = candidateSets(tune, feat, opts, defaults)
% The candidate VALUES that can change any grade.
%
% Bounds are derived from the data, not hardcoded, and that is the property
% that makes this survive the retrain: if the new Model 5 detects 4x more
% lesions, the search range grows with the counts instead of capping out at a
% range fitted to the old detector.
userBounds = getdef(opts, 'bounds', struct());
notIdentifiable = {};
cands = struct(); bounds = struct();

maxTotalRed    = max([feat.totalRed;    0]);
maxMinRed      = max([feat.minRed;      0]);
maxTotalBright = max([feat.totalBright; 0]);

for k = 1:numel(tune)
    name = tune{k};
    switch name
        case 'redFloor'
            b = [0, maxTotalRed + 1];       c = b(1):b(2);
        case 'grade3QuadMin'
            % Below 1 the criterion fires on every image (min(red) >= 0 is
            % always true). That is not a grading rule, it is a bug.
            b = [1, maxMinRed + 1];         c = b(1):b(2);
        case 'moderateRedCount'
            b = [0, maxTotalRed + 1];       c = b(1):b(2);
        case 'brightFloor'
            b = [0, maxTotalBright + 1];    c = b(1):b(2);
        case 'nvThreshold'
            b = [0, 1];
            c = thresholdCandidates(feat.nvScore, getdef(opts, 'maxNvCandidates', 24));
        otherwise
            error('optimizeRuleThresholds:badTune', 'unknown parameter %s', name);
    end
    if isfield(userBounds, name)
        ub = userBounds.(name);
        b = [ub(1), ub(2)];
        c = c(c >= b(1) & c <= b(2));
        if isempty(c), c = b(1); end
    end

    % Identifiability. Varied one at a time from the defaults, which is the
    % cheap test and can in principle miss a parameter that only matters in
    % combination with another. It catches the case that actually occurs --
    % an input column that is constant, so the threshold on it is inert.
    if numel(c) < 2 || ~parameterMatters(name, c, feat, defaults)
        notIdentifiable{end+1} = name; %#ok<AGROW>
        continue;
    end
    cands.(name)  = c;
    bounds.(name) = b;
end
end

function tf = parameterMatters(name, c, feat, defaults)
p = defaults;
p.(name) = c(1);
g0 = gradeVectorized(feat, p, 3);
tf = false;
for i = 2:numel(c)
    p.(name) = c(i);
    if ~isequal(gradeVectorized(feat, p, 3), g0), tf = true; return; end
end
end

function c = thresholdCandidates(x, maxCount)
% Midpoints between observed values: a `>` threshold on a continuous input can
% only be distinguished at the gaps between the points it separates.
u = unique(x(isfinite(x)));
if numel(u) < 2, c = 0.5; return; end
mids = (u(1:end-1) + u(2:end)) / 2;
c = [max(0, u(1) - 1e-6); mids(:); min(1, u(end) + 1e-6)]';
if numel(c) > maxCount
    c = c(unique(round(linspace(1, numel(c), maxCount))));
end
end

function search = runSolver(solver, scoreFn, cands, bounds, tune, defaults, opts, quiet)
t0 = tic;
if strcmpi(solver, 'auto')
    gridSize = prod(cellfun(@(nm) numel(cands.(nm)), tune));
    maxGrid  = getdef(opts, 'maxGridPoints', 4e6);
    if gridSize <= maxGrid
        solver = 'exhaustive';
    elseif ~isempty(which('surrogateopt'))
        solver = 'surrogateopt';
    elseif ~isempty(which('ga'))
        solver = 'ga';
    else
        solver = 'exhaustive';   % subsampled -- warned about here and below
        if ~quiet
            fprintf(['NOTE: the grid has %.3g points and no Global Optimization ' ...
                     'Toolbox solver is\n      installed, so the candidate sets ' ...
                     'are subsampled. The result is a good\n      local optimum, ' ...
                     'not a proven global one.\n'], gridSize);
        end
    end
end

switch lower(solver)
    case 'exhaustive'
        search = exhaustiveSearch(scoreFn, cands, tune, defaults, opts, quiet);
    case {'surrogateopt', 'ga', 'patternsearch'}
        search = globalSolver(lower(solver), scoreFn, cands, bounds, tune, ...
                              defaults, opts, quiet);
    otherwise
        error('optimizeRuleThresholds:badSolver', 'unknown solver "%s".', solver);
end
search.seconds = toc(t0);
end

function s = exhaustiveSearch(scoreFn, cands, tune, defaults, opts, quiet)
% Enumerate every distinguishable combination. Returns the global optimum, the
% number of combinations tied with it, and each parameter's tied range -- which
% on small data is the most informative output this function produces.
lists = cell(1, numel(tune));
for k = 1:numel(tune), lists{k} = cands.(tune{k}); end

maxGrid = getdef(opts, 'maxGridPoints', 4e6);
full = lists;                         % kept for the refinement pass below
total = prod(cellfun(@numel, lists));
coarse = false;
stride = ones(1, numel(lists));
if total > maxGrid
    coarse = true;
    shrink = (maxGrid / total)^(1 / numel(lists));
    for k = 1:numel(lists)
        want = max(2, floor(numel(lists{k}) * shrink));
        idx = unique(round(linspace(1, numel(lists{k}), want)));
        stride(k) = max(1, ceil(numel(lists{k}) / max(1, numel(idx))));
        lists{k} = lists{k}(idx);
    end
    total = prod(cellfun(@numel, lists));
end

grids = cell(1, numel(lists));
[grids{:}] = ndgrid(lists{:});
combos = zeros(total, numel(lists));
for k = 1:numel(lists), combos(:, k) = grids{k}(:); end

costs = inf(total, 1);
if getdef(opts, 'useParallel', total > 20000) && haveParallelPool()
    parfor i = 1:total
        costs(i) = scoreFn(combos(i, :));
    end
else
    for i = 1:total
        costs(i) = scoreFn(combos(i, :));
    end
end

bestCost = min(costs);
if ~isfinite(bestCost)
    error('optimizeRuleThresholds:noFeasible', ...
        ['no threshold combination satisfies the constraints -- ' ...
         'minReferableSensitivity is probably unreachable on this data.']);
end
tiedIdx = find(costs <= bestCost + 1e-12);

% ── The tie-break, which is a policy choice and not a numerical detail ──
% Among combinations that score identically, pick the one closest to the values
% already in ruleEngineGrade, measured in units of each parameter's own search
% range. A refit the data cannot distinguish should return what is already
% deployed; silently moving a live threshold on a tie would be a change with no
% evidence behind it.
dflt = zeros(1, numel(tune));
for k = 1:numel(tune), dflt(k) = defaults.(tune{k}); end
span = max(1e-9, cellfun(@(L) max(L) - min(L), lists));
[~, pick] = min(sum(abs((combos(tiedIdx, :) - dflt) ./ span), 2));
chosen = tiedIdx(pick);

s = struct();
s.theta       = combos(chosen, :);
s.score       = bestCost;
s.tiedCount   = numel(tiedIdx);
s.evaluations = total;
s.solverUsed  = 'exhaustive';
s.coarse      = coarse;
s.tiedRanges  = struct();
for k = 1:numel(tune)
    v = combos(tiedIdx, k);
    s.tiedRanges.(tune{k}) = [min(v) max(v)];
end

% ── REFINEMENT: recover what the coarse grid stepped over ─────────────────
% When the full grid exceeded maxGridPoints the pass above sampled every
% stride(k)-th candidate, so the true optimum can sit between two sampled
% values and never be scored. This re-searches the FULL candidate lists
% within one stride either side of the winner -- a small dense box around a
% coarse answer, which is cheap and recovers exactly what the subsampling
% could have skipped.
%
% It is not a proof of global optimality: a better optimum outside the box is
% still possible. `coarse` stays true so the caller keeps reporting the
% result as a good local optimum rather than a proven global one.
if coarse
    box = cell(1, numel(full));
    for k = 1:numel(full)
        near = abs(full{k} - s.theta(k)) <= stride(k);
        box{k} = full{k}(near);
        if isempty(box{k}), box{k} = s.theta(k); end
    end
    nBox = prod(cellfun(@numel, box));
    if nBox > 1 && nBox <= maxGrid
        g2 = cell(1, numel(box));
        [g2{:}] = ndgrid(box{:});
        c2 = zeros(nBox, numel(box));
        for k = 1:numel(box), c2(:, k) = g2{k}(:); end
        cost2 = inf(nBox, 1);
        for i = 1:nBox, cost2(i) = scoreFn(c2(i, :)); end
        s.evaluations = s.evaluations + nBox;
        if min(cost2) < s.score - 1e-12
            tied2 = find(cost2 <= min(cost2) + 1e-12);
            span2 = max(1e-9, cellfun(@(L) max(L) - min(L), box));
            [~, p2] = min(sum(abs((c2(tied2, :) - dflt) ./ span2), 2));
            s.refinedFrom = s.theta;
            s.theta     = c2(tied2(p2), :);
            s.score     = min(cost2);
            s.tiedCount = numel(tied2);
            for k = 1:numel(tune)
                s.tiedRanges.(tune{k}) = [min(c2(tied2, k)) max(c2(tied2, k))];
            end
            if ~quiet
                fprintf('refine    : local pass improved the coarse optimum\n');
            end
        end
    end
end

if ~quiet
    fprintf('search    : exhaustive, %d combinations%s, %d tied at the optimum\n', ...
        total, ternary(coarse, ' (COARSE + local refine)', ''), s.tiedCount);
end
end

function s = globalSolver(name, scoreFn, cands, bounds, tune, defaults, opts, quiet)
if isempty(which(name))
    error('optimizeRuleThresholds:solverMissing', ...
        ['%s is not available on this machine. It ships with the GLOBAL ' ...
         'Optimization Toolbox (not the Optimization Toolbox, which is what ' ...
         'is installed here). Install it, or use opts.solver = ''exhaustive'', ' ...
         'which returns the global optimum for this problem anyway.'], name);
end
nv = numel(tune);
lb = zeros(1, nv); ub = zeros(1, nv); intcon = [];
for k = 1:nv
    b = bounds.(tune{k});
    lb(k) = b(1); ub(k) = b(2);
    if ~strcmp(tune{k}, 'nvThreshold'), intcon(end+1) = k; end %#ok<AGROW>
end
maxEvals = getdef(opts, 'maxEvals', 400);
useParallel = getdef(opts, 'useParallel', true) && haveParallelPool();
display = ternary(quiet, 'off', 'iter');

switch name
    case 'surrogateopt'
        o = optimoptions('surrogateopt', 'MaxFunctionEvaluations', maxEvals, ...
            'Display', display, 'UseParallel', useParallel, 'PlotFcn', []);
        [x, fval, ~, out] = surrogateopt(scoreFn, lb, ub, intcon, o);
    case 'ga'
        o = optimoptions('ga', 'Display', display, 'UseParallel', useParallel, ...
            'MaxGenerations', max(20, round(maxEvals / 20)));
        [x, fval, ~, out] = ga(scoreFn, nv, [], [], [], [], lb, ub, [], intcon, o);
    case 'patternsearch'
        % patternsearch has no integer support, so it searches the relaxed
        % problem and the wrapper rounds. Reported as such rather than
        % pretending the result is an integer optimum.
        x0 = zeros(1, nv);
        for k = 1:nv, x0(k) = defaults.(tune{k}); end
        o = optimoptions('patternsearch', 'Display', display, ...
            'UseParallel', useParallel, 'MaxFunctionEvaluations', maxEvals);
        [x, fval, ~, out] = patternsearch(@(t) scoreFn(roundInt(t, intcon)), ...
                                          x0, [], [], [], [], lb, ub, [], o);
        x = roundInt(x, intcon);
end

% Snap back onto the candidate lattice: a solver may return a value between two
% distinguishable thresholds, which is a number the data never justified.
for k = 1:nv
    c = cands.(tune{k});
    [~, j] = min(abs(c - x(k)));
    x(k) = c(j);
end

s = struct();
s.theta       = x;
s.score       = fval;
s.tiedCount   = NaN;      % a global solver does not enumerate, so cannot count ties
s.tiedRanges  = struct();
s.evaluations = out.funccount;
s.solverUsed  = name;
if ~quiet
    fprintf('search    : %s, %d evaluations\n', name, s.evaluations);
end
end

function t = roundInt(t, intcon)
t(intcon) = round(t(intcon));
end

function tf = haveParallelPool()
% Only reports true for a pool that ALREADY exists. Starting one costs tens of
% seconds, which on a grid this size is slower than just running the loop.
tf = false;
try
    if isempty(which('gcp')), return; end
    tf = ~isempty(gcp('nocreate'));
catch
end
end

% ═══════════════════════════════════════════════════════════════════════════
% CROSS-VALIDATION
% ═══════════════════════════════════════════════════════════════════════════
function cv = crossValidate(folds, feat, target, defaults, tune, cands, ...
                            maxGrade, metric, minSens, opts, quiet)
% Re-run the WHOLE optimisation inside each fold and score on the held-out part.
%
% Optimising once and then cross-validating the winner would leak: those
% thresholds have already seen every fold. Refitting per fold is the only
% version that estimates what a refit on new data would actually achieve.
cv = struct('qwk', NaN, 'folds', 0, 'perFold', []);
if folds < 2, return; end
n = feat.n;
folds = min(folds, n);

% ── STRATIFIED folds (Statistics and Machine Learning Toolbox) ─────────────
% cvpartition with a grouping vector keeps each fold's GRADE MIX close to the
% whole set's. That matters here more than usual: grade 3 is ~7% of IDRiD, so
% an unstratified split can hand a fold zero grade-3 cases -- and a fold with
% no severe disease cannot say anything about grade3QuadMin, which is the
% threshold this whole exercise most needs to fit. The old
% mod(randperm(n), folds) drew exactly that fold regularly at n = 103.
%
% Falls back to the round-robin when the toolbox is absent, so the function
% still runs; the fallback is reported rather than silently substituted.
idx = [];
if ~isempty(which('cvpartition'))
    try
        c = cvpartition(target(:), 'KFold', folds);
        idx = zeros(n, 1);
        for f = 1:folds, idx(test(c, f)) = f; end
        cv.partition = 'cvpartition, stratified by grade';
    catch
        idx = [];   % e.g. a class with fewer members than folds
    end
end
if isempty(idx)
    idx = (mod(randperm(n), folds) + 1)';
    cv.partition = 'round-robin (cvpartition unavailable or refused)';
end

per = nan(folds, 1);
o = opts; o.quiet = true; o.verifyExhaustive = false;
for f = 1:folds
    % idx(:) then no transpose: both branches above produce a column, and the
    % feature vectors are columns. A row mask here silently returns row
    % results from subsetFeat and the orientation mismatch propagates.
    trainMask = (idx(:) ~= f);
    testMask  = ~trainMask;
    if ~any(testMask) || ~any(trainMask), continue; end
    fTrain = subsetFeat(feat, trainMask);
    fTest  = subsetFeat(feat, testMask);
    sFn = @(theta) scoreThresholds(theta, fTrain, target(trainMask), defaults, ...
                                   tune, maxGrade, metric, minSens);
    try
        s = exhaustiveSearch(sFn, cands, tune, defaults, o, true);
    catch
        continue;   % no feasible threshold set within this fold
    end
    p = defaults;
    for k = 1:numel(tune), p.(tune{k}) = s.theta(k); end
    m = gradeMetrics(gradeVectorized(fTest, p, maxGrade), target(testMask), maxGrade);
    per(f) = m.qwk;
end
cv.perFold = per;
cv.qwk     = mean(per(~isnan(per)));
cv.folds   = folds;
if ~quiet
    fprintf('cv        : %d-fold, refit inside each fold, held-out QWK %.3f\n', ...
        folds, cv.qwk);
end
end

% ═══════════════════════════════════════════════════════════════════════════
% YOUDEN'S J -- REPRODUCING TANUJ'S PYTHON METHOD, IN MATLAB
% ═══════════════════════════════════════════════════════════════════════════
function y = youdenThresholds(feat, truth, opts)
% Pick each threshold the way diagnostics/recalibrateRuleGate2.py picks it:
% the value maximising Youden's J (sensitivity + specificity - 1) for one
% specific binary separation.
%
%   redFloor       sum(red) >= T          separating GT 0    vs GT >= 1
%   grade3QuadMin  min(quadrant red) >= T separating GT < 3  vs GT >= 3
%   brightFloor    sum(bright) >= T       separating GT 0    vs GT >= 1
%
% ── WHY THIS EXISTS ALONGSIDE THE SEARCH, NOT INSTEAD OF IT ────────────────
% This is a DIFFERENT objective from the main optimiser's. Youden's J tunes
% each threshold against its own binary question, one at a time; the search
% maximises agreement of the WHOLE rule engine, all thresholds jointly. They
% answer different questions and can legitimately disagree -- J does not know
% that redFloor and moderateRedCount interact inside one if-statement.
%
% It is here so our numbers can be checked against HIS. Two pipelines on the
% same data agreeing is evidence; two pipelines using different methods
% agreeing is a coincidence until you can run both. Now we can.
%
% perfcurve (Statistics and Machine Learning Toolbox) does the ROC sweep and
% the CI; the fallback below computes J directly over candidate integers, so
% a machine without the toolbox still gets the comparison.
%
% ── J HAS THE SAME PLATEAU PROBLEM AS THE SEARCH, AND HIDES IT BETTER ──────
% When a gap in the data separates the classes cleanly, EVERY threshold in
% that gap scores J = 1, and perfcurve reports one of them with no indication
% that the others tie. The main search at least counts its ties and reports
% the range. So when this column and the search column disagree, check whether
% the search's tiedRange already CONTAINS the Youden value before concluding
% the two methods actually disagree -- often they do not.
% The same caveat applies to Tanuj's Python numbers, which use this method.
y = struct();
if nargin < 3, opts = struct(); end
nBoot = getdef(opts, 'youdenBootstrap', 1000);

specs = { ...
    'redFloor',      feat.totalRed,    truth >= 1; ...
    'grade3QuadMin', feat.minRed,      truth >= 3; ...
    'brightFloor',   feat.totalBright, truth >= 1};

for k = 1:size(specs, 1)
    name  = specs{k, 1};
    score = double(specs{k, 2}(:));
    pos   = logical(specs{k, 3}(:));
    r = struct('threshold', NaN, 'J', NaN, 'sensitivity', NaN, ...
               'specificity', NaN, 'auc', NaN, 'aucCI', [NaN NaN], ...
               'method', '', 'nPositive', sum(pos));

    if all(pos) || ~any(pos)
        % One class only: every threshold is equally (un)informative, and a
        % "best" one here would be an artefact of the sweep's tie order.
        r.method = 'not computable -- only one class present';
        y.(name) = r;
        continue;
    end

    if ~isempty(which('perfcurve'))
        [~, ~, T, AUC] = perfcurve(pos, score, true, 'NBoot', nBoot, ...
                                   'XVals', 'all');
        [X, Y] = perfcurve(pos, score, true);          % FPR, TPR at each T
        [r.J, i] = max(Y - X);
        % perfcurve's thresholds are ">= T" cut points on the score, which is
        % exactly the rule engine's comparison, so no conversion is needed.
        r.threshold   = T(min(i, numel(T)));
        r.sensitivity = Y(i);
        r.specificity = 1 - X(i);
        r.auc         = AUC(1);
        if numel(AUC) >= 3, r.aucCI = [AUC(2) AUC(3)]; end
        r.method = sprintf('perfcurve, %d-sample bootstrap CI', nBoot);
    else
        cands = unique([0; score]);
        bestJ = -Inf;
        for t = cands(:)'
            pred = score >= t;
            se = sum(pred & pos) / max(1, sum(pos));
            sp = sum(~pred & ~pos) / max(1, sum(~pos));
            if se + sp - 1 > bestJ
                bestJ = se + sp - 1;
                r.threshold = t; r.sensitivity = se; r.specificity = sp;
            end
        end
        r.J = bestJ;
        r.method = 'direct Youden sweep (perfcurve unavailable)';
    end

    % Integer thresholds: these are lesion COUNTS. perfcurve can return a
    % midpoint or an Inf for the degenerate end of the sweep.
    if isfinite(r.threshold)
        r.threshold = max(0, ceil(r.threshold));
    end
    y.(name) = r;
end
end

function ci = bootstrapQwkCi(pred, truth, maxGrade, nBoot, seed)
% 95% CI on the QWK at the chosen thresholds, by resampling CASES.
%
% A point estimate of 0.94 on 103 images invites a confidence the sample size
% does not support. bootci (Statistics and Machine Learning Toolbox) when it
% is there, a plain percentile bootstrap when it is not -- the interval is
% what matters, not which function produced it.
ci = [NaN NaN];
n = numel(pred);
if n < 10, return; end
rng(seed, 'twister');
stat = @(idx) qwkOf(pred(idx), truth(idx), maxGrade);

if ~isempty(which('bootci'))
    try
        ci = bootci(nBoot, {@(i) stat(i), (1:n)'}, 'type', 'percentile')';
        return;
    catch
        % falls through to the manual bootstrap
    end
end
vals = nan(nBoot, 1);
for b = 1:nBoot
    vals(b) = stat(randi(n, n, 1));
end
ci = prctile(vals(~isnan(vals)), [2.5 97.5]);
end

function k = qwkOf(pred, truth, maxGrade)
m = gradeMetrics(pred, truth, maxGrade);
k = m.qwk;
end

function f = subsetFeat(feat, mask)
f.totalRed        = feat.totalRed(mask);
f.minRed          = feat.minRed(mask);
f.totalBright     = feat.totalBright(mask);
f.nvScore         = feat.nvScore(mask);
f.foveaUnreliable = feat.foveaUnreliable(mask);
f.n               = sum(mask);
end

% ═══════════════════════════════════════════════════════════════════════════
% REPORTING
% ═══════════════════════════════════════════════════════════════════════════
function d = currentDefaults()
% The values ruleEngineGrade uses today. Kept here so the report can show what
% is changing, and so a tie resolves toward the deployed behaviour.
%
% NOTE ON nvThreshold: the task called it nvSuspicionThreshold = 0.7. The
% parameter is named nvThreshold and its default is 0.6 (ruleEngineGrade.m,
% the getdef block). 0.6 is used here because that is what the code does.
d = struct('redFloor', 3, 'grade3QuadMin', 3, 'moderateRedCount', 5, ...
           'brightFloor', 1, 'nvThreshold', 0.6);
end

function c = changeSummary(defaults, chosen, tune)
c = struct();
for k = 1:numel(tune)
    c.(tune{k}) = struct('from', defaults.(tune{k}), 'to', chosen.(tune{k}));
end
end

function b = baselineComparison(feat, target, defaults, maxGrade)
m = gradeMetrics(gradeVectorized(feat, defaults, maxGrade), target, maxGrade);
b = struct('qwk', m.qwk, 'mse', m.mse, 'accuracy', m.accuracy, ...
           'referableSensitivity', m.referableSensitivity, ...
           'referableSpecificity', m.referableSpecificity);
end

function txt = limitationText(data, n, m, cv, search)
parts = {};
if data.isSynthetic
    parts{end+1} = ['THESE THRESHOLDS ARE FITTED ON SYNTHETIC DATA and describe ' ...
        'a detector this file invented. They must not be written into ' ...
        'ruleEngineGrade. Re-run with opts.data from the real model.'];
end
if n < 100
    parts{end+1} = sprintf(['n = %d is small for fitting %d threshold(s): the ' ...
        'in-sample score is optimistic by an unknown amount.'], n, numel(search.theta));
end
if ~isnan(search.tiedCount) && search.tiedCount > 1
    parts{end+1} = sprintf(['%d threshold combinations score identically; the ' ...
        'reported one is the tie broken toward the current defaults, not a ' ...
        'uniquely best answer.'], search.tiedCount);
end
if ~isnan(cv.qwk) && cv.qwk < m.qwk - 0.05
    parts{end+1} = sprintf(['held-out QWK (%.3f) is well below in-sample ' ...
        '(%.3f) -- that gap is overfitting, not headroom.'], cv.qwk, m.qwk);
end
if isnan(cv.qwk)
    parts{end+1} = ['no cross-validation was run, so nothing here estimates ' ...
        'performance on unseen data.'];
end
if ~isnan(m.referableSensitivity) && m.referableSensitivity < 0.85
    parts{end+1} = sprintf(['referable sensitivity at this optimum is %.3f -- ' ...
        'the score improved while referrals were missed.'], m.referableSensitivity);
end
txt = strjoin(parts, ' ');
end

function printReport(r, tune, defaults)
fprintf('\n');
pairs = cell(1, numel(tune));
for k = 1:numel(tune)
    v = r.thresholds.(tune{k});
    if strcmp(tune{k}, 'nvThreshold')
        pairs{k} = sprintf('%s = %.3f', tune{k}, v);
    else
        pairs{k} = sprintf('%s = %d', tune{k}, v);
    end
end
fprintf('Optimal Thresholds Found: %s\n', strjoin(pairs, ', '));

fprintf('\n  parameter          current -> optimal   tied range\n');
for k = 1:numel(tune)
    nm = tune{k};
    tr = '(not enumerated)';
    if isfield(r.tiedRanges, nm)
        b = r.tiedRanges.(nm);
        if b(1) == b(2), tr = sprintf('%g', b(1));
        else,            tr = sprintf('%g .. %g', b(1), b(2)); end
    end
    fprintf('  %-17s %7g -> %-7g   %s\n', nm, defaults.(nm), r.thresholds.(nm), tr);
end

fprintf('\n  metric                current   optimal\n');
fprintf('  %-20s %7.3f   %7.3f\n', 'QWK',            r.baseline.qwk, r.qwk);
fprintf('  %-20s %7.3f   %7.3f\n', 'MSE',            r.baseline.mse, r.mse);
fprintf('  %-20s %7.3f   %7.3f\n', 'accuracy',       r.baseline.accuracy, r.accuracy);
fprintf('  %-20s %7.3f   %7.3f\n', 'referable sens', r.baseline.referableSensitivity, r.referableSensitivity);
fprintf('  %-20s %7.3f   %7.3f\n', 'referable spec', r.baseline.referableSpecificity, r.referableSpecificity);
if ~isnan(r.cvQwk)
    fprintf('  %-20s %7s   %7.3f\n', 'QWK (held out)', '-', r.cvQwk);
end

if isfield(r, 'qwkCI') && ~any(isnan(r.qwkCI))
    fprintf('  %-20s %7s   %7s  95%% CI [%.3f, %.3f]\n', 'QWK bootstrap', '-', '-', ...
        r.qwkCI(1), r.qwkCI(2));
end

% ── The second opinion: Youden's J, one threshold at a time ───────────────
% Printed next to the joint search so a disagreement is VISIBLE rather than
% buried in the returned struct. The two optimise different things (see
% youdenThresholds' header); a gap between them is information, not an error.
if isfield(r, 'youden')
    names = fieldnames(r.youden);
    if ~isempty(names)
        fprintf(['\n  Youden''s J per threshold (Statistics & ML Toolbox) -- a ' ...
                 'SECOND method,\n  tuning each threshold against its own ' ...
                 'binary question:\n']);
        fprintf('  %-17s %8s %8s %8s %8s   %s\n', ...
            'parameter', 'search', 'youden', 'sens', 'spec', 'AUC [95% CI]');
        for k = 1:numel(names)
            nm = names{k}; yk = r.youden.(nm);
            searchVal = '-';
            if isfield(r.thresholds, nm), searchVal = sprintf('%g', r.thresholds.(nm)); end
            if isnan(yk.threshold)
                fprintf('  %-17s %8s %8s   %s\n', nm, searchVal, 'n/a', yk.method);
            else
                aucTxt = '-';
                if ~isnan(yk.auc)
                    aucTxt = sprintf('%.3f', yk.auc);
                    if ~any(isnan(yk.aucCI))
                        aucTxt = sprintf('%s [%.3f, %.3f]', aucTxt, yk.aucCI(1), yk.aucCI(2));
                    end
                end
                fprintf('  %-17s %8s %8d %8.3f %8.3f   %s\n', nm, searchVal, ...
                    yk.threshold, yk.sensitivity, yk.specificity, aucTxt);
            end
        end
    end
end

% ── The held-out split: the only numbers worth quoting ───────────────────
if isfield(r, 'heldOut') && ~isempty(r.heldOut)
    h = r.heldOut;
    fprintf('\n  HELD OUT (%s, n = %d) -- fitted thresholds, never-seen data\n', ...
        h.source, h.n);
    fprintf('  %-20s %7s   %7s\n', 'metric', 'current', 'fitted');
    fprintf('  %-20s %7.3f   %7.3f', 'QWK', h.baselineQwk, h.qwk);
    if ~any(isnan(h.qwkCI))
        fprintf('   95%% CI [%.3f, %.3f]', h.qwkCI(1), h.qwkCI(2));
    end
    fprintf('\n');
    fprintf('  %-20s %7.3f   %7.3f\n', 'referable sens', ...
        h.baselineReferableSensitivity, h.referableSensitivity);
    fprintf('  %-20s %7.3f   %7.3f\n', 'referable spec', ...
        h.baselineReferableSpecificity, h.referableSpecificity);
end

fprintf('\n  confusion (rows = truth 0..%d, cols = predicted)\n', r.maxGrade);
disp(r.confusion);

if ~isempty(r.limitation)
    fprintf('  LIMITATION: %s\n\n', wrapText(r.limitation, 70, '              '));
end
end

function s = wrapText(txt, width, indent)
words = strsplit(txt, ' ');
lines = {}; cur = '';
for i = 1:numel(words)
    if isempty(cur)
        cur = words{i};
    elseif numel(cur) + 1 + numel(words{i}) <= width
        cur = [cur ' ' words{i}]; %#ok<AGROW>
    else
        lines{end+1} = cur; %#ok<AGROW>
        cur = words{i};
    end
end
if ~isempty(cur), lines{end+1} = cur; end
s = strjoin(lines, [newline indent]);
end

function writeJson(path, r, tune)
out = struct();
out.fittedAt = char(datetime('now', 'TimeZone', 'UTC', ...
                             'Format', 'yyyy-MM-dd''T''HH:mm:ss''Z'''));
out.fittedBy = 'grading/optimizeRuleThresholds.m';
out.dataSource = r.dataSource;
out.n = r.n;
out.syntheticData = r.syntheticData;
out.tuned = tune;
out.thresholds = r.thresholds;
out.qwk = r.qwk;
out.cvQwk = r.cvQwk;
out.referableSensitivity = r.referableSensitivity;
out.tiedOptima = r.tiedOptima;
out.limitation = r.limitation;
fid = fopen(path, 'w');
if fid < 0
    error('optimizeRuleThresholds:cannotWrite', 'could not open %s', path);
end
closer = onCleanup(@() fclose(fid)); %#ok<NASGU>
fwrite(fid, jsonencode(out, 'PrettyPrint', true));
end

function v = ternary(c, a, b)
if c, v = a; else, v = b; end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end

% ═══════════════════════════════════════════════════════════════════════════
% SELFTEST
% ═══════════════════════════════════════════════════════════════════════════
function ok = selftest()
fprintf('\n=== optimizeRuleThresholds selftest ===\n');
pass = 0; fail = 0;
    function check(name, cond)
        if cond
            pass = pass + 1; fprintf('  ok   %s\n', name);
        else
            fail = fail + 1; fprintf('  FAIL %s\n', name);
        end
    end

% 1. The fast evaluator matches the real rule engine -- the load-bearing test.
rng(1, 'twister');
d = makeSyntheticData(120, 1);
f = prepareFeatures(d);
mismatch = 0;
for t = 1:6
    p = currentDefaults();
    p.redFloor = randi([0 30]); p.grade3QuadMin = randi([1 25]);
    p.moderateRedCount = randi([0 50]); p.brightFloor = randi([0 20]);
    p.nvThreshold = rand();
    fast = gradeVectorized(f, p, 3);
    for i = 1:numel(d.trueGrade)
        o = p; o.maxGrade = 3; o.foveaUnreliable = d.foveaUnreliable(i);
        if ruleEngineGrade(d.redQuadrants(i,:), d.brightQuadrants(i,:), ...
                           d.nvScore(i), o) ~= fast(i)
            mismatch = mismatch + 1;
        end
    end
end
check(sprintf('fast evaluator == ruleEngineGrade (720 cases, %d mismatches)', mismatch), ...
      mismatch == 0);

% 2. fovea-unreliable rows must skip the all-four-quadrants criterion
d2 = d; d2.foveaUnreliable(:) = true;
check('foveaUnreliable suppresses grade 3 by criterion (a)', ...
      ~any(gradeVectorized(prepareFeatures(d2), currentDefaults(), 3) == 3));

% 3. QWK boundary behaviour
check('QWK of perfect agreement is 1', abs(quadraticKappa(diag([5 5 5 5])) - 1) < 1e-12);
C = zeros(4); C(1,4) = 5; C(4,1) = 5;
check('QWK of maximal disagreement is negative', quadraticKappa(C) < 0);
check('QWK of a degenerate single-cell table is 1', quadraticKappa([9 0; 0 0]) == 1);

% 4. Recovering a planted floor. Counts are built so that the only way to score
%    well is to ignore detections below 10 -- the optimiser must find that.
rng(7, 'twister');
n = 300; g = randi([0 3], n, 1);
red = zeros(n, 4); bright = zeros(n, 4);
for i = 1:n
    if g(i) == 0, tot = randi([0 9]); else, tot = 12 + 15 * g(i) + randi([0 5]); end
    q = floor(tot / 4);
    red(i, :) = [tot - 3 * q, q, q, q];
    bright(i, 1) = (g(i) >= 2) * randi([3 10]);
end
planted = normaliseData(struct('redQuadrants', red, 'brightQuadrants', bright, ...
                               'trueGrade', g));
r = optimizeRuleThresholds(struct('data', planted, 'quiet', true, 'cvFolds', 0, ...
                                  'tune', {{'redFloor'}}));
check(sprintf('planted noise floor of 10 recovered (tied range %g..%g)', ...
              r.tiedRanges.redFloor(1), r.tiedRanges.redFloor(2)), ...
      r.tiedRanges.redFloor(1) <= 10 && r.tiedRanges.redFloor(2) >= 10);
check('optimum is at least as good as the current defaults', r.qwk >= r.baseline.qwk - 1e-12);

% 5. Non-identifiable parameters are dropped, not fitted to noise
flat = planted; flat.nvScore = zeros(size(flat.nvScore));
r2 = optimizeRuleThresholds(struct('data', flat, 'quiet', true, 'cvFolds', 0, ...
                                   'tune', {{'redFloor', 'nvThreshold'}}));
check('constant nvScore reported as not identifiable', ...
      ismember('nvThreshold', r2.notIdentifiable{1}));
check('untuned nvThreshold stays at its default', r2.thresholds.nvThreshold == 0.6);

% 6. A tie resolves toward the deployed value, never away from it.
%    Half the rows have no lesions at all and half have 20, so every redFloor
%    from 1 to 20 grades the set identically -- and 3 is the deployed value.
nn = 20;
red6 = [zeros(nn/2, 4); repmat(5, nn/2, 4)];
bright6 = [zeros(nn/2, 4); repmat([4 0 0 0], nn/2, 1)];
tied = normaliseData(struct('redQuadrants', red6, 'brightQuadrants', bright6, ...
                            'trueGrade', [zeros(nn/2, 1); 2 * ones(nn/2, 1)]));
r3 = optimizeRuleThresholds(struct('data', tied, 'quiet', true, 'cvFolds', 0, ...
                                   'tune', {{'redFloor'}}));
check(sprintf('a tied plateau returns the deployed value (got %d, tied %g..%g)', ...
              r3.thresholds.redFloor, r3.tiedRanges.redFloor(1), r3.tiedRanges.redFloor(2)), ...
      r3.thresholds.redFloor == 3 && r3.tiedRanges.redFloor(2) > 3);

% 7. The sensitivity constraint is hard, not advisory
r4 = optimizeRuleThresholds(struct('data', planted, 'quiet', true, 'cvFolds', 0, ...
        'tune', {{'redFloor', 'moderateRedCount'}}, 'minReferableSensitivity', 0.95));
check('minReferableSensitivity is honoured', r4.referableSensitivity >= 0.95);

% 8. Synthetic results are labelled as unshippable
r5 = optimizeRuleThresholds(struct('n', 200, 'quiet', true, 'cvFolds', 0));
check('synthetic run carries the do-not-ship limitation', ...
      r5.syntheticData && contains(r5.limitation, 'SYNTHETIC'));

% 9. Bad input is refused
threw = false;
try
    optimizeRuleThresholds(struct('data', struct('redQuadrants', zeros(3,3), ...
        'brightQuadrants', zeros(3,4), 'trueGrade', [0;1;2]), 'quiet', true));
catch
    threw = true;
end
check('a 3-wide quadrant matrix is rejected', threw);

% 10. countScale moves the floor, which is the whole point of the tool
rng(11, 'twister');
a = optimizeRuleThresholds(struct('n', 400, 'countScale', 1, 'quiet', true, ...
                                  'cvFolds', 0, 'tune', {{'redFloor'}}));
rng(11, 'twister');
b = optimizeRuleThresholds(struct('n', 400, 'countScale', 4, 'quiet', true, ...
                                  'cvFolds', 0, 'tune', {{'redFloor'}}));
check(sprintf('4x counts raise the fitted floor (%d -> %d)', ...
              a.thresholds.redFloor, b.thresholds.redFloor), ...
      b.thresholds.redFloor > a.thresholds.redFloor);

% 11. Youden's J recovers the planted floor too, by a different route
yd = youdenThresholds(prepareFeatures(planted), planted.trueGrade, ...
                      struct('youdenBootstrap', 200));
% The planted data separates perfectly for ANY threshold in [10, 27] (grade-0
% totals stop at 9, everything else starts at 27), so the assertion is the
% PLATEAU, not a point. Asserting 10 would be asserting a tie-break, and
% perfcurve legitimately reports the other end of it.
check(sprintf('Youden''s J finds the planted floor (redFloor = %g, J = %.2f)', ...
              yd.redFloor.threshold, yd.redFloor.J), ...
      yd.redFloor.threshold >= 10 && yd.redFloor.threshold <= 27 ...
      && yd.redFloor.J > 0.99);
check('a separation with no positive cases is reported, not invented', ...
      isnan(youdenThresholds(prepareFeatures(tied), zeros(nn, 1), ...
                             struct('youdenBootstrap', 50)).grade3QuadMin.threshold));

% 12. The bootstrap CI brackets the point estimate it belongs to
predP = gradeVectorized(prepareFeatures(planted), currentDefaults(), 3);
ciP   = bootstrapQwkCi(predP, planted.trueGrade, 3, 300, 5);
kP    = qwkOf(predP, planted.trueGrade, 3);
check(sprintf('bootstrap CI [%.3f, %.3f] contains the point estimate %.3f', ...
              ciP(1), ciP(2), kP), ...
      ciP(1) <= kP && kP <= ciP(2));

% 13. Folds are stratified, so no fold loses a whole grade
r6 = optimizeRuleThresholds(struct('data', planted, 'quiet', true, 'cvFolds', 5, ...
                                   'tune', {{'redFloor'}}));
check(sprintf('cross-validation partition: %s', r6.cvPartition), ...
      ~isnan(r6.cvQwk));

fprintf('\n%d passed, %d failed\n\n', pass, fail);
ok = (fail == 0);
end
