function report = comparePreprocessingRecipes(imagePath, opts)
% COMPAREPREPROCESSINGRECIPES  How far apart are the two preprocessing chains?
%
%   report = comparePreprocessingRecipes()             % uses datasets/2.jpg
%   report = comparePreprocessingRecipes(imagePath, opts)
%
%   opts:
%     .outputDir  where the side-by-side PNGs go
%     .quiet      suppress the printed report
%
%   ── WHY THIS EXISTS ────────────────────────────────────────────────────────
%   Branch A (Model1, 2026-09-09) was trained on a PYTHON preprocessing chain:
%   ben_graham.py then clahe_enhance.py. This repo's serving path uses a MATLAB
%   chain: preprocessForBranchA.m. They are not the same chain.
%
%   A model only ever sees what preprocessing hands it. Train it on one chain
%   and serve it another and nothing errors — no exception, no warning, no
%   failed test. The model simply performs worse than its reported numbers, on
%   every case, for a reason invisible from the outside. That is train/serve
%   skew, and it is the failure this project has flagged as its highest silent
%   risk since the model-handoff guide was written.
%
%   This turns "the two chains are different" into a number.
%
%   ── WHY THEIR CHAIN IS RE-IMPLEMENTED HERE INSTEAD OF CALLED ───────────────
%   Running their actual Python needs OpenCV, which is not installed (they use
%   a conda env that does not exist on this machine). Porting their recipe into
%   MATLAB is not merely a workaround, though — it is the better controlled
%   experiment: with both chains in one runtime, any difference measured is a
%   difference of RECIPE, not of OpenCV-versus-MATLAB implementations of the
%   same idea.
%
%   The cost is that this port is faithful to their SOURCE, not bit-identical
%   to their BINARY. cv2.createCLAHE and adapthisteq do not use the same clip
%   normalisation, and INTER_AREA and imresize differ slightly. So the numbers
%   below are a solid lower bound on the divergence, and the honest confirmation
%   is to `pip install opencv-python` and diff against their real output.

if nargin < 1 || isempty(imagePath)
    thisDir = fileparts(mfilename('fullpath'));
    imagePath = fullfile(thisDir, '..', '..', '..', 'datasets', '2.jpg');
end
if nargin < 2, opts = struct(); end
outputDir = getdef(opts, 'outputDir', tempdir);

thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, 'preprocessing'));
addpath(fullfile(thisDir, 'cameraCalibration'));
addpath(fullfile(thisDir, 'segmentation'));

raw = imread(imagePath);

% ── The two chains ─────────────────────────────────────────────────────────
theirs = tanujChain(raw, 384);
[mine, ~] = preprocessForBranchA(raw, [], struct());

report.imagePath = imagePath;
report.rawSize   = size(raw);
report.theirSize = size(theirs);
report.mineSize  = size(mine);

% ── Difference 1: the output is not even the same shape ────────────────────
% Worth stating first because it is categorical, not a matter of degree: the
% network has a fixed input size, so if the serving chain emits a different
% one, something silently resizes it — adding a resampling step that was never
% part of training.
report.sizeMatches = isequal(size(theirs, 1), size(mine, 1)) ...
                  && isequal(size(theirs, 2), size(mine, 2));

% Compare on common ground. Mine is resized to THEIR size, because their size
% is the one the trained network actually requires.
mineR = imresize(mine, [size(theirs, 1) size(theirs, 2)]);

A = double(theirs);
B = double(mineR);

% ── Difference 2: pixel-level divergence ───────────────────────────────────
d = abs(A - B);
report.meanAbsDiff   = mean(d(:));
report.medianAbsDiff = median(d(:));
report.p95AbsDiff    = prctileLocal(d(:), 95);
report.maxAbsDiff    = max(d(:));
report.rmse          = sqrt(mean((A(:) - B(:)).^2));

% As a percentage of the 0-255 range, which is the intuitive form.
report.meanAbsDiffPercent = 100 * report.meanAbsDiff / 255;

% ── Difference 3: are they even correlated? ────────────────────────────────
% Mean difference alone can hide a constant offset, which a network largely
% tolerates. Correlation asks whether the STRUCTURE survived — that is what a
% convolutional model keys on.
report.correlation = corr(A(:), B(:));

% SSIM on luminance: perceptual/structural agreement, the closest single number
% to "would these look like the same input to a vision model".
report.ssim = ssim(im2gray(im2uint8(mineR)), im2gray(im2uint8(theirs)));

% ── Difference 4: intensity statistics ─────────────────────────────────────
% A network's first layer responds to absolute intensity. A systematic shift in
% mean or spread is a systematic shift in every activation downstream.
report.theirMean = mean(A(:));   report.mineMean = mean(B(:));
report.theirStd  = std(A(:));    report.mineStd  = std(B(:));
report.meanShift = report.mineMean - report.theirMean;
report.stdRatio  = report.mineStd / report.theirStd;

% ── Artefacts ──────────────────────────────────────────────────────────────
if ~exist(outputDir, 'dir'), mkdir(outputDir); end
report.theirPath = fullfile(outputDir, 'recipe_tanuj.png');
report.minePath  = fullfile(outputDir, 'recipe_ours.png');
report.diffPath  = fullfile(outputDir, 'recipe_difference.png');
imwrite(im2uint8(theirs), report.theirPath);
imwrite(im2uint8(mineR),  report.minePath);
% Amplified 3x so the structure of the disagreement is visible rather than a
% near-black square.
imwrite(im2uint8(mat2gray(mean(d, 3)) * 3), report.diffPath);

