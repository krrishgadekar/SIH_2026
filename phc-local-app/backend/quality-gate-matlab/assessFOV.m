function result = assessFOV(img)
% ASSESSFOV  Compute a field-of-view coverage score for a fundus image.
%
%   result = assessFOV(img)
%
%   Input:
%     img    - HxWx3 uint8 RGB image.
%
%   Output:
%     result - scalar struct with fields:
%                .score           double in [0, 1].
%                .coveragePercent double in [0, 1] — fraction of pixels
%                                 belonging to the retinal disc, used
%                                 directly by qualityGateMain.m for the
%                                 insufficient_fov decision threshold.
%
%   Algorithm (revised from Task 1.3 spec after real-image validation):
%     The spec used imbinarize(..., 'adaptive', 'Sensitivity', 0.4).
%     Tested on datasets/2.jpg (real fundus):
%       Adaptive result: coveragePercent = 0.019  (DoD FAIL — expected ≥ 0.6)
%     Root cause: adaptive binarization computes a LOCAL threshold — inside the
%     retinal disc it sees relatively dark tissue and classifies most of it as
%     background, picking up only the brightest specular highlights.
%
%     Fix: global threshold at a very low intensity value (15/255).
%     Fundus cameras produce a near-zero-intensity black border and a retinal
%     disc with intensity consistently > 20.  A threshold of 15 cleanly
%     separates the two without any per-camera tuning.
%     imfill('holes') then closes dark interior regions (vessels, lesions)
%     so the entire disc area is counted, not just the bright patches.
%
%   Steps:
%     1. Convert to greyscale.
%     2. Global threshold at 15: black border → 0, retinal disc → 1.
%     3. Fill holes in the binary mask (vessels, lesions, dark regions).
%     4. Find the largest connected component (= the retinal disc).
%     5. coveragePercent = disc area / total pixel count.
%     6. score = min(1, coveragePercent / 0.6)  — full score at ≥ 60% coverage.

% Step 1 — greyscale
gray = rgb2gray(img);

% Step 2 — global threshold at 15/255
%   Black border pixels: intensity ≈ 0–5.
%   Retinal disc pixels: intensity > 20 everywhere (even in dark vessels).
%   Threshold = 15 is conservative: avoids any border bleed-in.
bw = gray > 15;

% Step 3 — fill holes so the disc area is solid
%   Dark vessels and lesions create 'holes' in the binary mask; imfill
%   closes them so the whole disc is counted, not just bright patches.
bw = imfill(bw, 'holes');

% Step 4 — area of the largest connected component (the retinal disc)
props = regionprops(bw, 'Area');
if isempty(props)
    largestArea = 0;
else
    largestArea = max([props.Area]);
end

% Step 5 — coverage fraction
result.coveragePercent = largestArea / numel(gray);

% Step 6 — normalise to [0, 1], targeting >= 60% coverage for a full score
result.score = min(1, result.coveragePercent / 0.6);

end
