function buildDistrictScreeningModel(outPath)
% BUILDDISTRICTSCREENINGMODEL  Construct districtScreeningSimEvents.slx.
%
%   buildDistrictScreeningModel()
%   buildDistrictScreeningModel(outPath)
%
%   Task 3.8 / PS requirement 5. Builds the SimEvents discrete-event model of
%   the district screening pipeline programmatically, rather than by drawing it
%   in the GUI and committing an opaque binary.
%
%   WHY A SCRIPT AND NOT A HAND-DRAWN MODEL
%     A .slx cannot be diffed, cannot be code reviewed, and its merge conflicts
%     are unresolvable. On a six-person team sharing one repo that is a real
%     cost. This script is the reviewable source of truth; the .slx is a build
%     artifact. Rebuild it rather than hand-editing it — if someone edits the
%     .slx directly, the two drift and this script silently stops being true.
%
%   ⚠️  NOT YET RUN. Simulink and SimEvents are licensed but NOT INSTALLED on
%   the dev machine (Task 0.0 in the implementation plan). This script is
%   written against the documented SimEvents block paths but has never been
%   executed, so treat the first run as a debugging session, not a formality —
%   expect block paths and parameter names to need correction against the
%   installed version. The preflight check below fails loudly rather than
%   producing a half-built model.
%
%   Structure built (design doc §7):
%
%     Entity Generator ──▶ Upload Queue ──▶ Upload Server ──▶ Tier Switch
%                                                                │
%                                    Tier A ◀───────────────────┤ (auto-clear)
%                                    Terminator                  │
%                                                                ▼
%                                              Review Priority Queue
%                                                                │
%                                                                ▼
%                                              Reviewer Server (N capacity)
%                                                                │
%                                                                ▼
%                                                           Terminator
%
%   Validate the built model against referenceQueueingModel.m on the same
%   inputs — it exists as an oracle for exactly this. Material disagreement
%   means one of the two is wrong.

if nargin < 1 || isempty(outPath)
    outPath = fullfile(fileparts(mfilename('fullpath')), 'districtScreeningSimEvents.slx');
end

% ── Preflight ────────────────────────────────────────────────────────────────
% Check before touching anything. Half-building a model and failing partway
% leaves a locked, broken system open in memory that is worse than not starting.
missing = {};
if ~exist('simulink', 'file'), missing{end+1} = 'Simulink'; end
if isempty(ver('slde')) && isempty(ver('simevents')), missing{end+1} = 'SimEvents'; end
if ~isempty(missing)
    error(['buildDistrictScreeningModel: %s not installed.\n' ...
           'Both are LICENSED but not installed on this machine — install via the\n' ...
           'MATLAB installer / Add-On Explorer (Task 0.0), then re-run.\n' ...
           'Verify with: ver'], strjoin(missing, ' and '));
end

p = referenceQueueingModel('defaults');

modelName = 'districtScreeningSimEvents';
if bdIsLoaded(modelName), close_system(modelName, 0); end
new_system(modelName, 'Model');
load_system('simevents');

try
    buildBlocks(modelName, p);
    connectBlocks(modelName);
    Simulink.BlockDiagram.arrangeSystem(modelName);

    secondsPerDay = p.workingHoursPerDay * 3600;
    set_param(modelName, 'StopTime', num2str(p.simDays * secondsPerDay));

    save_system(modelName, outPath);
    fprintf('Built %s\n', outPath);
    fprintf(['\nNEXT: run it and compare against referenceQueueingModel.m on the\n' ...
             'same parameters. They should agree; if they do not, one is wrong.\n']);
catch ME
    close_system(modelName, 0);
    rethrow(ME);
end
end

% ── Blocks ───────────────────────────────────────────────────────────────────
function buildBlocks(m, p)

secondsPerDay = p.workingHoursPerDay * 3600;
perDay        = p.annualPatients / p.workingDaysPerYear;
meanInterarrival = secondsPerDay / perDay;

% Mean upload time across the modelled bandwidth tiers. The reference model
% queues per PHC; this single aggregated server is the simplification the
% Simulink version makes, so expect a small divergence at high utilisation and
% say so rather than tuning until the numbers match.
meanUploadSeconds = mean((p.imageSizeMB * 8) ./ p.bandwidthMbps);

add_block('simevents/Entity Generator', [m '/Patient Arrivals'], ...
    'GenerationMethod',   'Statistical', ...
    'DistributionType',   'Exponential', ...
    'InterGenerationTimeSource', 'Dialog', ...
    'MeanInterGenerationTime',   num2str(meanInterarrival));

add_block('simevents/Entity Queue', [m '/Upload Queue'], ...
    'Capacity', 'inf', 'QueueType', 'FIFO');

add_block('simevents/Entity Server', [m '/Network Upload'], ...
    'Capacity', num2str(p.numPhcs), ...          % PHCs upload in parallel
    'ServiceTimeSource', 'Dialog', ...
    'ServiceTime', num2str(meanUploadSeconds));

% Tier triage. Tier A auto-clears and never consumes reviewer capacity —
% modelling this explicitly is the point, since it is what the tier system buys.
add_block('simevents/Entity Output Switch', [m '/Tier Triage'], ...
    'NumberOfEntityPorts', '2', ...
    'SwitchingCriterion',  'Equiprobable');

add_block('simevents/Entity Terminator', [m '/Tier A Auto-Cleared']);

% Tier C must preempt Tier B, so the queue is priority-ordered on an entity
% attribute rather than FIFO.
add_block('simevents/Entity Queue', [m '/Review Queue'], ...
    'Capacity', 'inf', 'QueueType', 'Priority', ...
    'PriorityAttributeName', 'tierPriority', ...
    'SortingDirection', 'Descending');

add_block('simevents/Entity Server', [m '/Ophthalmologist Review'], ...
    'Capacity', num2str(p.numOphthalmologists), ...
    'ServiceTimeSource', 'Dialog', ...
    'ServiceTime', num2str(p.reviewSecondsB), ...
    'PreemptionMode', 'on');

add_block('simevents/Entity Terminator', [m '/Reviewed']);
end

% ── Wiring ───────────────────────────────────────────────────────────────────
function connectBlocks(m)
c = @(a, b) add_line(m, a, b, 'autorouting', 'on');
c('Patient Arrivals/1',      'Upload Queue/1');
c('Upload Queue/1',          'Network Upload/1');
c('Network Upload/1',        'Tier Triage/1');
c('Tier Triage/1',           'Tier A Auto-Cleared/1');
c('Tier Triage/2',           'Review Queue/1');
c('Review Queue/1',          'Ophthalmologist Review/1');
c('Ophthalmologist Review/1','Reviewed/1');
end
