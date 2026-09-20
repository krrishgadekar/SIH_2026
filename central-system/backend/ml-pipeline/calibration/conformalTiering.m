function [tier, details] = conformalTiering(probs, calib, opts)
% CONFORMALTIERING  Assign Tier A/B/C from a contiguous, referable-stratified
% conformal prediction set (score v3), plus the referable-threshold safety
% gate.
%
%   [tier, details] = conformalTiering(probs, calib)
%   [tier, details] = conformalTiering(probs, calib, opts)
%
%   Inputs:
%     probs - 1x5 calibrated probabilities for one case (grades 0-4).
%     calib - the struct from conformalCalibrate (method
%             'ordinal_mode_interval_stratified_v3', fields stratumOf,
%             qhatPerStratum, referableThreshold).
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
%   ── HOW THE SET IS BUILT (score v3) ─────────────────────────────────────────
%   ordinalModeIntervalScore.m gives scores(k) and the mode m for this case,
%   using score v3 (s(m)=0; s(k)=interval-mass-p(k) for k!=m -- see that
%   file's header for the v2 defect this replaced). A grade k is a RAW
%   member if scores(k) <= calib.qhatPerStratum(calib.stratumOf(k)+1) -- the
%   threshold fitted from calibration examples whose TRUE grade fell in k's
%   own REFERABLE STRATUM (non-referable: grade 0-1; referable: grade 2-4),
%   not k's individual grade (v2's finest per-grade split, e.g. grade 3 at
%   n=43, could not support a reliable quantile). The mode m is ALWAYS a
%   member regardless of its own score (score v3 makes this trivial: s(m)=0
%   <= any qhat >= 0). Per-stratum thresholds can still reopen gaps in the
%   raw membership even though the score is ordinal, so the CONTIGUOUS HULL
%   [min(raw), max(raw)] is returned, never the raw set -- it only ever adds
%   coverage, and a gapped set like {1,3} misrepresents what "referable vs
%   not" means on an ordinal scale. The EPS guard mirrors the score-scale-
%   comparison discipline v2 needed for the same reason.
%
%   Because the mode is always a member, the set is NEVER empty.
%
%   ── HOW THE PREDICTION SET BECOMES A TIER ──────────────────────────────────
%   Referable DR is grade >= 2. Because the returned set is contiguous
%   [low, high], the three cases collapse to a comparison on low/high alone:
%
%     high < 2   -> the true grade is non-referable with stratum-conditional
%                   coverage                                    -> TIER A*.
%     low  >= 2  -> referable with the same guarantee            -> TIER B.
%     low < 2 <= high -> the data does not distinguish referable from not
%                   at this confidence                           -> TIER C.
%
%   * subject to the referable-threshold safety gate below and the existing
%     MC-Dropout uncertainty withhold -- either can still demote A to B.
%
%   ── REFERABLE-THRESHOLD SAFETY GATE (new in v3) ─────────────────────────────
%   A case whose OWN P(g>=2) = sum(probs(3:5)) is >= calib.referableThreshold
%   can NEVER be Tier A, even if the conformal set itself says {0,1}. This is
%   a SEPARATE, independently-fitted check from the conformal set: the set's
%   stratum-conditional guarantee is about the STRATUM on average, not about
%   this specific case's own referable-probability mass, and a case whose
%   own model output already leans referable enough to clear
%   referableThreshold (fitted to catch ~95% of true referable calibration
%   cases by this score alone) auto-clearing anyway would defeat the point
%   of having fitted the gate. This check is evaluated BEFORE the MC-Dropout
%   uncertainty withhold; both are demotions from A to B and either alone is
%   sufficient to trigger it -- checking order between the two demotion
%   reasons does not change the outcome, only which `reason` string is
%   reported when both would have fired.
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
%
%   All other tier logic (branch disagreement/quality-forced overrides,
%   Tier B/C set-boundary logic, the MC-Dropout uncertainty withhold) is
%   UNCHANGED from v2 -- only the score, the per-candidate threshold lookup
%   (stratum instead of individual grade), and the new referable-threshold
%   gate differ.

