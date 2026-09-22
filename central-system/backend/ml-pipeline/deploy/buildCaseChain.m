function buildCaseChain(target)
% BUILDCASECHAIN  Trial build of the per-case MATLAB chain with mcc.
%
%   buildCaseChain            build both targets
%   buildCaseChain('case')    the arithmetic half only (1.3 MB)
%   buildCaseChain('infer')   the networks (hundreds of MB)
%
%   Produces deploy/dist/*.exe, which run on a machine with only the MATLAB
%   Runtime.
%
%   TWO TARGETS, ON PURPOSE. netraSetuCaseMain is the rule engine, camera
%   check and evidence text -- arithmetic on numbers the caller already has,
%   and it compiles to 1.3 MB. netraSetuInferMain carries the neural networks.
%   Packaging them together would put hundreds of megabytes of weights into
%   every deployment of a component that mostly does not need them, and would
%   make a change to the evidence wording a 300 MB rebuild.
%
%   ── WHY BUILD THIS NOW, LONG BEFORE DEPLOYMENT ─────────────────────────────
%   Compilation does not fail at build time for the things that actually break
%   it. `mcc` happily produces an executable that dies on the first real case,
%   because the two most common faults are invisible to it:
%
%     1. fileparts(mfilename('fullpath')) resolves INSIDE the CTF archive, so
%        every asset lookup written that way finds nothing. There are ~39 of
%        those in this pipeline.
%     2. addpath() at runtime does nothing useful in a deployed application --
%        the path is fixed when the archive is built.
%
%   Both produce "file not found" at the first capture on a machine with no
%   MATLAB and no source tree to fall back on. Finding them here costs an
%   afternoon; finding them in demo week costs the demo.
%
%   -a adds a file to the archive. Every asset the chain reads must be listed,
%   and the listing below IS the inventory of what this component depends on
%   beyond code.

if nargin < 1 || isempty(target), target = 'both'; end

thisDir = fileparts(mfilename('fullpath'));
mlRoot  = fileparts(thisDir);
outDir  = fullfile(thisDir, 'dist');
if ~isfolder(outDir), mkdir(outDir); end

% Source folders the chain spans. mcc follows calls from the entry point, so
% these are for the resolver, not a manual dependency list.
srcDirs = {'grading', 'explainability', 'preprocessing', 'cameraCalibration', ...
           'segmentation', 'calibration', 'inference'};
for k = 1:numel(srcDirs)
    d = fullfile(mlRoot, srcDirs{k});
    if isfolder(d), addpath(d); end
end
addpath(thisDir);

% Data files. A missing one here is a runtime failure on a real case, not a
% build error, which is exactly why they are enumerated rather than globbed.
assets = { ...
    fullfile(mlRoot, 'cameraCalibration', 'calibrationProfiles.json'), ...
    fullfile(mlRoot, 'models', 'calibration_v1.json'), ...
    fullfile(mlRoot, 'models', 'rule_thresholds_red_v2.json')};

if any(strcmpi(target, {'case', 'both'}))
    buildOne('netraSetuCaseMain', thisDir, outDir, assets, {});
end

if any(strcmpi(target, {'infer', 'both'}))
    % The weights, plus the custom layer packages the imported nets are made
    % of. The .m files in models/+branchA_v1 and friends are CODE mcc cannot
    % reach by following calls -- see the %#function block in
    % netraSetuInferMain.m -- so the package folders go in as well.
    inferAssets = { ...
        fullfile(mlRoot, 'models', 'branchA_v1.mat'), ...
        fullfile(mlRoot, 'models', 'calibration_v1.json'), ...
        fullfile(mlRoot, 'models', 'vessel_unet_v1.mat'), ...
        fullfile(mlRoot, 'models', 'localization_v1.mat'), ...
        fullfile(mlRoot, 'models', 'bright_lesion_unet_v1.mat')};
    inferDirs = { ...
        fullfile(mlRoot, 'models', '+branchA_v1'), ...
        fullfile(mlRoot, 'models', '+vessel_unet_v1'), ...
        fullfile(mlRoot, 'models', '+localization_v1'), ...
        fullfile(mlRoot, 'models', '+bright_lesion_unet_v1')};

    % THE ONNX CONVERTER'S OWN CLASSES. branchA_v1.mat references
    % nnet.onnx.layer.* -- classes that live in a SUPPORT PACKAGE, not in
    % MATLAB itself and not in the .mat. Without them in the archive the
    % deployed load() substitutes placeholders and succeeds, then predict()
    % fails with an internal error naming no support package at all. That is
    % the same fault that made Branch A look like a corrupt model file for
    % most of a debugging session; ensureOnnxSupportPackage.m has the story.
    %
    % Only Branch A needs this: the segmentation nets' custom layers were
    % generated into models/+<net>/ and are ordinary code.
    onnxPkg = onnxSupportPackageDir();
    if ~isempty(onnxPkg)
        inferDirs{end+1} = onnxPkg;
    else
        warning('buildCaseChain:noOnnxSupportPackage', ...
            ['the ONNX converter support package was not found, so the ' ...
             'built component will fail on Branch A. Install it first.']);
    end
    buildOne('netraSetuInferMain', thisDir, outDir, inferAssets, inferDirs);
end
end

% ═══════════════════════════════════════════════════════════════════════════
function buildOne(name, thisDir, outDir, assets, dirs)
args = {'-m', fullfile(thisDir, [name '.m']), '-d', outDir, '-o', name, '-v'};
for k = 1:numel(assets)
    if isfile(assets{k})
        args = [args, {'-a', assets{k}}]; %#ok<AGROW>
    else
        warning('buildCaseChain:missingAsset', 'not packaging %s -- it does not exist', assets{k});
    end
end
for k = 1:numel(dirs)
    if isfolder(dirs{k})
        args = [args, {'-a', dirs{k}}]; %#ok<AGROW>
    else
        warning('buildCaseChain:missingDir', 'not packaging %s -- it does not exist', dirs{k});
    end
end

fprintf('\n=== mcc: %s ===\n', name);
fprintf('assets: %d files, %d folders\n\n', numel(assets), numel(dirs));

t0 = tic;
mcc(args{:});
secs = toc(t0);

exe = fullfile(outDir, [name '.exe']);
if ~isfile(exe)
    error('buildCaseChain:noOutput', 'mcc reported success but produced no %s', exe);
end
d = dir(exe);
ctf = dir(fullfile(outDir, [name '.ctf']));
fprintf('\nbuilt %s in %.0f s -- exe %.1f MB', name, secs, d.bytes / 1048576);
if ~isempty(ctf)
    fprintf(', ctf %.1f MB', ctf.bytes / 1048576);
end
fprintf('\n');
end

% ═══════════════════════════════════════════════════════════════════════════
function d = onnxSupportPackageDir()
% Where the ONNX converter lives on this machine, or '' if it is absent.
d = '';
candidates = {};
try
    root = matlabshared.supportpkg.getSupportPackageRoot();
    if ~isempty(root)
        candidates{end+1} = fullfile(root, 'toolbox', 'nnet', 'supportpackages', 'onnx');
    end
catch
end
candidates{end+1} = fullfile(matlabroot, 'toolbox', 'nnet', 'supportpackages', 'onnx');
for k = 1:numel(candidates)
    if isfolder(candidates{k})
        d = candidates{k};
        return;
    end
end
end
