function parityCheckRedLesionV2()
% PARITYCHECKREDLESIONV2  M5 phase 2, Gate 3: compare the imported MATLAB
% red_lesion_unet_v2 dlnetwork against the original PyTorch checkpoint on
% the same 10 real fundus images parityCheck.m/prepare_parity_inputs.py use
% (IDRiD_163 .. IDRiD_172 -- see that script's own note: the grading TRAIN
% folder is missing IDRiD_001-162 on this machine, so list_images(10)'s
% "first 10" starts at 163, not 1).
%
% NOT folded into parityCheck.m's own loop: that loop applies SIGMOID to
% both sides uniformly (the right activation for M2/M4/M5-v1's single-
% channel contract). red_lesion_unet_v2 has 3 MUTUALLY EXCLUSIVE classes
% (background/MA/HE, checkpoint's own class_map) and must be compared after
% SOFTMAX over the channel dimension instead -- a real, not cosmetic,
% difference (sigmoid would let all 3 "probabilities" be high or low
% together; softmax is what the model was trained under and what
% inference/segInfer.py's argmax decision rule actually consumes).
%
% Two checks, per the brief:
%   1. Per-image max|diff| over the FULL FRAME (all 3 channels x 512 x 512),
%      after softmax on both sides -- same threshold discipline as
%      parityCheck.m (0.01).
%   2. Per-class connected-component COUNT agreement: argmax both sides'
%      softmax output into a class map, threshold each class's blobs at its
%      own floor (MA>=5px, HE>=10px @512, from red_lesion_v2_config.json --
%      the SAME floors segInfer.py's v2 path uses), and compare MA/HE
%      component counts exactly, per image. This is the number that
%      actually matters for the rule engine (it counts components, not
%      per-pixel probability), so a network that is numerically close but
%      counts a different number of blobs would still be a real parity
%      failure this check exists to catch.
%
% Writes diagnostics/out/parity_red_v2_report.txt and appends an entry to
% diagnostics/out/artifact_manifest.json (both files' existing entries are
% read and preserved, never overwritten). Does NOT wire MATLAB into any live
% inference path -- inference/segInfer.py's RED_LESION_MODEL_VERSION switch
% is the only place v1/v2 is actually selected, and it never calls MATLAB.

thisDir = fileparts(mfilename('fullpath'));
mlRoot = fullfile(thisDir, '..');
dataDir = fullfile(thisDir, 'parity_data');
modelsDir = fullfile(mlRoot, 'models');
outDir = fullfile(mlRoot, 'diagnostics', 'out');
if ~exist(outDir, 'dir'), mkdir(outDir); end

THRESH = 0.01;
IMAGE_NAMES = {'IDRiD_163','IDRiD_164','IDRiD_165','IDRiD_166','IDRiD_167', ...
               'IDRiD_168','IDRiD_169','IDRiD_170','IDRiD_171','IDRiD_172'};

lines = {};
function add(s)
    fprintf('%s\n', s);
    lines{end+1} = s; %#ok<AGROW>
end

add('=====================================================================');
add('parityCheckRedLesionV2: PyTorch vs imported MATLAB dlnetwork (M5v2)');
add('10 real images, SOFTMAX applied on both sides (3 mutually-exclusive classes)');
add('=====================================================================');

% ── Load floors from the same config segInfer.py's v2 path reads ──────────
cfgPath = fullfile(modelsDir, 'red_lesion_v2_config.json');
cfg = jsondecode(fileread(cfgPath));
maFloor = cfg.chosen_min_area_floors.MA;
heFloor = cfg.chosen_min_area_floors.HE;
add(sprintf('\nfloors: MA >= %d px, HE >= %d px (both at 512, from %s)', ...
    maFloor, heFloor, cfgPath));

loaded = load(fullfile(modelsDir, 'red_lesion_unet_v2.mat'), 'net');
net = loaded.net;

inData  = load(fullfile(dataDir, 'red_lesion_unet_v2_input.mat'));
outData = load(fullfile(dataDir, 'red_lesion_unet_v2_torch_output.mat'));
x = single(inData.x);            % 512 x 512 x 3 x 10
yTorch = double(outData.y);      % 512 x 512 x 3 x 10, raw logits

yPred = predict(net, dlarray(x, 'SSCB'));
yPred = double(extractdata(yPred));   % 512 x 512 x 3 x 10, raw logits

matlabProbs = softmaxChannel(yPred);
torchProbs  = softmaxChannel(yTorch);

n = size(x, 4);
diff = abs(matlabProbs - torchProbs);
perImageMax = zeros(1, n);
for k = 1:n
    frame = diff(:, :, :, k);
    perImageMax(k) = max(frame(:));
end

add(sprintf('\n-- 1. full-frame max|softmax diff| per image --'));
for k = 1:n
    add(sprintf('  %-10s  max|diff| = %.6f', IMAGE_NAMES{k}, perImageMax(k)));
end
maxDiff = max(perImageMax);
framePass = maxDiff <= THRESH;
if framePass
    add(sprintf('  PASS  overall max|diff| = %.6f  (threshold %.2f)', maxDiff, THRESH));
else
    add(sprintf('  FAIL  overall max|diff| = %.6f  EXCEEDS threshold %.2f', maxDiff, THRESH));
end

% ── 2. per-class component-count agreement ─────────────────────────────────
add(sprintf('\n-- 2. per-class connected-component count agreement --'));
countMismatches = 0;
countRows = {};
for k = 1:n
    [~, matlabCls] = max(matlabProbs(:, :, :, k), [], 3);   % 1=bg,2=MA,3=HE
    [~, torchCls]  = max(torchProbs(:, :, :, k), [], 3);

    matlabMA = bwareaopen(matlabCls == 2, maFloor, 8);
    torchMA  = bwareaopen(torchCls  == 2, maFloor, 8);
    matlabHE = bwareaopen(matlabCls == 3, heFloor, 8);
    torchHE  = bwareaopen(torchCls  == 3, heFloor, 8);

    [~, nMatlabMA] = bwlabel(matlabMA, 8);
    [~, nTorchMA]  = bwlabel(torchMA, 8);
    [~, nMatlabHE] = bwlabel(matlabHE, 8);
    [~, nTorchHE]  = bwlabel(torchHE, 8);

    okMA = isequal(nMatlabMA, nTorchMA);
    okHE = isequal(nMatlabHE, nTorchHE);
    if ~okMA, countMismatches = countMismatches + 1; end
    if ~okHE, countMismatches = countMismatches + 1; end

    add(sprintf('  %-10s  MA: matlab=%3d torch=%3d %s   HE: matlab=%3d torch=%3d %s', ...
        IMAGE_NAMES{k}, nMatlabMA, nTorchMA, tern(okMA, 'OK', 'MISMATCH'), ...
        nMatlabHE, nTorchHE, tern(okHE, 'OK', 'MISMATCH')));
    countRows{end+1} = struct('image', IMAGE_NAMES{k}, ...
        'matlabMA', nMatlabMA, 'torchMA', nTorchMA, 'okMA', okMA, ...
        'matlabHE', nMatlabHE, 'torchHE', nTorchHE, 'okHE', okHE); %#ok<AGROW>
end
countPass = (countMismatches == 0);
if countPass
    add('  PASS  every image: MA and HE component counts agree exactly');
else
    add(sprintf('  FAIL  %d class/image count mismatch(es) -- see rows above', countMismatches));
end

overallPass = framePass && countPass;
add(sprintf('\n===== OVERALL: %s =====', tern(overallPass, 'PASS', 'FAIL')));

% ── Write report ────────────────────────────────────────────────────────────
reportPath = fullfile(outDir, 'parity_red_v2_report.txt');
fid = fopen(reportPath, 'w');
fprintf(fid, '%s\n', strjoin(lines, newline));
fclose(fid);
fprintf('\nWrote %s\n', reportPath);

% ── Append to artifact_manifest.json (read existing, add one entry, never
%    overwrite what is already there) ───────────────────────────────────────
manifestPath = fullfile(outDir, 'artifact_manifest.json');
manifest = jsondecode(fileread(manifestPath));
entry = struct( ...
    'name', 'red_lesion_unet_v2', ...
    'role', 'red-lesion segmenter (M5 phase 2), 3-class (background/MA/HE)', ...
    'input_size_declared_by_checkpoint', '1x3x512x512 (H=512, W=512, C=3)', ...
    'note', 'appended by parityCheckRedLesionV2.m (Gate 3); NOT wired into any live inference path', ...
    'files', struct( ...
        'onnx', struct('filename', 'red_lesion_unet_v2.onnx', ...
                       'relative_path', 'training/onnx_out/red_lesion_unet_v2.onnx', ...
                       'size_bytes', fileSizeOrNaN(fullfile(thisDir, 'onnx_out', 'red_lesion_unet_v2.onnx')), ...
                       'sha256', sha256OrEmpty(fullfile(thisDir, 'onnx_out', 'red_lesion_unet_v2.onnx'))), ...
        'mat', struct('filename', 'red_lesion_unet_v2.mat', ...
                      'relative_path', 'models/red_lesion_unet_v2.mat', ...
                      'size_bytes', fileSizeOrNaN(fullfile(modelsDir, 'red_lesion_unet_v2.mat')), ...
                      'sha256', sha256OrEmpty(fullfile(modelsDir, 'red_lesion_unet_v2.mat')))), ...
    'parityCheck', struct( ...
        'script', 'training/parityCheckRedLesionV2.m', ...
        'report', 'diagnostics/out/parity_red_v2_report.txt', ...
        'nImages', n, 'threshold', THRESH, ...
        'fullFrameMaxDiff', maxDiff, 'fullFramePass', framePass, ...
        'componentCountMismatches', countMismatches, 'componentCountPass', countPass, ...
        'overallPass', overallPass));

if ~isfield(manifest, 'models') || ~iscell(manifest.models)
    % artifact_manifest.json's top-level 'models' array deserializes as a
    % struct array via jsondecode when every existing entry shares the same
    % fields, which it does not here (this entry's fields differ from v1's/
    % v2a's) -- convert to a cell array of structs so a heterogeneous append
    % works, matching how jsonencode(..., cell array) already serializes
    % correctly elsewhere in this codebase (see conformalCalibrate.m's
    % golden-vector generator for the same idiom).
    if isfield(manifest, 'models')
        existing = manifest.models;
        manifest.models = num2cell(existing);
    else
        manifest.models = {};
    end
end
manifest.models{end+1} = entry;

fid = fopen(manifestPath, 'w');
fprintf(fid, '%s', jsonencode(manifest, 'PrettyPrint', true));
fclose(fid);
fprintf('Appended red_lesion_unet_v2 entry to %s\n', manifestPath);

if ~overallPass
    error('parityCheckRedLesionV2:failed', 'Gate 3 parity check FAILED -- see report above.');
end
end

% ── Helpers ──────────────────────────────────────────────────────────────────
function p = softmaxChannel(x)
% softmax over dim 3 (channels), matching HWCN layout.
m = max(x, [], 3);
e = exp(x - m);
p = e ./ sum(e, 3);
end

function s = tern(cond, a, b)
if cond, s = a; else, s = b; end
end

function b = fileSizeOrNaN(p)
if isfile(p)
    d = dir(p);
    b = d.bytes;
else
    b = NaN;
end
end

function h = sha256OrEmpty(p)
if ~isfile(p)
    h = '';
    return;
end
opt = java.security.MessageDigest.getInstance('SHA-256');
fid = fopen(p, 'rb');
data = fread(fid, Inf, '*uint8');
fclose(fid);
opt.update(data);
digest = typecast(opt.digest(), 'uint8');
h = lower(sprintf('%02x', digest));
end
