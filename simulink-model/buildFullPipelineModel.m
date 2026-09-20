function outPath = buildFullPipelineModel(outPath)
% BUILDFULLPIPELINEMODEL  Build netraSetuPipeline.slx: the WHOLE screening
% pipeline as a live, watchable SimEvents model.
%
%   buildFullPipelineModel()
%   buildFullPipelineModel('path/to/netraSetuPipeline.slx')
%
%   districtScreeningSimEvents.slx models three stages -- upload, triage,
%   review -- with every rate baked into a block dialog, so it answers
%   questions only by being re-run. This model covers the pipeline the system
%   actually runs, and it is built to be DRIVEN while it runs:
%
%     patient arrives -> capture + quality gate -> RETAKE LOOP -> local sync
%     queue -> network link (can be switched off) -> central grading (can be
%     switched off, can fail, retries) -> tier triage -> reviewer pool with
%     preemption -> referral
%
%   ── WHAT MAKES IT LIVE, AND WHY THE MODEL HAD TO CHANGE ────────────────────
%   SimEvents reads a block dialog when the model compiles, so a dialog value
%   cannot move during a run. Every rate here therefore arrives as a SIGNAL
%   instead: a Constant feeds a MATLAB Function that turns it into an
%   exponential draw, and the Entity Generator and Servers take their timing
%   from that signal port. A dashboard Slider bound to the Constant then
%   changes the rate mid-simulation, because it is changing a signal source
%   rather than recompiling a dialog.
%
%   The two switches work the other way round: an Entity Gate takes a control
%   signal by design, so "network down" and "grading down" are Toggle Switches
%   on the Constants driving those gates. Flip one and watch the queue behind
%   it grow.
%
%   ── THE RANDOMNESS, HONESTLY ───────────────────────────────────────────────
%   Signal-fed service times are sampled from a piecewise-constant random
%   signal (Uniform Random Number -> -mean*log(u)). The sample period is small
%   relative to the mean inter-arrival time, so successive entities see
%   independent draws in practice. It is not the same as drawing per entity
%   inside the block, and two entities starting service within one sample
%   period share a draw. That is the price of live tunability, and it is
%   stated here rather than hidden.
%
%   ── CALIBRATION ────────────────────────────────────────────────────────────
%   Defaults come from calibration.json (scripts/exportSimCalibration.js),
%   which labels every figure as measured or assumed. Where the two disagree
%   the model takes the honest one -- see loadCalibration below for the two
%   places that matters.

if nargin < 1 || isempty(outPath)
    outPath = fullfile(fileparts(mfilename('fullpath')), 'netraSetuPipeline.slx');
end
modelName = 'netraSetuPipeline';

p = loadCalibration(fileparts(mfilename('fullpath')));

if bdIsLoaded(modelName), close_system(modelName, 0); end
if isfile(outPath), delete(outPath); end

new_system(modelName);
try
    buildFullEntityBus();
    buildControls(modelName, p);
    buildCapture(modelName, p);
    buildSync(modelName, p);
    buildGrading(modelName, p);
    buildReview(modelName, p);
    buildDashboard(modelName, p);
    connectAll(modelName);

    % The bus must exist before the model compiles, anywhere it is opened --
    % not only in the session that built it.
    set_param(modelName, 'PreLoadFcn', 'buildFullEntityBus;');
    set_param(modelName, 'StopTime', num2str(p.simDays * p.workingHoursPerDay * 3600));
    set_param(modelName, 'SolverType', 'Variable-step');
    % Pacing is what makes this watchable: without it the run finishes before
    % anyone can look at it. 200x means a simulated 8-hour clinic day takes
    % about two and a half minutes on screen.
    set_param(modelName, 'EnablePacing', 'on', 'PacingRate', '200');

    try
        Simulink.BlockDiagram.arrangeSystem(modelName);
    catch
        % Cosmetic only -- never fail a build over layout.
    end

    save_system(modelName, outPath);
    fprintf('Built %s\n', outPath);
    fprintf('Blocks: %d\n', numel(find_system(modelName, 'Type', 'Block')));
    close_system(modelName, 0);
catch ME
    if bdIsLoaded(modelName), close_system(modelName, 0); end
    rethrow(ME);
