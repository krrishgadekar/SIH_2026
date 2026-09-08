function verifyCameraCalibration()
% VERIFYCAMERACALIBRATION  Checks Task 6.3.
%
%   Run: matlab -batch "verifyCameraCalibration"
%
%   ── WHAT THIS CAN AND CANNOT ESTABLISH ─────────────────────────────────────
%   There is no multi-camera dataset here — every sample image comes from a
%   similar source. So this does NOT measure classification accuracy, and no
%   accuracy figure should be quoted from it. The family thresholds remain
%   hand-built and unvalidated.
%
%   What it DOES establish:
%     - the features separate synthetically-perturbed camera variants, so they
%       are discriminative in principle rather than constant;
%     - the chosen profile actually reaches the pixels. Task 6.3's DoD is
%       explicit about this, because the easy failure is to classify the camera,
%       store the family, show it on a dashboard, and never feed it back — at
%       which point everything looks implemented and no pixel differs.
%
%   The synthetic variants below double as the seed for Task 9.3's
%   portable-camera-perturbed test set.

thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, 'preprocessing'));
addpath(fullfile(thisDir, 'cameraCalibration'));

repoRoot = fullfile(thisDir, '..', '..', '..');
imgPath  = fullfile(repoRoot, 'datasets', '2.jpg');
if ~isfile(imgPath), error('verifyCameraCalibration: %s not found.', imgPath); end

raw = imread(imgPath);
failures = 0;

% ── Features are computed and discriminative ────────────────────────────────
fprintf('\n===== Task 6.3: camera-family classification =====\n');

variants = struct( ...
    'original',  raw, ...
    'portable',  simulatePortable(raw), ...
    'phone',     simulatePhone(raw));

names = fieldnames(variants);
fams  = cell(1, numel(names));

for k = 1:numel(names)
    [fam, d] = classifyCameraFamily(variants.(names{k}));
    fams{k} = fam;
    f = d.features;
    fprintf('\n--- %s ---\n', names{k});
    fprintf('  aspect %.2f | coverage %.2f | vignette sharpness %.2f | R/G %.2f\n', ...
            f.aspectRatio, f.retinalCoverage, f.vignetteSharpness, f.redGreenRatio);
    fprintf('  -> family ''%s'' (confidence %.2f)\n', fam, d.confidence);

    failures = failures + report('family is a known key', ...
        ismember(fam, {'desktop_tabletop','portable_handheld','smartphone_adapter','unknown'}), fam);
    failures = failures + report('features are finite', ...
        all(isfinite([f.aspectRatio f.retinalCoverage f.vignetteSharpness f.redGreenRatio])));
end

% The features must actually respond to camera characteristics. If every
% variant produced identical features, the classifier would be decorative.
[~, dOrig] = classifyCameraFamily(variants.original);
[~, dPhone] = classifyCameraFamily(variants.phone);
failures = failures + report('phone simulation changes the aspect ratio', ...
    abs(dPhone.features.aspectRatio - dOrig.features.aspectRatio) > 0.1, ...
    sprintf('%.2f vs %.2f', dPhone.features.aspectRatio, dOrig.features.aspectRatio));
failures = failures + report('phone simulation reduces retinal coverage', ...
    dPhone.features.retinalCoverage < dOrig.features.retinalCoverage, ...
    sprintf('%.2f vs %.2f', dPhone.features.retinalCoverage, dOrig.features.retinalCoverage));

[~, dPort] = classifyCameraFamily(variants.portable);
failures = failures + report('portable simulation softens the vignette edge', ...
    dPort.features.vignetteSharpness < dOrig.features.vignetteSharpness, ...
    sprintf('%.2f vs %.2f', dPort.features.vignetteSharpness, dOrig.features.vignetteSharpness));

% ── Reported-vs-detected mismatch ───────────────────────────────────────────
fprintf('\n--- reported-device cross-check ---\n');
[famA, dA] = classifyCameraFamily(raw, 'topcon_trc_nw400');   % desktop
[famB, dB] = classifyCameraFamily(raw, 'remidio_fop');        % phone adapter

