function verifyPhase4()
% VERIFYPHASE4  Check the Phase 4 components that are buildable without datasets.
%
%   Covers Task 4.5 (optic disc / fovea), Task 4.1's classical half (Frangi
%   vessel segmentation) and Task 4.4 (NV suspicion).
%
%   Tasks 4.2 and 4.3 are NOT covered: they train U-Nets on IDRiD's segmentation
%   subset, which is not downloaded. See datasets/README.md.
%
%   WHAT THIS CAN AND CANNOT ESTABLISH
%     There is no ground truth here — no DRIVE masks, no IDRiD coordinates. So
%     this checks the properties that are checkable without labels: correct
%     shapes and ranges, plausible geometry, determinism, and graceful failure.
%     It does NOT establish accuracy, and no accuracy number should be quoted
%     from it. Those require the datasets and Task 9.1's harness.
%
%   Writes annotated overlays to tempdir so the results can be inspected by eye,
%   which for segmentation is worth more than any assertion made here.

thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, 'preprocessing'));
addpath(fullfile(thisDir, 'segmentation'));

repoRoot = fullfile(thisDir, '..', '..', '..');
images = dir(fullfile(repoRoot, 'datasets', '*.jpg'));
images = [images; dir(fullfile(repoRoot, 'datasets', '*.webp'))];

if isempty(images)
    error('verifyPhase4: no sample images in datasets/.');
end

fprintf('\n===== Phase 4 verification (%d sample images) =====\n', numel(images));
fprintf('No ground truth available — checking shape, range and plausibility only.\n\n');

failures = 0;
outDir = fullfile(tempdir, 'phase4_overlays');
if ~isfolder(outDir), mkdir(outDir); end

