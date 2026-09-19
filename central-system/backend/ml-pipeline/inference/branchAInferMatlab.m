function out = branchAInferMatlab(tensorPath, gradcamPath)
% BRANCHAINFERMATLAB  Branch A inference via the imported MATLAB dlnetwork
% (models/branchA_v1.mat, ONNX-imported from the same branchA_v1.pt
% checkpoint branchAInfer.py serves), given an ALREADY-PREPROCESSED tensor.
%
%   out = branchAInferMatlab(tensorPath)
%   out = branchAInferMatlab(tensorPath, gradcamPath)
%
% Mirrors branchAInfer.py's JSON contract field-for-field (see that file's
% docstring) so gradingOrchestrator.js's calling/parsing code does not change
% -- only which backend it shells out to (INFERENCE_BACKEND=matlab|python).
%
% ── CONTRACT CHANGE (2026-09-19): NO IMAGE PREPROCESSING HAPPENS HERE ──────
% This function used to do its own preprocessing via preprocessForBranchA.m /
% preprocessModel1.m -- a hand-maintained MATLAB PORT of the Python
% ben_graham chain. That port had a real, measured residual (SSIM 0.981, not
% 1.0 -- preprocessModel1.m's own header) that was small in pixel terms but
% large enough to flip the predicted grade on 1/10 and the conformal tier on
% 2/10 real images, even though the imported network matched Python to 2e-6
% given IDENTICAL input (training/parityCheck.m). The fix is not a tighter
% port. It is not maintaining a second implementation at all:
%
%   tensorPath is a .mat written by ml-pipeline/inference/
%   preprocessBranchATensor.py, which calls branchAInfer.preprocess() --
%   the EXACT function branchAInfer.py's own Python inference path uses for
%   every image. This function's job is to load that tensor and call
%   predict(). Preprocessing exists in exactly one place in this codebase
%   now: preprocess() in branchAInfer.py.
%
% tensorPath's .mat contains:
%   x        (384,384,3,1) single, SSCB layout, ImageNet-normalized --
%            handed to dlarray(x,'SSCB') and predict() with no further
%            transformation.
%   display  (384,384,3) uint8, ben_graham-enhanced RGB, the SAME pixels x
%            was computed from one step before normalization -- Grad-CAM's
%            overlay background (must be the ENHANCED image, i.e. what the
%            network actually saw, not the plain crop -- see
%            preprocessBranchATensor.py's docstring).
%
% ── WHY THIS EXISTS ALONGSIDE branchAInfer.py, NOT INSTEAD OF IT ────────────
% branchAInfer.py's own header explains why Branch A ran in Python in the
% first place: MATLAB's DIRECT PyTorch converter (importNetworkFromPyTorch)
% imported this exact architecture wrong -- 8-11% class agreement, -0.25
% correlation against the model's own published logits, despite importing
% "structurally fine" (see testImportedNetwork.m). That failure does NOT
% apply here: this .mat came from a DIFFERENT path (torch.onnx.export ->
% importNetworkFromONNX), independently verified against the same PyTorch
% model on 10 real IDRiD images at max|diff| ~2e-6 (post-softmax) -- see
% training/parityCheck.m.
%
% ── RAW LOGITS, NOT THE NET'S OWN OUTPUT ────────────────────────────────────
% The saved `net` has a terminal softmax baked in (the handoff contract
% requires it, for classifyBranchA.m's direct callers). Temperature scaling
% needs to divide LOGITS by T before softmax, so this function reaches past
% that terminal layer with predict(net, X, 'Outputs', 'x_head_Gemm') to get
% the pre-softmax Gemm output, then applies temperature + softmax itself --
% the same two-step branchAInfer.py does. argmax is invariant to both
% monotonic transforms, so the predicted grade does not depend on this choice;
% the calibrated confidence and conformal tier do.
%
% ── ONE KNOWN, DELIBERATE FIDELITY GAP ──────────────────────────────────────
%   - uncertaintyScore (MC-Dropout, Task 6.1): NOT computed. forward() on
%     this specific imported network returns a bit-identical default output
%     across repeated calls even though the same dropout layer, requested as
%     an explicit intermediate 'Outputs' target, is independently confirmed
%     stochastic -- an unexplained MATLAB/ONNX-import interaction, not a
%     shrug. Reporting null + a reason, rather than guessing and risking the
%     exact failure mcDropout.py's own docstring is written around: zero
%     variance silently reads downstream as MAXIMUM certainty.
% This does not affect drGradeCnn, confidenceScore, referable, or
% conformalTier, which is what tiering and the DB write actually consume.
% (gradcamMap/gradcamWarning, previously also listed here as gaps, are now
% moot the same way they always were -- gradCam.m only ever returned a
% finished PNG, unrelated to this contract change.)

if nargin < 2, gradcamPath = ''; end

thisDir = fileparts(mfilename('fullpath'));
mlRoot  = fullfile(thisDir, '..');
% preprocessing/, grading/, cameraCalibration/ are NOT needed here any more --
% this function never touches a raw image.
addpath(fullfile(mlRoot, 'calibration'));
addpath(fullfile(mlRoot, 'explainability'));
addpath(fullfile(mlRoot, 'models'));

modelPath = fullfile(mlRoot, 'models', 'branchA_v1.mat');
calibPath = fullfile(mlRoot, 'models', 'calibration_v1.json');

% persistent, like classifyBranchA.m: safe whether this runs as a fresh
% -batch process per call or inside the persistent session (matlabSession/
% runMatlabInferenceSession.m), which calls this same function repeatedly
% without exiting MATLAB between requests.
persistent net
if isempty(net)
    loaded = load(modelPath, 'net');
    net = loaded.net;
    if isa(net, 'dlnetwork') && ~net.Initialized
        net = initialize(net, dlarray(zeros(384, 384, 3, 1, 'single'), 'SSCB'));
    end
end

td = load(tensorPath, 'x', 'display');
X = dlarray(single(td.x), 'SSCB');

logitsD = predict(net, X, 'Outputs', 'x_head_Gemm');
logits  = reshape(double(extractdata(logitsD)), 1, []);

calibrated = false;
calibrationWarning = '';
temperature = 1.0;
referableFrom = 2;
calib = struct();
if isfile(calibPath)
    calib = jsondecode(fileread(calibPath));

    % VERSION GUARD (2026-09-19): refuse a calibration fitted for a
    % differently-shaped model instead of silently applying it -- the exact
    % mistake of deploying a v2 model (different resolution) with v1's
    % qhat=0.8432 still in calibration_v1.json. The network's OWN input-layer
    % size is the ground truth here (not a hardcoded 384), so this stays
    % correct automatically whatever .mat is actually loaded. Mirrors the
    % same guard in branchAInfer.py's load_calibration() -- both backends
    % read this file independently and must agree on when to trust it.
    netImgSize = net.Layers(1).InputSize(1);
    trainedSize = [];
    if isfield(calib, 'trainedImgSize'), trainedSize = calib.trainedImgSize; end

    if ~isempty(trainedSize) && trainedSize ~= netImgSize
        calibrationWarning = sprintf(...
            ['calibration_v1.json was fitted for trainedImgSize=%d but the loaded ' ...
             'network''s input is %dx%d -- REFUSING to apply this calibration ' ...
             '(qhat/temperature from a different model mean nothing here). Re-run ' ...
             'calibrateBranchA.m against THIS model''s predictions and overwrite ' ...
             'calibration_v1.json before deploying it. Confidences are UNCALIBRATED.'], ...
            trainedSize, netImgSize, netImgSize);
    else
        temperature = calib.temperature;
        if isfield(calib, 'referableFrom'), referableFrom = calib.referableFrom; end
        calibrated = true;
    end
else
    calibrationWarning = ['calibration_v1.json missing; run calibrateBranchA.m. ' ...
                          'Confidences are UNCALIBRATED.'];
end

rawProbs = softmaxRow(logits);
calProbs = softmaxRow(logits ./ temperature);

[confidence, gradeIdx] = max(calProbs);
grade = gradeIdx - 1;
referable = grade >= referableFrom;

tier = '';
predictionSet = [];
tierReason = '';
if calibrated
    [tier, details] = conformalTiering(calProbs, calib);
    predictionSet = details.predictionSet;
    tierReason = details.reason;
end

out = struct( ...
    'drGradeCnn',              grade, ...
    'confidenceScore',         confidence, ...
    'calibratedProbabilities', calProbs, ...
    'rawProbabilities',        rawProbs, ...
    'logits',                  logits, ...
    'referable',               referable, ...
    'conformalTier',           tier, ...
    'predictionSet',           predictionSet, ...
    'tierReason',              tierReason, ...
    'temperature',             temperature, ...
    'calibrated',              calibrated, ...
    'modelVersion',            'branchA_v1', ...
    'imgSize',                 384, ...
    'preprocessing',           'branchAInfer.preprocess() (Python) via preprocessBranchATensor.py -- ben_graham 384, ImageNet norm, no CLAHE', ...
    'backend',                 'matlab', ...
    'uncertaintyScore',        [], ...
    'uncertaintyError', ['MC-Dropout not implemented for the MATLAB backend: forward() ' ...
        'returns a deterministic default output on this imported network despite ' ...
        'its dropout layer being independently confirmed stochastic when requested ' ...
        'as an explicit intermediate output -- reporting null rather than a value ' ...
        'that risks being silently wrong (see this function''s header).'] ...
);
if ~isempty(calibrationWarning)
    out.calibrationWarning = calibrationWarning;
end

if ~isempty(gradcamPath)
    try
        gradCam(net, td.display, gradeIdx, gradcamPath);
        out.gradcamPath = gradcamPath;
    catch ME
        % Field left UNSET here, not set to [] -- jsonencode renders [] as
        % JSON [], which `branchA.gradcamPath ?? null` in gradingOrchestrator.js
        % would NOT convert to null ([] is not nullish). An absent key
        % round-trips through JSON.parse as `undefined`, which `?? null` does
        % catch. See the matching uncertaintyScore fix in gradingOrchestrator.js.
        out.gradcamError = ME.message;
    end
end
end

function p = softmaxRow(z)
z = z - max(z);
e = exp(z);
p = e ./ sum(e);
end
