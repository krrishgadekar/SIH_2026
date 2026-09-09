function [score, detail] = neovascularizationSuspicion(vesselMask, opticDiscCoords, opts)
% NEOVASCULARIZATIONSUSPICION  Vessel-irregularity suspicion score, 0-1.
%
%   score           = neovascularizationSuspicion(vesselMask, [odX odY])
%   [score, detail] = neovascularizationSuspicion(vesselMask, [odX odY], opts)
%
%   Inputs:
%     vesselMask      - HxW logical from vesselSegmentationUnet (Task 4.1).
%     opticDiscCoords - [odX odY] in pixels, from opticDiscFovea (Task 4.5).
%     opts - optional struct:
%              .discRadiusPx  - disc radius; defaults to width/16
%              .innerDiscDiam 1 - annulus inner edge, in disc diameters
%              .outerDiscDiam 3 - annulus outer edge, in disc diameters
%
%   Outputs:
%     score  - double in [0,1]. HIGHER = more suspicious.
%     detail - struct of the component measures, for the evidence panel and
%              for debugging a surprising score.
%
%   Task 4.4.
%
%   ══ THIS IS NOT A NEOVASCULARIZATION DETECTOR ══════════════════════════════
%   The PS asks for "neovascularization detection". This deliberately delivers a
%   SUSPICION SCORE instead, and that gap must be stated openly rather than
%   glossed (design doc §1.12, §16).
%
%   The reason is data, not effort: no available dataset has pixel-level
%   neovascularization annotations. A detector trained on nothing cannot be
%   validated, and a validated-sounding claim behind an unvalidated model is the
%   kind of overclaim that collapses under one informed question — on the
%   deliverable where being wrong matters most, since NV defines the most severe
%   DR stage.
%
%   So: label the output "possible proliferative pattern — urgent review",
%   never "neovascularization detected". Route it to a human. Report its recall
%   separately rather than folding it into an aggregate that hides it.
%
%   The weighting below is a STARTING POINT, not a validated formula. Say so if
%   asked. It has no ground truth behind it and is not tuned against outcomes.
%
%   ── What it actually measures ──────────────────────────────────────────────
%   New vessels on or near the disc are fine, densely packed, and tortuous —
%   quite unlike the smooth arcades of normal vasculature. Two proxies for that,
%   restricted to an annulus around the optic disc where NVD/NVE typically
%   appears:
%     density    - fraction of annulus pixels that are vessel
%     tortuosity - skeleton arc length vs straight-line distance between
%                  branch points; a straight vessel scores 1, a winding one more

if nargin < 3, opts = struct(); end

if ~islogical(vesselMask), vesselMask = vesselMask > 0; end
[H, W] = size(vesselMask);

score = 0;
detail = struct('density', 0, 'tortuosity', 0, 'branchDensity', 0, ...
                'annulusPx', 0, 'valid', false, 'note', '');

if numel(opticDiscCoords) < 2 || any(~isfinite(opticDiscCoords(1:2)))
    % No disc means no annulus, and a score computed over the whole image would
    % be a different measurement wearing the same name. Return 0 with valid
    % false so a caller cannot mistake "could not compute" for "not suspicious".
    detail.note = 'optic disc coordinates unavailable; score not computed';
    return;
end

odX = opticDiscCoords(1);
odY = opticDiscCoords(2);

if isfield(opts, 'discRadiusPx') && ~isempty(opts.discRadiusPx)
    discRadius = opts.discRadiusPx;
else
    discRadius = W / 16;
end
innerDD = getfielddef(opts, 'innerDiscDiam', 1);
outerDD = getfielddef(opts, 'outerDiscDiam', 3);

discDiameter = 2 * discRadius;
rInner = innerDD * discDiameter;
rOuter = outerDD * discDiameter;

% ── Annulus ─────────────────────────────────────────────────────────────────
% Ring, not disc: the optic disc itself is where every vessel converges, so
% including it would return a high density for every healthy eye and the score
% would carry no information at all.
[xx, yy] = meshgrid(1:W, 1:H);
d2 = (xx - odX).^2 + (yy - odY).^2;
annulus = d2 >= rInner^2 & d2 <= rOuter^2;

annulusPx = nnz(annulus);
detail.annulusPx = annulusPx;
if annulusPx < 100
    detail.note = 'annulus falls outside the image; score not computed';
    return;
end

region = vesselMask & annulus;

% ── Density ─────────────────────────────────────────────────────────────────
density = nnz(region) / annulusPx;

% Normalised against a plausible healthy ceiling. ~25% vessel coverage in this
% ring is already dense for a normal eye, so that maps to 1.
normDensity = min(1, density / 0.25);

% ── Tortuosity and branching ────────────────────────────────────────────────
skel = bwskel(region);
branchPoints = bwmorph(skel, 'branchpoints');
endPoints    = bwmorph(skel, 'endpoints');

skelPx = nnz(skel);
nBranch = nnz(branchPoints);

if skelPx < 20
    normTort = 0;
    tortuosity = 1;
    branchDensity = 0;
else
    % Arc length vs straight-line distance, per segment. Cutting the skeleton at
    % its branch points leaves individual vessel segments; for each, the ratio
    % of pixel count to endpoint separation is the standard tortuosity proxy.
    segments = skel & ~imdilate(branchPoints, strel('square', 3));
    cc = bwconncomp(segments);

    ratios = [];
    for k = 1:cc.NumObjects
        idx = cc.PixelIdxList{k};
        if numel(idx) < 8, continue; end     % too short to be meaningful
        [ys, xs] = ind2sub([H, W], idx);
        % Straight-line distance between the two extreme points of the segment.
        dx = max(xs) - min(xs);
        dy = max(ys) - min(ys);
        chord = hypot(dx, dy);
        if chord < 3, continue; end
        ratios(end+1) = numel(idx) / chord; %#ok<AGROW>
    end

    if isempty(ratios)
        tortuosity = 1;
        normTort = 0;
    else
        tortuosity = median(ratios);
        % 1.0 is a straight segment. ~1.5 is already markedly winding, so that
        % is the top of the scale.
        normTort = min(1, max(0, (tortuosity - 1) / 0.5));
    end

    branchDensity = nBranch / max(1, skelPx);
end

% ── Combine ─────────────────────────────────────────────────────────────────
% Equal weighting, explicitly a starting point (see the header). Neither term
% is individually sufficient: dense-but-smooth is a normal arcade, and
% tortuous-but-sparse is often a segmentation artefact.
score = min(1, 0.5 * normDensity + 0.5 * normTort);

detail.density        = density;
detail.normDensity    = normDensity;
detail.tortuosity     = tortuosity;
detail.normTortuosity = normTort;
detail.branchDensity  = branchDensity;
detail.skeletonPx     = skelPx;
detail.branchPoints   = nBranch;
detail.endPoints      = nnz(endPoints);
detail.valid          = true;
detail.note           = 'suspicion signal only — NOT a validated NV detector';
end

function v = getfielddef(s, name, dflt)
if isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
