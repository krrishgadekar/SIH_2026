function [odX, odY, foveaX, foveaY] = opticDiscFovea(img, opts)
% OPTICDISCFOVEA  Locate the optic disc and fovea centres.
%
%   [odX, odY, foveaX, foveaY] = opticDiscFovea(img)
%   [...] = opticDiscFovea(img, opts)
%
%   Input:
%     img  - HxWx3 uint8 fundus image. See the WHICH IMAGE note below: this
%            wants the CROPPED image, not the illumination-normalised one.
%     opts - optional struct:
%              .debug        false  - return a diagnostic overlay in opts
%              .discRadiusPx []     - override the searched radius range
%
%   Outputs:
%     odX, odY         - optic disc centre, pixels (NaN if not found)
%     foveaX, foveaY   - fovea centre estimate, pixels
%
%   Task 4.5. These two points define the optic-disc–fovea axis, which is what
%   makes the quadrant mapping in Tasks 4.2/4.3 possible — and quadrant counts
%   are what the ICDR rule engine (Task 5.1) actually grades on. So an error
%   here does not stay here: it rotates every lesion's quadrant assignment and
%   silently changes the rule engine's grade.
%
%   ── WHICH IMAGE TO PASS ────────────────────────────────────────────────────
%   Pass the output of benGrahamCrop, BEFORE illuminationNormalize.
%
%   The optic disc is found by being the brightest roughly-circular region.
%   illuminationNormalize subtracts a large-kernel Gaussian background estimate
%   specifically to flatten large-scale brightness variation — and the optic
%   disc IS large-scale brightness variation. Running this after it removes the
%   single feature the detector depends on.
%
%   gradingOrchestrator therefore has to keep the intermediate crop rather than
%   only the fully preprocessed image. That is a real ordering constraint on the
%   pipeline, not a preference.
%
%   ── WHAT THIS IS AND IS NOT ────────────────────────────────────────────────
%   Classical CV only: circular Hough plus a brightness prior. Design doc §6.4
%   specifies this refined by a regressor fine-tuned on IDRiD's 516-image
%   localization subset — that dataset is not downloaded, so the refinement does
%   not exist yet and this is the first pass alone. Accuracy is therefore
%   untested against ground truth; the DoD ("within roughly one disc diameter")
%   cannot be evaluated until IDRiD lands. Treat the coordinates as usable but
%   unvalidated, and say so.

if nargin < 2, opts = struct(); end
if ~isfield(opts, 'debug'), opts.debug = false; end

if size(img, 3) ~= 3
    error('opticDiscFovea: expected an HxWx3 RGB image.');
end

[H, W, ~] = size(img);

% ── Retinal mask: ignore the black surround ─────────────────────────────────
% Every statistic below would otherwise be dragged toward the border. Same
% gray>15 rule assessFOV and benGrahamCrop use, so the three agree on where the
% retina is rather than each deciding separately.
gray = rgb2gray(img);
retina = imfill(gray > 15, 'holes');
retina = bwareafilt(retina, 1);          % largest component only
if ~any(retina(:)), retina = true(H, W); end

% ── Channel choice ──────────────────────────────────────────────────────────
% The RED channel, not green and not luminance. The optic disc is bright in red
% and the retinal background is already red-saturated, so the disc stands out
% with the vessels suppressed — vessels are dark in green, which is why green is
% the right channel for vessel work and the wrong one here.
odChannel = double(img(:,:,1));
odChannel(~retina) = 0;

% Smooth away vessels crossing the disc, which otherwise fragment it into
% several small bright pieces and defeat the circular fit.
odSmooth = imgaussfilt(odChannel, max(3, round(min(H, W) / 100)));

% ── Circular Hough ──────────────────────────────────────────────────────────
% The optic disc is ~1/7 to ~1/12 of retinal width in a standard 45-degree
% fundus image. Deriving the range from the image size keeps this working at
% any resolution instead of hard-coding pixels.
if isfield(opts, 'discRadiusPx') && ~isempty(opts.discRadiusPx)
    rRange = opts.discRadiusPx;
else
    rRange = [round(W / 24), round(W / 10)];
end
rRange(1) = max(5, rRange(1));
rRange(2) = max(rRange(1) + 2, rRange(2));

odX = NaN; odY = NaN;
try
    normed = mat2gray(odSmooth);
    [centers, radii, metric] = imfindcircles(normed, rRange, ...
        'ObjectPolarity', 'bright', 'Sensitivity', 0.95, 'Method', 'TwoStage');
