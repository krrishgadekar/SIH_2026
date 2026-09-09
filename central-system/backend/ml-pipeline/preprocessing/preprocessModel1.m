function [out, steps] = preprocessModel1(img, opts)
% PREPROCESSMODEL1  The exact preprocessing Branch A (Model1) was trained on.
%
%   out = preprocessModel1(img)
%   [out, steps] = preprocessModel1(img, opts)
%
%   opts:
%     .targetSize  384  - MUST match the trained network's input
%     .clipLimit   0.01 - adapthisteq clip; see the CLAHE note below
%     .numTiles  [8 8]
%
%   Returns a targetSize x targetSize x 3 uint8 image.
%
%   ══ THIS FILE IS A PORT. DO NOT "IMPROVE" IT. ══════════════════════════════
%   This is a line-for-line reimplementation of the Python that Branch A
%   (Model1, EfficientNet-B0, 2026-09-09) was actually trained with:
%
%       central-system/backend/ml-pipeline/preprocessing/ben_graham.py
%       central-system/backend/ml-pipeline/preprocessing/clahe_enhance.py
%
%   Its correctness criterion is not "is this good preprocessing" — it is
%   "does this produce what the model was trained on". A better denoiser, a
%   smarter crop, a nicer contrast curve would all make this file WORSE,
%   because the model has never seen their output.
%
%   Every deviation from the Python is a silent accuracy loss with no error
%   message attached. If the model is ever retrained, this file changes to
%   match the new training code, in the same commit.
%
%   ── WHAT THIS REPLACED, AND WHAT WAS GIVEN UP ──────────────────────────────
%   The previous Branch A chain was camera calibration -> benGrahamCrop ->
%   denoiseRetinal -> adaptiveEnhance at 512x512. Measured against the training
%   recipe on datasets/2.jpg it differed by 20.6 grey levels on average, SSIM
%   0.824, and emitted the wrong input size entirely (512 vs 384).
%
%   So denoising (Task 2.1b) and adaptive enhancement (Task 2.8) no longer
%   touch the Branch A input. That is a real reduction and it is deliberate:
%   the model was not trained with them, so applying them makes it worse, not
%   better. They remain in use for the Phase 4 segmentation path, where the
%   models are ours and we control both sides of the chain.
%
%   ── THE ONE PART THAT IS NOT EXACT ─────────────────────────────────────────
%   cv2.createCLAHE(clipLimit=2.0) and adapthisteq('ClipLimit', c) do not use
%   the same normalisation: OpenCV's limit is a multiplier on the average
%   histogram bin count, MATLAB's is a fraction in [0,1]. There is no published
%   exact conversion.
%
%   For 384x384 with 8x8 tiles, each tile is 48x48 = 2304 px, so the average
%   bin holds 2304/256 = 9 counts and OpenCV clips at 2.0 x 9 = 18. Expressed
%   as a fraction of the tile that is 18/2304 = 0.0078, which is where the
%   default below comes from — reasoned, not measured. Confirming it needs
%   OpenCV installed and a direct diff against the Python output; until then
%   this is the weakest link in the port and is marked as such rather than
%   presented as exact.

if nargin < 2, opts = struct(); end
targetSize = getdef(opts, 'targetSize', 384);
clipLimit  = getdef(opts, 'clipLimit', 0.0078);
numTiles   = getdef(opts, 'numTiles', [8 8]);

if size(img, 3) ~= 3
    error('preprocessModel1:badInput', 'Expected an HxWx3 RGB image.');
end

% ── ben_graham.py, step 1: crop to the retinal circle ──────────────────────
% Green channel thresholded at >7, closed with a 15x15 ellipse, then the
% bounding box of the LARGEST connected region.
%
% strel('disk', 7) approximates cv2's getStructuringElement(MORPH_ELLIPSE,
% (15,15)). Not bit-identical — OpenCV's ellipse and MATLAB's disk differ at
% the boundary pixels — but this is a closing on a large near-circular mask, so
% a one-pixel boundary difference cannot move the bounding box materially.
green = img(:, :, 2);
mask = green > 7;
mask = imclose(mask, strel('disk', 7));

cc = bwconncomp(mask);
if cc.NumObjects > 0
    [~, k] = max(cellfun(@numel, cc.PixelIdxList));
    biggest = false(size(mask));
    biggest(cc.PixelIdxList{k}) = true;
    st = regionprops(biggest, 'BoundingBox');
    bb = st(1).BoundingBox;
    x = max(1, floor(bb(1)));
    y = max(1, floor(bb(2)));
    w = min(round(bb(3)), size(img, 2) - x + 1);
    h = min(round(bb(4)), size(img, 1) - y + 1);
    cropped = img(y:y+h-1, x:x+w-1, :);
else
    cropped = img;      % their explicit fallback when no contour is found
end
if isempty(cropped), cropped = img; end

% ── step 2: resize to the square the network expects ───────────────────────
% 'box' is MATLAB's nearest equivalent to cv2.INTER_AREA. Both are area
% averaging; this is a downscale, which is what INTER_AREA is designed for.
resized = imresize(cropped, [targetSize targetSize], 'box');

% ── step 3: Ben Graham local-contrast boost ────────────────────────────────
%   sigma = targetSize/30;  out = clip(4*img - 4*blur + 128)
% The kernel is sized from sigma exactly as their int(sigma)*2+1 does.
sigma = targetSize / 30;
ksize = double(floor(sigma)) * 2 + 1;
blurred = imgaussfilt(double(resized), sigma, 'FilterSize', ksize);
enhanced = 4 * double(resized) - 4 * blurred + 128;
enhanced = uint8(min(255, max(0, enhanced)));

% ── clahe_enhance.py: CLAHE on the L channel of LAB, colour left alone ─────
% Only luminance is touched. Running CLAHE per RGB channel instead would shift
% hue, and the red/green balance of a fundus photograph carries the lesion
% signal — that is why their code goes through LAB rather than the easy route.
lab = rgb2lab(enhanced);
L = lab(:, :, 1) / 100;                       % adapthisteq wants [0,1]
L = adapthisteq(L, 'ClipLimit', clipLimit, 'NumTiles', numTiles);
lab(:, :, 1) = L * 100;
out = lab2rgb(lab, 'OutputType', 'uint8');

steps = struct( ...
    'recipe',      'model1', ...
    'targetSize',  targetSize, ...
    'sigma',       sigma, ...
    'kernelSize',  ksize, ...
    'clipLimit',   clipLimit, ...
    'numTiles',    numTiles, ...
    'portedFrom',  'ben_graham.py + clahe_enhance.py (Model1 training code)', ...
    'exactness',   ['crop/resize/gaussian are faithful; the CLAHE clip limit ' ...
                    'is a reasoned conversion from cv2 clipLimit=2.0 and is ' ...
                    'UNVERIFIED against the Python']);
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
