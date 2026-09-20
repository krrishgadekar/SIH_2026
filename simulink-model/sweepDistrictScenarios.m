function results = sweepDistrictScenarios(varargin)
% SWEEPDISTRICTSCENARIOS  Run the SimEvents district model across a grid of
% scenarios in parallel (Parallel Computing Toolbox: parsim).
%
%   results = sweepDistrictScenarios()
%   results = sweepDistrictScenarios('Workers', 4, 'Serial', true)
%
%   runDistrictScreeningModel.m answers "what happens at the default
%   configuration". A district planner's question is the other one: WHERE DOES
%   IT BREAK -- how much demand, or how weak a model, before two
%   ophthalmologists stop coping. That is one simulation per combination, and
%   the combinations are independent, which is exactly what parsim is for.
%
%   ── WHY parsim AND NOT A parfor OF sim() ───────────────────────────────────
%   parsim sets up each worker's model for it: one load per worker rather than
%   one per run, and the model's compiled form is reused across the runs that
%   worker handles. A parfor calling sim() reloads and recompiles per iteration
%   and can leave models open on workers when a run errors.
%
%   ── WHAT VARIES, AND WHY THESE FOUR ────────────────────────────────────────
%   The .slx bakes its parameters into block dialogs at build time
%   (buildDistrictScreeningModel.m), so a sweep either rebuilds the model per
%   point -- slow, and a different model each time -- or overrides the dialog
%   strings per run. Simulink.SimulationInput does the second, which is why
%   these four are the knobs and reviewer COUNT is not: the number of Reviewer
%   blocks is structural, so review THROUGHPUT is swept through service time
%   instead -- see reviewTimeScale below.
%
%     demandMultiplier  patients/year relative to the 100k baseline. Enters as
%                       the generator's mean inter-arrival time.
%     tierAFraction     share auto-cleared without a human. This is the model's
%                       own quality expressed as a resourcing input -- a weaker
%                       classifier IS a staffing cost, and that link is the
%                       most useful thing this sweep shows.
%     reviewTimeScale   multiplier on review seconds. 0.5 = each review takes
%                       half as long, which is the same throughput as twice
%                       the reviewers. Capacity itself cannot be swept:
%                       SimEvents allows preemption only on a single server.
%     simDays           250 = a working year, 50 = camp mode, the same annual
%                       volume compressed (design doc §9.5).
%
%   Every parameter is a modelled assumption, not field data (design doc §16).
%   Say so when presenting the results.

opts = parseArgs(varargin{:});

thisDir   = fileparts(mfilename('fullpath'));
modelName = 'districtScreeningSimEvents';
slxPath   = fullfile(thisDir, [modelName '.slx']);
if ~isfile(slxPath)
    error(['sweepDistrictScenarios: %s not found.\n' ...
           'Build it first: buildDistrictScreeningModel'], slxPath);
end

p = referenceQueueingModel('defaults');
secondsPerDay = p.workingHoursPerDay * 3600;

% The six To Workspace sinks, by the variable name each writes.
SINKS = {'uploadUtil', 'reviewWait', 'tierACleared', 'reviewedCount', ...
         'reviewerUtil1', 'reviewerUtil2'};

grid = buildGrid(opts);
n = numel(grid);
fprintf('\n=== District scenario sweep (SimEvents) ===\n');
fprintf('%d scenarios, %d block-parameter overrides each\n', n, 4);