end
end

% ═══════════════════════════════════════════════════════════════════════════
function p = loadCalibration(thisDir)
% Defaults, then whatever calibration.json can honestly override.
p = struct( ...
    'meanIatSeconds',      72, ...
    'captureSeconds',      90, ...
    'qualityPassRate',     0.885, ...
    'uploadSeconds',       29.6, ...
    'gradingSeconds',      21, ...
    'gradingFailureRate',  0.05, ...
    'maxRetries',          3, ...
    'tierFractions',       [0.70 0.20 0.10], ...
    'reviewSecondsB',      30, ...
    'reviewSecondsC',      240, ...
    'referableFraction',   0.30, ...
    'numPhcs',             10, ...
    'numOphthalmologists', 2, ...
    'workingHoursPerDay',  8, ...
    'simDays',             2, ...
    ... % ── THE SAMPLE PERIOD IS THE FRAME RATE ──────────────────────────
    ... % Every sampled source forces a solver step, so this one number
    ... % decides how fast the model can run. Measured on this machine, per
    ... % simulated hour: 0.25 s -> 18.9 s, 1 s -> 6.2 s, 2 s -> 5.6 s. Below
    ... % about 1 s the cost is all solver steps and no extra fidelity.
    ... %
    ... % It cannot go much coarser either: the rates are sampled from a
    ... % piecewise-constant signal, so a period approaching the mean
    ... % inter-arrival time (72 s) starts to distort the arrival process --
    ... % at 5 s a 4-hour run produced noticeably more patients than theory.
    ... % 1 s is 1/72nd of the mean gap and lands within a standard deviation
    ... % of the expected count, which is the best of both.
    'randomSampleTime',    1.0);

f = fullfile(thisDir, 'calibration.json');
if ~isfile(f), return; end
c = jsondecode(fileread(f));

p.gradingSeconds  = pick(c, 'gradingSeconds',  p.gradingSeconds);
p.qualityPassRate = pick(c, 'qualityPassRate', p.qualityPassRate);
p.reviewSecondsB  = pick(c, 'reviewSecondsB',  p.reviewSecondsB);
p.reviewSecondsC  = pick(c, 'reviewSecondsC',  p.reviewSecondsC);
p.numPhcs         = pick(c, 'numPhcs',         p.numPhcs);
p.numOphthalmologists = pick(c, 'numOphthalmologists', p.numOphthalmologists);
p.workingHoursPerDay  = pick(c, 'workingHoursPerDay',  p.workingHoursPerDay);

% TIER MIX: the design-doc assumption, NOT the observed one. The observed
% split is 3% auto-cleared because this corpus is IDRiD, a teaching set
% enriched for disease. Using it would make every scenario collapse for a
% reason that has nothing to do with the system.
p.tierFractions = pick(c, 'tierFractions', p.tierFractions)';
if numel(p.tierFractions) ~= 3, p.tierFractions = [0.70 0.20 0.10]; end

% GRADING FAILURE RATE: the measured 0.53 is development history -- half the
% corpus was graded against a pipeline that was still being built, and those
% failures are recorded with failure_code = not_recorded. A model run at 53%
% failure would be modelling last month's bugs, so the default stands and the
% measured figure is reported by the exporter for a human to judge.
if isfield(c, 'annualPatients') && isfield(c, 'workingDaysPerYear')
    perDay = pick(c, 'annualPatients', 100000) / pick(c, 'workingDaysPerYear', 250);
    p.meanIatSeconds = (p.workingHoursPerDay * 3600) / perDay;
end
end

function v = pick(c, name, dflt)
v = dflt;
if isfield(c, name) && isstruct(c.(name)) && isfield(c.(name), 'value') ...
        && ~isempty(c.(name).value)
    v = c.(name).value;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function buildControls(m, p)
% Every live knob: a Constant a dashboard control is bound to, and where a
% rate needs randomness, a uniform source and the transform that turns the
% two into an exponential draw.

st = num2str(p.randomSampleTime);
ctl = @(name, value) add_block('simulink/Sources/Constant', [m '/' name], ...
    'Value', num2str(value), 'SampleTime', st);

