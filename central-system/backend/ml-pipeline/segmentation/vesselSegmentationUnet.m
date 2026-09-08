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
%   The U-Net does not exist yet: training needs DRIVE's 40 annotated images,
%   which are not downloaded (datasets/README.md). Until then this always
%   returns 'frangi'.

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
    loaded = load(modelPath, 'net');
    net    = loaded.net;
end

% The network is trained at a fixed input size; resize in, resize the mask back
% out, so callers never have to care what that size was.
inputSize = net.Layers(1).InputSize;
resized   = imresize(img, inputSize(1:2));

scores = predict(net, single(resized));
if isa(scores, 'dlarray'), scores = extractdata(scores); end

% Channel 2 is the vessel class (1 = background), matching how
% trainVesselUnet.m orders its pixel labels.
if ndims(scores) >= 3 && size(scores, 3) >= 2
    vesselScore = scores(:,:,2);
else
    vesselScore = scores;
end

mask   = imresize(double(vesselScore), [size(img,1), size(img,2)]) > 0.5;
method = 'unet';
end
