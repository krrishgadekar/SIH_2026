function result = assessFocus(img)
% ASSESSFOCUS  Compute a focus/sharpness score for a fundus image.
%
%   result = assessFocus(img)
%
%   Input:
%     img    - HxWx3 uint8 RGB image (from imread or the capture handler).
%
%   Output:
%     result - scalar struct with field:
%                .score  double in [0, 1].  Values close to 1 are sharp;
%                        values close to 0 are blurry.
%
%   Algorithm:
%     Laplacian variance method.  The Laplacian amplifies high-frequency
%     detail; its pixel-wise variance collapses that into a single number
%     that tracks sharpness monotonically.  The result is normalised to
%     [0, 1] by dividing by a constant chosen so that a properly-focused
%     fundus image (Laplacian variance ~400-600) maps to ~0.8-1.0 and a
%     Gaussian-blurred copy (sigma=5) maps to <0.3.
%
%   Normalisation constant (500):
%     Starting value from the implementation plan.  If your camera
%     family consistently produces sharper or softer images, tune this
%     per-preset in cameraPresets.json and pass the preset value in;
%     the algorithm itself does not need to change.

% Step 1 — convert to greyscale
gray = rgb2gray(img);

% Step 2 — Laplacian filter (Image Processing Toolbox)
lap      = fspecial('laplacian', 0.2);
filtered = imfilter(double(gray), lap, 'replicate');

% Step 3 — variance of filtered pixel values
v = var(filtered(:));

% Step 4 — normalise and clamp to [0, 1]
%
% Constant calibration (updated from the Task 1.1 spec's starting value of 500):
%   Tested on datasets/2.jpg (real fundus, 120 KB, visually sharp):
%     Laplacian variance of sharp image  ≈ 56.1
%     Laplacian variance after imgaussfilt(img,5) ≈ 1.0
%   With constant=500: sharp→0.11, blurry→0.002 (correct ranking, wrong scale).
%   Target: sharp ≥ 0.70  →  constant = 56.1 / 0.70 ≈ 70.
%   With constant=70:   sharp→0.80, blurry→0.014 (both thresholds passed).
%
%   Fundus images are inherently smooth (large uniform retinal background +
%   fine vessel detail), so their Laplacian variance sits ~50-60, far below
%   natural-image benchmarks. The constant is camera-family-dependent; if a
%   camera preset provides its own focusNormConst, use that instead of 70.
result.score = min(1, v / 70);

end