sideBySide = [im2uint8(theirs), im2uint8(mineR)];
report.sideBySidePath = fullfile(outputDir, 'recipe_side_by_side.png');
imwrite(sideBySide, report.sideBySidePath);

if ~getdef(opts, 'quiet', false)
    printReport(report);
end
end

% ═══════════════════════════════════════════════════════════════════════════
function out = tanujChain(image, targetSize)
% Faithful MATLAB port of ben_graham.py -> clahe_enhance.py.
%
% Their code reads BGR because that is what cv2.imread returns. Channel index 1
% is green in BOTH BGR and RGB, so the green-channel step ports directly; the
% LAB conversion is colour-order sensitive and is done in RGB here, matching
% what their code does to its own BGR input.

% -- ben_graham_preprocess -------------------------------------------------
% Step 1: threshold the green channel at >7, close with a 15x15 ellipse, crop
% to the largest connected region's bounding box.
green = image(:, :, 2);
mask = green > 7;
mask = imclose(mask, strel('disk', 7));        % ~15x15 ellipse

cc = bwconncomp(mask);
if cc.NumObjects > 0
    numPix = cellfun(@numel, cc.PixelIdxList);
    [~, k] = max(numPix);
    biggest = false(size(mask));
    biggest(cc.PixelIdxList{k}) = true;
    stats = regionprops(biggest, 'BoundingBox');
    bb = stats(1).BoundingBox;
    x = max(1, floor(bb(1))); y = max(1, floor(bb(2)));
    w = min(round(bb(3)), size(image, 2) - x + 1);
    h = min(round(bb(4)), size(image, 1) - y + 1);
    cropped = image(y:y+h-1, x:x+w-1, :);
else
    cropped = image;
end
if isempty(cropped), cropped = image; end

% Step 2: resize to targetSize square. INTER_AREA ~ 'box' with antialiasing.
resized = imresize(cropped, [targetSize targetSize], 'box');

% Step 3: sigma = targetSize/30; out = clip(4*img - 4*blur + 128)
sigma = targetSize / 30;
blurred = imgaussfilt(double(resized), sigma, 'FilterSize', 2*floor(sigma)+1);
enhanced = 4 * double(resized) - 4 * blurred + 128;
enhanced = uint8(min(255, max(0, enhanced)));

% -- clahe_enhance ---------------------------------------------------------
% CLAHE on the L channel of LAB only. NOTE: cv2's clipLimit=2.0 and
% adapthisteq's ClipLimit are on different scales; 0.01 is the closest
% commonly-used equivalent. This is the least exact part of the port.
lab = rgb2lab(enhanced);
L = lab(:, :, 1) / 100;
L = adapthisteq(L, 'ClipLimit', 0.01, 'NumTiles', [8 8]);
lab(:, :, 1) = L * 100;
out = lab2rgb(lab, 'OutputType', 'uint8');
end

% ═══════════════════════════════════════════════════════════════════════════
function printReport(r)
fprintf('\n===============================================================\n');
fprintf('  PREPROCESSING RECIPE COMPARISON\n');
fprintf('  %s\n', r.imagePath);
fprintf('===============================================================\n\n');

fprintf('Raw image            : %s\n', mat2str(r.rawSize));
fprintf('Tanuj chain output   : %s   (ben_graham.py -> clahe_enhance.py)\n', mat2str(r.theirSize));
fprintf('Our chain output     : %s   (preprocessForBranchA.m)\n', mat2str(r.mineSize));
if r.sizeMatches
    fprintf('  sizes match.\n');
else
    fprintf('  *** SIZES DO NOT MATCH ***\n');
    fprintf('  The trained network takes %dx%d. Our chain emits a different size,\n', ...
        r.theirSize(1), r.theirSize(2));
    fprintf('  so something must silently resize it -- a resampling step that was\n');
    fprintf('  never part of training. Comparison below resizes ours to theirs.\n');
end

fprintf('\n--- Pixel divergence (0-255 scale) ---\n');
fprintf('mean |difference|    : %7.2f  (%.1f%% of full range)\n', ...
    r.meanAbsDiff, r.meanAbsDiffPercent);
fprintf('median |difference|  : %7.2f\n', r.medianAbsDiff);
fprintf('95th percentile      : %7.2f\n', r.p95AbsDiff);
fprintf('max |difference|     : %7.2f\n', r.maxAbsDiff);
fprintf('RMSE                 : %7.2f\n', r.rmse);

fprintf('\n--- Structure ---\n');
fprintf('correlation          : %7.4f   (1.0 = identical structure)\n', r.correlation);
fprintf('SSIM                 : %7.4f   (1.0 = perceptually identical)\n', r.ssim);

fprintf('\n--- Intensity statistics ---\n');
fprintf('                        theirs     ours\n');
fprintf('mean                 : %8.2f %8.2f   (shift %+.2f)\n', ...
    r.theirMean, r.mineMean, r.meanShift);
fprintf('std dev              : %8.2f %8.2f   (ratio %.3f)\n', ...
    r.theirStd, r.mineStd, r.stdRatio);

fprintf('\n--- Images written ---\n');
fprintf('  %s\n  %s\n  %s\n  %s\n', ...
    r.theirPath, r.minePath, r.diffPath, r.sideBySidePath);
fprintf('===============================================================\n');
end

function q = prctileLocal(v, p)
v = sort(v(:)); n = numel(v);
if n == 0, q = NaN; return; end
pos = 1 + (p/100) * (n - 1);
lo = floor(pos); hi = ceil(pos);
if lo == hi, q = v(lo); else, q = v(lo) + (pos-lo) * (v(hi)-v(lo)); end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
