function [score, details] = lesionAttentionConsistency(heatmap, lesionMask, roiMask, opts)
% LESIONATTENTIONCONSISTENCY  Does Grad-CAM look where the lesions are?
%
%   [score, details] = lesionAttentionConsistency(heatmap, lesionMask, roiMask)
%   [score, details] = lesionAttentionConsistency(..., opts)
%
%   Inputs:
%     heatmap    - HxW Grad-CAM map (Task 2.6). Any scale; normalised here.
%     lesionMask - HxW logical, the union of the red and bright lesion masks
%                  (Tasks 4.2/4.3).
%     roiMask    - HxW logical retinal region. Optional; defaults to the whole
%                  frame, but see "Why the ROI matters" below.
%     opts:
%       .minEnrichment 1.0 - below this, the case is flagged
%       .topFraction   0.1 - top-attention fraction used for the IoU view
%
%   Outputs:
%     score   - attention energy falling inside lesions, in [0,1].
%     details - the numbers needed to interpret that score, including the
%               chance level it must be compared against.
%
%   Task 7.1. Stored in explainability_outputs.lesion_attention_consistency_score.
%
%   ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
%   A Grad-CAM heatmap is always producible and always looks plausible. It is
%   an explanation of the model, not evidence that the model is right, and a
%   confident grade whose attention sits on the image border, the optic disc, or
%   a camera artefact is a model that got the answer for a reason no clinician
%   would accept. That case should be reviewed even when the grade looks fine.
%
%   This measures the overlap between where the model looked and where the
%   lesions actually are, so that mismatch becomes a number instead of something
%   a reviewer has to notice by eye on every case.
%
%   ── THE TRAP: A RAW OVERLAP FRACTION IS NOT INTERPRETABLE ──────────────────
%   "70% of the attention is on lesions" sounds excellent and can be terrible.
%   If lesions cover 70% of the retina, a heatmap of pure noise scores 0.70 too.
%   The number only means something against its chance level, which is the
%   lesion area fraction.
%
%   So the primary score is the plain energy fraction (bounded, and what the
%   column name implies), and `details` carries:
%     .chanceLevel - lesion area fraction: what a random heatmap would score
%     .enrichment  - score / chanceLevel; 1.0 is chance, >1 is real attention
%     .flagged     - enrichment < minEnrichment
%
%   The flag is computed HERE rather than left to whatever renders the score,
%   because the comparison is the whole point and a UI showing "0.70" beside a
%   green tick would be actively misleading. Anything storing the score should
%   store or show the chance level with it.
%
%   ── WHY THE ROI MATTERS ────────────────────────────────────────────────────
%   Everything is restricted to the retinal circle. The black surround is a
%   large fraction of a fundus frame, and including it inflates the denominator
%   with pixels no lesion could ever occupy and no explanation should ever point
%   at — making a mediocre heatmap look focused.
%
%   ── WHAT A LOW SCORE DOES NOT MEAN ─────────────────────────────────────────
%   Low consistency is a reason to review, never a reason to change a grade.
%   The lesion masks are themselves model output with their own error rate, so a
%   disagreement between two imperfect models says something is worth a human's
%   attention and nothing about which one is wrong.

if nargin < 4, opts = struct(); end
minEnrichment = getdef(opts, 'minEnrichment', 1.0);
topFraction   = getdef(opts, 'topFraction', 0.1);

heatmap = double(heatmap);
if nargin < 3 || isempty(roiMask), roiMask = true(size(heatmap)); end

lesionMask = logical(lesionMask);
roiMask    = logical(roiMask);

if ~isequal(size(heatmap), size(lesionMask)) || ~isequal(size(heatmap), size(roiMask))
    error('lesionAttentionConsistency:sizeMismatch', ...
          'heatmap, lesionMask and roiMask must all be the same size.');
end
if ~any(roiMask(:))
    error('lesionAttentionConsistency:emptyRoi', 'The ROI mask is empty.');
