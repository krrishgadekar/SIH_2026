function outImg = illuminationNormalize(img)
% ILLUMINATIONNORMALIZE  Flatten large-scale illumination gradients.
%
%   outImg = illuminationNormalize(img)
%
%   Input:
%     img    - HxWx3 uint8 RGB image.
%
%   Output:
%     outImg - HxWx3 uint8 RGB image with illumination gradients removed.
%
%   Algorithm (v1 — Gaussian background subtraction):
%     A very large Gaussian filter (sigma = 50 pixels) estimates the
%     slow-varying background illumination field.  Subtracting it and
%     re-adding a fixed midpoint (128) removes gradients while keeping
%     the mean intensity stable.
%
%   Why sigma = 50:
%     The largest fundus image structures (optic disc, macula) span ~80–120
%     pixels in a 512-px image.  A sigma of 50 blurs everything at that
%     scale into the background estimate while leaving vessel/lesion detail
%     (which lives at 2–15 px) in the residual.  This is the standard
%     "large-kernel subtract" used in the APTOS / Kaggle DR community.
%
%   Applied per-channel (RGB) so colour balance is preserved.

% Fixed midpoint to re-add after subtraction (keeps output in uint8 range)
MIDPOINT = 128;

imgD   = double(img);
outImg = zeros(size(imgD));

for ch = 1:3
    bg            = imgaussfilt(imgD(:,:,ch), 50);
    outImg(:,:,ch) = imgD(:,:,ch) - bg + MIDPOINT;
end

% Clamp to [0, 255] and return as uint8
outImg = uint8(max(0, min(255, outImg)));

end
