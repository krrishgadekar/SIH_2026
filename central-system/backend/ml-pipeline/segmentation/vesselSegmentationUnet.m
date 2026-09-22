function [mask, method] = vesselSegmentationUnet(img, opts)
% VESSELSEGMENTATIONUNET  Vessel segmentation entry point (Task 4.1).
%
%   mask           = vesselSegmentationUnet(img)
%   [mask, method] = vesselSegmentationUnet(img, opts)
%
%   Input:
%     img  - HxWx3 uint8 fundus image.
%     opts - optional struct:
%              .forceMethod 'unet' | 'frangi' - skip the dispatch
%
%   Outputs:
%     mask   - HxW logical, true = vessel.
%     method - 'unet' or 'frangi': WHICH path actually produced this mask.
%
%   This is the single entry point every caller should use. It runs the trained
%   U-Net when models/vessel_unet_v1.mat is present and falls back to the
%   classical Frangi filter when it is not (design doc §6.5 pairs the two).
%
%   ── WHY method IS RETURNED, NOT JUST LOGGED ────────────────────────────────
%   A fallback that is invisible is a trap. Downstream, Task 4.4's NV suspicion
%   score and Task 4.2's false-positive suppression both consume this mask, and
%   their output means something different depending on which produced it — one
%   is a validated model, the other an unvalidated filter. Callers that record
%   or report anything derived from this mask must record the method alongside
%   it, so a number computed from the fallback is never presented as a number
%   from the trained model.
%
%   ── STATUS (corrected 2026-09-22) ──────────────────────────────────────────
%   This header used to say the U-Net "does not exist yet" and that the function
%   "always returns 'frangi'". Both are long out of date: models/vessel_unet_v1
%   is present, and it is Tanuj's PyTorch model imported from ONNX -- NOT the
%   MATLAB-trained network of trainVesselUnet.m that this file was first written
%   against. The preprocessing block below is written for that PyTorch model;
%   read its note before changing anything there.
%
%   ── THIS IS NOT THE PRODUCTION VESSEL PATH ─────────────────────────────────
%   Production vessel segmentation runs through inference/segInfer.py. This
%   function exists for MATLAB-only tooling (verifyPhase4.m). It now reproduces
%   segInfer.py's preprocessing step for step, so the masks should agree
%   closely, but that agreement is NOT asserted anywhere -- do not treat this
%   as a parity check or quote a number from it as a production number.

if nargin < 2, opts = struct(); end

thisDir   = fileparts(mfilename('fullpath'));
modelPath = fullfile(thisDir, '..', 'models', 'vessel_unet_v1.mat');

forced = '';
if isfield(opts, 'forceMethod') && ~isempty(opts.forceMethod)
    forced = lower(opts.forceMethod);
end

useUnet = isfile(modelPath);
if strcmp(forced, 'frangi'), useUnet = false; end
if strcmp(forced, 'unet')
    if ~isfile(modelPath)
        error('vesselSegmentationUnet: forceMethod=''unet'' but %s is missing.', modelPath);
    end
    useUnet = true;
end

if ~useUnet
    mask   = vesselSegmentationFrangi(img, opts);
    method = 'frangi';
    return;
end

% ── Trained U-Net path ──────────────────────────────────────────────────────
% Cached across calls: a segmentation network is tens of MB and reloading it
% per case would dominate the per-case cost once this runs in the live path —
% the same reason classifyBranchA caches Branch A.
persistent net
if isempty(net)
    % ── models/ MUST BE ON THE PATH BEFORE THIS load() ──────────────────────
    % This network was imported from ONNX, and an imported network is not
    % self-contained: importNetworkFromONNX generated its custom layer classes
    % into models/+vessel_unet_v1/, and the .mat holds REFERENCES to them.
    %
    % Without that folder on the path, load() does NOT fail. It substitutes
    % placeholder layers and returns a dlnetwork with Initialized = 0, and the
    % failure surfaces later as `Undefined function 'getExternalLayers'` -- an
    % internal name that mentions neither this file, nor a missing path, nor
    % the word ONNX. That is the verifyPhase4.m crash: it never reached the NV
    % computation because it died here, looking like a corrupt model file.
    %
    % Nothing else on this code path adds models/ -- callers reach this
    % function directly -- so it is added here rather than assumed.
    if ~isdeployed
        addpath(fullfile(thisDir, '..', 'models'));
    end

    loaded = load(modelPath, 'net');
    net    = loaded.net;

    % Placeholder layers are the silent failure above. Caught here, while the
    % cause is still nameable, instead of several calls later.
    if isa(net, 'dlnetwork') && ~net.Initialized
        net = [];
        error('vesselSegmentationUnet:netNotInitialized', ...
            ['%s loaded but is not initialized -- its custom layer classes ' ...
             '(models/+vessel_unet_v1) were not found on the path, so load() ' ...
             'substituted placeholders.'], modelPath);
    end
