function results = runDistrictScreeningModel()
% RUNDISTRICTSCREENINGMODEL  Simulate districtScreeningSimEvents.slx and check
% it against the reference queueing model.
%
%   results = runDistrictScreeningModel()
%
%   Task 3.8. Runs the SimEvents model, extracts the statistics Task 3.8
%   requires, and diffs them against referenceQueueingModel.m on the same
%   parameters.
%
%   WHY THE COMPARISON MATTERS
%     Two independent implementations of the same queueing system should agree.
%     If they do not, one of them is wrong — and finding that here is far
%     cheaper than finding it when a judge asks why the resource recommendation
%     is what it is. The two are NOT expected to match exactly: the reference
%     model queues uploads per PHC while the Simulink model pools them into one
%     server of capacity numPhcs, so upload-side figures differ by construction
%     at high utilisation. The review stage should track closely.

thisDir   = fileparts(mfilename('fullpath'));
modelName = 'districtScreeningSimEvents';
slxPath   = fullfile(thisDir, [modelName '.slx']);

if ~isfile(slxPath)
    error(['runDistrictScreeningModel: %s not found.\n' ...
           'Build it first: buildDistrictScreeningModel'], slxPath);
end

p = referenceQueueingModel('defaults');

fprintf('=== SimEvents district screening model ===\n');
fprintf('%d patients/yr, %d PHCs, %d ophthalmologists, %d sim days\n\n', ...
    p.annualPatients, p.numPhcs, p.numOphthalmologists, p.simDays);

load_system(slxPath);
cleanup = onCleanup(@() close_system(modelName, 0));

t0  = tic;
out = sim(modelName, 'ReturnWorkspaceOutputs', 'on');
fprintf('simulated in %.1fs\n\n', toc(t0));

% ── Extract statistics ──────────────────────────────────────────────────────
% Each To Workspace sink logs a timeseries; the LAST sample is the running
% statistic at end of simulation. Utilisation and average wait are cumulative
% within SimEvents, so the final value is the whole-run figure -- not a mean of
% the series, which would average the warm-up period in.
tierA    = lastValue(out, 'tierACleared');
reviewed = lastValue(out, 'reviewedCount');
upUtil   = lastValue(out, 'uploadUtil');
revWait  = lastValue(out, 'reviewWait');

revUtil = zeros(1, p.numOphthalmologists);
for k = 1:p.numOphthalmologists
    revUtil(k) = lastValue(out, sprintf('reviewerUtil%d', k));
end

results = struct( ...
    'tierAAutoCleared',   tierA, ...
    'reviewed',           reviewed, ...
    'uploadUtilisation',  upUtil, ...
    'reviewWaitMeanSec',  revWait, ...
    'reviewerUtilisation', mean(revUtil));

fprintf('--- SimEvents results ---\n');
fprintf('  Tier A auto-cleared : %d entities\n', tierA);
fprintf('  reviewed            : %d entities\n', reviewed);
fprintf('  auto-clear share    : %.1f%%\n', 100*tierA/max(1, tierA+reviewed));
fprintf('  upload utilisation  : %.1f%%\n', 100*upUtil);
fprintf('  reviewer utilisation: %.1f%% (mean of %d)\n', ...
    100*mean(revUtil), p.numOphthalmologists);
fprintf('  mean review wait    : %.1f min\n', revWait/60);

% ── Cross-check against the reference model ─────────────────────────────────
r = referenceQueueingModel('run', p);

fprintf('\n--- Reference model, same parameters ---\n');
fprintf('  reviewed            : %d cases\n', r.casesReviewed);
fprintf('  auto-clear share    : %.1f%%\n', ...
    100*r.casesAutoCleared/max(1, r.casesSimulated));
fprintf('  upload utilisation  : %.1f%%\n', 100*r.uploadUtilisation);
fprintf('  reviewer utilisation: %.1f%%\n', 100*r.reviewUtilisation);
fprintf('  mean review wait    : %.1f min\n', r.reviewWaitMeanMin);

fprintf('\n--- Agreement ---\n');
cmp('auto-clear share', 100*tierA/max(1,tierA+reviewed), ...
    100*r.casesAutoCleared/max(1,r.casesSimulated), 5, '%');
cmp('reviewer utilisation', 100*mean(revUtil), 100*r.reviewUtilisation, 10, '%');
cmp('mean review wait (min)', revWait/60, r.reviewWaitMeanMin, 5, ' min');

fprintf(['\nUpload figures are EXPECTED to differ: the reference model queues\n' ...
         'per PHC, this model pools uploads into one server of capacity %d.\n' ...
         '  SimEvents %.1f%%  vs  reference %.1f%%\n'], ...
        p.numPhcs, 100*upUtil, 100*r.uploadUtilisation);

fprintf(['\nAll parameters are modelled assumptions, not measured field data\n' ...
         '(design doc §16). Say so when presenting these numbers.\n\n']);
end

% ── Helpers ─────────────────────────────────────────────────────────────────
function v = lastValue(out, name)
% Final sample of a logged To Workspace timeseries, or 0 if it never logged
% (a statistic that never fired produces an empty series, not a zero one).
v = 0;
try
    ts = out.(name);
    if isa(ts, 'timeseries')
        d = ts.Data;
    else
        d = ts;
    end
    if ~isempty(d), v = double(d(end)); end
catch
    warning('runDistrictScreeningModel:missingSignal', ...
            'No logged signal named ''%s''.', name);
end
end

function cmp(label, a, b, tol, unit)
ok = abs(a - b) <= tol;
fprintf('  %-24s SimEvents %7.1f%s   reference %7.1f%s   %s\n', ...
        label, a, unit, b, unit, ternary(ok, 'AGREE', 'DIVERGE'));
end

function s = ternary(c, a, b)
if c, s = a; else, s = b; end
end
