function runParityCaptureV2(modelVersion)
% RUNPARITYCAPTUREV2  Wrapper (NOT part of the parity check itself) that
% captures parityCheckV2(modelVersion)'s output -- plus a documentation
% header (date, git commit, MATLAB release, installed toolboxes) -- to
% diagnostics/out/parity_<tag>_report.txt, where <tag> is modelVersion with
% the 'branchA_' prefix stripped (e.g. 'branchA_v2a' -> 'v2a').
%
% GENERALIZE (v2b integration): this is runParityCaptureV2a.m's former body,
% extracted verbatim and parameterized by modelVersion; runParityCaptureV2a.m
% is now a one-line wrapper calling runParityCaptureV2('branchA_v2a'), so its
% own behaviour and output path (parity_v2a_report.txt) are UNCHANGED.
%
% NOTE: the parameter is named modelVersion, not `version` -- MATLAB has a
% builtin `version` function (used below via disp(version) to print the
% MATLAB release), and a parameter named `version` would shadow it.
%
% Does not modify parityCheckV2.m, importModels.m, or any model file.

thisDir       = fileparts(mfilename('fullpath'));           % .../training
mlPipelineDir = fullfile(thisDir, '..');                    % .../ml-pipeline
modelsDir     = fullfile(mlPipelineDir, 'models');
repoRoot      = fullfile(mlPipelineDir, '..', '..', '..');  % .../SIH_2026 (git root)
outDir        = fullfile(mlPipelineDir, 'diagnostics', 'out');
tag           = modelVersion(9:end);                        % 'branchA_v2a' -> 'v2a'
reportPath    = fullfile(outDir, ['parity_' tag '_report.txt']);

if ~exist(outDir, 'dir')
    mkdir(outDir);
end

% +<modelname> custom-layer package folders live directly under models/;
% MATLAB only resolves a "+pkg" package if the folder CONTAINING it is on
% the path, not the package folder itself.
addpath(modelsDir);

if exist(reportPath, 'file')
    delete(reportPath);
end
diary(reportPath);
diary on;

fprintf('===== Parity check capture header (%s) =====\n', modelVersion);
fprintf('Report generated: %s\n', datestr(now, 'yyyy-mm-dd HH:MM:SS'));

[gitStatus, gitHash] = system(sprintf('git -C "%s" rev-parse HEAD', repoRoot));
if gitStatus == 0
    fprintf('Git commit (HEAD): %s', gitHash);
else
    fprintf('Git commit (HEAD): UNAVAILABLE (%s)\n', strtrim(gitHash));
end

[dirtyStatus, dirtyOut] = system(sprintf('git -C "%s" status --porcelain', repoRoot));
if dirtyStatus == 0 && ~isempty(strtrim(dirtyOut))
    fprintf('Git working tree: DIRTY (uncommitted changes present)\n');
elseif dirtyStatus == 0
    fprintf('Git working tree: clean\n');
else
    fprintf('Git working tree: status UNAVAILABLE\n');
end

fprintf('\nMATLAB release:\n');
disp(version);

fprintf('\nInstalled toolboxes / support packages (ver):\n');
ver;

fprintf('\n===== Begin parityCheckV2() output =====\n');

try
    parityCheckV2(modelVersion);
catch ME
    fprintf('\nERROR: parityCheckV2() threw an exception:\n%s\n', getReport(ME, 'extended'));
end

fprintf('===== End parityCheckV2() output =====\n');

diary off;
end