ctl('Mean Arrival Secs', p.meanIatSeconds);   % slider
ctl('Review Time Scale', 1);                  % slider
ctl('Network Up',        1);                  % toggle switch
ctl('Grading Up',        1);                  % toggle switch

% One uniform source per stochastic stage. Sharing a single source would make
% the arrival and service draws the same number at the same instant, which
% quietly correlates the two.
for name = {'U Arrival', 'U Upload', 'U Grading', 'U Review'}
    add_block('simulink/Sources/Uniform Random Number', [m '/' name{1}], ...
        'Minimum', '0.0001', 'Maximum', '1', ...
        'SampleTime', num2str(p.randomSampleTime), ...
        'Seed', num2str(randi(10000)));
end

expo(m, 'IAT', 'inter-arrival');
expoScaled(m, 'Review Time', p.reviewSecondsB, 'review service');

% ── THE OUTAGE SWITCHES ARE SERVICE TIME, NOT A GATE ───────────────────────
% The obvious block is an Entity Gate in Enable mode. In this SimEvents
% version its control port "expects an anonymous entity" -- it is driven by
% messages, not by a signal a dashboard switch can hold at 0 or 1. Both
% wirings were tried; neither compiles with a Constant on the control.
%
% So an outage is modelled as the stage taking effectively forever: work
% stops, everything queues behind it, and flipping the switch back drains the
% backlog. The one difference from a real outage is the case already IN
% service, which here is stuck rather than returned to the queue. It is one
% case, and the queue behind it is the thing anyone is looking at.
outageTime(m, 'Upload Time',  p.uploadSeconds,  'network upload');
outageTime(m, 'Grading Time', p.gradingSeconds, 'grading');
end

function outageTime(m, name, baseSecs, what)
% dt = exponential(base * scale) while up; a very long time while down.
b = [m '/' name];
add_block('simulink/User-Defined Functions/MATLAB Function', b);
setFcn(b, sprintf([ ...
    'function dt = fcn(up, u)' '\n'  ...
    '%%#codegen' '\n'  ...
    '%% %s time. up <= 0.5 means the stage is down.' '\n'  ...
    'uu = min(max(u, 1e-9), 1);' '\n'  ...
    'if up > 0.5' '\n'  ...
    '  dt = -%.10g * log(uu);' '\n'  ...
    'else' '\n'  ...
    '  dt = 1e6;' '\n'  ...
    'end' '\n'  ...
    'dt = max(dt, 1e-3);' '\n' ], what, baseSecs));
end

function expo(m, name, what)
% dt = -mean * log(u): the inverse-transform exponential draw, as a block so
% the mean can arrive as a live signal instead of a compiled-in constant.
b = [m '/' name];
add_block('simulink/User-Defined Functions/MATLAB Function', b);
setFcn(b, sprintf([ ...
    'function dt = fcn(meanSecs, u)\n' ...
    '%%#codegen\n' ...
    '%% %s time, exponential with a live mean.\n' ...
    'uu = min(max(u, 1e-9), 1);\n' ...
    'dt = -double(meanSecs) * log(uu);\n' ...
    'dt = max(dt, 1e-3);\n'], what));
end

function expoScaled(m, name, baseSecs, what)
% Same, but the live signal is a SCALE on a fixed mean rather than the mean
% itself -- "half as long per case" is the question a planner asks about
% review time, not "27.4 seconds".
b = [m '/' name];
add_block('simulink/User-Defined Functions/MATLAB Function', b);
setFcn(b, sprintf([ ...
    'function dt = fcn(scale, u)\n' ...
    '%%#codegen\n' ...
    '%% %s time, exponential, mean %.4g s scaled live.\n' ...
    'uu = min(max(u, 1e-9), 1);\n' ...
    'dt = -(%.10g * double(scale)) * log(uu);\n' ...
    'dt = max(dt, 1e-3);\n'], what, baseSecs, baseSecs));
end

function setFcn(blockPath, code)
% Write the body of a MATLAB Function block.
rt = sfroot;
blk = rt.find('-isa', 'Stateflow.EMChart', '-and', 'Path', blockPath);
blk.Script = code;
end

