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
%
% ══ THAT CALIBRATION WAS FITTED TO ONE IMAGE, AND IT DID NOT TRANSFER ══════
%   The constant above was chosen so that a SINGLE image — datasets/2.jpg, at
%   1002x867 — scores 0.80. Measured later on 52 held-out IDRiD fundus
%   photographs (4288x2848), the same score lands at median 0.288, max 0.391.
%
%   The old focusThreshold of 0.40 sat ABOVE the maximum any of those clean
%   images reached, so the gate rejected 52 of 52 research-grade photographs as
%   'blur'. Shipped that way, no capture would ever pass and no case would ever
%   reach grading. The threshold is now 0.17 (cameraPresets.json), measured:
%   88.5% of clean images pass and 100% of JPEG-quality-10 images are rejected.
%   See central-system/backend/ml-pipeline/experiments/qualityGateCompression.py.
%
%   ── THE UNDERLYING CAUSE: THIS METRIC IS RESOLUTION-DEPENDENT ────────────
%   Laplacian variance is computed per pixel, so the same scene at a different
%   sensor resolution gives a different number. Downscaling an IDRiD image to
%   1002px wide — matching datasets/2.jpg — roughly DOUBLES its score
%   (e.g. 0.256 → 0.514). The constant fitted on a small image therefore cannot
%   be right for a large one.
%
%   ── WHY NORMALISING THE RESOLUTION IS *NOT* THE FIX ─────────────────────
%   The obvious repair is to resize to a canonical size before filtering. It
%   was tried and MUST NOT be adopted: downscaling averages away exactly the
%   high-frequency artefacts this gate needs to see. Measured, resizing to
%   1024px collapsed the separation between clean and JPEG-10 images from 2.8x
%   to 1.2x, and compression rejection fell from 100% to 9.6%.
%
%   So the resolution sensitivity is real and is deliberately LEFT IN, because
%   removing it removes the signal. The consequence is that the constant and
%   the threshold are only valid for a given camera's native resolution.
%
%   ── WHICH IS WHY PER-CAMERA PRESETS MATTER, AND ARE NOT IMPLEMENTED ─────
%   Two sources of genuinely good images differ by 2.8x on this metric
%   (datasets/2.jpg 56.1 vs IDRiD median 20.1 Laplacian variance). A single
%   global threshold cannot be right for both. cameraPresets.json currently
%   holds only "default", so every call passing a real camera id silently falls
%   back to it and the id is ignored without anyone being told.
%
%   ── WHAT 0.17 IS AND IS NOT ─────────────────────────────────────────────
%   It is measured, not guessed, and it is a large improvement on a value that
%   rejected everything. It is NOT validated for the target hardware: n=52 from
%   one dataset captured on a Kowa VX-10, a mydriatic desk unit, not the
%   portable cameras this system is for. Those are best-case images, so 0.17
%   may still be too strict for a usable portable capture. It also separates
%   clean-from-compressed, not usable-from-unusable. Re-fit it on real captures
%   before any deployment.
result.score = min(1, v / 70);

end
