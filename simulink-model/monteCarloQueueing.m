function summary = monteCarloQueueing(varargin)
% MONTECARLOQUEUEING  Replicate the reference queueing model across random
% seeds, in parallel (Parallel Computing Toolbox: parfor).
%
%   summary = monteCarloQueueing()
%   summary = monteCarloQueueing('Replications', 50, 'Workers', 4)
%   summary = monteCarloQueueing('Serial', true)        % no toolbox needed
%
%   ── WHY THIS EXISTS, AND IT IS NOT SPEED ───────────────────────────────────
%   referenceQueueingModel runs with rngSeed = 42, fixed, so every figure it
%   reports is ONE draw from a stochastic system. "p95 wait = 92.8 min" reads
%   like a measurement and is actually a sample: arrivals are Poisson and
%   service times exponential, so a different seed gives a different number,
%   and nothing in the current output says by how much.
%
%   That matters where it is used. The resource recommendation on the admin
%   dashboard says how many ophthalmologists a district needs; if the seed
%   moves that answer, the recommendation is noise presented as advice.
%
%   Replicating over seeds turns each figure into a mean with a confidence
%   interval, and the interval is the honest part -- it is what tells a reader
%   whether "2 reviewers is enough" is a finding or a coin flip. Replications
%   are independent by construction, which is what makes parfor correct here
%   rather than merely faster.
%
%   ── SEEDS ARE FIXED, NOT RANDOM ────────────────────────────────────────────
%   Seed r is BASE_SEED + r, so the whole study reproduces exactly. Drawing
%   seeds from the clock would mean the confidence interval itself changed
%   every run, and "we cannot reproduce last week's number" is the one thing
%   that would make this worse than the single-seed version it replaces.
%
%   Every parameter remains a modelled assumption, not field data
%   (design doc §16).

opts = parseArgs(varargin{:});
BASE_SEED = 1000;

scenarios = opts.Scenarios;
if isempty(scenarios), scenarios = defaultScenarios(); end
nS = numel(scenarios);
R  = opts.Replications;

fprintf('\n=== Monte Carlo: reference queueing model ===\n');
fprintf('%d scenarios x %d replications = %d runs\n', nS, R, nS*R);

usePar = ~opts.Serial && hasParallel();
if usePar
    pool = ensurePool(opts.Workers);
    fprintf('%d workers\n', pool.NumWorkers);
else
    fprintf('serial\n');
end

summary = struct('label', {}, 'params', {}, 'replications', {}, ...
                 'reviewWaitP95Min', {}, 'reviewUtilisation', {}, ...
                 'totalTimeMeanMin', {}, 'casesReviewed', {}, ...
                 'bottleneckModes', {});

t0 = tic;
for s = 1:nS
    sc = scenarios(s);

    % Preallocated slices, not growing arrays: parfor requires each iteration
    % to write its own element and nothing else.
    p95   = zeros(1, R);
    util  = zeros(1, R);
    total = zeros(1, R);
    seen  = zeros(1, R);
    bott  = cell(1, R);

    if usePar
        parfor r = 1:R
            [p95(r), util(r), total(r), seen(r), bott{r}] = ...
                oneRun(sc.params, BASE_SEED + r);
        end
    else
        for r = 1:R
            [p95(r), util(r), total(r), seen(r), bott{r}] = ...
                oneRun(sc.params, BASE_SEED + r);
        end
    end

    summary(s) = struct( ...
        'label', sc.label, 'params', sc.params, 'replications', R, ...
        'reviewWaitP95Min',  stat(p95), ...
        'reviewUtilisation', stat(util), ...
        'totalTimeMeanMin',  stat(total), ...
        'casesReviewed',     stat(seen), ...
        'bottleneckModes',   {tally(bott)}); %#ok<AGROW>
end
elapsed = toc(t0);

report(summary, elapsed, usePar);

if nargout == 0
    clear summary;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function [p95, util, total, seen, bottleneck] = oneRun(params, seed)
% One replication. Everything this touches is local to the worker: the only
% thing that differs between replications is the seed, and the only thing that
% comes back is five numbers.
params.rngSeed = seed;
r = referenceQueueingModel('run', params);
p95        = r.reviewWaitP95Min;
util       = r.reviewUtilisation;
total      = r.totalTimeMeanMin;
seen       = r.casesReviewed;
bottleneck = r.bottleneck;
end