for i = 1:numel(images)
    imgPath = fullfile(images(i).folder, images(i).name);
    fprintf('--- %s ---\n', images(i).name);

    % MATLAB's imread has no WebP support, and datasets/ contains .webp files.
    % Skip rather than abort: one unreadable sample must not take down the
    % check of every other image.
    try
        raw = imread(imgPath);
    catch readErr
        fprintf('  SKIP  cannot read: %s\n', strtrim(readErr.message));
        fprintf('        (MATLAB imread has no WebP support — convert to PNG/JPEG)\n\n');
        continue;
    end
    if size(raw, 3) ~= 3
        fprintf('  SKIP  not an RGB image\n\n'); continue;
    end

    % Crop only. NOT illuminationNormalize: it flattens exactly the large-scale
    % brightness the optic disc detector depends on (see opticDiscFovea).
    cropped = benGrahamCrop(raw, 512);
    [H, W, ~] = size(cropped);

    % ── Task 4.5 ────────────────────────────────────────────────────────────
    t = tic;
    [odX, odY, fX, fY] = opticDiscFovea(cropped);
    tOD = toc(t);

    failures = failures + report('optic disc inside the image', ...
        isfinite(odX) && odX >= 1 && odX <= W && odY >= 1 && odY <= H, ...
        sprintf('(%.0f, %.0f)', odX, odY));
    failures = failures + report('fovea inside the image', ...
        isfinite(fX) && fX >= 1 && fX <= W && fY >= 1 && fY <= H, ...
        sprintf('(%.0f, %.0f)', fX, fY));

    % The two must not coincide, or the disc-fovea axis is undefined and every
    % quadrant assignment downstream becomes arbitrary.
    sep = hypot(odX - fX, odY - fY);
    failures = failures + report('disc and fovea are meaningfully separated', ...
        sep > W / 8, sprintf('%.0f px apart (need > %.0f)', sep, W/8));

    % ── Task 4.1 ────────────────────────────────────────────────────────────
    % ── KNOWN: THE CONNECTIVITY CHECK BELOW FAILS HERE, AND THE MASK IS NOT
    %    THE ONE PRODUCTION PRODUCES ──────────────────────────────────────────
    % `cropped` is benGrahamCrop's output: resized to 512 WITH antialiasing,
    % which low-pass filters away the one-to-two-pixel structures the vessel
    % model keys on. The mask comes back as confetti -- largest connected
    % component 9-18% of the mask -- and the connectivity assertion below
    % reports that honestly rather than being relaxed to hide it.
    %
    % Production does not do this. segInfer.py's vessels() takes the ORIGINAL
    % image and does its own aspect-pad; on that input the same model gives a
    % properly connected tree (largest component ~55%, vessel fraction 0.0564,
    % MATLAB and Python agreeing to four decimals). So this is the HARNESS
    % feeding the vessel model the CLASSIFIER's preprocessing, not a defect in
    % vesselSegmentationUnet.
    %
    % NOT FIXED HERE because it cannot be fixed cleanly yet: odX/odY and the
    % overlay below are in `cropped` coordinates, so passing `raw` would return
    % a mask in a different space and silently misalign the NV score. The real
    % fix is for benGrahamCrop to return its crop box (as Python's
    % retinal_crop_box already does) so a raw-space mask can be mapped back.
    % Until then this check stays red and says why.
    t = tic;
    [vessels, method] = vesselSegmentationUnet(cropped);
    tVes = toc(t);

    coverage = nnz(vessels) / (H * W);
    failures = failures + report('vessel mask is logical and image-sized', ...
        islogical(vessels) && isequal(size(vessels), [H W]));
    % Vessels occupy roughly 8-15% of a fundus image. Well outside that means
    % the filter latched onto the background or found almost nothing.
    failures = failures + report('vessel coverage is plausible (2-30%)', ...
        coverage > 0.02 && coverage < 0.30, sprintf('%.1f%%', 100*coverage));
    failures = failures + report('reports which method produced the mask', ...
        ismember(method, {'unet','frangi'}), method);

    % A vessel tree is connected structure, not confetti. Comparing the largest
    % component against total area catches a mask that is mostly noise.
    cc = bwconncomp(vessels);
    if cc.NumObjects > 0
        sizes = cellfun(@numel, cc.PixelIdxList);
        largestFrac = max(sizes) / sum(sizes);
        failures = failures + report('mask forms a connected tree, not speckle', ...
            largestFrac > 0.20, sprintf('largest component = %.0f%% of mask', 100*largestFrac));
    end

    % ── Task 4.4 ────────────────────────────────────────────────────────────
    [nvScore, nvDetail] = neovascularizationSuspicion(vessels, [odX odY]);

    failures = failures + report('NV score is in [0,1]', ...
        isnumeric(nvScore) && nvScore >= 0 && nvScore <= 1, sprintf('%.4f', nvScore));
    failures = failures + report('NV detail marked valid', nvDetail.valid);
    failures = failures + report('NV output is labelled a suspicion signal', ...
        contains(nvDetail.note, 'NOT a validated'), nvDetail.note);

    % Brackets, not just a line continuation: MATLAB does NOT concatenate two
    % adjacent string literals split across '...' — it is a syntax error.
    fprintf(['    OD (%.0f,%.0f) fovea (%.0f,%.0f) | vessels %.1f%% via %s | ' ...
             'NV %.3f (density %.3f, tortuosity %.2f)\n'], ...
            odX, odY, fX, fY, 100*coverage, method, nvScore, ...
            nvDetail.density, nvDetail.tortuosity);
    fprintf('    timing: opticDiscFovea %.2fs, vessels %.2fs\n', tOD, tVes);

    % ── Overlay for eyeball inspection ──────────────────────────────────────
    % Computer Vision Toolbox (Task 4.6): insertObjectAnnotation is the right
    % tool for marking detections on an image, rather than hand-drawing pixels.
    overlay = labeloverlay(cropped, vessels, 'Colormap', [0 1 0], 'Transparency', 0.5);
    overlay = insertObjectAnnotation(overlay, 'circle', ...
        [odX odY W/16; fX fY W/24], {'optic disc', 'fovea'}, ...
        'Color', {'yellow', 'cyan'}, 'LineWidth', 2);
    [~, base] = fileparts(images(i).name);
    outPath = fullfile(outDir, [base '_phase4.png']);
    imwrite(overlay, outPath);
    fprintf('    overlay: %s\n\n', outPath);
end

% ── Graceful failure ────────────────────────────────────────────────────────
fprintf('--- Degenerate inputs ---\n');
[s0, d0] = neovascularizationSuspicion(false(100,100), [NaN NaN]);
failures = failures + report('NV returns 0 and valid=false with no disc', ...
    s0 == 0 && ~d0.valid, d0.note);

[s1, d1] = neovascularizationSuspicion(false(512,512), [256 256]);
failures = failures + report('NV returns 0 on an empty vessel mask', ...
    s1 == 0, sprintf('%.3f', s1));

fprintf('\n===== %s =====\n', ...
    ternary(failures == 0, 'Phase 4 (dataset-free parts) verified', ...
            sprintf('%d FAILURE(S)', failures)));
fprintf('Overlays in %s — LOOK AT THEM. For segmentation, visual inspection\n', outDir);
fprintf('tells you more than any assertion this script can make.\n');
fprintf('Tasks 4.2/4.3 remain blocked on IDRiD (see datasets/README.md).\n\n');
end

function n = report(label, ok, detail)
if ok
    fprintf('  PASS  %s\n', label);
    n = 0;
else
    fprintf('  FAIL  %s', label);
    if nargin > 2, fprintf('  [%s]', detail); end
    fprintf('\n');
    n = 1;
end
end

function s = ternary(c, a, b)
if c, s = a; else, s = b; end
end
