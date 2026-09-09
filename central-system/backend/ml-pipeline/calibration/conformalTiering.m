function [tier, details] = conformalTiering(probs, calib, opts)
% CONFORMALTIERING  Assign Tier A/B/C from a conformal prediction set.
%
%   [tier, details] = conformalTiering(probs, calib)
%   [tier, details] = conformalTiering(probs, calib, opts)
%
%   Inputs:
%     probs - 1x5 calibrated probabilities for one case (grades 0-4).
%     calib - the struct from conformalCalibrate.
%     opts:
%       .branchAgreement  []  - true / false / [] (Branch B has not run)
%       .qualityForced   false - a poor-but-usable capture the worker forced
%       .uncertainty      []  - MC-Dropout score from Task 6.1
%       .maxUncertainty  0.5  - above this, Tier A is withheld
%
%   Outputs:
%     tier    - 'A', 'B' or 'C'.
%     details - the prediction set and the reason the tier was chosen.
%
%   Task 6.2. Replaces the placeholder threshold rule in gradingOrchestrator's
%   assignTier once a calibration exists.
%
%   ── HOW THE PREDICTION SET BECOMES A TIER ──────────────────────────────────
%   conformalCalibrate guarantees the true grade is in the set at least
%   (1-alpha) of the time. Referable DR is grade >= 2, so:
%
%     set contains ONLY grades 0-1  -> the true grade is non-referable with
%                                      probability >= 1-alpha  -> TIER A.
%                                      That IS the NPV guarantee design doc
%                                      §6.8 asks for, and it is what makes
%                                      skipping the queue defensible.
%     set contains ONLY grades 2-4  -> referable with the same guarantee,
%                                      the PPV side               -> TIER B.
%     set SPANS both               -> the data does not distinguish referable
%                                      from not at this confidence -> TIER C.
%     set is EMPTY                 -> no grade cleared the threshold: the case
%                                      is unlike anything in calibration
%                                                                  -> TIER C.
%
%   The empty set is not an edge case to tidy away. It is conformal prediction
%   reporting that this image is out-of-distribution, which on a rural
%   deployment with unfamiliar cameras is exactly the case that most needs a
%   human. A threshold rule cannot express it at all — it always returns some
%   confident-looking grade.
%
%   ── WHAT OVERRIDES WHAT ────────────────────────────────────────────────────
%   Branch disagreement forces Tier C regardless of any set (design doc §1.11,
%   §6.7): two independent methods that are both confident and incompatible is
%   MORE alarming than one uncertain method, not less. A forced poor-quality
%   capture also forces C. Both are checked before the set, because no
%   statistical guarantee about the classifier addresses either condition.
%
%   null branchAgreement means Branch B has not run, which today is the normal
%   case. Treating null as disagreement would push every case to Tier C and
%   drown the review queue.

if nargin < 3, opts = struct(); end
branchAgreement = getdef(opts, 'branchAgreement', []);
qualityForced   = getdef(opts, 'qualityForced', false);
uncertainty     = getdef(opts, 'uncertainty', []);
maxUncertainty  = getdef(opts, 'maxUncertainty', 0.5);

probs = double(probs(:))';
if numel(probs) ~= 5
    error('conformalTiering:badProbs', 'probs must be 1x5, got 1x%d.', numel(probs));
end
if ~isstruct(calib) || ~isfield(calib, 'probThreshold')
    error('conformalTiering:noCalibration', ...
          ['A calibration struct from conformalCalibrate is required. Without ' ...
           'one there is no guarantee to assign a tier from, and a tier ' ...
           'assigned without one would carry the authority of a conformal ' ...
           'guarantee while being a bare threshold.']);
end

REFERABLE_FROM = 2;

% Membership is tested on the NONCONFORMITY scale, not by comparing the
% probability against calib.probThreshold. The two are algebraically identical
% -- (1-p) <= qhat  iff  p >= 1-qhat -- and numerically are not: 1 - 0.70 is
% 0.30000000000000004 in binary floating point, so a case sitting exactly on
% the boundary is excluded from its own set. That is how a conformal
% implementation silently under-covers: the guarantee is stated on the score
% scale, so the comparison has to happen there too. calib.probThreshold is kept
% for display and must not be used for this test.
inSet = (1 - probs) <= calib.qhat;
setGrades = find(inSet) - 1;

details = struct( ...
    'predictionSet',   setGrades, ...
    'setSize',         numel(setGrades), ...
    'probThreshold',   calib.probThreshold, ...
    'alpha',           calib.alpha, ...
    'coverage',        calib.coverage, ...
    'branchAgreement', branchAgreement, ...
    'uncertainty',     uncertainty);

% ── Overrides, before any statistical reasoning ─────────────────────────────
if isequal(branchAgreement, false)
    tier = 'C';
    details.reason = ['branch disagreement: the CNN and the rule engine reached ' ...
                      'different grades, which routes to full manual review ' ...
                      'regardless of confidence'];
    return;
end
if qualityForced
    tier = 'C';
    details.reason = ['capture was force-flagged as poor-but-usable; no ' ...
                      'shortcut is offered on an image the worker had doubts about'];
    return;
end

% ── The set ─────────────────────────────────────────────────────────────────
if isempty(setGrades)
    tier = 'C';
    details.reason = sprintf( ...
        ['empty prediction set: no grade reached the conformal threshold of ' ...
         '%.4f (max probability was %.4f). The case is unlike the calibration ' ...
         'data — out-of-distribution, not merely uncertain'], ...
        calib.probThreshold, max(probs));
    return;
end

allNonReferable = all(setGrades <  REFERABLE_FROM);
allReferable    = all(setGrades >= REFERABLE_FROM);

if allNonReferable
    % Tier A skips the ophthalmologist entirely, so it is the one tier where a
    % second condition is worth imposing: high epistemic uncertainty means the
    % model does not know its own mind about this image, and the conformal
    % guarantee is marginal — it says nothing about THIS case. Withholding the
    % auto-clear costs one review; granting it wrongly costs a missed referral.
    if ~isempty(uncertainty) && uncertainty > maxUncertainty
        tier = 'B';
        details.reason = sprintf( ...
            ['prediction set is non-referable {%s}, but MC-Dropout uncertainty ' ...
             '%.3f exceeds %.3f — auto-clear withheld, routed to assisted review'], ...
            num2str(setGrades), uncertainty, maxUncertainty);
        return;
    end
    tier = 'A';
    details.reason = sprintf( ...
        ['prediction set {%s} contains no referable grade, so the case is ' ...
         'non-referable with %.0f%% coverage on calibration-like data'], ...
        num2str(setGrades), 100 * calib.coverage);
    return;
end

if allReferable
    tier = 'B';
    details.reason = sprintf( ...
        ['prediction set {%s} is entirely referable with %.0f%% coverage — ' ...
         'assisted review with Grad-CAM and lesion evidence'], ...
        num2str(setGrades), 100 * calib.coverage);
    return;
end

tier = 'C';
details.reason = sprintf( ...
    ['prediction set {%s} spans referable and non-referable grades: at this ' ...
     'confidence level the data does not separate them, so no shortcut applies'], ...
    num2str(setGrades));
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
