function result = counterfactualOcclusionTest(net, img, lesionMask, opts)
% COUNTERFACTUALOCCLUSIONTEST  Remove the evidence; the confidence must fall.
%
%   result = counterfactualOcclusionTest(net, img, lesionMask)
%   result = counterfactualOcclusionTest(net, img, lesionMask, opts)
%
%   Inputs:
%     net        - the Branch A dlnetwork.
%     img        - the preprocessed image the grade was produced from.
%     lesionMask - HxW logical lesion mask (Tasks 4.2/4.3), or a label image
%                  whose regions are ranked by opts.heatmap when supplied.
%     opts:
%       .heatmap       []     - Grad-CAM map, used to pick the TOP region
%       .nRegions      1      - how many regions to occlude, largest first
%       .dilatePixels  4      - grow the mask before filling; see below
%       .method        'inpaint' | 'localmean' | 'black'
%       .classifyFn    []     - injectable scorer, for testing without MATLAB
%                               networks; must return a 1x5 probability row
%
%   Output: struct with the original and occluded probabilities, the drop in
%   the originally-predicted class, and a pass/fail on that drop.
%
%   Task 7.1.
%
%   ── OFFLINE ONLY. NOT A PER-REQUEST CHECK. ─────────────────────────────────
%   This runs Branch A a second time, so it doubles the cost of the most
%   expensive step in the pipeline for every case it touches. It belongs in
%   validation runs and spot-audits, not in gradingOrchestrator — the plan says
%   so explicitly and this header repeats it because the function is trivially
%   easy to wire into the request path by someone who has not read the plan.
%
%   ── WHAT IT ANSWERS ────────────────────────────────────────────────────────
%   Grad-CAM shows where the model looked. It does not show that what it looked
%   at is what drove the decision — a heatmap can sit squarely on a lesion while
%   the grade actually turns on image brightness or a camera artefact. The only
%   way to distinguish those is to intervene: take the lesion away and see
%   whether the prediction follows.
%
%   If the model still calls the eye grade 3 after its lesions have been
%   removed, the lesions were not what it was grading on. That is a finding
%   about the model, and it is invisible to any amount of looking at heatmaps.
%
%   ── WHY THE FILL METHOD IS NOT A DETAIL ────────────────────────────────────
%   Filling the region with black creates a hard-edged dark blob that appears
%   nowhere in training data. The confidence will drop — and tell you nothing,
%   because it dropped in response to an obvious artefact rather than to the
%   absence of a lesion. That is a test that always passes and means nothing.
%
%   So the default fills from the surrounding retina (`regionfill`), which
%   removes the lesion while leaving something that still looks like retina.
%   'black' is retained only for demonstrating this exact failure, and is
%   labelled in the result so a number produced that way cannot be quoted as if
%   it were the real test.
%
%   The mask is also dilated a little first: a mask that clips a lesion's edge
%   leaves a rim of lesion behind, and a few surviving pixels of haemorrhage are
%   enough for the model to keep its answer.

if nargin < 4, opts = struct(); end

nRegions     = getdef(opts, 'nRegions', 1);
dilatePixels = getdef(opts, 'dilatePixels', 4);
method       = getdef(opts, 'method', 'inpaint');
heatmap      = getdef(opts, 'heatmap', []);
classifyFn   = getdef(opts, 'classifyFn', []);

if ~ismember(method, {'inpaint', 'localmean', 'black'})
    error('counterfactualOcclusionTest:badMethod', ...
          "method must be 'inpaint', 'localmean' or 'black'.");
end

lesionMask = logical(lesionMask);
if ~any(lesionMask(:))
    error('counterfactualOcclusionTest:noLesions', ...
          ['The lesion mask is empty; there is nothing to occlude. A case with ' ...
           'no segmented lesions cannot be counterfactually tested, and ' ...
           'reporting a zero drop for it would read as a failed test rather ' ...
           'than an inapplicable one.']);
end
if size(lesionMask, 1) ~= size(img, 1) || size(lesionMask, 2) ~= size(img, 2)
    error('counterfactualOcclusionTest:sizeMismatch', ...
          'lesionMask must match the image in the first two dimensions.');
end

score = @(x) scoreImage(net, x, classifyFn);

