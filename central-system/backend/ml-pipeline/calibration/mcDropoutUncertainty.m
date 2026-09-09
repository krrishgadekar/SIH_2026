function [uncertainty, details] = mcDropoutUncertainty(net, img, opts)
% MCDROPOUTUNCERTAINTY  Epistemic uncertainty from stochastic forward passes.
%
%   [uncertainty, details] = mcDropoutUncertainty(net, img)
%   [uncertainty, details] = mcDropoutUncertainty(net, img, opts)
%
%   opts:
%     .nPasses      20   - stochastic forward passes (design doc §6.8: 10-20)
%     .forwardFn    []   - injectable scorer for testing; called as fn(img, k)
%                          and must return a 1x5 probability row
%     .requireDropout true - refuse a network with no dropout layers
%
%   Outputs:
%     uncertainty - scalar in [0,1]: the normalised predictive-variance score
%                   written to grading_results.uncertainty_score.
%     details     - meanProbs, per-class variance, predictive entropy, mutual
%                   information, and the passes themselves.
%
%   Task 6.1. Feeds conformal tiering (Task 6.2).
%
%   ── THE FAILURE THIS FUNCTION IS WRITTEN AROUND ────────────────────────────
%   Run MC-Dropout on a network with no dropout layers and every pass is
%   identical, so the variance is exactly 0. Zero variance is the value that
%   means MAXIMUM CERTAINTY. The pipeline would store 0.0, the tiering step
%   would read it as an unusually confident case, and a case nobody sampled at
%   all would be routed towards auto-clear.
%
%   Nothing about that is visible downstream: no error, no warning, a perfectly
%   plausible number. Branch A's current stub has no dropout layer, so this is
%   the live configuration, not a hypothetical one.
%
%   So the layer check is not a nicety — it is the whole safety of this
%   function, and it errors by default rather than warning. An uncertainty of
%   "0" that means "not measured" is exactly the class of mistake this project
%   refuses everywhere else (an unmeasured metric is NaN or NULL, never 0).
%
%   ── WHY `forward` AND NOT `predict` ────────────────────────────────────────
%   In MATLAB, predict() runs a dlnetwork in inference mode, which DISABLES
%   dropout. Calling predict in a loop gives 20 identical results and the same
%   silent zero as above. forward() keeps the training-time behaviour, which is
%   the entire mechanism being sampled here.
%
%   ── WHAT THE NUMBER MEANS, AND WHAT IT DOES NOT ────────────────────────────
%   MC-Dropout approximates EPISTEMIC uncertainty — the model's uncertainty
%   about its own parameters, the kind that more training data reduces. It does
%   not capture aleatoric uncertainty (a genuinely ambiguous image), and it is
%   an approximation whose quality depends on where the dropout layers sit.
%
%   A low score therefore is not evidence the grade is right. It means the
%   model is internally consistent about it, which a confidently wrong model
%   also is. It earns its place as one input to tiering, not as a verdict.

if nargin < 3, opts = struct(); end
nPasses         = getdef(opts, 'nPasses', 20);
forwardFn       = getdef(opts, 'forwardFn', []);
requireDropout  = getdef(opts, 'requireDropout', true);

if ~isnumeric(nPasses) || nPasses < 2
    error('mcDropoutUncertainty:badPasses', ...
          'nPasses must be at least 2; variance over a single pass is meaningless.');
end

% ── The dropout check ───────────────────────────────────────────────────────
if isempty(forwardFn) && requireDropout
    nDropout = countDropoutLayers(net);
    details0 = struct('dropoutLayers', nDropout);
    if nDropout == 0
        error('mcDropoutUncertainty:noDropoutLayers', ...
              ['This network has no dropout layers, so every stochastic pass is ' ...
               'identical and the variance would be exactly 0 -- a value that ' ...
               'reads downstream as maximum certainty. Refusing to return an ' ...
               'uncertainty of 0 that actually means "not measured". Add dropout ' ...
               'to the Branch A architecture, or pass ' ...
               'opts.requireDropout=false only if you intend an unmeasured case ' ...
               'and will store NaN rather than this result.']);
    end