% ── Build one SimulationInput per scenario ─────────────────────────────────
in(1:n) = Simulink.SimulationInput(modelName);
for k = 1:n
    g = grid(k);

    % Arrivals. perDay is the load the district actually sees; the mean
    % inter-arrival time is its reciprocal in simulated seconds. Exponential
    % via inverse transform, matching how the model was built -- NOT a fixed
    % interval, because a constant arrival rate hides exactly the queueing that
    % this model exists to measure.
    perDay  = (p.annualPatients * g.demandMultiplier) / p.workingDaysPerYear;
    meanIAT = secondsPerDay / perDay;
    in(k) = in(k).setBlockParameter([modelName '/Patient Arrivals'], ...
        'IntergenerationTimeAction', sprintf('dt = -%.10g*log(rand());', meanIAT));

    % Tier split. The non-A remainder keeps the baseline 2:1 B:C ratio, so a
    % single number moves auto-clear without silently changing the B/C mix too.
    cumA = g.tierAFraction;
    cumB = cumA + (1 - cumA) * 2/3;
    in(k) = in(k).setBlockParameter([modelName '/Patient Arrivals'], ...
        'GenerateAction', sprintf([ ...
            'u = rand();\n' ...
            'if u < %.6f\n  entity.prio = 1;\n' ...
            'elseif u < %.6f\n  entity.prio = 2;\n' ...
            'else\n  entity.prio = 3;\nend'], cumA, cumB));

    % REVIEW SPEED, NOT REVIEWER CAPACITY.
    %
    % The obvious knob -- give each Reviewer block a capacity above 1 -- is
    % not available: SimEvents refuses it ("Preemption is only supported for
    % a single server"), and preemption is load-bearing here, since Tier C
    % preempting an in-progress Tier B is what the reference model implements
    % and what the cross-check depends on. Nine of eighteen runs failed on
    % exactly this before the sweep was changed.
    %
    % Scaling the service time answers the same planning question from the
    % other side: half the time per case is the same throughput as twice the
    % reviewers, and unlike a capacity change it is a quantity the PS actually
    % names (the <30 s AI-assisted review target).
    reviewAction = sprintf([ ...
        'if entity.prio == 3\n  dt = -%.10g*log(rand());\nelse\n' ...
        '  dt = -%.10g*log(rand());\nend'], ...
        p.reviewSecondsC * g.reviewTimeScale, ...
        p.reviewSecondsB * g.reviewTimeScale);
    for r = 1:2
        in(k) = in(k).setBlockParameter( ...
            sprintf('%s/Reviewer %d', modelName, r), ...
            'ServiceTimeAction', reviewAction);
    end

    in(k) = in(k).setModelParameter('StopTime', ...
        num2str(g.simDays * secondsPerDay));

    % KEEP ONLY THE LAST SAMPLE OF EACH SINK.
    %
    % This is not tidying, it is what makes the sweep runnable. Every sink
    % logs a sample per event, and a saturating scenario generates events for
    % the whole simulated year -- the first run of this sweep returned 7.7 MB
    % for a healthy scenario and 30.5 MB for a loaded one, then spent seven
    % minutes on a 4x-demand run before falling over. SimEvents statistics are
    % cumulative, so the final sample IS the whole-run figure and every
    % earlier one is weight nobody reads: To Workspace keeps the most recent
    % MaxDataPoints samples, so 1 keeps exactly the value report() wants.
    for sink = SINKS
        in(k) = in(k).setBlockParameter( ...
            sprintf('%s/%s out', modelName, sink{1}), 'MaxDataPoints', '1');
    end
end

% ── Run them ───────────────────────────────────────────────────────────────
% Serial fallback is not politeness: this has to keep working on a machine
% without Parallel Computing Toolbox, and a sweep that only runs on the
% developer's laptop is a sweep nobody re-runs.
t0 = tic;
if opts.Serial || ~hasParallel()
    if ~opts.Serial
        fprintf('Parallel Computing Toolbox not available -- running serially.\n');
    end
    out = parsim(in, 'ShowProgress', 'on', 'RunInBackground', 'off', ...
                 'UseFastRestart', 'off', 'TransferBaseWorkspaceVariables', 'on', ...
                 'ShowSimulationManager', 'off');
else
    pool = ensurePool(opts.Workers);
    fprintf('%d workers\n', pool.NumWorkers);
    out = parsim(in, 'ShowProgress', 'on', 'UseFastRestart', 'off', ...
                 'TransferBaseWorkspaceVariables', 'on', ...
                 'ShowSimulationManager', 'off');
end
elapsed = toc(t0);

% ── Collect ────────────────────────────────────────────────────────────────
results = struct('label', {}, 'demandMultiplier', {}, 'tierAFraction', {}, ...
                 'reviewTimeScale', {}, 'simDays', {}, 'autoCleared', {}, ...
                 'reviewed', {}, 'uploadUtilisation', {}, ...
                 'reviewerUtilisation', {}, 'reviewWaitMeanMin', {}, ...
                 'errorMessage', {});
for k = 1:n
    g = grid(k);
    r = struct('label', g.label, 'demandMultiplier', g.demandMultiplier, ...
               'tierAFraction', g.tierAFraction, ...
               'reviewTimeScale', g.reviewTimeScale, 'simDays', g.simDays, ...
               'autoCleared', NaN, 'reviewed', NaN, 'uploadUtilisation', NaN, ...
               'reviewerUtilisation', NaN, 'reviewWaitMeanMin', NaN, ...
               'errorMessage', '');
    % A failed run is reported as NaN with its message, never dropped. A sweep
    % that silently returns fewer rows than it was asked for is a sweep whose
    % conclusion is drawn from the scenarios that happened to succeed.
    if ~isempty(out(k).ErrorMessage)
        r.errorMessage = out(k).ErrorMessage;
        % Written out as well as returned: the first run of this sweep lost
        % its error to a truncated console, and a sweep whose failures are
        % invisible is worse than one that does not run.
        logFailure(thisDir, g, out(k).ErrorMessage);
    else
        r.autoCleared         = lastValue(out(k), 'tierACleared');
        r.reviewed            = lastValue(out(k), 'reviewedCount');
        r.uploadUtilisation   = lastValue(out(k), 'uploadUtil');
        r.reviewWaitMeanMin   = lastValue(out(k), 'reviewWait') / 60;
        r.reviewerUtilisation = mean([lastValue(out(k), 'reviewerUtil1'), ...
                                      lastValue(out(k), 'reviewerUtil2')]);
    end
    results(k) = r; %#ok<AGROW>
end

report(results, elapsed);

if nargout == 0
    clear results;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function grid = buildGrid(opts)
% The grid is deliberately small and readable rather than a dense sweep: six
% demand levels x three auto-clear rates x two capacities x two horizons is 72
% runs, which is a long wait for a table nobody reads. These are the points
% that answer a question someone actually asked.
demand   = opts.Demand;
tierA    = opts.TierA;
scales   = opts.ReviewTimeScale;
days     = opts.SimDays;

grid = struct('label', {}, 'demandMultiplier', {}, 'tierAFraction', {}, ...
              'reviewTimeScale', {}, 'simDays', {});
for d = demand
    for a = tierA
        for c = scales
            for s = days
                grid(end+1) = struct( ...
                    'label', sprintf('%.2gx demand, %.0f%% auto-clear, %.2gx review time, %d days', ...
                                     d, 100*a, c, s), ...
                    'demandMultiplier', d, 'tierAFraction', a, ...
                    'reviewTimeScale', c, 'simDays', s); %#ok<AGROW>
            end
        end
    end
end
end

function opts = parseArgs(varargin)
q = inputParser;
q.addParameter('Workers', 0);              % 0 = let the cluster decide
q.addParameter('Serial', false);
q.addParameter('Demand', [1 2 4]);
q.addParameter('TierA', [0.70 0.50 0.30]);
q.addParameter('ReviewTimeScale', [1 0.5]);   % 1 = as specified, 0.5 = twice as fast
q.addParameter('SimDays', 50);
% 50 simulated days, not 250. The sweep compares scenarios at the SAME
% horizon, and a scenario that saturates does so within the first weeks --
% simulating the remaining ten months of an unbounded backlog builds a bigger
% queue to reach a conclusion already visible, which is what made the first
% run of this sweep take minutes per point and then fail. Arrival and service
% RATES are unchanged, so utilisation and waiting time mean the same thing;
% only the number of patients behind them is smaller. Pass 'SimDays', 250 for
% a full working year on the scenarios that do not saturate.
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
    % Each worker is a whole MATLAB process. Capped rather than maxed: this
    % runs on a 16 GB demo laptop that is also holding Postgres, a Python
    % segmentation worker and the persistent MATLAB session, and a pool that
    % pushes the machine into swap is slower than running serially.
    n = workers;
    if n <= 0, n = min(4, c.NumWorkers); end
    pool = parpool(c, n);
end
end

function v = lastValue(out, name)
% Each To Workspace sink logs a timeseries; SimEvents statistics are
% cumulative, so the final sample is the whole-run figure.
v = NaN;
try
    ts = out.(name);
    if isa(ts, 'timeseries') && ~isempty(ts.Data)
        v = double(ts.Data(end));
    elseif isnumeric(ts) && ~isempty(ts)
        v = double(ts(end));
    end
catch
    % Missing sink -> NaN, same as a failed run.
end
end

function report(results, elapsed)
fprintf('\nfinished in %.1f s\n\n', elapsed);
fprintf('%-46s %9s %9s %9s %11s\n', 'scenario', 'reviewed', 'upload%', 'reviewer%', 'wait(min)');
fprintf('%s\n', repmat('-', 1, 88));
for k = 1:numel(results)
    r = results(k);
    if ~isempty(r.errorMessage)
        fprintf('%-46s   FAILED: %s\n', r.label, firstLine(r.errorMessage));
        continue;
    end
    fprintf('%-46s %9d %9.0f %9.0f %11.1f\n', r.label, r.reviewed, ...
        100*r.uploadUtilisation, 100*r.reviewerUtilisation, r.reviewWaitMeanMin);
end

ok = results(cellfun(@isempty, {results.errorMessage}));
if isempty(ok), fprintf('\nevery scenario failed.\n'); return; end

% The headline is the breaking point, not the table. A reviewer pool at 100%
% utilisation has no slack: the queue grows without bound and the mean wait
% reported here understates it, because the run ends before the queue does.
saturated = ok([ok.reviewerUtilisation] >= 0.95);
if isempty(saturated)
    fprintf('\nNo scenario saturated the reviewers (all below 95%% utilisation).\n');
else
    fprintf('\nReviewers SATURATED (>=95%% utilisation) in %d of %d scenarios:\n', ...
        numel(saturated), numel(ok));
    for k = 1:numel(saturated)
        fprintf('  %s\n', saturated(k).label);
    end
    fprintf(['In these the mean wait UNDERSTATES the real one: the queue is still\n' ...
             'growing when the simulation ends.\n']);
end
end

function logFailure(dir, g, msg)
f = fullfile(dir, 'out', 'sweep-failures.log');
if ~isfolder(fileparts(f)), mkdir(fileparts(f)); end
fid = fopen(f, 'a');
if fid < 0, return; end
fprintf(fid, '[%s] %s\n%s\n\n', ...
    char(datetime('now', 'Format', 'yyyy-MM-dd HH:mm:ss')), g.label, char(msg));
fclose(fid);
end

function s = firstLine(msg)
parts = strsplit(char(msg), newline);
s = strtrim(parts{1});
end
