function mask = vesselSegmentationFrangi(img, opts)
% VESSELSEGMENTATIONFRANGI  Classical vesselness-filter vessel segmentation.
%
%   mask = vesselSegmentationFrangi(img)
%   mask = vesselSegmentationFrangi(img, opts)
%
%   Input:
%     img  - HxWx3 uint8 fundus image (the cropped image; see the note in
%            opticDiscFovea about illumination normalisation).
%     opts - optional struct:
%              .thickness       [] - vessel widths to respond to, in pixels
%              .seedPercentile  96 - hysteresis seed cut (confidently vessel)
%              .growPercentile  86 - hysteresis growth cut (moderate, kept only
%                                    where connected to a seed)
%              .minAreaPx       [] - drop components smaller than this
%
%   Output:
%     mask - HxW logical, true = vessel.
%
%   Part of Task 4.1. Design doc §6.5 specifies a U-Net "complemented by a
%   Frangi vesselness filter (classical CV)" — so this is a documented half of
%   the design, not a stand-in for the model. It also happens to be the half
%   that works today: the U-Net needs DRIVE's 40 annotated images, which are not
%   downloaded (see datasets/README.md).
%
%   That matters beyond convenience. Task 4.4's neovascularization suspicion
%   score consumes a vessel mask, and Task 4.2 uses one to suppress false
%   microaneurysms — both are otherwise blocked behind a download. This unblocks
%   them with a mask that is real, if less accurate than a trained model's.
%
%   MATLAB's fibermetric() is the Frangi vesselness measure: it responds to
%   tubular structures at a given scale by comparing Hessian eigenvalues, which
%   is exactly the "long thin bright/dark ridge" shape a vessel has.
%
%   ── HONEST LIMITS ──────────────────────────────────────────────────────────
%   Vesselness filtering finds vessel-LIKE structure. It over-segments at lesion
%   borders and near the optic disc rim, and it thins or drops the smallest
%   capillaries. It has no ground truth behind it here, so do not report a Dice
%   or sensitivity figure from it — those numbers require DRIVE. When the U-Net
%   lands, compare the two on DRIVE's test split rather than assuming the model
%   is better.

if nargin < 2, opts = struct(); end
if size(img, 3) ~= 3
    error('vesselSegmentationFrangi: expected an HxWx3 RGB image.');
end

[H, W, ~] = size(img);

% ── Retinal mask ────────────────────────────────────────────────────────────
% The crop's black surround is a huge step edge. Vesselness would light up
% along it, producing a bright ring that is not a vessel; it is excluded, then
% eroded slightly so the rim itself cannot contribute.
gray   = rgb2gray(img);
retina = imfill(gray > 15, 'holes');
retina = bwareafilt(retina, 1);
if ~any(retina(:)), retina = true(H, W); end
retina = imerode(retina, strel('disk', max(2, round(min(H,W)/150))));

% ── Green channel ───────────────────────────────────────────────────────────
% Haemoglobin absorbs green strongly, so vessels are darkest and highest
% contrast there. Red is where the optic disc stands out (see opticDiscFovea);
% green is where vessels do. Using luminance blends both and weakens each.
green = double(img(:,:,2));

% CLAHE before filtering: vessel contrast falls off toward the periphery, and
% without local equalisation the filter finds the arcades and misses the thin
% peripheral branches entirely.
green = adapthisteq(mat2gray(green), 'ClipLimit', 0.01, 'NumTiles', [8 8]);

% Vessels are DARK on a bright retina; fibermetric looks for bright ridges.
inverted = imcomplement(green);

% ── Multi-scale vesselness ──────────────────────────────────────────────────
% Vessel calibre spans roughly an order of magnitude between the arcades and
% the finest visible branches, and a single scale can only catch one end.
if isfield(opts, 'thickness') && ~isempty(opts.thickness)
    thickness = opts.thickness;
else
    base = max(2, round(min(H, W) / 250));
    thickness = base * [1 2 3 5 8];
end

vesselness = fibermetric(inverted, thickness, ...
                         'ObjectPolarity', 'bright', 'StructureSensitivity', 0.03);
vesselness = mat2gray(vesselness);
vesselness(~retina) = 0;

% ── Threshold: hysteresis on the in-retina distribution ─────────────────────
% NOT imbinarize(...,'adaptive'). Adaptive thresholding assumes each local
% window is roughly bimodal and splits it — but on a vesselness map almost
% every window is mostly background, so it keeps about half of the background
% too. Measured, that produced 30-39% vessel coverage on the sample images,
% against the ~8-15% a real fundus has. It looked like a tuning problem and was
% actually the wrong operator.
%
% Hysteresis is the standard choice for tracing thin connected structures:
% take confidently-vessel pixels as seeds, then grow only into moderate pixels
% that CONNECT to a seed. A thin peripheral branch attached to the arcade
% survives; an equally-bright isolated speck of background noise does not.
% imreconstruct does the growth.
%
% Percentiles are taken over retinal pixels only — including the black surround
% would drag both cut points down and reintroduce the flooding.
pHigh = getfielddef(opts, 'seedPercentile', 96);
pLow  = getfielddef(opts, 'growPercentile', 86);

vals = vesselness(retina);
if isempty(vals)
    mask = false(H, W);
    return;
end

tHigh = prctileLocal(vals, pHigh);
tLow  = prctileLocal(vals, pLow);
if ~(tHigh > tLow), tHigh = tLow + eps; end

seeds = (vesselness >= tHigh) & retina;
grow  = (vesselness >= tLow)  & retina;

mask = imreconstruct(seeds, grow);

% ── Clean up ────────────────────────────────────────────────────────────────
% Bridge one-pixel breaks where a vessel crosses another or dips in contrast,
% then drop specks. Vessels are long and connected; isolated blobs are not
% vessels whatever their vesselness score.
mask = bwmorph(mask, 'bridge');
mask = bwmorph(mask, 'clean');

if isfield(opts, 'minAreaPx') && ~isempty(opts.minAreaPx)
    minArea = opts.minAreaPx;
else
    minArea = max(10, round(H * W / 20000));
end
mask = bwareaopen(mask, minArea);

end

function v = getfielddef(s, name, dflt)
if isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end

function v = prctileLocal(x, q)
% Percentile without the Statistics Toolbox, keeping this file dependent on
% Image Processing alone.
x = sort(x(:));
if isempty(x), v = NaN; return; end
v = interp1(linspace(0, 100, numel(x)), x, q, 'linear', 'extrap');
end