else
    details0 = struct('dropoutLayers', NaN);
end

% ── Sample ──────────────────────────────────────────────────────────────────
passes = zeros(nPasses, 5);
for k = 1:nPasses
    if ~isempty(forwardFn)
        p = double(forwardFn(img, k));
    else
        % forward(), not predict(): predict runs in inference mode and turns
        % dropout OFF, which would make every pass identical.
        dlX = dlarray(single(img), 'SSCB');
        p = double(extractdata(forward(net, dlX)));
    end
    p = p(:)';
    if numel(p) ~= 5
        error('mcDropoutUncertainty:badOutput', ...
              'Pass %d returned %d scores; Branch A must output 5.', k, numel(p));
    end
    s = sum(p);
    if s > 0, p = p / s; end
    passes(k, :) = p;
end

meanProbs = mean(passes, 1);
varProbs  = var(passes, 0, 1);          % unbiased, across passes

details = details0;
details.nPasses     = nPasses;
details.passes      = passes;
details.meanProbs   = meanProbs;
details.variancePerClass = varProbs;
[details.meanConfidence, idx] = max(meanProbs);
details.predictedGrade = idx - 1;

% ── The stored score ────────────────────────────────────────────────────────
% Total variance summed across classes, normalised to [0,1].
%
% The normaliser is not arbitrary. For a 5-class distribution the per-class
% variance is maximised when passes alternate between two one-hot corners,
% giving 0.25 in each of two classes: 0.5 total. Dividing by that maps the
% attainable range onto [0,1] so the number can be compared against a fixed
% threshold and read on a UI, rather than being a raw quantity whose ceiling
% depends on the class count.
MAX_TOTAL_VARIANCE = 0.5;
uncertainty = min(1, sum(varProbs) / MAX_TOTAL_VARIANCE);
details.totalVariance = sum(varProbs);

% ── Two decompositions worth keeping ────────────────────────────────────────
% Predictive entropy is TOTAL uncertainty; mutual information is the epistemic
% part alone. They separate "this image is genuinely ambiguous" (high entropy,
% low MI -- more data will not help) from "the model does not know" (high MI --
% more data will). Only the second is a retraining signal, and the continual
% learning loop cares about the difference.
details.predictiveEntropy = entropyOf(meanProbs);
details.expectedEntropy   = mean(arrayfun(@(k) entropyOf(passes(k, :)), 1:nPasses));
details.mutualInformation = max(0, details.predictiveEntropy - details.expectedEntropy);

% Zero variance from a network that DOES have dropout is still worth
% surfacing: it means the sampled layers had no influence on this input.
%
% Compared against a tolerance, NOT `== 0`. Ten bit-identical passes do not
% produce an exactly-zero variance: var() computes sum((x-mean).^2)/(n-1), and
% mean() of ten copies of v is not bit-identical to v, so the deviations are
% ~1e-17 and the variance lands around 1e-33. An equality test therefore never
% fires, and the note this function exists to emit would be silently absent on
% precisely the case it was written for. Measured at 4.3e-33 on identical
% passes; a real difference between two probability vectors is many orders of
% magnitude above this floor, so the tolerance cannot mask a genuine signal.
NUMERICAL_ZERO = 1e-12;
if details.totalVariance < NUMERICAL_ZERO
    details.note = ['every pass was identical despite dropout being present -- ' ...
                    'the sampled layers had no effect on this input. Treat as ' ...
                    'unmeasured, not as certain.'];
end
end

% ───────────────────────────────────────────────────────────────────────────
function n = countDropoutLayers(net)
n = 0;
if isempty(net) || ~isprop(net, 'Layers'), return; end
for L = net.Layers'
    if isa(L, 'nnet.cnn.layer.DropoutLayer') ...
       || contains(lower(class(L)), 'dropout') ...
       || contains(lower(string(L.Name)), 'dropout')
        n = n + 1;
    end
end
end

function H = entropyOf(p)
p = p(p > 0);
H = -sum(p .* log(p));
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
