function report = verifyModel1Port(imagePath, referencePath, opts)
% VERIFYMODEL1PORT  Check preprocessModel1.m against the real training output.
%
%   report = verifyModel1Port(imagePath, referencePath)
%   report = verifyModel1Port(imagePath, referencePath, opts)
%
%   opts:
%     .calibrateClip  false - sweep adapthisteq's ClipLimit and report the
%                             value that best matches the reference
%     .clipRange   [0.002 0.03]
%     .clipSteps   15
%
%   referencePath is the PNG written by exportReferencePreprocessing.py, i.e.
%   the output of the ACTUAL Python chain the model was trained on.
%
%   ── WHAT THIS SETTLES ──────────────────────────────────────────────────────
%   comparePreprocessingRecipes.m compares two MATLAB implementations, both
%   written from the same source by the same author on the same afternoon. Two
%   such files agreeing is weak evidence: a misreading of the Python appears in
%   both and cancels out.
%
%   This compares against the Python's actual output, which is the only
%   comparison that can catch a misread.
%
%   ── THE CLIP-LIMIT CALIBRATION ─────────────────────────────────────────────
%   One parameter could not be derived from source. cv2.createCLAHE takes
%   clipLimit as a multiplier on the average histogram bin count; adapthisteq
%   takes a fraction in [0,1]. There is no published conversion, so
%   preprocessModel1 uses 0.0078, reasoned from tile geometry.
%
%   With the reference output available that guess becomes unnecessary: sweep
%   the parameter and read off the value that actually minimises the
%   difference. That replaces an argument with a measurement, which is the
%   whole reason to install OpenCV for this.

if nargin < 3, opts = struct(); end
calibrate = getdef(opts, 'calibrateClip', false);

thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, 'preprocessing'));

if exist(referencePath, 'file') ~= 2
    error('verifyModel1Port:noReference', ...
          ['No reference at %s. Generate it first:\n' ...
           '  python exportReferencePreprocessing.py <image> --out <dir>'], ...
          referencePath);
end

raw = imread(imagePath);

% The reference PNG was written by cv2.imwrite, which takes BGR and stores it
% as ordinary RGB in the file. imread therefore returns it already in RGB
% order, matching what preprocessModel1 produces. Getting this backwards would
% swap red and blue and report a large difference that is purely a channel
% ordering bug -- and in a fundus image the red channel carries most of the
% signal, so the result would look plausibly wrong rather than obviously wrong.
reference = imread(referencePath);

mine = preprocessModel1(raw);

report.imagePath     = imagePath;
report.referencePath = referencePath;
report.referenceSize = size(reference);
report.mineSize      = size(mine);
report.sizeMatches   = isequal(size(reference), size(mine));

if ~report.sizeMatches
    error('verifyModel1Port:sizeMismatch', ...
          ['Port produced %s, reference is %s. Sizes must match before any ' ...
           'pixel comparison means anything.'], ...
          mat2str(size(mine)), mat2str(size(reference)));
end

report.atDefault = diffStats(reference, mine);

% ── Sweep the one uncertain parameter ──────────────────────────────────────
if calibrate
    range = getdef(opts, 'clipRange', [0.002 0.03]);
    steps = getdef(opts, 'clipSteps', 15);
    clips = linspace(range(1), range(2), steps);

    best = struct('clip', NaN, 'meanAbsDiff', Inf);
    sweep = zeros(numel(clips), 3);

    for k = 1:numel(clips)
        candidate = preprocessModel1(raw, struct('clipLimit', clips(k)));
        s = diffStats(reference, candidate);
        sweep(k, :) = [clips(k), s.meanAbsDiff, s.ssim];
        if s.meanAbsDiff < best.meanAbsDiff
            best.clip = clips(k);
            best.meanAbsDiff = s.meanAbsDiff;
            best.ssim = s.ssim;
        end
    end

    report.sweep = sweep;
    report.bestClip = best;
    report.atBest = diffStats(reference, ...
        preprocessModel1(raw, struct('clipLimit', best.clip)));
end

if ~getdef(opts, 'quiet', false), printReport(report); end
end

% ═══════════════════════════════════════════════════════════════════════════
function s = diffStats(reference, candidate)
A = double(reference);
B = double(candidate);
d = abs(A - B);
s.meanAbsDiff = mean(d(:));
s.medianAbsDiff = median(d(:));
s.maxAbsDiff = max(d(:));
s.rmse = sqrt(mean((A(:) - B(:)).^2));
s.percentOfRange = 100 * s.meanAbsDiff / 255;
s.correlation = corr(A(:), B(:));
s.ssim = ssim(im2gray(im2uint8(candidate)), im2gray(im2uint8(reference)));
% Fraction of pixels within 2 grey levels -- a stricter, more honest read than
% a mean, which a few large errors can hide inside a sea of exact matches.
s.fractionWithin2 = mean(d(:) <= 2);
s.fractionWithin5 = mean(d(:) <= 5);
end

function printReport(r)
fprintf('\n=================================================================\n');
fprintf('  PORT VERIFICATION -- preprocessModel1.m vs the real Python\n');
fprintf('  image     : %s\n', r.imagePath);
fprintf('  reference : %s\n', r.referencePath);
fprintf('=================================================================\n');
fprintf('sizes match : %d   %s\n', r.sizeMatches, mat2str(r.mineSize));

printBlock('AT THE DEFAULT CLIP LIMIT (0.0078, reasoned from tile geometry)', ...
           r.atDefault);

if isfield(r, 'bestClip')
    fprintf('\n--- clip-limit sweep ---\n');
    fprintf('   clip     mean|diff|    SSIM\n');
    for k = 1:size(r.sweep, 1)
        marker = ' ';
        if abs(r.sweep(k,1) - r.bestClip.clip) < 1e-12, marker = '*'; end
        fprintf(' %s %.4f   %8.3f   %.4f\n', marker, r.sweep(k,1), r.sweep(k,2), r.sweep(k,3));
    end
    fprintf('\nBEST clip limit: %.4f  (default was 0.0078)\n', r.bestClip.clip);
    printBlock('AT THE MEASURED BEST CLIP LIMIT', r.atBest);
    fprintf('\nIf that differs from 0.0078, change the default in\n');
    fprintf('preprocessModel1.m -- a measured value beats a reasoned one.\n');
end
fprintf('=================================================================\n');
end

function printBlock(title, s)
fprintf('\n--- %s ---\n', title);
fprintf('mean |difference| : %7.3f grey levels (%.2f%% of range)\n', ...
    s.meanAbsDiff, s.percentOfRange);
fprintf('median            : %7.3f\n', s.medianAbsDiff);
fprintf('max               : %7.3f\n', s.maxAbsDiff);
fprintf('RMSE              : %7.3f\n', s.rmse);
fprintf('correlation       : %7.4f\n', s.correlation);
fprintf('SSIM              : %7.4f\n', s.ssim);
fprintf('pixels within 2   : %6.2f%%\n', 100 * s.fractionWithin2);
fprintf('pixels within 5   : %6.2f%%\n', 100 * s.fractionWithin5);
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