function s = stat(v)
% Mean with a 95% interval. The t-distribution, not 1.96*sigma: at 20-30
% replications the normal approximation is visibly too narrow, and a
% confidence interval that is too tight defeats the purpose of computing one.
n = numel(v);
s.mean = mean(v);
s.std  = std(v);
s.n    = n;
if n > 1
    % tinv without Statistics Toolbox would be a dependency for one number;
    % 2.093 is t(0.975, 19), close enough across 15-40 replications and
    % conservative below that. Recorded here rather than hidden in a constant.
    tcrit = 2.093;
    half = tcrit * s.std / sqrt(n);
    s.ci = [s.mean - half, s.mean + half];
else
    s.ci = [NaN NaN];
end
end

function t = tally(c)
% Which stage was the bottleneck, and how often. A scenario whose bottleneck
% MOVES between replications is the interesting case: it means the system is
% near a boundary, and a single-seed run would have reported whichever side it
% happened to land on as if it were the answer.
u = unique(c);
t = struct('mode', {}, 'count', {});
for i = 1:numel(u)
    t(i) = struct('mode', u{i}, 'count', sum(strcmp(c, u{i}))); %#ok<AGROW>
end
[~, order] = sort([t.count], 'descend');
t = t(order);
end

function scenarios = defaultScenarios()
base = referenceQueueingModel('defaults');

scenarios = struct('label', {}, 'params', {});
scenarios(1) = struct('label', 'Baseline: 10 PHCs, 2 ophthalmologists', ...
                      'params', base);

weak = base;                       % the classifier auto-clears far less
weak.tierFractions = [0.30, 0.70*2/3, 0.70*1/3];
scenarios(2) = struct('label', 'Weak model: 30% auto-clear', 'params', weak);

camp = base;                       % same annual volume, 50 working days
camp.workingDaysPerYear = 50;
scenarios(3) = struct('label', 'Camp mode: 50 working days', 'params', camp);

lean = base;                       % one ophthalmologist for the district
lean.numOphthalmologists = 1;
scenarios(4) = struct('label', 'One ophthalmologist', 'params', lean);
end

function opts = parseArgs(varargin)
q = inputParser;
q.addParameter('Replications', 20);
q.addParameter('Workers', 0);
q.addParameter('Serial', false);
q.addParameter('Scenarios', []);
q.parse(varargin{:});
opts = q.Results;
end

function tf = hasParallel()
tf = ~isempty(ver('parallel')) && license('test', 'Distrib_Computing_Toolbox');
end

function pool = ensurePool(workers)
pool = gcp('nocreate');
if isempty(pool)
    c = parcluster('Processes');
    % Capped at 4: each worker is a whole MATLAB process, and this runs on a
    % 16 GB laptop that is also holding Postgres, the Python segmentation
    % worker and the persistent MATLAB session.
    n = workers;
    if n <= 0, n = min(4, c.NumWorkers); end
    pool = parpool(c, n);
end
end

function report(summary, elapsed, usePar)
fprintf('\nfinished in %.1f s (%s)\n\n', elapsed, ternary(usePar, 'parallel', 'serial'));
for s = 1:numel(summary)
    x = summary(s);
    fprintf('--- %s (%d replications) ---\n', x.label, x.replications);
    line('reviewed',            x.casesReviewed,     '%.0f');
    line('reviewer utilisation', scale(x.reviewUtilisation, 100), '%.1f%%');
    line('review wait p95 (min)', x.reviewWaitP95Min, '%.1f');
    line('total time mean (min)', x.totalTimeMeanMin, '%.1f');

    modes = x.bottleneckModes;
    if numel(modes) == 1
        fprintf('  bottleneck          : %s, in every replication\n', modes(1).mode);
    else
        parts = arrayfun(@(m) sprintf('%s x%d', m.mode, m.count), modes, ...
                         'UniformOutput', false);
        fprintf('  bottleneck          : UNSTABLE -- %s\n', strjoin(parts, ', '));
        fprintf(['                        a single-seed run would have reported\n' ...
                 '                        whichever of these it happened to hit.\n']);
    end
    fprintf('\n');
end
fprintf(['The interval is the point: a figure whose interval spans the decision\n' ...
         'boundary is not evidence for either side of it.\n']);
end

function line(label, s, fmt)
% Built with two sprintf passes once, which quietly swallowed the numbers.
% One pass now: the value format is substituted into the template, then the
% whole line is printed.
tmpl = ['  %-20s: ' fmt '  (95%% CI ' fmt ' .. ' fmt ')\n'];
fprintf(tmpl, label, s.mean, s.ci(1), s.ci(2));
end

function s = scale(s, k)
s.mean = s.mean * k; s.ci = s.ci * k; s.std = s.std * k;
end

function v = ternary(c, a, b)
if c, v = a; else, v = b; end
end
