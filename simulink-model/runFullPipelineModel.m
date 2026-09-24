function results = runFullPipelineModel(varargin)
% RUNFULLPIPELINEMODEL  Run netraSetuPipeline.slx, on screen or headless.
%
%   runFullPipelineModel()                       open it and watch it run
%   runFullPipelineModel('Hours', 4)             four simulated clinic hours
%   runFullPipelineModel('Pace', 500)            faster than real time
%   results = runFullPipelineModel('Show', false)  headless, just the numbers
%
%   ── WATCHING IT ────────────────────────────────────────────────────────────
%   With 'Show' true (the default) the model opens and runs with PACING on, so
%   the displays, gauges and lamps move at a speed a person can follow. The
%   sliders and switches are live while it runs:
%
%     Patients per hour   drag it up and the queues start to build
%     Review speed        0.5 means each read takes half as long
%     Network link        off = the district link is down. The PHC backlog
%                         climbs; nothing is lost, which is the entire point
%                         of capturing offline. Back on, and it drains.
%     Grading available   off = the central pipeline is down. Cases pile up
%                         behind grading instead, and the reviewers go idle --
%                         a different shape of failure, and worth showing
%                         next to the first one.
%
%   ── WHY THE PACE MATTERS ───────────────────────────────────────────────────
%   Unpaced, the model runs an entire eight-hour clinic day in about five and
%   a half seconds -- far too fast to watch. Pacing holds it to a speed a
%   person can follow: at 200x one simulated hour takes 18 seconds on screen.
%
%   The machine is nowhere near its limit at 200x; what limits smoothness is
%   how fast the dashboard can REDRAW, not how fast the simulation computes.
%   If it still stutters, close the two Dashboard Scopes first -- they redraw
%   continuously, while the displays and lamps only change on an event.
%   Set Pace to 0 for no pacing at all when you only want the numbers.

opts = parseArgs(varargin{:});

% ── -batch HAS NO DISPLAY ─────────────────────────────────────────────────
% `matlab -batch "runFullPipelineModel"` looks like it hangs: open_system
% cannot show anything without a desktop, pacing then holds the run at
% wall-clock speed, and nothing prints until it finishes. Detected here and
% said out loud, because a silent terminal for two minutes reads as a crash.
%
% To WATCH it, start the desktop instead:
%   matlab -sd "<this folder>" -r "runFullPipelineModel"
if opts.Show && ~usejava('desktop')
    warning('runFullPipelineModel:noDisplay', ...
        ['no MATLAB desktop (you are in -batch), so there is nothing to ' ...
         'watch. Running headless and unpaced instead. To see it: ' ...
         'matlab -sd "%s" -r "runFullPipelineModel"'], ...
        fileparts(mfilename('fullpath')));
    opts.Show = false;
    opts.Pace = 0;
end

thisDir   = fileparts(mfilename('fullpath'));
modelName = 'netraSetuPipeline';
slxPath   = fullfile(thisDir, [modelName '.slx']);
if ~isfile(slxPath)
    error(['runFullPipelineModel: %s not found.\n' ...
           'Build it first: buildFullPipelineModel'], slxPath);
end

if opts.Show
    open_system(slxPath);
else
    load_system(slxPath);
end
cleanup = onCleanup(@() closeQuietly(modelName));

% ── A RUN ALREADY IN PROGRESS MUST BE STOPPED FIRST ───────────────────────
% Everything below reconfigures the model -- StopTime, pacing, and a compile
% via SimulationCommand 'update' -- and NONE of that is allowed while a
% simulation is running. The failure does not say so: SimEvents reports
%
%   Cannot change the 'EventLogging' parameter while the model
%   'netraSetuPipeline' is running
%
% which names a parameter this file never touches, because the compile
% internally reaches for it. The actual cause is almost always that the model
% was started with the Run button in the Simulink window -- it is paced at
% 200x and takes minutes -- and then this function was called from the command
% line while it was still going.
%
% Stopped rather than refused: the caller asked for a run, and the previous
% one is a leftover, not something to protect. The wait loop matters because
% 'stop' is asynchronous -- proceeding immediately would hit the same error.
status = get_param(modelName, 'SimulationStatus');
if ~strcmp(status, 'stopped')
    fprintf('a simulation is already %s -- stopping it first... ', status);
    set_param(modelName, 'SimulationCommand', 'stop');
    for k = 1:100                       % up to ~10 s
        if strcmp(get_param(modelName, 'SimulationStatus'), 'stopped'), break; end
        pause(0.1);
    end
    if strcmp(get_param(modelName, 'SimulationStatus'), 'stopped')
        fprintf('stopped\n');
    else
        error('runFullPipelineModel:stillRunning', ...
            ['the model is still %s after 10 s. Press Stop in the Simulink ' ...
             'window, then re-run.'], get_param(modelName, 'SimulationStatus'));
    end
end

