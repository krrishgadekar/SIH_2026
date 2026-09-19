function parityCheck()
% PARITYCHECK  Compare the imported MATLAB dlnetworks against the original
% PyTorch checkpoints on 10 real fundus images (prepare_parity_inputs.py).
%
% Both sides are compared AFTER the activation each model's contract calls
% for (softmax for the classifier -- already baked into the saved net;
% sigmoid, applied here to both sides, for the four segmentation/heatmap
% nets, since "sigmoid > 0.5" / "sigmoid then argmax" is how their raw
% logits are actually consumed downstream). Comparing raw unbounded logits
% would make a 0.01 threshold meaningless; comparing bounded [0,1] values
% after the real downstream activation is what the threshold is calibrated
% for. Flags max|diff| > 0.01 as a failure to investigate, per the brief --
% not something to wave through.

thisDir = fileparts(mfilename('fullpath'));
dataDir = fullfile(thisDir, 'parity_data');
modelsDir = fullfile(thisDir, '..', 'models');

THRESH = 0.01;

specs = struct( ...
    'name',      {'branchA_v1', 'vessel_unet_v1', 'localization_v1', ...
                   'bright_lesion_unet_v1', 'red_lesion_unet_v1'}, ...
    'matFile',   {'branchA_v1.mat', 'vessel_unet_v1.mat', 'localization_v1.mat', ...
                   'bright_lesion_unet_v1.mat', 'red_lesion_unet_v1.mat'}, ...
    'isClassifier', {true, false, false, false, false});

fprintf('\n===== parityCheck: PyTorch vs imported MATLAB dlnetwork (10 real images) =====\n');

results = struct('name', {}, 'maxDiff', {}, 'perImageMax', {}, 'pass', {});

for i = 1:numel(specs)
    s = specs(i);
    fprintf('\n-- %s --\n', s.name);

    loaded = load(fullfile(modelsDir, s.matFile), 'net');
    net = loaded.net;

    inData  = load(fullfile(dataDir, [s.name '_input.mat']));
    outData = load(fullfile(dataDir, [s.name '_torch_output.mat']));
    x = single(inData.x);          % H x W x C x N
    yTorch = double(outData.y);    % classifier: N x 5 ; else H x W x C x N

    yPred = predict(net, dlarray(x, 'SSCB'));
    yPred = double(extractdata(yPred));

    if s.isClassifier
        % yPred: 5 x N (already softmax'd in the saved net). yTorch: N x 5 raw logits.
        matlabProbs = yPred';                        % N x 5
        torchProbs  = softmaxRows(yTorch);            % N x 5
        diff = abs(matlabProbs - torchProbs);
        perImageMax = max(diff, [], 2)';
    else
        % yPred, yTorch: H x W x C x N raw logits -> sigmoid both sides.
        matlabProbs = 1 ./ (1 + exp(-yPred));
        torchProbs  = 1 ./ (1 + exp(-yTorch));
        diff = abs(matlabProbs - torchProbs);
        n = size(diff, 4);
        perImageMax = zeros(1, n);
        for k = 1:n
            frame = diff(:, :, :, k);
            perImageMax(k) = max(frame(:));
        end
    end

    maxDiff = max(perImageMax);
    passOk = maxDiff <= THRESH;

    for k = 1:numel(perImageMax)
        fprintf('  image %2d   max|diff| = %.6f\n', k, perImageMax(k));
    end
    if passOk
        fprintf('  PASS  overall max|diff| = %.6f  (threshold %.2f)\n', maxDiff, THRESH);
    else
        fprintf('  FAIL  overall max|diff| = %.6f  EXCEEDS threshold %.2f -- needs investigation\n', ...
                maxDiff, THRESH);
    end

    results(end+1) = struct('name', s.name, 'maxDiff', maxDiff, ...
                             'perImageMax', perImageMax, 'pass', passOk); %#ok<AGROW>
end

fprintf('\n===== Summary =====\n');
anyFail = false;
for i = 1:numel(results)
    r = results(i);
    status = 'PASS';
    if ~r.pass
        status = 'FAIL';
        anyFail = true;
    end
    fprintf('  %-6s  %-24s  max|diff| = %.6f\n', status, r.name, r.maxDiff);
end

if anyFail
    fprintf('\nAt least one model exceeds the 0.01 parity threshold. Investigate before handoff.\n\n');
else
    fprintf('\nAll 5 models within parity threshold.\n\n');
end
end

function p = softmaxRows(logits)
m = max(logits, [], 2);
e = exp(logits - m);
p = e ./ sum(e, 2);
end