fprintf('  detected ''%s''; reported topcon -> mismatch %d\n', famA, dA.mismatch);
fprintf('  detected ''%s''; reported remidio -> mismatch %d\n', famB, dB.mismatch);

failures = failures + report('detection ignores the reported device (image wins)', ...
    strcmp(famA, famB), sprintf('%s vs %s', famA, famB));
failures = failures + report('a conflicting report is flagged as a mismatch', ...
    dA.mismatch ~= dB.mismatch, ...
    sprintf('topcon %d, remidio %d', dA.mismatch, dB.mismatch));
failures = failures + report('the mismatch carries an explanation', ...
    (~dA.mismatch || ~isempty(dA.notes)) && (~dB.mismatch || ~isempty(dB.notes)));

[~, dNone] = classifyCameraFamily(raw, 'unknown');
failures = failures + report("device 'unknown' raises no mismatch", ~dNone.mismatch);

% ══ THE DoD: two profiles must produce DIFFERENT pixels ════════════════════
fprintf('\n===== DoD: the profile must reach the pixels =====\n');

oDesk  = preprocessForBranchA(raw, [], struct('cameraFamily', 'desktop_tabletop'));
oPort  = preprocessForBranchA(raw, [], struct('cameraFamily', 'portable_handheld'));
oPhone = preprocessForBranchA(raw, [], struct('cameraFamily', 'smartphone_adapter'));
oOff   = preprocessForBranchA(raw, [], struct('enableCameraCalibration', false));

dDeskPort  = meanAbsDiff(oDesk, oPort);
dDeskPhone = meanAbsDiff(oDesk, oPhone);

fprintf('  desktop vs portable   : %.2f grey levels mean difference\n', dDeskPort);
fprintf('  desktop vs smartphone : %.2f grey levels mean difference\n', dDeskPhone);

failures = failures + report('desktop and portable profiles differ visibly', ...
    dDeskPort > 1.0, sprintf('%.2f', dDeskPort));
failures = failures + report('desktop and smartphone profiles differ visibly', ...
    dDeskPhone > 1.0, sprintf('%.2f', dDeskPhone));
failures = failures + report('the stronger profile differs more', ...
    dDeskPhone > dDeskPort, sprintf('%.2f vs %.2f', dDeskPhone, dDeskPort));

% The neutral profile must be a genuine no-op, so an unrecognised camera is
% never made worse by a guessed correction.
oUnknown = preprocessForBranchA(raw, [], struct('cameraFamily', 'unknown'));
failures = failures + report('the neutral profile equals calibration-disabled', ...
    isequal(oUnknown, oOff), sprintf('%.4f', meanAbsDiff(oUnknown, oOff)));

% ── The clip limit is carried through, not just selected ───────────────────
fprintf('\n--- profile parameters reach adaptiveEnhance ---\n');
[~, sDesk]  = preprocessForBranchA(raw, [], struct('cameraFamily', 'desktop_tabletop'));
[~, sPhone] = preprocessForBranchA(raw, [], struct('cameraFamily', 'smartphone_adapter'));
fprintf('  desktop base clip %.3f -> applied %.3f\n', sDesk.baseClipLimit, sDesk.adaptive.clipLimit);
fprintf('  phone   base clip %.3f -> applied %.3f\n', sPhone.baseClipLimit, sPhone.adaptive.clipLimit);

failures = failures + report('profiles carry different base clip limits', ...
    sPhone.baseClipLimit > sDesk.baseClipLimit, ...
    sprintf('%.3f vs %.3f', sPhone.baseClipLimit, sDesk.baseClipLimit));
failures = failures + report('the base clip limit reaches the applied clip limit', ...
    abs(sPhone.adaptive.clipLimit - sPhone.baseClipLimit) < 1e-9, ...
    sprintf('%.3f vs %.3f', sPhone.adaptive.clipLimit, sPhone.baseClipLimit));