% ── WARM THE MODEL UP BEFORE ANYONE WATCHES ───────────────────────────────
% Measured on this machine: the first run in a MATLAB session takes 18.3 s
% for one simulated hour, the second 6.0 s, the third 5.5 s -- and an EIGHT
% hour day also takes 5.5 s. In other words the cost is compilation, not
% simulation, and the model can sustain thousands of times real time once it
% is compiled.
%
% That compile is what makes the first paced run look broken: pacing cannot
% begin until the model is built, so the window sits there doing nothing.
% Compiling first, with a message, turns a mysterious stall into a line of
% text and lets the watched run start moving immediately.
fprintf('compiling the model (a few seconds, once per session)... ');
t0 = tic;
try
    set_param(modelName, 'SimulationCommand', 'update');
    fprintf('%.1f s\n', toc(t0));
catch ME
    fprintf('\n');
    warning('runFullPipelineModel:warmup', ...
        'could not pre-compile: %s', ME.message);
end

stopTime = opts.Hours * 3600;
set_param(modelName, 'StopTime', num2str(stopTime));
if opts.Pace > 0
    set_param(modelName, 'EnablePacing', 'on', 'PacingRate', num2str(opts.Pace));
    fprintf(['\nRunning %g simulated hour(s) at %gx.\n' ...
             'About %.0f s on screen -- the controls are live while it runs.\n'], ...
        opts.Hours, opts.Pace, stopTime / opts.Pace);
else
    set_param(modelName, 'EnablePacing', 'off');
    fprintf('\nRunning %g simulated hour(s), unpaced.\n', opts.Hours);
end

t0 = tic;
out = sim(modelName);
elapsed = toc(t0);

results = collect(out);
report(results, opts.Hours, elapsed);
if nargout == 0
    clear results;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function r = collect(out)
% The logged statistics, by the block that produced them. Each is cumulative
% inside SimEvents, so the last sample is the whole-run figure.
r = struct('autoCleared', 0, 'referred', 0, 'clearedByReviewer', 0, ...
           'failed', 0, 'abandonedCaptures', 0, ...
           'phcBacklog', 0, 'gradingBacklog', 0, 'awaitingReview', 0, ...
           'uploadUtilisation', 0, 'gradingUtilisation', 0, ...
           'reviewerUtilisation', 0);

byBlock = containers.Map('KeyType', 'char', 'ValueType', 'double');
try
    ls = out.logsout;
    for i = 1:ls.numElements
        e = ls.getElement(i);
        d = e.Values.Data;
        % An EMPTY log is a real answer: nothing ever went through that
        % branch. Zero is the right value for it, and it must not read as
        % "missing" when a counter simply never fired.
        v = 0;
        if ~isempty(d), v = double(d(end)); end
        name = char(e.BlockPath.getBlock(1));
        parts = strsplit(name, '/');
        byBlock(parts{end}) = v;
    end
catch
    % No logs at all -- report zeros rather than failing the run.
end

g = @(k) ternaryGet(byBlock, k);
r.autoCleared        = g('Tier A Auto-Cleared');
r.referred           = g('Referred + SMS');
r.clearedByReviewer  = g('Cleared by Reviewer');
r.failed             = g('Failed Cases');
r.abandonedCaptures  = g('Abandoned Captures');
r.phcBacklog         = g('Sync Queue');
r.gradingBacklog     = g('Grading Queue');
r.awaitingReview     = g('Review Queue');
r.uploadUtilisation  = g('Network Upload');
r.gradingUtilisation = g('Grading Server');
r.reviewerUtilisation = mean([g('Reviewer 1'), g('Reviewer 2')]);
end

function v = ternaryGet(map, key)
if isKey(map, key), v = map(key); else, v = 0; end
end

function report(r, hours, elapsed)
seen = r.autoCleared + r.referred + r.clearedByReviewer + r.failed;
fprintf('\n=== %g simulated hour(s), %.1f s of wall clock ===\n', hours, elapsed);
fprintf('  patients screened end to end : %d\n', round(seen));
fprintf('    auto-cleared (Tier A)      : %d\n', round(r.autoCleared));
fprintf('    referred + SMS             : %d\n', round(r.referred));
fprintf('    cleared by a reviewer      : %d\n', round(r.clearedByReviewer));
fprintf('    grading gave up            : %d\n', round(r.failed));
fprintf('    capture abandoned          : %d   (3 retakes, still unusable)\n', ...
    round(r.abandonedCaptures));
fprintf('  still queued at the end      : %d at the PHC, %d for grading, %d for review\n', ...
    round(r.phcBacklog), round(r.gradingBacklog), round(r.awaitingReview));
fprintf('  utilisation                  : upload %.0f%%, grading %.0f%%, reviewers %.0f%%\n', ...
    100*r.uploadUtilisation, 100*r.gradingUtilisation, 100*r.reviewerUtilisation);

if r.reviewerUtilisation >= 0.95
    fprintf(['\n  Reviewers are saturated: the queue was still growing when the run\n' ...
             '  ended, so the waiting figures understate the real ones.\n']);
end
fprintf(['\nEvery rate here is a modelled assumption unless calibration.json marks\n' ...
         'it measured. Say so when presenting these numbers.\n']);
end

function opts = parseArgs(varargin)
q = inputParser;
q.addParameter('Hours', 4);
q.addParameter('Pace', 200);
q.addParameter('Show', true);
q.parse(varargin{:});
opts = q.Results;
end

function closeQuietly(modelName)
try
    if bdIsLoaded(modelName), close_system(modelName, 0); end
catch
end
end
