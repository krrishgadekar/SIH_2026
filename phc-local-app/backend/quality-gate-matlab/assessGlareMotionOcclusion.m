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

% ══ WHAT THIS USED TO MEASURE, AND WHY IT WAS WRONG ═══════════════════════
% The previous version counted every dark connected component TOUCHING THE
% IMAGE BORDER, over the whole frame area. In a fundus photograph the black
% surround around the retinal circle is exactly that: dark, border-touching,
% and large. So the score was dominated by how much empty frame the camera
% leaves around the retina — it measured FRAMING, not occlusion.
%
% Measured: 52 IDRiD images (4288x2848, wide black side-bands) all scored
% 0.3086-0.3106, while datasets/2.jpg (tightly cropped) scores 0.14. The 0.20
% threshold was set just above that single tight image, so every image from a
% differently-framed camera failed as 'eyelash_occlusion' — 46 of 52 clean
% research-grade photographs, once the focus threshold stopped masking it.
%
% Note the two numbers, 0.14 and 0.31, are both from perfectly good images.
% No threshold on this quantity could have separated occlusion from framing.
%
% ══ WHAT IT MEASURES NOW ══════════════════════════════════════════════════
% Dark pixels INSIDE the expected retinal disc, as a fraction of that disc.
% An eyelash or eyelid intrudes into the retina; the surround does not. This
% is framing-invariant: a tightly cropped image and a letterboxed one score
% the same, which is the property the old metric lacked.
%
% The disc is the CONVEX HULL of the bright region, not the bright region
% itself. That matters for the case this check exists to catch: a dark bar
% across the retina is excluded from the bright region, so measuring "dark
% inside the bright area" would shrink the region around the occlusion and
% report nothing. The hull spans the bar, because retina remains on both
% sides of it, and the bar is then counted as the intrusion it is.
%
% gray > 7 is the same "inside the retina" rule ben_graham crops with and the
% Grad-CAM ROI safeguard uses, so the term means one thing across the project.
brightMask = gray > 7;
brightMask = imclose(brightMask, strel('disk', 7));

% Small specks are dropped, but the hull is then taken over ALL remaining
% bright regions rather than only the largest.
%
% That distinction is the whole test. A bar across the retina SPLITS the
% bright region into two components; keeping only the largest would hull just
% one half, place the bar outside the hull, and report nothing. Measured on a
% synthetic bar, largest-component-only moved the score from 0.0143 to 0.0165
% between a 2% and a 30% occlusion — i.e. it was blind to exactly the thing it
% exists to detect. Taking the union spans the gap, and the bar is counted.
%
% 1% of frame area removes sensor noise and stray highlights while keeping any
% retinal fragment large enough to matter.
brightMask = bwareaopen(brightMask, round(0.01 * numel(gray)));

if ~any(brightMask(:))
    % No retina found at all. That is not an occlusion measurement — assessFOV
    % is the check that should fail here — so this reports 0 rather than
    % inventing a number from an image it could not interpret.
    result.occlusionScore = 0;
else
    discMask = bwconvhull(brightMask);
    discArea = sum(discMask(:));
    if discArea == 0
        result.occlusionScore = 0;
    else
        result.occlusionScore = sum(darkMask(:) & discMask(:)) / discArea;
    end
end

end
