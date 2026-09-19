function verifySegmentationHandoff(name, matFile, inputSize, expectedChannels)
% VERIFYSEGMENTATIONHANDOFF  Acceptance test for an imported segmentation /
% heatmap-regression .mat, in the same spirit as verifyModelHandoff.m but for
% the 4 models that script cannot check (it is hardcoded to the 5-class
% classifier contract: softmax-sums-to-1, dropout, classifyBranchA,
% Grad-CAM). No equivalent existed for M2/M3/M4/M5 before this.
%
%   verifySegmentationHandoff('vessel_unet_v1', 'vessel_unet_v1.mat', [512 512 1], 1)
%   verifySegmentationHandoff('localization_v1', 'localization_v1.mat', [512 512 3], 2)
%   verifySegmentationHandoff('bright_lesion_unet_v1', 'bright_lesion_unet_v1.mat', [512 512 3], 1)
%   verifySegmentationHandoff('red_lesion_unet_v1', 'red_lesion_unet_v1.mat', [512 512 3], 1)
%
% inputSize is [H W C] the network's ONNX export was traced with (per
% diagnostics/MODEL_INTERFACE_REFERENCE.md); expectedChannels is the number
% of output channels (1 for the three binary-mask models, 2 for localization).
%
% These nets deliberately keep raw logits as their `net` output (no sigmoid
% baked in) -- MODEL_INTERFACE_REFERENCE.md's cross-cutting fact "all seg
% models output raw logits, activation=None; apply sigmoid yourself" is a
% caller responsibility, unlike M1 where the net contract requires softmax
% baked into the saved network. This checker applies sigmoid itself only to
% evaluate output sanity, not because the saved net should have one.

thisDir  = fileparts(mfilename('fullpath'));
modelPath = fullfile(thisDir, '..', 'models', matFile);
dataDir  = fullfile(thisDir, 'parity_data');

fprintf('\n===== %s handoff verification =====\n', name);
fprintf('model : %s\n\n', modelPath);

hardFail = 0;
softFail = 0;

%% -- File layout --
fprintf('-- File layout --\n');
if ~isfile(modelPath)
    fprintf('  HARD FAIL  model file not found\n');
    fprintf('\nCannot continue without the file.\n');
    return;
end
hardFail = report('file exists', true, hardFail);

info = whos('-file', modelPath);
varNames = {info.name};
hasNet = ismember('net', varNames);
hardFail = report('contains a variable named ''net''', hasNet, hardFail);
if ~hasNet
    fprintf('    found instead: %s\n', strjoin(varNames, ', '));
    fprintf('\nCannot continue without a ''net'' variable.\n');
    return;
end
softFail = report('contains ONLY ''net'' (no stray workspace vars)', ...
                  numel(varNames) == 1, softFail, true);

d = dir(modelPath);
fprintf('  INFO       size on disk: %.1f MB\n', d.bytes / 1e6);

loaded = load(modelPath, 'net');
net = loaded.net;
fprintf('  INFO       class: %s\n', class(net));

isKnownType = isa(net, 'dlnetwork') || isa(net, 'DAGNetwork') || isa(net, 'SeriesNetwork');
hardFail = report('net is a dlnetwork / DAGNetwork / SeriesNetwork', isKnownType, hardFail);

%% -- Input / output contract --
fprintf('\n-- Input / output contract --\n');

H = inputSize(1); W = inputSize(2); C = inputSize(3);

if isa(net, 'dlnetwork') && ~net.Initialized
    softFail = report('dlnetwork was saved initialised', false, softFail, true);
    net = initialize(net, dlarray(zeros(H, W, C, 1, 'single'), 'SSCB'));
else
    softFail = report('dlnetwork was saved initialised', true, softFail, true);
end

x = dlarray(single(randi([0 255], H, W, C)), 'SSCB');
y1 = predict(net, x);
sz = size(y1);

hardFail = report(sprintf('accepts %dx%dx%d input', H, W, C), ~isempty(y1), hardFail);
outOk = numel(sz) >= 3 && sz(1) == H && sz(2) == W && sz(3) == expectedChannels;
hardFail = report(sprintf('emits %dx%dx%d output', H, W, expectedChannels), outOk, hardFail);
if ~outOk
    fprintf('    got size %s\n', mat2str(sz));
end

allFinite = all(isfinite(extractdata(y1)), 'all');
hardFail = report('output contains no NaN/Inf', allFinite, hardFail);

%% -- Determinism --
fprintf('\n-- Determinism --\n');
y2 = predict(net, x);
hardFail = report('same input gives identical output twice', ...
                  max(abs(extractdata(y1) - extractdata(y2)), [], 'all') < 1e-9, hardFail);

%% -- Real-image sanity --
fprintf('\n-- Real-image sanity --\n');
fixturePath = fullfile(dataDir, [name '_input.mat']);
if ~isfile(fixturePath)
    fprintf('  SKIP       no parity fixture at %s\n', fixturePath);
else
    fx = load(fixturePath, 'x');
    realImg = single(fx.x(:, :, :, 1));   % first of the 10 parity images
    yReal = predict(net, dlarray(realImg, 'SSCB'));
    probs = 1 ./ (1 + exp(-extractdata(yReal)));   % sigmoid, for sanity only

    lo = min(probs, [], 'all'); hi = max(probs, [], 'all');
    fprintf('  INFO       sigmoid(output) range on a real image: [%.4f, %.4f]\n', lo, hi);

    % A network that is saturated at 0 or 1 everywhere is exactly the "looks
    % confident, tells you nothing" failure mode branchA's confidence check
    % guards against -- same idea, applied to a per-pixel mask instead of a
    % per-class probability.
    spreadOk = (hi - lo) > 1e-3;
    softFail = report('output is not saturated at a single value', spreadOk, softFail, true);
    if ~spreadOk
        fprintf('    every pixel maps to ~%.6f after sigmoid -- check the network actually\n', lo);
        fprintf('    learned something and that input normalization matches training.\n');
    end
end

%% -- Summary --
fprintf('\n===== Summary: %s =====\n', name);
fprintf('  hard failures : %d\n', hardFail);
fprintf('  soft warnings : %d\n', softFail);
if hardFail > 0
    fprintf('\nNOT READY TO HAND OVER. Fix the hard failures above.\n\n');
elseif softFail > 0
    fprintf('\nIntegrates, but read the warnings.\n\n');
else
    fprintf('\nREADY TO HAND OVER.\n\n');
end
end

function n = report(label, ok, n, isSoft)
if nargin < 4, isSoft = false; end
if ok
    fprintf('  PASS       %s\n', label);
else
    if isSoft
        fprintf('  WARN       %s\n', label);
    else
        fprintf('  HARD FAIL  %s\n', label);
    end
    n = n + 1;
end
end
