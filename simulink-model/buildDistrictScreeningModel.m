function buildDistrictScreeningModel(outPath)
% BUILDDISTRICTSCREENINGMODEL  Construct districtScreeningSimEvents.slx.
%
%   buildDistrictScreeningModel()
%   buildDistrictScreeningModel(outPath)
%
%   Task 3.8 / PS requirement 5. Builds the SimEvents discrete-event model of
%   the district screening pipeline programmatically.
%
%   WHY A SCRIPT AND NOT A HAND-DRAWN MODEL
%     A .slx is an opaque binary: it cannot be diffed, cannot be code reviewed,
%     and its merge conflicts are unresolvable. On a six-person team sharing one
%     repo that is a real cost. This script is the reviewable source of truth;
%     the .slx is a build artifact. Rebuild it rather than hand-editing it, or
%     the two drift and this script silently stops being true.
%
%   LIBRARY NAME
%     The SimEvents library is 'sldelib' (Simulink Discrete Event), NOT
%     'simevents'. There is no toolbox/simevents folder in R2026a — the product
%     directory is toolbox/slde, and `ver('simevents')` is deprecated in favour
%     of `ver('slde')`. load_system('simevents') fails outright.
%
%   MODEL STRUCTURE (design doc §7)
%
%     Patient Arrivals ─▶ Upload Queue ─▶ Network Upload ─▶ Tier Triage
%       exponential IAT      FIFO           capacity =        switch on
%                                           numPhcs           entity.prio
%                                                                 │
%             ┌───────────────────────────────────────────────────┤
%             ▼ port 1 (prio 1 = Tier A)      ports 2,3 (Tier B,C)▼
%       Tier A Auto-Cleared                        Review Merge
%          (Terminator)                                  │
%                                                        ▼
%                                              Review Queue (Priority)
%                                                        │
%                                                        ▼
%                                          Ophthalmologist Review
%                                          capacity = numOphthalmologists
%                                          preemption on entity.prio
%                                                        │
%                                                        ▼
%                                                   Reviewed
%
%   ONE ATTRIBUTE, 'prio', carries the tier: 1 = A, 2 = B, 3 = C. It does three
%   jobs at once — it selects the output-switch port, it orders the priority
%   queue, and it drives server preemption — which is why a single attribute is
%   used rather than separate 'tier' and 'priority' fields that could disagree.
%
%   Validate the built model against referenceQueueingModel.m on the same
%   inputs; it exists as an oracle for exactly this.

if nargin < 1 || isempty(outPath)
    outPath = fullfile(fileparts(mfilename('fullpath')), 'districtScreeningSimEvents.slx');
end

% ── Preflight ────────────────────────────────────────────────────────────────
if ~exist('simulink', 'file')
    error(['buildDistrictScreeningModel: Simulink is not installed.\n' ...
           'Install it (Task 0.0), then re-run. Verify with: ver']);
end
if isempty(ver('slde'))
    error(['buildDistrictScreeningModel: SimEvents (slde) is not installed.\n' ...
           'Install it (Task 0.0), then re-run. Verify with: ver']);
end

p = referenceQueueingModel('defaults');

modelName = 'districtScreeningSimEvents';

% A zero-byte placeholder of the same name shadows the model and makes
% new_system warn and then misbehave. Remove any stale file first.
if isfile(outPath), delete(outPath); end
if bdIsLoaded(modelName), close_system(modelName, 0); end

load_system('sldelib');
new_system(modelName, 'Model');

try
    buildBlocks(modelName, p);
    connectBlocks(modelName, p);

    try
        Simulink.BlockDiagram.arrangeSystem(modelName);
    catch
        % Cosmetic only — never fail the build over layout.
    end

    secondsPerDay = p.workingHoursPerDay * 3600;
    set_param(modelName, 'StopTime', num2str(p.simDays * secondsPerDay));
    % SimEvents is a discrete-event system; a variable-step solver is required
    % or the model refuses to compile.
    set_param(modelName, 'SolverType', 'Variable-step');

    save_system(modelName, outPath);
    fprintf('Built %s\n', outPath);
    fprintf('Blocks: %d\n', numel(find_system(modelName, 'Type', 'Block')));
    close_system(modelName, 0);
catch ME
    if bdIsLoaded(modelName), close_system(modelName, 0); end
    rethrow(ME);
end
end

% ── Blocks ───────────────────────────────────────────────────────────────────
function buildBlocks(m, p)

% See the "PORT ORDER" note at the statistics sinks below.
STAT_PORT = 1;   %#ok<NASGU>  used in the sink wiring at the end of this function

secondsPerDay    = p.workingHoursPerDay * 3600;
perDay           = p.annualPatients / p.workingDaysPerYear;
meanIAT          = secondsPerDay / perDay;

% Mean upload seconds across the modelled bandwidth tiers. The reference model
% queues per PHC; this single pooled server (capacity = numPhcs) is the
% simplification the Simulink version makes, so expect a small divergence at
% high utilisation rather than tuning until the two match exactly.
meanUploadSecs   = mean((p.imageSizeMB * 8) ./ p.bandwidthMbps);

