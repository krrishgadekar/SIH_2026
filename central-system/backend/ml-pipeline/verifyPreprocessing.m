function verifyPreprocessing()
% VERIFYPREPROCESSING  Checks Task 2.1b (denoising) and Task 2.8 (adaptive).
%
%   Run: matlab -batch "verifyPreprocessing"
%
%   THE DENOISING CHECK IS NOT "DOES IT LOOK CLEANER".
%   A denoiser that removes small dark blobs scores well on every noise metric
%   and destroys the microaneurysms this whole system exists to find. So the
%   test injects synthetic microaneurysm-sized blobs at known locations and
%   counts how many survive. Retention, not smoothness, is the property that
%   matters.

thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, 'preprocessing'));

repoRoot = fullfile(thisDir, '..', '..', '..');
imgPath  = fullfile(repoRoot, 'datasets', '2.jpg');
if ~isfile(imgPath)
    error('verifyPreprocessing: %s not found.', imgPath);
end

raw     = imread(imgPath);
cropped = benGrahamCrop(raw, 512);

fprintf('\n===== Task 2.1b: denoising =====\n');
failures = 0;

% ── Microaneurysm retention ─────────────────────────────────────────────────
% Synthetic blobs, because the sample images have no lesion annotations. Sizes
% span the real microaneurysm range (~3-10 px at this resolution) and the blobs
% are dark on retina, as real ones are.
[withBlobs, centres, radii] = injectBlobs(cropped);
fprintf('injected %d synthetic microaneurysms, radii %s px\n', ...
        numel(radii), mat2str(radii));

methods = {'none', 'anisotropic'};
for m = 1:numel(methods)
    method = methods{m};
    t = tic;
    den = denoiseRetinal(withBlobs, method);
    elapsed = toc(t);

    [survived, contrasts] = countSurvivingBlobs(den, centres, radii, cropped);

    fprintf('\n--- method: %s (%.2fs) ---\n', method, elapsed);
    fprintf('    blobs still detectable: %d / %d\n', survived, numel(radii));
    fprintf('    mean blob contrast: %.1f grey levels\n', mean(contrasts));

    if strcmp(method, 'none')
        failures = failures + report('pass-through retains every blob', ...
            survived == numel(radii), sprintf('%d/%d', survived, numel(radii)));
        baselineContrast = mean(contrasts);
    else
        % The bar that matters: a denoiser may soften a microaneurysm, but it
        % must not delete it. Losing any is a failure.
        failures = failures + report('ALL microaneurysm-scale blobs survive denoising', ...
            survived == numel(radii), sprintf('%d/%d survived', survived, numel(radii)));
        retained = mean(contrasts) / baselineContrast;
        fprintf('    contrast retained vs undenoised: %.0f%%\n', 100 * retained);
        failures = failures + report('blob contrast retained above 60%', ...
            retained > 0.60, sprintf('%.0f%%', 100 * retained));
    end

    failures = failures + report('output is uint8 and the same size', ...
        isa(den, 'uint8') && isequal(size(den), size(withBlobs)));
end

% ── Noise IS actually reduced ───────────────────────────────────────────────
% Retention alone would be satisfied by doing nothing, so check the other half.
noisy   = imnoise(cropped, 'gaussian', 0, 0.002);
cleaned = denoiseRetinal(noisy, 'anisotropic');
nBefore = noiseEstimate(noisy);
nAfter  = noiseEstimate(cleaned);
fprintf('\n--- noise reduction ---\n');
fprintf('    high-frequency energy: %.2f -> %.2f\n', nBefore, nAfter);
failures = failures + report('denoising actually reduces noise', ...
    nAfter < nBefore, sprintf('%.2f -> %.2f', nBefore, nAfter));

failures = failures + reportErr('rejects an unknown method', ...
    @() denoiseRetinal(cropped, 'bogus'));

% ── Task 2.8 ────────────────────────────────────────────────────────────────
fprintf('\n===== Task 2.8: adaptive enhancement =====\n');

good = struct('focusScore', 0.85, 'illuminationScore', 0.90, 'glareScore', 0.01);
dim  = struct('focusScore', 0.85, 'illuminationScore', 0.30, 'glareScore', 0.01);
soft = struct('focusScore', 0.30, 'illuminationScore', 0.90, 'glareScore', 0.01);
glar = struct('focusScore', 0.85, 'illuminationScore', 0.90, 'glareScore', 0.35);

[oGood, aGood] = adaptiveEnhance(cropped, good);
[oDim,  aDim ] = adaptiveEnhance(cropped, dim);
[oSoft, aSoft] = adaptiveEnhance(cropped, soft);
[oGlar, aGlar] = adaptiveEnhance(withGlare(cropped), glar);

fprintf('good scores : %s\n', strjoin(aGood.reason, '; '));
fprintf('dim         : %s\n', strjoin(aDim.reason,  '; '));
fprintf('soft focus  : %s\n', strjoin(aSoft.reason, '; '));
fprintf('glare       : %s\n', strjoin(aGlar.reason, '; '));

failures = failures + report('good scores trigger NO adaptation', ...
    ~aGood.sharpening && ~aGood.glareAttenuation && aGood.clipLimit == 0.01);
failures = failures + report('dim image raises the CLAHE clip limit', ...
    aDim.clipLimit > aGood.clipLimit, sprintf('%.3f vs %.3f', aDim.clipLimit, aGood.clipLimit));