% ═══════════════════════════════════════════════════════════════════════════
function buildCapture(m, p)
% Stage 1: the patient is photographed, the quality gate judges the image,
% and a failed capture sends the patient BACK to the camera. This loop is
% invisible in the central database -- a retake is resolved at the PHC before
% anything syncs -- which is exactly why it belongs in the model.

gen = [m '/Patient Arrivals'];
add_block('sldelib/Entity Generator', gen);
set_param(gen, ...
    'GenerationMethod', 'Time-based', ...
    'TimeSource',       'Signal port', ...
    'EntityType',       'Bus object', ...
    'EntityTypeName',   'DRCaseFull');
set_param(gen, 'GenerateAction', sprintf([ ...
    'u = rand();\n' ...
    'if u < %.6f\n  entity.prio = 1;\n' ...
    'elseif u < %.6f\n  entity.prio = 2;\n' ...
    'else\n  entity.prio = 3;\nend\n' ...
    'entity.retakes = 0;\n' ...
    'entity.attempts = 0;\n' ...
    'entity.qc = 1;\n' ...
    'entity.failed = 1;\n' ...
    'entity.route = 1;\n' ...
    'entity.refer = 2;'], ...
    p.tierFractions(1), p.tierFractions(1) + p.tierFractions(2)));

add_block('sldelib/Entity Queue', [m '/Capture Queue'], 'Capacity', '200');

qg = [m '/Quality Gate'];
add_block('sldelib/Entity Server', qg);
set_param(qg, ...
    'Capacity',          num2str(p.numPhcs), ...   % one camera per PHC
    'NumberEntitiesInBlock', 'on');

% ── THE RETAKE LOOP, WITHOUT A LOOP ────────────────────────────────────────
% A failed capture means the patient sits again at the SAME camera, so the
% physical effect is a longer occupancy of that station, not a journey back
% through the model. It was first built as a real feedback edge -- verdict ->
% merge -> queue -> gate -- and SimEvents rejected it: "All input ports of
% Capture Merge must have the same entity structure", because the entity type
% on the returning edge cannot be resolved until the loop it is part of is
% resolved.
%
% Retaking inside the service time is equivalent for everything this model
% measures (station occupancy, time to a usable image, how many patients are
% waiting) and it keeps the entity type inference acyclic. What it gives up
% is the animation of a case visibly going backwards, which is a presentation
% loss rather than a modelling one -- and the retake count is still carried on
% the entity and displayed.
%
% Capped at 3. An uncapped retake loop models a patient who never leaves.
% The verdict is decided on ENTRY and the service time is read from it.
% Service time action cannot write attributes -- SimEvents rejects the model
% with "Changing entity attributes ... is not allowed in Service time
% action" -- so the retakes are drawn here, where writing is allowed, and
% the duration below is simply how long that many attempts take.
set_param(qg, 'EntryAction', sprintf([ ...
    'n = 0;\n' ...
    'ok = rand() < %.6f;\n' ...
    'while ~ok && n < 3\n' ...
    '  n = n + 1;\n' ...
    '  ok = rand() < %.6f;\n' ...
    'end\n' ...
    'entity.retakes = n;\n' ...
    'if ok\n  entity.qc = 1;\nelse\n  entity.qc = 2;\nend'], ...
    p.qualityPassRate, p.qualityPassRate));
set_param(qg, 'ServiceTimeSource', 'MATLAB action');
set_param(qg, 'ServiceTimeAction', ...
    sprintf('dt = %.10g * (1 + entity.retakes);', p.captureSeconds));

add_block('sldelib/Entity Output Switch', [m '/Quality Verdict'], ...
    'NumberOutputPorts', '2', 'SwitchingCriterion', 'From attribute', ...
    'SwitchAttributeName', 'qc');

% Three retakes and the image is still unusable: the patient goes home
% without a screen. Rare, and worth counting rather than hiding -- it is the
% one path where the system fails a patient before any AI is involved.
add_block('sldelib/Entity Terminator', [m '/Abandoned Captures']);
set_param([m '/Abandoned Captures'], 'NumberEntitiesArrived', 'on');
end

