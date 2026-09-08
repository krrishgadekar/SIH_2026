function outImg = benGrahamCrop(img, targetSize)
% BENGRAHAMCROP  Retinal-disc crop + local contrast boost (Ben Graham method).
%
%   outImg = benGrahamCrop(img)
%   outImg = benGrahamCrop(img, targetSize)
%
%   Inputs:
%     img        - HxWx3 uint8 RGB image (raw fundus capture).
%     targetSize - optional scalar, output will be targetSize x targetSize
%                  pixels (default 512).
%
%   Output:
%     outImg - targetSize x targetSize x 3 uint8 image, cropped to the
%              retinal disc and contrast-boosted.
%
%   Algorithm:
%     Step 1 — Detect the retinal disc boundary.
%              Uses the SAME global-threshold logic as assessFOV (Task 1.3):
%              gray > 15 to separate the near-zero black border from retinal
%              tissue, then imfill('holes') to close vessels/lesions.
%              This keeps FOV detection and preprocessing behaviour consistent
%              across the codebase (spec note: Task 2.1 says "reuse the same
%              adaptive-threshold logic" — our Task 1.3 calibration replaced
%              adaptive with gray>15+imfill, so we reuse that calibrated form).
%
%     Step 2 — Crop to the bounding box of the largest connected component.
%
%     Step 3 — Resize to targetSize × targetSize.
%
%     Step 4 — Ben Graham contrast boost:
%              Subtract a heavily-blurred version of itself (sigma = targetSize/30)
%              scaled by ~4 and re-added at mid-gray (128).
%              This amplifies local contrast around microaneurysms, hard
%              exudates, and haemorrhages while suppressing the large-scale
%              illumination gradient — the key preprocessing step that
%              enabled top-10 performance in the 2015 Kaggle DR competition.
%
%   Reference: B. Graham, "Kaggle Diabetic Retinopathy Detection Competition
%   Report", U. of Warwick, 2015.

if nargin < 2 || isempty(targetSize)
    targetSize = 512;
end

% ── Step 1: detect retinal disc (same logic as assessFOV / Task 1.3) ─────────
gray = rgb2gray(img);
bw   = gray > 15;
bw   = imfill(bw, 'holes');

% Largest connected component = the retinal disc
props = regionprops(bw, 'BoundingBox', 'Area');
if isempty(props)
    % Fallback: if nothing is detected, use the whole image
    warning('benGrahamCrop: no retinal disc detected — using full image.');
    cropped = img;
else
    [~, idx] = max([props.Area]);
    bb = props(idx).BoundingBox;   % [x, y, width, height]
    % BoundingBox is [col_start, row_start, width, height]
    c1 = max(1, round(bb(1)));
    r1 = max(1, round(bb(2)));
    c2 = min(size(img,2), round(bb(1) + bb(3) - 1));
    r2 = min(size(img,1), round(bb(2) + bb(4) - 1));
    cropped = img(r1:r2, c1:c2, :);
end

% ── Step 2: resize to targetSize x targetSize ─────────────────────────────────
resized = imresize(cropped, [targetSize, targetSize]);

% ── Step 3: Ben Graham contrast boost ────────────────────────────────────────
%   sigma = targetSize / 30 ≈ 17 px at 512 — large enough to estimate the
%   slow-varying illumination field, small enough to preserve vessel edges.
%
%   Formula:  out = 4 * img - 4 * blur + 128
%   Equivalent to: out = img + 3*(img - blur) + 128 - img
%   The 4x weight strongly amplifies local detail over the background.
%   Re-adding at 128 centres the output around mid-gray.

sigma  = targetSize / 30;
imgD   = double(resized);
outD   = zeros(size(imgD));

for ch = 1:3
    blurred         = imgaussfilt(imgD(:,:,ch), sigma);
    outD(:,:,ch)    = 4 * imgD(:,:,ch) - 4 * blurred + 128;
end

% Clamp to [0, 255] and convert to uint8
outImg = uint8(max(0, min(255, outD)));

end