end
if any(~isfinite(heatmap(roiMask)))
    error('lesionAttentionConsistency:badHeatmap', ...
          'The heatmap contains non-finite values inside the ROI.');
end

% Lesions outside the retinal circle are segmentation errors, not findings.
% Counting them would credit the model for attending to something that cannot
% be a lesion.
lesionInRoi = lesionMask & roiMask;

% Normalise to non-negative weights. Grad-CAM is usually ReLU'd already, but a
% negative value would subtract from the energy of a region it was supposedly
% highlighting, and min-shifting is the only way to keep "energy" meaningful.
h = heatmap;
h(~roiMask) = 0;
minInRoi = min(heatmap(roiMask));
if minInRoi < 0
    h(roiMask) = heatmap(roiMask) - minInRoi;
end

totalEnergy = sum(h(roiMask));
roiArea     = sum(roiMask(:));
lesionArea  = sum(lesionInRoi(:));

details = struct( ...
    'lesionAreaPixels', lesionArea, ...
    'roiAreaPixels',    roiArea, ...
    'chanceLevel',      lesionArea / roiArea, ...
    'totalEnergy',      totalEnergy);

% ── The two undefined cases, kept undefined ─────────────────────────────────
% No lesions segmented: there is nothing for attention to be consistent WITH.
% Returning 0 would read as "the model looked in the wrong place", which is a
% measurement this data cannot support — a grade-0 eye correctly has no lesions.
if lesionArea == 0
    score = NaN;
    details.enrichment = NaN;
    details.flagged = false;
    details.note = ['no lesion pixels in the ROI — consistency is UNDEFINED, ' ...
                    'not zero. An eye with no lesions gives attention nothing ' ...
                    'to agree with.'];
    return;
end

% A flat or empty heatmap carries no attention to attribute.
if totalEnergy <= 0
    score = NaN;
    details.enrichment = NaN;
    details.flagged = true;
    details.note = ['the heatmap has no energy inside the ROI — Grad-CAM ' ...
                    'produced nothing to check, which is itself a reason to review.'];
    return;
end

score = sum(h(lesionInRoi)) / totalEnergy;
details.enrichment = score / details.chanceLevel;

% Flagged unless STRICTLY better than the threshold, not "less than" it. At
% exactly 1.0 the heatmap has told us nothing a uniform map would not have —
% that is the definition of chance, and it must flag rather than sit one
% floating-point tick on the passing side of the boundary. Written as ~(> t)
% so the exactly-at-threshold case is decided deliberately instead of by which
% comparison operator got typed.
details.flagged = ~(details.enrichment > minEnrichment);

% ── A second, independent view: IoU of the peak region with the lesions ─────
% The energy fraction is diffuse-friendly — a broad, unfocused heatmap covering
% everything scores respectably. Thresholding to the top attention and taking a
% plain IoU asks a different question: is the PEAK on a lesion? The two
% disagreeing is informative, so both are reported rather than blended into one
% number whose components cannot be recovered.
thresholdValue = quantileLocal(h(roiMask), 1 - topFraction);
topMask = (h >= thresholdValue) & roiMask;
inter = sum(topMask(:) & lesionInRoi(:));
uni   = sum(topMask(:) | lesionInRoi(:));
if uni > 0
    details.topAttentionIoU = inter / uni;
else
    details.topAttentionIoU = NaN;
end

details.note = sprintf( ...
    'attention on lesions %.3f vs chance %.3f (enrichment %.2fx)', ...
    score, details.chanceLevel, details.enrichment);
end

function q = quantileLocal(v, p)
% Plain linear-interpolation quantile, so this file needs no Statistics
% Toolbox -- the rest of the explainability path does not require one and
% adding a dependency for a single threshold would be a poor trade.
v = sort(v(:));
n = numel(v);
if n == 0, q = NaN; return; end
if n == 1, q = v(1); return; end
pos = 1 + p * (n - 1);
lo = floor(pos); hi = ceil(pos);
if lo == hi
    q = v(lo);
else
    q = v(lo) + (pos - lo) * (v(hi) - v(lo));
end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