% ═══════════════════════════════════════════════════════════════════════════
function buildSync(m, p)
% Stage 2: the PHC's sync queue and the link to the district. The gate is the
% link being up: close it and the queue behind it is the PHC's local backlog,
% which is the failure this whole offline-first design exists to survive.
add_block('sldelib/Entity Queue', [m '/Sync Queue'], 'Capacity', '5000', ...
    'NumberEntitiesInBlock', 'on');

up = [m '/Network Upload'];
add_block('sldelib/Entity Server', up);
set_param(up, ...
    'Capacity',          num2str(p.numPhcs), ...
    'ServiceTimeSource', 'Signal port', ...
    'Utilization', 'on');
end

% ═══════════════════════════════════════════════════════════════════════════
function buildGrading(m, p)
% Stage 3: the central grading pipeline -- Branch A, segmentation, the rule
% engine and the MATLAB session, as one server of capacity 2 because that is
% the Node queue's concurrency. Cases can fail and are retried, which is the
% real behaviour: transient failures retry up to three times, then the case
% is marked error and a human has to look.
add_block('sldelib/Entity Queue', [m '/Grading Queue'], 'Capacity', '5000', ...
    'NumberEntitiesInBlock', 'on');

add_block('sldelib/Entity Input Switch', [m '/Grading Merge'], ...
    'NumberInputPorts', '2', 'ActivePortSelection', 'All');

gs = [m '/Grading Server'];
add_block('sldelib/Entity Server', gs);
set_param(gs, ...
    'Capacity',          '2', ...
    'ServiceTimeSource', 'Signal port', ...
    'Utilization', 'on');
set_param(gs, 'ServiceCompleteAction', sprintf([ ...
    'entity.attempts = entity.attempts + 1;\n' ...
    'if rand() < %.6f\n  entity.failed = 2;\nelse\n  entity.failed = 1;\nend\n' ...
    'if entity.attempts >= %d\n  entity.route = 2;\nelse\n  entity.route = 1;\nend'], ...
    p.gradingFailureRate, p.maxRetries));

add_block('sldelib/Entity Output Switch', [m '/Grading Outcome'], ...
    'NumberOutputPorts', '2', 'SwitchingCriterion', 'From attribute', ...
    'SwitchAttributeName', 'failed');

add_block('sldelib/Entity Output Switch', [m '/Retry Decision'], ...
    'NumberOutputPorts', '2', 'SwitchingCriterion', 'From attribute', ...
    'SwitchAttributeName', 'route');

add_block('sldelib/Entity Terminator', [m '/Failed Cases']);
set_param([m '/Failed Cases'], 'NumberEntitiesArrived', 'on');
end

% ═══════════════════════════════════════════════════════════════════════════
function buildReview(m, p)
% Stage 4: tier triage and the reviewer pool. Tier A never reaches a human --
% that is the whole economic argument for the system, and here it is the
% branch that does not consume a reviewer.
add_block('sldelib/Entity Output Switch', [m '/Tier Triage'], ...
    'NumberOutputPorts', '3', 'SwitchingCriterion', 'From attribute', ...
    'SwitchAttributeName', 'prio');

add_block('sldelib/Entity Terminator', [m '/Tier A Auto-Cleared']);
set_param([m '/Tier A Auto-Cleared'], 'NumberEntitiesArrived', 'on');

add_block('sldelib/Entity Input Switch', [m '/Review Merge'], ...
    'NumberInputPorts', '2', 'ActivePortSelection', 'All');

add_block('sldelib/Entity Queue', [m '/Review Queue'], ...
    'Capacity', '5000', 'QueueType', 'Priority', ...
    'PrioritySource', 'prio', 'SortingDirection', 'Descending', ...
    'NumberEntitiesInBlock', 'on');

add_block('sldelib/Entity Output Switch', [m '/Review Dispatch'], ...
    'NumberOutputPorts', num2str(p.numOphthalmologists), ...
    'SwitchingCriterion', 'First port that is not blocked');