cumA = p.tierFractions(1);
cumB = p.tierFractions(1) + p.tierFractions(2);

% ── Patient arrivals ────────────────────────────────────────────────────────
% The entity carries TWO fields, so it needs a Bus object: the Entity
% Generator dialog holds exactly one attribute name, and a cell array, a
% comma-separated string and a newline-separated string are all rejected.
%
%   prio     1 = Tier A, 2 = Tier B, 3 = Tier C
%   residual remaining service time written back when a case is preempted
%
% 'residual' is not decoration. Without it SimEvents preemption RESTARTS the
% interrupted case; with it the case RESUMES with the work it had left. The
% reference model implements resume, so omitting this would make the two models
% disagree by construction and invalidate the cross-check.
buildEntityBus();
set_param(m, 'PreLoadFcn', 'buildEntityBus();');   % keeps the .slx self-contained

gen = [m '/Patient Arrivals'];
add_block('sldelib/Entity Generator', gen);
set_param(gen, ...
    'GenerationMethod', 'Time-based', ...
    'TimeSource',       'MATLAB action', ...
    'IntergenerationTimeAction', sprintf('dt = -%.10g*log(rand());', meanIAT), ...
    'EntityType',       'Bus object', ...
    'EntityTypeName',   'DRCase');

% Assign the tier on generation. 1 = A (auto-clear), 2 = B, 3 = C.
set_param(gen, 'GenerateAction', sprintf([ ...
    'u = rand();\n' ...
    'if u < %.6f\n' ...
    '  entity.prio = 1;\n' ...
    'elseif u < %.6f\n' ...
    '  entity.prio = 2;\n' ...
    'else\n' ...
    '  entity.prio = 3;\n' ...
    'end'], cumA, cumB));

% ── Stage 1: network transmission ───────────────────────────────────────────
uq = [m '/Upload Queue'];
add_block('sldelib/Entity Queue', uq);
set_param(uq, 'Capacity', 'inf', 'QueueType', 'FIFO');

us = [m '/Network Upload'];
add_block('sldelib/Entity Server', us);
set_param(us, ...
    'Capacity',          num2str(p.numPhcs), ...
    'ServiceTimeSource', 'MATLAB action', ...
    'ServiceTimeAction', sprintf('dt = -%.10g*log(rand());', meanUploadSecs), ...
    ... % Statistics port. Exactly ONE statistic is enabled per block: each one
    ... % adds an output port, and enabling several makes the port indices used
    ... % by connectBlocks depend on the enable order -- a silent mis-wiring
    ... % waiting to happen when someone adds a second statistic later.
    'Utilization', 'on');

% ── Stage 2: tier triage ────────────────────────────────────────────────────
% Tier A leaves here without consuming reviewer capacity. Modelling that
% explicitly is the point: it is what the tier system buys, and omitting it
% would make the reviewer pool look far more overloaded than it is.
sw = [m '/Tier Triage'];
add_block(sprintf('sldelib/Entity\nOutput Switch'), sw);
set_param(sw, ...
    'NumberOutputPorts',   '3', ...
    'SwitchingCriterion',  'From attribute', ...
    'SwitchAttributeName', 'prio');

add_block('sldelib/Entity Terminator', [m '/Tier A Auto-Cleared']);
set_param([m '/Tier A Auto-Cleared'], 'NumberEntitiesArrived', 'on');

% Tiers B and C rejoin into one review queue.
mg = [m '/Review Merge'];
add_block(sprintf('sldelib/Entity\nInput Switch'), mg);
% ActivePortSelection 'All' keeps BOTH input ports permanently open, which is
% what makes this a merge rather than a switch: whichever tier has an entity
% ready gets in. Setting it to 'Switch' would gate the ports in turn and stall
% Tier C behind an idle Tier B port — the opposite of the intended priority.
% SwitchingCriterion is only meaningful under 'Switch', so it is not set here.
set_param(mg, 'NumberInputPorts', '2', 'ActivePortSelection', 'All');

% ── Stage 3: ophthalmologist review ─────────────────────────────────────────
rq = [m '/Review Queue'];
add_block('sldelib/Entity Queue', rq);
set_param(rq, ...
    'Capacity',         'inf', ...
    'QueueType',        'Priority', ...
    'PrioritySource',   'prio', ...
    'SortingDirection', 'Descending', ...   % higher prio (Tier C = 3) first
    'AverageWait',      'on');

% ── N reviewers as N single-capacity servers ────────────────────────────────
% NOT one Entity Server with Capacity = N. SimEvents rejects that outright:
% "Preemption is only supported for a single server." Since design doc §7
% requires Tier C to preempt Tier B, the pool is modelled as N independent
% capacity-1 servers behind a dispatcher.
%
% That is also the more faithful picture: an ophthalmologist is an individual
% who can be interrupted mid-case, not a fungible unit of a shared N-capacity
% resource — and preemption is a property of the individual.
K = p.numOphthalmologists;

