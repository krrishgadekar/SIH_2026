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
%     score  - double in [0,1]. HIGHER = more suspicious. UNCHANGED formula
%              (flat 50/50 density+tortuosity) regardless of opts below -
%              this is the value ruleEngineGrade.m reads, and it must not
%              move under any caller that hasn't opted into the new one.
%     detail - struct of the component measures, for the evidence panel and
%              for debugging a surprising score. Extended (task: NV score
%              validation) with a SECOND, four-component candidate score
%              that is NEVER read by ruleEngineGrade.m or any other live
%              caller - it exists only so the two formulas can be validated
%              side by side from the same single pass over the mask:
%       .fractalDim         - box-counting fractal dimension of the vessel
%                             skeleton, computed in the SAME disc-proximal
%                             annulus as density/tortuosity (see below).
%       .normFractal        - fractalDim min-max normalised via
%                             opts.fractalRange (default [1 1.6], a
%                             plausible-but-unfitted placeholder - the
%                             validation pipeline overrides this with a
%                             train-only-fit range; see fitAndValidateNVScore.py).
%       .normBranchDensity  - branchDensity (already computed pre-existing)
%                             min-max normalised via opts.branchDensityRange
%                             (default [0 0.05], likewise an unfitted
%                             placeholder overridden by the validation
%                             pipeline).
%       .newScore           - clip(0,1, w1*normDensity + w2*normTortuosity +
%                             w3*normFractal + w4*normBranchDensity), weights
%                             from opts.newScoreWeights (default equal
%                             [0.25 0.25 0.25 0.25]). NOT wired into `score`,
%                             ruleEngineGrade.m, or any live path.
%                             VALIDATION FAILED (2026-09-21, fitAndValidateNVScore.py):
%                             AUC 0.27-0.47 on both IDRiD test and Messidor-2 --
%                             below chance (0.5) on every split tried. Do not wire
%                             this into any decision path; keep it detail-only.
%       .newScoreWeights    - the 4 weights actually used (echoed back so a
%                             caller/log can see what produced newScore
%                             without re-deriving it from opts).
%
%   opts additionally accepts (all optional, all default to the placeholders
%   above so every EXISTING call site's output is byte-identical unless it
%   explicitly opts in):
%     .fractalRange        [lo hi] for normFractal, default [1 1.6]
%     .branchDensityRange  [lo hi] for normBranchDensity, default [0 0.05]
%     .newScoreWeights     [w1 w2 w3 w4], default [0.25 0.25 0.25 0.25],
%                          renormalised to sum to 1 if they do not already
%                          (a zero-sum vector falls back to equal weights).
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
%   quite unlike the smooth arcades of normal vasculature. Proxies for that,
%   restricted to an annulus around the optic disc where NVD/NVE typically
%   appears:
%     density       - fraction of annulus pixels that are vessel
%     tortuosity    - skeleton arc length vs straight-line distance between
%                     branch points; a straight vessel scores 1, a winding one more
%     fractalDim    - box-counting dimension of the skeleton (detail-only,
%                     see below - not part of the live `score`)
%     branchDensity - branch points per skeleton pixel (already computed
%                     pre-existing; likewise detail-only for the live score)
%
%   ── detail.newScore: VALIDATION FAILED ─────────────────────────────────────
%   The four-component candidate score in `detail` (fractalDim + branchDensity
%   added to density + tortuosity, see .newScore below) was fit and validated
%   against IDRiD test and Messidor-2 (fitAndValidateNVScore.py, 2026-09-21).
%   Result: AUC 0.27-0.47 on both -- below chance (0.5) on every split tried.
%   It must not be used for any decision, live or advisory. It stays in
%   `detail` only, unwired from `score`, ruleEngineGrade.m, and every live
%   caller, exactly as it was added.

if nargin < 3, opts = struct(); end

if ~islogical(vesselMask), vesselMask = vesselMask > 0; end
[H, W] = size(vesselMask);

fractalRange       = getfielddef(opts, 'fractalRange', [1 1.6]);
branchDensityRange  = getfielddef(opts, 'branchDensityRange', [0 0.05]);
newScoreWeights     = getfielddef(opts, 'newScoreWeights', [0.25 0.25 0.25 0.25]);
wSum = sum(newScoreWeights);
if ~isfinite(wSum) || wSum <= 0
    newScoreWeights = [0.25 0.25 0.25 0.25];   % degenerate input -> equal weights, not a divide-by-zero
else
    newScoreWeights = newScoreWeights / wSum;   % renormalise to sum 1 so newScore stays in [0,1]
end

