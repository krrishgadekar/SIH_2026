function calib = conformalCalibrate(calProbs, calLabels, opts)
% CONFORMALCALIBRATE  Referable-stratified Mondrian ordinal conformal
% calibration (score v3) for the Tier A/B/C boundaries, plus the
% referable-threshold safety gate.
%
%   calib = conformalCalibrate(calProbs, calLabels)
%   calib = conformalCalibrate(calProbs, calLabels, opts)
%
%   Inputs:
%     calProbs  - Nx5 CALIBRATED probabilities (post temperature scaling) on
%                 the calibration pool (pooled val+test -- see
%                 calibrateBranchA.m's own header for why pooling replaced
%                 val-only: cross-fitting showed val-only calibration is not
%                 trustworthy at these per-stratum n).
%     calLabels - Nx1 true grades 0-4 for those same N images.
%     opts:
%       .alphaPerStratum  [0.30 0.05]  - miscoverage rate PER REFERABLE
%                 STRATUM. Index 1 = non-referable (true grade 0-1), index 2
%                 = referable (true grade 2-4). A wider net on the common,
%                 low-stakes stratum buys a tighter, more useful one on the
%                 stakes-bearing stratum -- the same spirit as v2's per-class
%                 alpha, but grouped by what actually matters clinically
%                 (referable vs not) rather than by individual grade, which
%                 v2's finest grades (3, n=43) could not support reliably.
%       .referableTargetSensitivity  0.05  - the referableThreshold fit
%                 targets 1-this sensitivity for catching true referable
%                 cases via P(g>=2) alone (default targets 95%).
%
%   Output: a struct to hand to conformalTiering, and to save alongside the
%   model version it was fitted for.
%
%   ── METHOD: SCORE v3, REFERABLE-STRATIFIED MONDRIAN ────────────────────────
%   Score (ordinalModeIntervalScore.m, score v3 -- see that file for the v2
%   defect this replaces):
%     p = calibrated probabilities over grades 0..4.
%     m = argmax(p), ties broken to the HIGHER grade.
%     s(m) = 0. For k != m: s(k) = (mass of the smallest interval around m
%            that contains k) MINUS p(k).
%
%   Mondrian calibration, by STRATUM not by individual grade: stratumOf =
%   [0 0 1 1 1] (grades 0,1 -> stratum 0; grades 2,3,4 -> stratum 1). For
%   TRUE stratum g, take s(y_i) over calibration points whose true grade's
%   stratum is g (n_g of them); qhatPerStratum(g) is the
%   ceil((n_g+1)(1-alpha_g))-th smallest of those scores. At inference,
%   candidate grade k enters the set if s(k) <= qhatPerStratum(stratumOf(k))
%   -- the threshold is indexed by k's OWN stratum, fitted from calibration
%   points whose TRUE grade fell in that same stratum.
%
%   ── REFERABLE THRESHOLD (the second, independent safety gate) ─────────────
%   referableThreshold is fit SEPARATELY from the stratified qhat, on the
%   same calibration pool: among calibration points whose TRUE grade is
%   referable (>=2), let p_ref(i) = P(g>=2 | x_i) = sum(calProbs(i,3:5)).
%   referableThreshold is the ceil((n_ref+1)*referableTargetSensitivity)-th
%   SMALLEST p_ref among those points -- i.e. the (1-target) that
%   ~referableTargetSensitivity fraction of true referable cases fall below.
%   At inference, a case is NEVER allowed a Tier A auto-clear if its own
%   P(g>=2) >= referableThreshold, regardless of what the conformal set says
%   -- see conformalTiering.m for exactly how this composes with the set.
%
%   ── THE FLOOR IS SATURATED, NOT ERRORED (unchanged principle from v2) ──────
%   qhatPerStratum: if the required rank exceeds n_g, qhat=1 (unconditional
%   admission -- the conservative direction for a WIDENING threshold).
%   referableThreshold: if the required rank exceeds n_ref (or n_ref=0), the
%   threshold saturates to 0 -- the conservative direction for a SAFETY GATE
%   is the opposite of qhat's: threshold=0 means P(g>=2)>=0 is true for
%   every case, so the gate can never be silently bypassed by an unfittable
%   threshold defaulting to "never trigger". Both directions are surfaced in
%   the output so they can be audited, not discovered later.
%
%   ── THE ASSUMPTION THAT MUST BE STATED WHEREVER THIS IS USED ───────────────
%   The guarantee holds only if calibration data and deployment data are
%   EXCHANGEABLE. In this system they are very likely not: the calibration
%   pool comes from public datasets (APTOS/IDRiD) and deployment is rural
%   Indian PHCs with different cameras, different operators and different
%   disease prevalence. Under that shift the coverage guarantee degrades by
%   an unknown amount. That does not make the method useless -- it is still
%   a far better-founded operating point than a hand-picked threshold -- but
%   the guarantee must be reported as "stratum-conditional coverage ON DATA
%   LIKE THE CALIBRATION POOL", never as an unqualified promise.

if nargin < 3, opts = struct(); end
alphaPerStratum = getdef(opts, 'alphaPerStratum', [0.30 0.05]);
refTargetSens   = getdef(opts, 'referableTargetSensitivity', 0.05);