disp_ = [m '/Review Dispatch'];
add_block(sprintf('sldelib/Entity\nOutput Switch'), disp_);
set_param(disp_, ...
    'NumberOutputPorts',  num2str(K), ...
    ... % Route to whichever reviewer is free; blocked ports are skipped, which
    ... % is what load-balances across the pool.
    'SwitchingCriterion', 'First port that is not blocked');

serviceAction = sprintf([ ...
    'if entity.prio == 3\n' ...
    '  dt = -%.10g*log(rand());\n' ...
    'else\n' ...
    '  dt = -%.10g*log(rand());\n' ...
    'end'], p.reviewSecondsC, p.reviewSecondsB);

for k = 1:K
    rs = sprintf('%s/Reviewer %d', m, k);
    add_block('sldelib/Entity Server', rs);
    set_param(rs, ...
        'Capacity',          '1', ...
        'ServiceTimeSource', 'MATLAB action', ...
        'ServiceTimeAction', serviceAction, ...
        ... % Tier C (prio 3) preempts an in-service Tier B (prio 2).
        'PermitPreemptionBasedOnAttribute', 'on', ...
        'SortingAttributeName', 'prio', ...
        'SortingDirection',     'Descending', ...
        ... % Preemptive-RESUME, not restart: a displaced Tier B keeps its
        ... % remaining service time rather than starting the case over.
        'WriteResidualTimeToAttribute', 'on', ...
        'ResidualTimeAttributeName',    'residual', ...
        'Utilization', 'on');
end

rmerge = [m '/Reviewer Merge'];
add_block(sprintf('sldelib/Entity\nInput Switch'), rmerge);
set_param(rmerge, 'NumberInputPorts', num2str(K), 'ActivePortSelection', 'All');

add_block('sldelib/Entity Terminator', [m '/Reviewed']);
set_param([m '/Reviewed'], 'NumberEntitiesArrived', 'on');

% ── Statistics sinks ────────────────────────────────────────────────────────
% Every enabled statistic needs somewhere to go; an unconnected output port
% fails compilation. To Workspace rather than a Scope so the run script can read
% the numbers programmatically and diff them against the reference model.
%
% !! PORT ORDER !! Enabling a statistic on a SimEvents block puts the STATISTIC
% on output port 1 and pushes the ENTITY output to port 2. That is the opposite
% of the intuitive order, and it fails in the worst way: add_line accepts the
% wrong wiring silently and the model SAVES fine, then dies at compile time with
% "Invalid connection between message and signal ports". Verified empirically by
% compiling both wirings -- entity on port 2 is the one that works.
%
% Hence STAT_PORT = 1 here, and ENTITY_PORT_WITH_STATS = 2 in connectBlocks.
% A Terminator has no entity output at all, so its statistic is simply port 1.
addToWorkspace(m, 'Network Upload',      STAT_PORT, 'uploadUtil');
addToWorkspace(m, 'Review Queue',        STAT_PORT, 'reviewWait');
addToWorkspace(m, 'Tier A Auto-Cleared', 1,         'tierACleared');
addToWorkspace(m, 'Reviewed',            1,         'reviewedCount');
for k = 1:K
    addToWorkspace(m, sprintf('Reviewer %d', k), STAT_PORT, sprintf('reviewerUtil%d', k));
end
end

function addToWorkspace(m, srcBlock, srcPort, varName)
% One To Workspace sink wired to a statistics port.
sink = sprintf('%s/%s out', m, varName);
add_block('simulink/Sinks/To Workspace', sink);
set_param(sink, 'VariableName', varName, 'SaveFormat', 'Timeseries');
add_line(m, sprintf('%s/%d', srcBlock, srcPort), sprintf('%s out/1', varName), ...
         'autorouting', 'on');
end

% ── Wiring ───────────────────────────────────────────────────────────────────
function connectBlocks(m, p)
c = @(a, b) add_line(m, a, b, 'autorouting', 'on');

% E is the entity output port of a block that has a statistic enabled: the
% statistic takes port 1, so the entity leaves on port 2. Blocks without a
% statistic keep their entity output on port 1.
E = 2;

c('Patient Arrivals/1',        'Upload Queue/1');
c('Upload Queue/1',            'Network Upload/1');
c(sprintf('Network Upload/%d', E), 'Tier Triage/1');   % stats enabled -> port 2

% Output-switch ports are selected by entity.prio, so port index == prio.
c('Tier Triage/1', 'Tier A Auto-Cleared/1');   % prio 1 = Tier A, auto-clears
c('Tier Triage/2', 'Review Merge/1');          % prio 2 = Tier B
c('Tier Triage/3', 'Review Merge/2');          % prio 3 = Tier C

c('Review Merge/1', 'Review Queue/1');
c(sprintf('Review Queue/%d', E), 'Review Dispatch/1');   % stats enabled -> port 2

% Fan out to the N reviewers and back into a single merge.
for k = 1:p.numOphthalmologists
    c(sprintf('Review Dispatch/%d', k),  sprintf('Reviewer %d/1', k));
    c(sprintf('Reviewer %d/%d', k, E),   sprintf('Reviewer Merge/%d', k));
end

c('Reviewer Merge/1', 'Reviewed/1');
end