catch
    centers = []; radii = []; metric = [];
end

discRadius = NaN;

if ~isempty(centers)
    % Rank by Hough strength AND mean brightness, not strength alone. The
    % circular fit happily locks onto a bright border artefact or a large
    % exudate patch; requiring the candidate to also be genuinely bright is
    % what separates the disc from those.
    n = min(size(centers, 1), 10);
    score = zeros(n, 1);
    for k = 1:n
        m = circleMask(H, W, centers(k,1), centers(k,2), radii(k));
        inside = odSmooth(m & retina);
        if isempty(inside), score(k) = -Inf; continue; end
        score(k) = metric(k) * mean(inside);
    end
    [best, idx] = max(score);
    if isfinite(best)
        odX = centers(idx, 1);
        odY = centers(idx, 2);
        discRadius = radii(idx);
    end
end

if isnan(odX)
    % Fallback: brightest sustained region. imhmax suppresses shallow local
    % maxima first, so a single blown-out pixel cannot win.
    suppressed = imhmax(mat2gray(odSmooth), 0.15);
    suppressed(~retina) = 0;
    peak = suppressed >= max(suppressed(:)) * 0.98;
    peak = bwareafilt(peak, 1);
    st = regionprops(peak, 'Centroid', 'EquivDiameter');
    if ~isempty(st)
        odX = st(1).Centroid(1);
        odY = st(1).Centroid(2);
        discRadius = st(1).EquivDiameter / 2;
    end
end

if isnan(odX)
    warning('opticDiscFovea:noDisc', 'Optic disc not found; returning NaN.');
    foveaX = NaN; foveaY = NaN;
    return;
end

if isnan(discRadius) || discRadius <= 0
    discRadius = W / 16;
end

% ── Fovea ───────────────────────────────────────────────────────────────────
% The fovea sits roughly 2.5 disc diameters temporal to the disc, on the
% horizontal axis, and is the darkest structure on the retina.
%
% "Temporal" is left or right depending on which eye this is, and nothing in
% the metadata says which. So both sides are searched and the darker candidate
% wins — laterality is inferred from the image rather than assumed, because
% assuming it is wrong half the time.
offset = 2.5 * (2 * discRadius);
darkChannel = imgaussfilt(double(rgb2gray(img)), max(3, round(min(H,W)/80)));
darkChannel(~retina) = Inf;              % never pick the black surround

searchR = max(10, round(discRadius * 1.5));
best = Inf; foveaX = NaN; foveaY = NaN;

for dir = [-1, 1]
    cx = odX + dir * offset;
    cy = odY;
    if cx < 1 || cx > W, continue; end
    m = circleMask(H, W, cx, cy, searchR) & retina;
    if ~any(m(:)), continue; end
    vals = darkChannel(m);
    v = mean(vals(vals < prctileLocal(vals, 25)));   % mean of the darkest quarter
    if v < best
        best = v;
        % Refine to the darkest point actually inside the window rather than
        % returning the window's centre.
        region = darkChannel;
        region(~m) = Inf;
        [~, li] = min(region(:));
        [foveaY, foveaX] = ind2sub([H, W], li);
    end
end

if isnan(foveaX)
    % Geometric fallback: keep the disc–fovea axis defined even when the dark
    % search fails, since Tasks 4.2/4.3 need an axis more than they need
    % precision. Better a usable approximate axis than no quadrants at all.
    foveaX = min(W, max(1, odX + offset));
    foveaY = odY;
    warning('opticDiscFovea:foveaFallback', ...
            'Fovea not found by intensity; using the geometric estimate.');
end

if opts.debug
    fprintf('opticDiscFovea: OD (%.1f, %.1f) r=%.1f | fovea (%.1f, %.1f)\n', ...
            odX, odY, discRadius, foveaX, foveaY);
end
end

% ── Helpers ─────────────────────────────────────────────────────────────────
function m = circleMask(H, W, cx, cy, r)
[xx, yy] = meshgrid(1:W, 1:H);
m = (xx - cx).^2 + (yy - cy).^2 <= r^2;
end

function v = prctileLocal(x, q)
% Percentile without the Statistics Toolbox, so this file has no dependency
% beyond Image Processing.
x = sort(x(:));
if isempty(x), v = NaN; return; end
v = interp1(linspace(0, 100, numel(x)), x, q, 'linear', 'extrap');
end