end

% ── PREPROCESSING MUST MATCH segInfer.py EXACTLY ───────────────────────────
% models/vessel_unet_v1.mat is no longer the MATLAB-trained U-Net this file was
% written for (trainVesselUnet.m, 3-channel RGB). It is the ONNX import of the
% PyTorch model, and it wants a very specific input. Three things were wrong
% here, and only the first announced itself:
%
%   1. CHANNELS. The net declares in_channels=1 and is fed the GREEN channel
%      (segInfer.py: `green = bgr[:, :, 1]`) -- green carries the most
%      vessel-to-background contrast. Passing RGB raised "expects channel
%      dimension size 1 but received size 3" on every call, which is why this
%      path had not worked at all since the model was swapped.
%   2. GEOMETRY. A plain imresize to a square squashes a 3:2 fundus photograph
%      and breaks vessels into fragments -- verifyPhase4.m's "connected tree,
%      not speckle" check failed with the largest component at 9-18% of the
%      mask. segInfer.py aspect-pads instead, and its own comment is explicit
%      that "the pad must be reproduced exactly or the model sees an input
%      unlike anything it was trained on" (it trained on near-square CHASE_DB1,
%      where the pad barely showed).
%   3. SCALE. Trained on [-1, 1], not 0-255.
%
% None of 2 or 3 would have errored. They return a mask-shaped array of the
% right size that is simply wrong, which is how they survived unnoticed.
inputSize = net.Layers(1).InputSize;
side = inputSize(1);

if numel(inputSize) >= 3 && inputSize(3) == 1 && size(img, 3) == 3
    plane = img(:, :, 2);
elseif numel(inputSize) >= 3 && inputSize(3) == size(img, 3)
    plane = img;
else
    error('vesselSegmentationUnet:channelMismatch', ...
        ['%s expects %d input channel(s) but the image has %d, and no ' ...
         'conversion is defined for that combination.'], ...
        modelPath, inputSize(3), size(img, 3));
end

% Aspect-preserving resize, then centre zero-pad -- segInfer.py's _aspect_pad.
% 'bilinear' matches its INTER_LINEAR, which that file notes is verified PER
% MODEL (M2 needs LINEAR, M3 needs AREA); do not "unify" it.
%
% 'Antialiasing', false IS LOAD-BEARING. MATLAB's imresize low-pass filters
% when DOWNsampling and OpenCV's INTER_LINEAR does not, so the default blurs
% away exactly the one-to-two-pixel structures this model is looking for. With
% antialiasing on, the mask came out as speckle -- largest connected component
% 9% of the mask, against 55% for the Python path on the same image -- while
% the vessel FRACTION stayed plausible (7.8% vs 5.6%), so every summary number
% looked fine and only the connectivity assertion caught it.
[h0, w0, ~] = size(img);
scale = side / max(h0, w0);
nw = round(w0 * scale);
nh = round(h0 * scale);
inner = imresize(plane, [nh nw], 'bilinear', 'Antialiasing', false);
padded = zeros(side, side, size(inner, 3), 'like', inner);
ox = floor((side - nw) / 2);
oy = floor((side - nh) / 2);
padded(oy+1:oy+nh, ox+1:ox+nw, :) = inner;

x = (double(padded) / 255 - 0.5) / 0.5;

scores = predict(net, single(x));
if isa(scores, 'dlarray'), scores = extractdata(scores); end

% The single-output PyTorch net emits LOGITS; segInfer.py sigmoids before
% thresholding at 0.5. Thresholding a raw logit at 0.5 is a different operating
% point (sigmoid(0.5) = 0.62) and under-segments rather than failing. The
% 2-channel MATLAB-trained net already emits softmax probabilities.
if size(scores, 3) == 1
    prob = 1 ./ (1 + exp(-double(scores)));
else
    % Channel 2 is the vessel class (1 = background), matching how
    % trainVesselUnet.m orders its pixel labels.
    prob = double(scores(:, :, 2));
end

% Undo the pad BEFORE resizing back: the padding is not part of the image, and
% resizing it in would drag black bands into the retina (segInfer.py's note).
prob = prob(oy+1:oy+nh, ox+1:ox+nw);
mask = imresize(prob, [h0, w0], 'bilinear') > 0.5;
method = 'unet';
end