for k = 1:p.numOphthalmologists
    rs = sprintf('%s/Reviewer %d', m, k);
    add_block('sldelib/Entity Server', rs);
    set_param(rs, ...
        'Capacity',          '1', ...
        'ServiceTimeSource', 'Signal port', ...
        ... % Tier C preempts an in-service Tier B, and the interrupted case
        ... % RESUMES rather than restarting -- residual carries what was left.
        'PermitPreemptionBasedOnAttribute', 'on', ...
        'SortingAttributeName', 'prio', ...
        'SortingDirection',     'Descending', ...
        'WriteResidualTimeToAttribute', 'on', ...
        'ResidualTimeAttributeName', 'residual', ...
        'Utilization', 'on');

    % The decision the reviewer actually makes. Without it every case left
    % review as "cleared" -- the referral path existed and no entity ever
    % took it, which showed up as an empty counter rather than as an error.
    %
    % Tier C is referred outright: it reached a human BECAUSE the system
    % thought it was serious. Tier B is referred at the observed rate.
    set_param(rs, 'ServiceCompleteAction', sprintf([ ...
        'if entity.prio >= 3' '\n'  ...
        '  entity.refer = 1;' '\n'  ...
        'elseif rand() < %.6f' '\n'  ...
        '  entity.refer = 1;' '\n'  ...
        'else' '\n'  ...
        '  entity.refer = 2;' '\n'  ...
        'end'], p.referableFraction));
end

add_block('sldelib/Entity Input Switch', [m '/Reviewer Merge'], ...
    'NumberInputPorts', num2str(p.numOphthalmologists), ...
    'ActivePortSelection', 'All');

% The reviewer's decision: refer onward, or clear. A referral is what the
% patient actually experiences, so it is the number the dashboard leads with.
add_block('sldelib/Entity Output Switch', [m '/Referral Decision'], ...
    'NumberOutputPorts', '2', 'SwitchingCriterion', 'From attribute', ...
    'SwitchAttributeName', 'refer');
add_block('sldelib/Entity Terminator', [m '/Referred + SMS']);
set_param([m '/Referred + SMS'], 'NumberEntitiesArrived', 'on');
add_block('sldelib/Entity Terminator', [m '/Cleared by Reviewer']);
set_param([m '/Cleared by Reviewer'], 'NumberEntitiesArrived', 'on');
end

% ═══════════════════════════════════════════════════════════════════════════
function connectAll(m)
c = @(a, b) add_line(m, a, b, 'autorouting', 'on');

% Controls into the rate transforms.
c('Mean Arrival Secs/1', 'IAT/1');   c('U Arrival/1', 'IAT/2');
c('Review Time Scale/1', 'Review Time/1'); c('U Review/1', 'Review Time/2');
% !! PORT ORDER !! Signals come FIRST on both sides of a SimEvents block:
%   - a server taking service time from a signal has that signal on INPUT 1
%     and the entity on input 2;
%   - any block with a statistic enabled puts the STATISTIC on OUTPUT 1 and
%     pushes the entity to output 2.
% Both are the opposite of the intuitive order, and both fail the same
% unhelpful way: add_line accepts the wiring, the model saves, and it dies at
% compile time with "Invalid connection between message and signal ports"
% naming the ports without saying which way round they belong. Verified by
% compiling both ways; the same note is in buildDistrictScreeningModel.m.
c('Network Up/1', 'Upload Time/1');  c('U Upload/1', 'Upload Time/2');
c('Grading Up/1', 'Grading Time/1'); c('U Grading/1', 'Grading Time/2');
c('Upload Time/1',  'Network Upload/1');   % service-time signal
c('Grading Time/1', 'Grading Server/1');   % service-time signal

% Capture and the retake loop.
c('IAT/1', 'Patient Arrivals/1');
c('Patient Arrivals/1', 'Capture Queue/1');
c('Capture Queue/1', 'Quality Gate/1');
c('Quality Gate/2', 'Quality Verdict/1');
c('Quality Verdict/1', 'Sync Queue/1');            % usable image
c('Quality Verdict/2', 'Abandoned Captures/1');    % still unusable after 3 retakes

% Sync and the link.
c('Sync Queue/2', 'Network Upload/2');     % entity
c('Network Upload/2', 'Grading Queue/1');

