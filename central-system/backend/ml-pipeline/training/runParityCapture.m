function runParityCapture()
% RUNPARITYCAPTURE  Wrapper (NOT part of the parity check itself) that sets
% up paths so the +<modelname> custom-layer package folders under models/
% resolve, then runs the existing parityCheck() unmodified and captures all
% of its output -- plus a documentation header (date, git commit, MATLAB
% release, installed toolboxes) -- to diagnostics/out/parity_v1_report.txt.
%
% Does not modify parityCheck.m, importModels.m, or any model file.

thisDir      = fileparts(mfilename('fullpath'));           % .../training
mlPipelineDir = fullfile(thisDir, '..');                    % .../ml-pipeline
modelsDir    = fullfile(mlPipelineDir, 'models');
repoRoot     = fullfile(mlPipelineDir, '..', '..', '..');   % .../SIH_2026 (git root)
outDir       = fullfile(mlPipelineDir, 'diagnostics', 'out');
reportPath   = fullfile(outDir, 'parity_v1_report.txt');

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

fprintf('===== Parity check capture header =====\n');
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

fprintf('\n===== Begin parityCheck() output =====\n');

try
    parityCheck();
catch ME
    fprintf('\nERROR: parityCheck() threw an exception:\n%s\n', getReport(ME, 'extended'));
end

fprintf('===== End parityCheck() output =====\n');

diary off;
end
