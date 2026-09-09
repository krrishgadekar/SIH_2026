function result = assessGlareMotionOcclusion(img)
% ASSESSGLAREMOTIONOCCLUSION  Detect glare, motion blur, and eyelash occlusion.
%
%   result = assessGlareMotionOcclusion(img)
%
%   Input:
%     img    - HxWx3 uint8 RGB image.
%
%   Output:
%     result - scalar struct with fields (all double, 0-1):
%                .glareScore     — fraction of saturated pixels in centre ROI.
%                .motionScore    — directional blur asymmetry (H vs V Laplacian).
%                .occlusionScore — fraction of dark connected pixels touching
%                                  the image border.
%
%   IMPORTANT — polarity is INVERTED vs. assessFocus/assessIllumination/assessFOV:
%     Higher value = WORSE quality (more of that artifact present).
%     qualityGateMain.m treats these as penalties with threshold > 0.3, not
%     as scores to maximise. This is documented in the task spec.
%
%   ── Glare ────────────────────────────────────────────────────────────────
%   Saturated pixels in the central 50%×50% ROI indicate specular reflection
%   (flash glare) on the lens or cornea.  The ROI excludes the peripheral
%   black border so border pixels don't inflate the count.
%   Threshold: pixel intensity > 250/255 (near-white saturation).
%
%   ── Motion blur ──────────────────────────────────────────────────────────
%   Motion blur is directional — it attenuates high frequencies along the
%   direction of motion while leaving the perpendicular direction intact.
%   Method: apply a 1D finite-difference edge filter separately in the
%   horizontal and vertical directions, compute the variance of each filtered
%   image, then score the asymmetry between the two variances.
%   A large asymmetry → directional blur → likely motion artifact.
%   Uniform (focus) blur produces symmetric attenuation, so it does not
%   elevate motionScore — it is already caught by assessFocus.
%
%   ── Occlusion (eyelash / eyelid) ─────────────────────────────────────────
%   Eyelash/eyelid obstructions appear as dark connected regions touching the
%   image border (top or bottom edge typically).  The score is the fraction of
%   all pixels that belong to dark components (intensity < 20) that are
%   connected to any border pixel.  This distinguishes eyelash intrusion from
%   normal retinal vessels (which are dark but interior, not border-touching).

gray = rgb2gray(img);
[H, W] = size(gray);

% ── 1. Glare score ────────────────────────────────────────────────────────
% Central 50%×50% ROI — rows/cols 25%–75% of image dimensions
r1 = round(0.25*H); r2 = round(0.75*H);
c1 = round(0.25*W); c2 = round(0.75*W);
centerROI = gray(r1:r2, c1:c2);
result.glareScore = sum(centerROI(:) > 250) / numel(centerROI);

% ── 2. Motion score ───────────────────────────────────────────────────────
% 1D finite-difference filters in each axis
grayD = double(gray);
filtH = imfilter(grayD, [1 -1],   'replicate');   % horizontal differences
filtV = imfilter(grayD, [1; -1],  'replicate');   % vertical differences

varH = var(filtH(:));
varV = var(filtV(:));

% Asymmetry between horizontal and vertical variance.
% Guard against division by zero when the image is nearly uniform.
denom = max(varH, varV);
if denom < 1e-10
    result.motionScore = 0;
else
    result.motionScore = abs(varH - varV) / denom;
end

% ── 3. Occlusion score ────────────────────────────────────────────────────
% Dark binary mask: pixels with intensity < 20 (dark enough to be an
% eyelash/eyelid, not just a vessel in the retinal interior)
darkMask = gray < 20;

% Find connected components that touch any border pixel.
% Approach: flood-fill from a 1-pixel-wide border frame set to true.
borderSeed = false(H, W);
borderSeed(1,:) = true; borderSeed(H,:) = true;
borderSeed(:,1) = true; borderSeed(:,W) = true;

% Only border pixels that are ALSO dark can seed the fill
borderSeed = borderSeed & darkMask;

% Grow seeds through the dark mask using bwselect / imdilate approach:
% imfill with a custom seed is complex; instead use bwlabel + border-touch check.
CC = bwconncomp(darkMask, 8);
borderTouchingArea = 0;
for k = 1:CC.NumObjects
    pixelList = CC.PixelIdxList{k};
    % Convert linear indices to [row, col]
    [rows, cols] = ind2sub([H, W], pixelList);
    touchesBorder = any(rows == 1) || any(rows == H) || ...
                    any(cols == 1) || any(cols == W);
    if touchesBorder
        borderTouchingArea = borderTouchingArea + numel(pixelList);
    end
end

result.occlusionScore = borderTouchingArea / numel(gray);

end