% Grading, with its retry loop.
c('Grading Queue/2', 'Grading Merge/1');
c('Grading Merge/1', 'Grading Server/2');   % entity
c('Grading Server/2', 'Grading Outcome/1');
c('Grading Outcome/1', 'Tier Triage/1');         % graded
c('Grading Outcome/2', 'Retry Decision/1');      % failed
c('Retry Decision/1', 'Grading Merge/2');        % retry
c('Retry Decision/2', 'Failed Cases/1');         % gave up

% Triage and review.
c('Tier Triage/1', 'Tier A Auto-Cleared/1');
c('Tier Triage/2', 'Review Merge/1');
c('Tier Triage/3', 'Review Merge/2');
c('Review Merge/1', 'Review Queue/1');
c('Review Queue/2', 'Review Dispatch/1');
c('Review Time/1', 'Reviewer 1/1');        % service-time signal
c('Review Time/1', 'Reviewer 2/1');
c('Review Dispatch/1', 'Reviewer 1/2');    % entity
c('Review Dispatch/2', 'Reviewer 2/2');
c('Reviewer 1/2', 'Reviewer Merge/1');
c('Reviewer 2/2', 'Reviewer Merge/2');
c('Reviewer Merge/1', 'Referral Decision/1');
c('Referral Decision/1', 'Referred + SMS/1');
c('Referral Decision/2', 'Cleared by Reviewer/1');
end

% ═══════════════════════════════════════════════════════════════════════════
function buildDashboard(m, p)
% The visible layer. Dashboard blocks bind to a signal or to a block
% parameter rather than being wired, so they can be attached to the
% statistics ports without changing the entity flow at all.
%
% Signal-bound (what the system is doing):  gauges, displays, a scope.
% Parameter-bound (what you can do to it):  sliders and switches.

lib = 'simulink_hmi_blocks';

% -- controls ------------------------------------------------------------
addParamControl(m, lib, 'Slider',        'Patients per hour',  'Mean Arrival Secs', ...
    [30 600], p.meanIatSeconds);
addParamControl(m, lib, 'Slider',        'Review speed',       'Review Time Scale', ...
    [0.25 3], 1);
addParamControl(m, lib, 'Toggle Switch', 'Network link',       'Network Up', [0 1], 1);
addParamControl(m, lib, 'Toggle Switch', 'Grading available',  'Grading Up',  [0 1], 1);

% -- live statistics -----------------------------------------------------
% Each statistic port is a signal, so a gauge or display can bind straight to
% it. Nothing here affects the simulation; remove the whole dashboard and the
% numbers are identical.
% The statistic is OUTPUT 1 wherever one is enabled (see the port-order note
% in connectAll), and a terminator has only that one port.
addSignalBinding(m, lib, 'Display', 'PHC backlog',      'Sync Queue', 1);
addSignalBinding(m, lib, 'Display', 'Grading backlog',  'Grading Queue', 1);
addSignalBinding(m, lib, 'Display', 'Awaiting review',  'Review Queue', 1);
addSignalBinding(m, lib, 'Display', 'Referred',         'Referred + SMS', 1);
addSignalBinding(m, lib, 'Display', 'Auto-cleared',     'Tier A Auto-Cleared', 1);
addSignalBinding(m, lib, 'Display', 'Failed cases',     'Failed Cases', 1);
% Both outcomes of a review, not just the alarming one. The first run
% reported 31 referred and 0 cleared, which looked like every reviewed case
% being referred -- it was actually this counter having no sink, so it logged
% nothing and nothing read as zero.
addSignalBinding(m, lib, 'Display', 'Cleared by reviewer', 'Cleared by Reviewer', 1);
addSignalBinding(m, lib, 'Display', 'Capture abandoned',   'Abandoned Captures', 1);
addSignalBinding(m, lib, 'Gauge',   'Upload link use',  'Network Upload', 1);
addSignalBinding(m, lib, 'Gauge',   'Grading load',     'Grading Server', 1);
for k = 1:p.numOphthalmologists
    addSignalBinding(m, lib, 'Lamp', sprintf('Reviewer %d busy', k), ...
        sprintf('Reviewer %d', k), 1);
end

% A queue length as a NUMBER tells you the state; as a TRACE it tells you the
% story -- flip the network switch off and the line climbs, flip it back and
% it drains. That shape is the whole argument for offline-first capture, and
% it is the one thing a still figure cannot show.
addSignalBinding(m, lib, 'Dashboard Scope', 'PHC backlog over time', ...
    'Sync Queue', 1);