if nargin < 3, opts = struct(); end
branchAgreement = getdef(opts, 'branchAgreement', []);
qualityForced   = getdef(opts, 'qualityForced', false);
uncertainty     = getdef(opts, 'uncertainty', []);
maxUncertainty  = getdef(opts, 'maxUncertainty', 0.5);

probs = double(probs(:))';
if numel(probs) ~= 5
    error('conformalTiering:badProbs', 'probs must be 1x5, got 1x%d.', numel(probs));
end
if ~isstruct(calib) || ~isfield(calib, 'qhatPerStratum') || ~isfield(calib, 'stratumOf') ...
        || ~isfield(calib, 'referableThreshold')
    error('conformalTiering:noCalibration', ...
          ['A calibration struct from conformalCalibrate (method ' ...
           'ordinal_mode_interval_stratified_v3, with qhatPerStratum/stratumOf/' ...
           'referableThreshold) is required. Without one there is no guarantee to ' ...
           'assign a tier from, and a tier assigned without one would carry the ' ...
           'authority of a conformal guarantee while being a bare threshold.']);
end

qhatPerStratum = double(calib.qhatPerStratum(:))';
stratumOf = double(calib.stratumOf(:))';
if numel(qhatPerStratum) ~= 2
    error('conformalTiering:badCalibration', ...
          'calib.qhatPerStratum must have 2 entries, got %d.', numel(qhatPerStratum));
end
if numel(stratumOf) ~= 5
    error('conformalTiering:badCalibration', ...
          'calib.stratumOf must have 5 entries, got %d.', numel(stratumOf));
end
referableThreshold = double(calib.referableThreshold);

REFERABLE_FROM = 2;
EPS = 1e-9;   % cross-implementation floating-point guard, same discipline v2 needed --
              % see branchAInfer.py's assign_tier().

[scores, mode] = ordinalModeIntervalScore(probs);        % score v3
qhatPerCandidate = qhatPerStratum(stratumOf + 1);         % 1x5, per-candidate threshold

inSet = (scores <= qhatPerCandidate + EPS);
inSet(mode + 1) = true;                  % the mode is always a member

rawGrades = find(inSet) - 1;
lo = min(rawGrades);
hi = max(rawGrades);
setGrades = lo:hi;
isContiguous = isequal(rawGrades, setGrades);

pReferable = sum(probs(3:5));            % P(g>=2)

details = struct( ...
    'predictionSet',   setGrades, ...
    'setSize',         numel(setGrades), ...
    'low',             lo, ...
    'high',            hi, ...
    'contiguous',      isContiguous, ...
    'mode',            mode, ...
    'pReferable',      pReferable, ...
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
allNonReferable = hi <  REFERABLE_FROM;
allReferable    = lo >= REFERABLE_FROM;

if allNonReferable
    % Referable-threshold safety gate (new in v3): a case whose OWN P(g>=2)
    % already clears referableThreshold can never auto-clear, regardless of
    % what the conformal set says.
    if pReferable >= referableThreshold - EPS
        tier = 'B';
        details.reason = sprintf( ...
            ['prediction set is non-referable {%s}, but P(g>=2)=%.4f >= the ' ...
             'referable-threshold safety gate (%.4f, fitted for %.0f%% referable ' ...
             'sensitivity) -- auto-clear withheld, routed to assisted review'], ...
            num2str(setGrades), pReferable, referableThreshold, ...
            100 * (1 - calib.referableTargetSensitivity));
        return;
    end
    % Tier A skips the ophthalmologist entirely, so it is the one tier where a
    % second condition is worth imposing: high epistemic uncertainty means the
    % model does not know its own mind about this image, and the conformal
    % guarantee is marginal to the STRATUM -- it says nothing about THIS image.
    % Withholding the auto-clear costs one review; granting it wrongly costs a
    % missed referral.
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
        ['prediction set {%s} contains no referable grade, at stratum-conditional ' ...
         'coverage (target alpha per stratum in calib.alphaPerStratum), and ' ...
         'P(g>=2)=%.4f is below the referable-threshold safety gate'], ...
        num2str(setGrades), pReferable);
    return;
end

if allReferable
    tier = 'B';
    details.reason = sprintf( ...
        ['prediction set {%s} is entirely referable — assisted review with ' ...
         'Grad-CAM and lesion evidence'], ...
        num2str(setGrades));
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