alphaPerStratum = double(alphaPerStratum(:))';
if numel(alphaPerStratum) ~= 2
    error('conformalCalibrate:badAlpha', ...
          'alphaPerStratum must have 2 entries (non-referable, referable), got %d.', ...
          numel(alphaPerStratum));
end
if any(~(alphaPerStratum > 0 & alphaPerStratum < 1))
    error('conformalCalibrate:badAlpha', 'every alphaPerStratum entry must be strictly between 0 and 1.');
end
if ~(refTargetSens > 0 && refTargetSens < 1)
    error('conformalCalibrate:badAlpha', 'referableTargetSensitivity must be strictly between 0 and 1.');
end

calLabels = double(calLabels(:));
n = numel(calLabels);

if size(calProbs, 1) ~= n
    error('conformalCalibrate:sizeMismatch', ...
          '%d labels but %d probability rows.', n, size(calProbs, 1));
end
if size(calProbs, 2) ~= 5
    error('conformalCalibrate:badProbs', 'calProbs must be Nx5.');
end
if any(calLabels < 0 | calLabels > 4 | mod(calLabels, 1) ~= 0)
    error('conformalCalibrate:badLabels', 'calLabels must be integers in 0..4.');
end

REFERABLE_FROM = 2;
STRATUM_OF_CLASS = [0 0 1 1 1];   % grades 0..4 -> stratum index (0-based)

% ── Score every calibration point at its OWN true grade ────────────────────
scoresAll = ordinalModeIntervalScore(calProbs);        % score v3
trueScore = scoresAll(sub2ind(size(scoresAll), (1:n)', calLabels + 1));
trueStratum = STRATUM_OF_CLASS(calLabels + 1)';         % Nx1, 0 or 1

qhatPerStratum = zeros(1, 2);
rankPerStratum = zeros(1, 2);
nCalPerStratum = zeros(1, 2);
saturatedPerStratum = false(1, 2);
empiricalCoveragePerStratum = nan(1, 2);

for s = 0:1
    mask = (trueStratum == s);
    ns = sum(mask);
    nCalPerStratum(s + 1) = ns;

    rank = ceil((ns + 1) * (1 - alphaPerStratum(s + 1)));
    rankPerStratum(s + 1) = rank;

    if rank > ns
        % Finite-sample floor hit for this stratum: saturate rather than
        % error (see docstring). max score is 1 by construction (a
        % probability-mass sum bounded by 1, minus a nonnegative term, is
        % still <= 1).
        qhatPerStratum(s + 1) = 1;
        saturatedPerStratum(s + 1) = true;
    else
        sortedS = sort(trueScore(mask));
        qhatPerStratum(s + 1) = sortedS(rank);
        empiricalCoveragePerStratum(s + 1) = mean(trueScore(mask) <= sortedS(rank) + 1e-9);
    end
end

% ── Referable threshold (independent safety gate) ──────────────────────────
pRefAll = sum(calProbs(:, 3:5), 2);
refMask = calLabels >= REFERABLE_FROM;
nRef = sum(refMask);
rankRef = ceil((nRef + 1) * refTargetSens);
if nRef == 0 || rankRef > nRef
    referableThreshold = 0;
    referableThresholdSaturated = true;
else
    sortedRef = sort(pRefAll(refMask));
    referableThreshold = sortedRef(rankRef);
    referableThresholdSaturated = false;
end

calib = struct( ...
    'method',                     'ordinal_mode_interval_stratified_v3', ...
    'stratumOf',                  STRATUM_OF_CLASS, ...
    'qhatPerStratum',             qhatPerStratum, ...
    'alphaPerStratum',            alphaPerStratum, ...
    'nCalPerStratum',             nCalPerStratum, ...
    'rankPerStratum',             rankPerStratum, ...
    'saturatedPerStratum',        saturatedPerStratum, ...
    'referableThreshold',         referableThreshold, ...
    'referableTargetSensitivity', refTargetSens, ...
    'nCalReferable',              nRef, ...
    'rankReferable',              rankRef, ...
    'referableThresholdSaturated', referableThresholdSaturated, ...
    'n',                          n, ...
    'calibratedAt',               datetime('now', 'TimeZone', 'UTC'), ...
    'guaranteeScope',             ['stratum-conditional (referable vs non-referable) ' ...
                                   'coverage over data EXCHANGEABLE with the calibration ' ...
                                   'pool; not conditional on any individual case, and not ' ...
                                   'transferable across camera or site shift'], ...
    'empiricalCoverageOnCalibrationPoolPerStratum', empiricalCoveragePerStratum);

if any(saturatedPerStratum)
    warning('conformalCalibrate:saturatedStratum', ...
        ['stratum/strata [%s] have too few calibration points for their requested ' ...
         'alpha and were saturated to qhat=1 (unconditionally admitted). ' ...
         'nCalPerStratum = [%s].'], ...
        num2str(find(saturatedPerStratum) - 1), num2str(nCalPerStratum));
end
if referableThresholdSaturated
    warning('conformalCalibrate:saturatedReferableThreshold', ...
        ['referableThreshold could not be fitted (nCalReferable=%d) and saturated to ' ...
         '0 -- the referable-threshold safety gate will trigger on every referable-' ...
         'leaning case until refitted with more calibration data.'], nRef);
end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