score = 0;
detail = struct('density', 0, 'tortuosity', 0, 'branchDensity', 0, ...
                'fractalDim', 0, 'normFractal', 0, 'normBranchDensity', 0, ...
                'newScore', 0, 'newScoreWeights', newScoreWeights, ...
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

% ── Fractal dimension (box-counting) ────────────────────────────────────────
% Same disc-proximal ROI as density/tortuosity: computed on `skel`, which is
% already `bwskel(region)` i.e. confined to `vesselMask & annulus`, not a
% separate crop. Box-counts the SKELETON (thin curves), not the filled mask -
% box-counting a filled blob trivially tends to D~2 and would carry no
% information; the skeleton is the standard substrate for vascular fractal
% dimension in the retinal-imaging literature.
fractalDim = boxCountFractalDim(skel);

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

% ── Combine (OLD, live score - UNCHANGED) ───────────────────────────────────
% Equal weighting, explicitly a starting point (see the header). Neither term
% is individually sufficient: dense-but-smooth is a normal arcade, and
% tortuous-but-sparse is often a segmentation artefact.
score = min(1, 0.5 * normDensity + 0.5 * normTort);

% ── Combine (NEW, four-component candidate score - detail-only, see header) ─
normFractal = min(1, max(0, (fractalDim - fractalRange(1)) / max(eps, fractalRange(2) - fractalRange(1))));
normBranchDensity = min(1, max(0, (branchDensity - branchDensityRange(1)) / ...
                                  max(eps, branchDensityRange(2) - branchDensityRange(1))));
newScore = min(1, newScoreWeights(1) * normDensity + newScoreWeights(2) * normTort + ...
                  newScoreWeights(3) * normFractal + newScoreWeights(4) * normBranchDensity);

detail.density        = density;
detail.normDensity    = normDensity;
detail.tortuosity     = tortuosity;
detail.normTortuosity = normTort;
detail.branchDensity  = branchDensity;
detail.skeletonPx     = skelPx;
detail.branchPoints   = nBranch;
detail.endPoints      = nnz(endPoints);
detail.fractalDim        = fractalDim;
detail.normFractal       = normFractal;
detail.normBranchDensity = normBranchDensity;
detail.newScore          = newScore;
detail.newScoreWeights   = newScoreWeights;
detail.valid          = true;
detail.note           = 'suspicion signal only — NOT a validated NV detector';
end

function v = getfielddef(s, name, dflt)
if isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end

function D = boxCountFractalDim(bwImg)
% BOXCOUNTFRACTALDIM  Differential box-counting fractal dimension, 0-2.
%
%   Crops to the bounding box of the true pixels (background outside the
%   ROI must not dilute the count), covers the crop with a grid of boxes of
%   side s for a range of s, counts N(s) = boxes containing >=1 true pixel,
%   and fits log(N(s)) against log(1/s) by least squares; the slope is the
%   estimated fractal dimension. Standard method, applied here to a vessel
%   SKELETON (see the caller's comment for why skeleton, not the filled mask).
%
%   Degenerate inputs (empty, or too small a bounding box to give >=3 usable
%   box sizes) return a defined value (0 or 1) rather than NaN, so callers
%   combining this into a weighted sum never have to special-case NaN.
[rows, cols] = find(bwImg);
if isempty(rows)
    D = 0;
    return;
end

r0 = min(rows); r1 = max(rows); c0 = min(cols); c1 = max(cols);
crop = bwImg(r0:r1, c0:c1);
[h, w] = size(crop);
maxDim = max(h, w);

sizes = unique(round(2 .^ (1:floor(log2(max(maxDim, 4))))));
sizes = sizes(sizes >= 2 & sizes <= max(2, floor(maxDim / 2)));
if numel(sizes) < 3
    D = 1;   % ROI too small to fit a slope meaningfully; 1 = "line-like", a
             % neutral fallback rather than fabricating a fitted number.
    return;
end

counts = zeros(size(sizes));
for i = 1:numel(sizes)
    s = sizes(i);
    nr = ceil(h / s);
    nc = ceil(w / s);
    padded = false(nr * s, nc * s);
    padded(1:h, 1:w) = crop;
    cnt = 0;
    for br = 1:nr
        for bc = 1:nc
            block = padded((br-1)*s+1:br*s, (bc-1)*s+1:bc*s);
            if any(block(:)), cnt = cnt + 1; end
        end
    end
    counts(i) = cnt;
end

valid = counts > 0;
if nnz(valid) < 3
    D = 1;
    return;
end
logInvS = log(1 ./ sizes(valid));
logN = log(counts(valid));
p = polyfit(logInvS, logN, 1);
D = max(0, min(2, p(1)));
end