baseProbs = score(img);
[baseConf, baseIdx] = max(baseProbs);
baseGrade = baseIdx - 1;

% ── Pick the regions to remove ──────────────────────────────────────────────
% Ranked by attention when a heatmap is supplied, by area otherwise. The
% heatmap ranking is the more meaningful test: it removes what the model says
% it used, rather than merely what is biggest.
cc = bwconncomp(lesionMask);
if cc.NumObjects == 0
    error('counterfactualOcclusionTest:noLesions', 'No connected lesion regions.');
end

regionScore = zeros(cc.NumObjects, 1);
for k = 1:cc.NumObjects
    if isempty(heatmap)
        regionScore(k) = numel(cc.PixelIdxList{k});
    else
        regionScore(k) = sum(double(heatmap(cc.PixelIdxList{k})));
    end
end
[~, order] = sort(regionScore, 'descend');
take = order(1:min(nRegions, cc.NumObjects));

occlusionMask = false(size(lesionMask));
for k = take(:)'
    occlusionMask(cc.PixelIdxList{k}) = true;
end

if dilatePixels > 0
    occlusionMask = imdilate(occlusionMask, strel('disk', dilatePixels));
end

% ── Remove the evidence ─────────────────────────────────────────────────────
occluded = applyOcclusion(img, occlusionMask, method);
occProbs = score(occluded);

drop = baseConf - occProbs(baseIdx);

result = struct( ...
    'baseGrade',        baseGrade, ...
    'baseConfidence',   baseConf, ...
    'baseProbs',        baseProbs, ...
    'occludedProbs',    occProbs, ...
    'occludedConfidenceForBaseGrade', occProbs(baseIdx), ...
    'confidenceDrop',   drop, ...
    'gradeChanged',     (find(occProbs == max(occProbs), 1) - 1) ~= baseGrade, ...
    'regionsOccluded',  numel(take), ...
    'occludedPixels',   sum(occlusionMask(:)), ...
    'method',           method, ...
    'rankedBy',         ternaryText(isempty(heatmap), 'area', 'heatmap energy'));

% A drop is expected. No drop -- or a RISE -- means the lesions were not what
% the model was grading on, which is the finding this test exists to surface.
result.passed = drop > getdef(opts, 'minDrop', 0);

if strcmp(method, 'black')
    result.warning = ['method=black fills with an out-of-distribution blob; a ' ...
                      'drop measured this way is a reaction to the artefact, ' ...
                      'not to the missing lesion. Do not quote it as evidence.'];
end
if ~result.passed
    result.finding = sprintf( ...
        ['removing the lesion evidence did not reduce confidence in grade %d ' ...
         '(%.4f -> %.4f). The grade does not appear to rest on the segmented ' ...
         'lesions.'], baseGrade, baseConf, occProbs(baseIdx));
end
end

% ───────────────────────────────────────────────────────────────────────────
function out = applyOcclusion(img, mask, method)
out = img;
switch method
    case 'black'
        for c = 1:size(img, 3)
            ch = out(:,:,c); ch(mask) = 0; out(:,:,c) = ch;
        end
    case 'localmean'
        % Mean of an annulus around the region: cheaper than inpainting and
        % keeps the local illumination, which varies a lot across a fundus.
        surround = imdilate(mask, strel('disk', 12)) & ~mask;
        for c = 1:size(img, 3)
            ch = out(:,:,c);
            fillValue = mean(double(ch(surround)));
            if isnan(fillValue), fillValue = mean(double(ch(:))); end
            ch(mask) = cast(fillValue, 'like', ch);
            out(:,:,c) = ch;
        end
    case 'inpaint'
        for c = 1:size(img, 3)
            out(:,:,c) = regionfill(out(:,:,c), mask);
        end
end
end

function probs = scoreImage(net, img, classifyFn)
if ~isempty(classifyFn)
    probs = double(classifyFn(img));
else
    probs = double(predict(net, single(img)));
end
probs = probs(:)';
if numel(probs) ~= 5
    error('counterfactualOcclusionTest:badOutput', ...
          'The classifier returned %d scores; Branch A must output 5.', numel(probs));
end
s = sum(probs);
if s > 0, probs = probs / s; end
end

function t = ternaryText(cond, a, b)
if cond, t = a; else, t = b; end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