addSignalBinding(m, lib, 'Dashboard Scope', 'Review queue over time', ...
    'Review Queue', 1);

annotate(m, ...
    ['NetraSetu, end to end. Patients arrive, are photographed, the quality ' ...
     'gate accepts or asks for a retake, usable images queue at the PHC, ' ...
     'sync to the district, are graded, and only Tier B and C reach an ' ...
     'ophthalmologist.'], [20 20]);
annotate(m, ['Sliders and switches work WHILE it runs. Turn the network off ' ...
     'and watch the PHC backlog grow; turn it back on and watch it drain.'], [20 60]);
annotate(m, ['Every rate is a modelled assumption unless calibration.json ' ...
     'says measured (scripts/exportSimCalibration.js). The tier mix is the ' ...
     'design-doc screening split, NOT this corpus.'], [20 100]);
end

function annotate(m, text, pos)
% Notes on the canvas, because the diagram is the deliverable people read.
a = Simulink.Annotation([m '/note']);
a.Text = text;
a.Position = [pos(1) pos(2) pos(1)+900 pos(2)+30];
a.FontSize = 11;
end

function addParamControl(m, lib, kind, label, targetBlock, range, value)
b = [m '/' label];
add_block([lib '/' kind], b);
try
    info = Simulink.HMI.ParamSourceInfo;
    info.BlockPath = Simulink.BlockPath([m '/' targetBlock]);
    info.ParamName = 'Value';
    set_param(b, 'Binding', info);
catch ME
    % A control that cannot bind is a cosmetic loss, not a broken model: the
    % simulation still runs and the value can be typed into the Constant.
    warning('buildFullPipelineModel:binding', ...
        'could not bind %s to %s: %s', label, targetBlock, ME.message);
end
% Limits are set separately from the binding, and failing to set them is not
% the same failure as failing to bind: a slider with default limits still
% works, a slider bound to nothing does not. Rolling both into one try made
% a limits complaint report itself as "could not bind".
if strcmp(kind, 'Slider')
    try
        set_param(b, 'Limits', range);   % a real double vector, not a string
    catch ME
        warning('buildFullPipelineModel:limits', ...
            '%s kept its default limits: %s', label, ME.message);
    end
end
if nargin >= 7 && ~isempty(value)
    % The control reads the Constant's own value; nothing to set here beyond
    % leaving the Constant where the calibration put it.
end
end

function addSignalBinding(m, lib, kind, label, sourceBlock, portIndex)
b = [m '/' label];
add_block([lib '/' kind], b);
try
    spec = Simulink.HMI.SignalSpecification;
    spec.BlockPath = Simulink.BlockPath([m '/' sourceBlock]);
    spec.OutputPortIndex = portIndex;
    set_param(b, 'Binding', spec);
catch ME
    warning('buildFullPipelineModel:binding', ...
        'could not bind %s to %s port %d: %s', label, sourceBlock, portIndex, ME.message);
end

% A statistics port that goes nowhere produces nothing: the first run of this
% model ended with seven "There is no data available for Output Port 1"
% warnings and a dashboard of empty boxes, because binding a gauge to a port
% is not the same as USING that port. Each bound statistic is therefore given
% a Terminator and marked for logging -- the Terminator makes the signal real,
% the logging flag makes it readable after the run as well as during it.
try
    src = [m '/' sourceBlock];
    ph  = get_param(src, 'PortHandles');
    if numel(ph.Outport) >= portIndex
        sink = sprintf('%s/%s sink', m, label);
        if isempty(find_system(m, 'SearchDepth', 1, 'Name', [label ' sink']))
            add_block('simulink/Sinks/Terminator', sink);
            add_line(m, sprintf('%s/%d', sourceBlock, portIndex), ...
                     sprintf('%s sink/1', label), 'autorouting', 'on');
        end
        set_param(ph.Outport(portIndex), 'DataLogging', 'on');
    end
catch ME
    warning('buildFullPipelineModel:statSink', ...
        '%s has no terminated statistic port: %s', label, ME.message);
end
end