% Camera profile and quality score must COMPOSE, not overwrite each other.
dim = struct('illuminationScore', 0.30);
[~, sBoth] = preprocessForBranchA(raw, dim, struct('cameraFamily', 'smartphone_adapter'));
failures = failures + report('a dim image on a phone exceeds the phone baseline', ...
    sBoth.adaptive.clipLimit > sPhone.baseClipLimit, ...
    sprintf('%.3f vs %.3f', sBoth.adaptive.clipLimit, sPhone.baseClipLimit));

% ── Errors ──────────────────────────────────────────────────────────────────
fprintf('\n--- errors ---\n');
failures = failures + reportErr('rejects an unknown forced family', ...
    @() preprocessForBranchA(raw, [], struct('cameraFamily', 'not_a_camera')));

outDir = fullfile(tempdir, 'camera_calibration');
if ~isfolder(outDir), mkdir(outDir); end
imwrite(oDesk,  fullfile(outDir, 'profile_desktop.png'));
imwrite(oPort,  fullfile(outDir, 'profile_portable.png'));
imwrite(oPhone, fullfile(outDir, 'profile_smartphone.png'));
imwrite(variants.portable, fullfile(outDir, 'sim_portable_raw.png'));
imwrite(variants.phone,    fullfile(outDir, 'sim_phone_raw.png'));

fprintf('\n===== %s =====\n', ternary(failures == 0, ...
    'Task 6.3 verified (mechanism, not accuracy)', sprintf('%d FAILURE(S)', failures)));
fprintf('Images in %s\n', outDir);
fprintf(['NOTE: family thresholds are hand-built and unvalidated. No\n' ...
         'classification accuracy has been measured; do not quote one.\n\n']);

if failures > 0, error('verifyCameraCalibration: %d check(s) failed.', failures); end
end

% ── Synthetic camera variants ───────────────────────────────────────────────
function out = simulatePortable(img)
% Softer vignette edge, warmer cast, stronger corner falloff.
[H, W, ~] = size(img);
gray = rgb2gray(img);
retina = imfill(gray > 15, 'holes');
st = regionprops(bwareafilt(retina, 1), 'Centroid', 'EquivDiameter');
cx = st(1).Centroid(1); cy = st(1).Centroid(2); r = st(1).EquivDiameter / 2;

[xx, yy] = meshgrid(1:W, 1:H);
rn = hypot(xx - cx, yy - cy) / r;

% Gradual falloff instead of a hard optical edge.
falloff = max(0, 1 - 0.55 * max(0, rn - 0.55) / 0.45);
falloff = imgaussfilt(falloff, 12);

out = double(img);
for c = 1:3
    out(:,:,c) = out(:,:,c) .* falloff;
end
out(:,:,1) = out(:,:,1) * 1.10;    % warm cast
out(:,:,3) = out(:,:,3) * 0.92;
out = uint8(max(0, min(255, out)));
end

function out = simulatePhone(img)
% Small retinal circle inside a tall phone frame, soft edge.
small = imresize(simulatePortable(img), 0.55);
[h, w, ~] = size(small);
H = round(h * 1.7); W = round(w * 1.0);
out = zeros(H, W, 3, 'uint8');
y0 = round((H - h) / 2); x0 = round((W - w) / 2);
out(y0+1:y0+h, x0+1:x0+w, :) = small;
out = imgaussfilt(out, 1.2);
end

% ── Harness ─────────────────────────────────────────────────────────────────
function d = meanAbsDiff(a, b)
if ~isequal(size(a), size(b)), d = Inf; return; end
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
    fn(); fprintf('  FAIL  %s  [no error raised]\n', label); n = 1;
catch
    fprintf('  PASS  %s\n', label); n = 0;
end
end

function s = ternary(c, a, b)
if c, s = a; else, s = b; end
end
