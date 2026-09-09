function calib = conformalCalibrate(calProbs, calLabels, opts)
% CONFORMALCALIBRATE  Split-conformal calibration for the Tier A/B/C boundaries.
%
%   calib = conformalCalibrate(calProbs, calLabels)
%   calib = conformalCalibrate(calProbs, calLabels, opts)
%
%   Inputs:
%     calProbs  - Nx5 CALIBRATED probabilities (post temperature scaling) on a
%                 held-out calibration fold.
%     calLabels - Nx1 true grades 0-4 for those same N images.
%     opts:
%       .alpha 0.10 - miscoverage rate; the guarantee is 1-alpha coverage
%
%   Output: a struct to hand to conformalTiering, and to save alongside the
%   model version it was fitted for.
%
%   Task 6.2. Pairs with conformalTiering.m the way fitTemperature pairs with
%   applyTemperature: fitting happens once, offline; inference is cheap.
%
%   ══ NOT YET RUN FOR REAL ═══════════════════════════════════════════════════
%   Needs a trained Branch A and a labelled calibration fold. Branch A is an
%   untrained stub and no grading dataset is present, so no conformal
%   calibration exists and gradingOrchestrator still uses its placeholder
%   threshold rule. This file is correct and tested; it has never been fitted.
%
%   ── WHAT SPLIT CONFORMAL ACTUALLY BUYS ─────────────────────────────────────
%   A calibrated probability of 0.93 is a claim by the model about itself. The
%   conformal step converts that into a claim backed by held-out data: over the
%   population, the true grade falls inside the prediction set at least
%   (1-alpha) of the time. That is a frequency guarantee, and it is what lets
%   Tier A skip the ophthalmologist queue with a number attached rather than a
%   hope.
%
%   The procedure is deliberately plain:
%     1. nonconformity  s_i = 1 - p_i(true grade)   -- how surprised the model
%        was by the correct answer;
%     2. qhat = the ceil((n+1)(1-alpha))/n quantile of those scores;
%     3. at inference, the prediction set is every grade with p >= 1 - qhat.
%
%   ── THE FINITE-SAMPLE CORRECTION IS NOT A ROUNDING DETAIL ──────────────────
%   The (n+1) is what makes the guarantee hold at finite n rather than only
%   asymptotically. It also implies a hard floor: if ceil((n+1)(1-alpha)) > n
%   the required quantile lies beyond the largest observed score, so no finite
%   threshold achieves the requested coverage. At alpha=0.10 that means n >= 9;
%   at alpha=0.05, n >= 19.
%
%   Below the floor the honest answer is that the guarantee cannot be made.
%   This function ERRORS there rather than clamping to the maximum score and
%   returning a number that looks like a calibrated threshold but guarantees
%   nothing — which is the single easiest way for a conformal implementation to
%   be quietly wrong.
%
%   ── THE ASSUMPTION THAT MUST BE STATED WHEREVER THIS IS USED ───────────────
%   The guarantee holds only if calibration data and deployment data are
%   EXCHANGEABLE. In this system they are very likely not: the calibration fold
%   will come from public datasets (APTOS/IDRiD/Messidor-2) and deployment is
%   rural Indian PHCs with different cameras, different operators and different
%   disease prevalence. Under that shift the coverage guarantee degrades by an
%   unknown amount.
%
%   That does not make the method useless — it is still a far better-founded
%   operating point than a hand-picked 0.9 threshold — but the guarantee must
%   be reported as "1-alpha coverage ON DATA LIKE THE CALIBRATION FOLD", never
%   as an unqualified promise. Task 9.3's domain-generalization experiment is
%   what would put a number on the degradation.

if nargin < 3, opts = struct(); end
alpha = getdef(opts, 'alpha', 0.10);

if ~isscalar(alpha) || ~(alpha > 0 && alpha < 1)
    error('conformalCalibrate:badAlpha', 'alpha must be strictly between 0 and 1.');
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

% ── The finite-sample floor ─────────────────────────────────────────────────
rank = ceil((n + 1) * (1 - alpha));
if rank > n
    error('conformalCalibrate:tooFewCalibrationPoints', ...
          ['%d calibration points cannot support a %.0f%% coverage guarantee: ' ...
           'the required order statistic is rank %d of %d, which does not ' ...
           'exist. Need at least %d points at this alpha. Refusing to clamp to ' ...
           'the maximum score and return a threshold that guarantees nothing.'], ...
          n, 100 * (1 - alpha), rank, n, ceil(1 / alpha) - 1);
end

% ── Nonconformity and its quantile ──────────────────────────────────────────
idx = sub2ind(size(calProbs), (1:n)', calLabels + 1);
scores = 1 - calProbs(idx);              % surprise at the true grade

sorted = sort(scores);
qhat = sorted(rank);

calib = struct( ...
    'qhat',            qhat, ...
    'alpha',           alpha, ...
    'coverage',        1 - alpha, ...
    'n',               n, ...
    'rank',            rank, ...
    'probThreshold',   1 - qhat, ...     % a grade enters the set at p >= this
    'scoreQuantiles',  struct('min', sorted(1), 'median', median(sorted), ...
                              'max', sorted(end)), ...
    'calibratedAt',    datetime('now', 'TimeZone', 'UTC'), ...
    'guaranteeScope',  ['marginal coverage over data EXCHANGEABLE with the ' ...
                        'calibration fold; not conditional on any individual ' ...
                        'case, and not transferable across camera or site shift']);

% ── Empirical coverage, on the fold it was fitted on ────────────────────────
% Tested on the SCORE scale, for the same floating-point reason documented in
% conformalTiering: comparing p >= 1-qhat drops the point that produced qhat.
inSet = scores <= qhat;
calib.empiricalCoverageOnCalibrationFold = mean(inSet);

% The reference is rank/n, NOT 1-alpha. On the fold it was fitted on, coverage
% is exactly rank/n by construction — qhat is the rank-th smallest score, so
% precisely rank of the n points satisfy s_i <= qhat (absent ties). That makes
% this an identity to assert rather than an approximation to tolerate.
%
% Comparing against 1-alpha with a fixed tolerance was wrong and produced false
% alarms: at n=9 coverage can only take values in steps of 1/9, so a target of
% 0.70 is not attainable at all and the check fired on correct output. The gap
% between rank/n and 1-alpha is the finite-sample correction doing its job, not
% an error.
calib.expectedCoverageOnCalibrationFold = rank / n;
if abs(calib.empiricalCoverageOnCalibrationFold - calib.expectedCoverageOnCalibrationFold) > 1e-9
    warning('conformalCalibrate:coverageOff', ...
        ['coverage on the calibration fold is %.4f but qhat is the rank-%d of ' ...
         '%d score, which should give exactly %.4f. Ties in the nonconformity ' ...
         'scores, or non-probability inputs (raw logits rather than calibrated ' ...
         'probabilities), are the usual causes.'], ...
        calib.empiricalCoverageOnCalibrationFold, rank, n, ...
        calib.expectedCoverageOnCalibrationFold);
end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
