function [out, steps] = preprocessModel1(img, opts)
% PREPROCESSMODEL1  The exact preprocessing Branch A (Model1) was trained on.
%
%   out = preprocessModel1(img)
%   [out, steps] = preprocessModel1(img, opts)
%
%   opts:
%     .targetSize  384  - MUST match the trained network's input
%     .clipLimit        accepted but UNUSED -- no CLAHE in the training chain
%     .numTiles  [8 8]
%
%   Returns a targetSize x targetSize x 3 uint8 image.
%
%   ══ THIS FILE IS A PORT. DO NOT "IMPROVE" IT. ══════════════════════════════
%   This is a line-for-line reimplementation of the Python that Branch A
%   (Model1, EfficientNet-B0, 2026-09-09) was actually trained with:
%
%       central-system/backend/ml-pipeline/preprocessing/ben_graham.py
%   (clahe_enhance.py sits beside it and is NOT part of the chain -- see below)
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
%   ── HOW THE CHAIN WAS ESTABLISHED, RATHER THAN ASSUMED ─────────────────────
%   The training script is not in the repo, and the two preprocessing modules
%   that ARE there (ben_graham.py, clahe_enhance.py) do not say which of them
%   training called. Reading alone could not settle it.
%
%   identifyTrainingChain.py settles it empirically: the checkpoint ships the
%   model's own test-split logits, so each candidate chain can be run and
%   checked against them. Logits are a fingerprint — the right preprocessing
%   reproduces them, the wrong one does not.
%
%       ben_graham only      mean |logit diff| 0.66   class agreement 81.2%
%       ben_graham + CLAHE   mean |logit diff| 1.92   class agreement 43.5%
%
%   So: no CLAHE. Re-run that script if the model is ever replaced.
%
%   ── STILL NOT AN EXACT REPRODUCTION ────────────────────────────────────────
%   0.66 and 81.2%% is decisively better than the alternative but is not the
%   near-zero an exact match would give, so something ELSE still differs
%   between this chain and training — a resize interpolation, an extra
%   normalisation, or preprocessed images cached at train time. Unresolved and
%   recorded rather than smoothed over. The remaining gap is small enough not
%   to be the CLAHE-sized error, and large enough to be worth finding.

if nargin < 2, opts = struct(); end
targetSize = getdef(opts, 'targetSize', 384);
% Accepted but UNUSED: the training chain applies no CLAHE (see above). Kept in
% the signature so callers written against the earlier, wrong version fail
% loudly on their expectations rather than silently passing a dead parameter.
clipLimit  = getdef(opts, 'clipLimit', NaN);
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

% ── AND THAT IS THE WHOLE CHAIN. NO CLAHE. ─────────────────────────────────
% clahe_enhance.py sits next to ben_graham.py in the training repo and is
% exported from preprocessing/__init__.py, so the obvious reading is that both
% ran. The first version of this file made exactly that assumption.
%
% It is wrong. The checkpoint's own metadata records
%     preprocessing: "ben_graham: circular crop -> resize ->
%                     gaussian-subtraction contrast"
% naming ben_graham alone, and identifyTrainingChain.py settled it by
% reproducing the model's published test logits under each candidate:
%
%     ben_graham only      mean |logit diff| 0.66   class agreement 81.2%
%     ben_graham + CLAHE   mean |logit diff| 1.92   class agreement 43.5%
%
% Adding CLAHE roughly halved agreement with the model's own recorded outputs.
% The file existing is not evidence the training script called it.
out = enhanced;

steps = struct( ...
    'recipe',      'model1', ...
    'targetSize',  targetSize, ...
    'sigma',       sigma, ...
    'kernelSize',  ksize, ...
    'claheApplied', false, ...
    'portedFrom',  'ben_graham.py (Model1 training code); CLAHE deliberately NOT applied', ...
    'exactness',   ['chain identified by reproducing the model''s published ' ...
                    'logits (identifyTrainingChain.py): 0.66 mean logit diff, ' ...
                    '81.2%% class agreement. Close but not exact — something ' ...
                    'minor still differs from training']);
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