failures = failures + report('soft focus triggers sharpening', aSoft.sharpening);
failures = failures + report('soft focus does NOT raise the clip limit', ...
    aSoft.clipLimit == 0.01, sprintf('%.3f', aSoft.clipLimit));
failures = failures + report('glare triggers attenuation', aGlar.glareAttenuation);
failures = failures + report('good scores do NOT trigger glare attenuation', ...
    ~aGood.glareAttenuation);

% The whole point: different faults must produce DIFFERENT output.
failures = failures + report('dim output differs from the default chain', ...
    meanAbsDiff(oDim, oGood) > 1.0, sprintf('%.2f grey levels', meanAbsDiff(oDim, oGood)));
failures = failures + report('soft-focus output differs from the default chain', ...
    meanAbsDiff(oSoft, oGood) > 1.0, sprintf('%.2f grey levels', meanAbsDiff(oSoft, oGood)));

failures = failures + report('missing scores fall back to the default chain', ...
    isequal(adaptiveEnhance(cropped, struct()), oGood));
failures = failures + report('empty scores fall back to the default chain', ...
    isequal(adaptiveEnhance(cropped, []), oGood));

failures = failures + report('output is uint8, same size', ...
    isa(oDim, 'uint8') && isequal(size(oDim), size(cropped)));

outDir = fullfile(tempdir, 'preprocessing_check');
if ~isfolder(outDir), mkdir(outDir); end
imwrite(oGood, fullfile(outDir, 'adaptive_default.png'));
imwrite(oDim,  fullfile(outDir, 'adaptive_dim.png'));
imwrite(oSoft, fullfile(outDir, 'adaptive_softfocus.png'));
imwrite(oGlar, fullfile(outDir, 'adaptive_glare.png'));

fprintf('\n===== %s =====\n', ternary(failures == 0, ...
    'Tasks 2.1b and 2.8 verified', sprintf('%d FAILURE(S)', failures)));
fprintf('Comparison images in %s\n\n', outDir);

if failures > 0, error('verifyPreprocessing: %d check(s) failed.', failures); end
end

% ── Helpers ─────────────────────────────────────────────────────────────────
function [out, centres, radii] = injectBlobs(img)
% Dark circular blobs at microaneurysm scale, placed on retina.
out = img;
[H, W, ~] = size(img);
radii   = [2 3 4 5 6 8];
centres = zeros(numel(radii), 2);
% Spread across the middle of the frame, clear of the black surround.
xs = round(linspace(0.30 * W, 0.70 * W, numel(radii)));
ys = round(linspace(0.35 * H, 0.65 * H, numel(radii)));
[xx, yy] = meshgrid(1:W, 1:H);
for k = 1:numel(radii)
    centres(k, :) = [xs(k), ys(k)];
    m = (xx - xs(k)).^2 + (yy - ys(k)).^2 <= radii(k)^2;
    for c = 1:3
        ch = out(:,:,c);
        % Darken to ~45% of local value: a real microaneurysm is a dark red
        % dot, distinctly darker than retina but not black.
        ch(m) = uint8(double(ch(m)) * 0.45);
        out(:,:,c) = ch;
    end
end
end

function [survived, contrasts] = countSurvivingBlobs(img, centres, radii, ~)
% A blob "survived" if it is still measurably darker than its immediate
% surround. Measured on green, where retinal lesions have the most contrast.
g = double(img(:,:,2));
[H, W] = size(g);
[xx, yy] = meshgrid(1:W, 1:H);
survived = 0;
contrasts = zeros(1, numel(radii));
for k = 1:numel(radii)
    cx = centres(k,1); cy = centres(k,2); r = radii(k);
    inside = (xx - cx).^2 + (yy - cy).^2 <= r^2;
    ring   = (xx - cx).^2 + (yy - cy).^2 <= (r + 4)^2 & ~inside;
    if ~any(inside(:)) || ~any(ring(:)), continue; end
    contrast = mean(g(ring)) - mean(g(inside));
    contrasts(k) = contrast;
    % 8 grey levels: comfortably above sensor noise, well below the ~60 the
    % injected blobs start at, so this detects "still clearly there" rather
    % than "mathematically non-zero".
    if contrast > 8, survived = survived + 1; end
end
end

function v = noiseEstimate(img)
% High-frequency energy: image minus its own slight blur.
g = double(rgb2gray(img));
v = std2(g - imgaussfilt(g, 1));
end

function out = withGlare(img)
out = img;
[H, W, ~] = size(img);
[xx, yy] = meshgrid(1:W, 1:H);
m = ((xx - W*0.45)/40).^2 + ((yy - H*0.45)/30).^2 <= 1;
for c = 1:3
    ch = out(:,:,c); ch(m) = 253; out(:,:,c) = ch;
end
end

function d = meanAbsDiff(a, b)
d = mean(abs(double(a(:)) - double(b(:))));
end

function n = report(label, ok, detail)
if ok
    fprintf('  PASS  %s\n', label); n = 0;
else
    fprintf('  FAIL  %s', label);
    if nargin > 2, fprintf('  [%s]', detail); end
    fprintf('\n'); n = 1;
end
end

function n = reportErr(label, fn)
try
    fn();
    fprintf('  FAIL  %s  [no error raised]\n', label); n = 1;
catch
    fprintf('  PASS  %s\n', label); n = 0;
end
end

function s = ternary(c, a, b)
if c, s = a; else, s = b; end
end
