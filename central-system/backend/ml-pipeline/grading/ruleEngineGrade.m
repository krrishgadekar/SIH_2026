function [grade, evidence] = ruleEngineGrade(redLesionQuadrantCounts, brightLesionQuadrantCounts, nvSuspicionScore, opts)
% RULEENGINEGRADE  ICDR/ETDRS rule engine — Branch B of the dual-branch grading.
%
%   grade             = ruleEngineGrade(redCounts, brightCounts, nvScore)
%   [grade, evidence] = ruleEngineGrade(redCounts, brightCounts, nvScore, opts)
%
%   Inputs:
%     redLesionQuadrantCounts    - 1x4 counts of microaneurysms + haemorrhages,
%                                  one per quadrant around the optic disc–fovea
%                                  axis (Task 4.2).
%     brightLesionQuadrantCounts - 1x4 counts of hard/soft exudates (Task 4.3).
%     nvSuspicionScore           - scalar 0-1 (Task 4.4).
%     opts - optional struct:
%       .venousBeadingQuadrants 0 - quadrants with venous beading (see below)
%       .irmaQuadrants          0 - quadrants with prominent IRMA (see below)
%       .nvThreshold          0.6
%       .severeHaemorrhageCount 20
%
%   Outputs:
%     grade    - integer 0-4 on the International Clinical DR severity scale.
%     evidence - struct explaining WHICH criterion fired, for the case-detail
%                evidence panel and the Task 7.3 report. A grade with no
%                traceable reason is not auditable, and auditability against
%                the clinical criteria is the entire point of this branch.
%
%   Task 5.1.
%
%   ── WHY THIS EXISTS ALONGSIDE THE CNN ──────────────────────────────────────
%   A CNN cannot be audited against the criteria an ophthalmologist trained on.
%   This applies those criteria directly and explicitly, so when the two
%   branches AGREE that agreement is evidence, and when they DISAGREE that is a
%   mandatory-review trigger rather than something to average away
%   (design doc §1.11, §6.7). It is deliberately plain MATLAB — no toolbox, no
%   I/O, no randomness — so it can be unit-tested against the rule text itself.
%
%   ══ KNOWN UNDER-GRADING: TWO OF THE THREE SEVERE-NPDR CRITERIA ARE MISSING ══
%   The ETDRS "4-2-1 rule" defines severe NPDR as ANY of:
%     (a) extensive haemorrhages in all 4 quadrants   <- implemented
%     (b) venous beading in >= 2 quadrants            <- NO DETECTOR EXISTS
%     (c) prominent IRMA in >= 1 quadrant             <- NO DETECTOR EXISTS
%
%   Nothing in this pipeline detects venous beading or IRMA. Both are therefore
%   treated as FALSE — never guessed at from a proxy, because a fabricated
%   criterion is worse than an absent one.
%
%   The consequence must be stated plainly: an eye that is severe NPDR by (b) or
%   (c) alone will be graded 2 by this branch, not 3. Branch B can UNDER-grade
%   severe NPDR, and it does so silently. That is survivable only because it is
%   one of two branches — Branch A sees the whole image and would likely call
%   such an eye higher, and the resulting DISAGREEMENT routes the case to a
%   human, which is exactly the safety mechanism the dual-branch design is for.
%   Report this limitation rather than letting a grade-2 output imply the eye
%   was checked against all three criteria.
%
%   opts.venousBeadingQuadrants / opts.irmaQuadrants exist so a future detector
%   plugs in without changing this signature or its semantics.

if nargin < 4, opts = struct(); end

nvThreshold      = getdef(opts, 'nvThreshold', 0.6);
severeHaemCount  = getdef(opts, 'severeHaemorrhageCount', 20);
venousBeadingQ   = getdef(opts, 'venousBeadingQuadrants', 0);
irmaQ            = getdef(opts, 'irmaQuadrants', 0);

red    = validateCounts(redLesionQuadrantCounts,    'redLesionQuadrantCounts');
bright = validateCounts(brightLesionQuadrantCounts, 'brightLesionQuadrantCounts');

if ~isnumeric(nvSuspicionScore) || ~isscalar(nvSuspicionScore) || ~isfinite(nvSuspicionScore)
    error('ruleEngineGrade:badNv', 'nvSuspicionScore must be a finite scalar.');
end

totalRed    = sum(red);
totalBright = sum(bright);

evidence = struct( ...
    'criterion', '', 'redTotal', totalRed, 'brightTotal', totalBright, ...
    'redByQuadrant', red, 'brightByQuadrant', bright, ...
    'nvSuspicionScore', nvSuspicionScore, ...
    'venousBeadingAssessed', false, 'irmaAssessed', false, ...
    'limitation', '');

% ── Grade 4: proliferative DR ───────────────────────────────────────────────
% Suspicion, not confirmation. neovascularizationSuspicion is explicitly not a
% validated detector (design doc §1.12), so this is a route-to-urgent-review
% trigger and must be reported as "possible proliferative pattern", never as
% confirmed neovascularization.
if nvSuspicionScore > nvThreshold
    grade = 4;
    evidence.criterion = sprintf( ...
        'NV suspicion %.2f exceeds %.2f — possible proliferative pattern, urgent review', ...
        nvSuspicionScore, nvThreshold);
    evidence.limitation = ['NV suspicion is a vessel-irregularity signal, NOT a ' ...
                           'validated neovascularization detector.'];
    return;
end

% ── Grade 3: severe NPDR, the 4-2-1 rule ────────────────────────────────────
% (a) Extensive haemorrhages in ALL FOUR quadrants.
%
% `any(...) && all(...)` rather than `all(...)` alone. For a 1x4 input the two
% are identical; they differ only on an EMPTY input, where all([]) is vacuously
% true and any([]) is false. Keeping both means an empty count vector cannot
% silently produce a severe-NPDR grade.
if any(red > severeHaemCount) && all(red > severeHaemCount)
    grade = 3;
    evidence.criterion = sprintf( ...
        'ETDRS 4-2-1(a): >%d red lesions in all four quadrants [%s]', ...
        severeHaemCount, num2str(red));
    return;
end

% (b) Venous beading in >= 2 quadrants, (c) prominent IRMA in >= 1.
% Both are FALSE unless a caller supplies a real detector's output. See the
% under-grading note in the header.
if venousBeadingQ >= 2
    grade = 3;
    evidence.criterion = sprintf('ETDRS 4-2-1(b): venous beading in %d quadrants', venousBeadingQ);
    evidence.venousBeadingAssessed = true;
    return;
end
if irmaQ >= 1
    grade = 3;
    evidence.criterion = sprintf('ETDRS 4-2-1(c): prominent IRMA in %d quadrant(s)', irmaQ);
    evidence.irmaAssessed = true;
    return;
end

% ── Grade 2: moderate NPDR ──────────────────────────────────────────────────
% Microaneurysms PLUS something else — either bright lesions, or enough red
% lesions to be more than minimal disease.
if totalRed > 0 && (totalBright > 0 || totalRed > 5)
    grade = 2;
    if totalBright > 0
        evidence.criterion = sprintf( ...
            'Moderate NPDR: %d red lesion(s) with %d bright lesion(s)', ...
            totalRed, totalBright);
    else
        evidence.criterion = sprintf( ...
            'Moderate NPDR: %d red lesions (>5), no bright lesions', totalRed);
    end
    evidence.limitation = severeCriteriaNote();
    return;
end

% ── Grade 1: mild NPDR ──────────────────────────────────────────────────────
if totalRed > 0
    grade = 1;
    evidence.criterion = sprintf('Mild NPDR: %d red lesion(s) only', totalRed);
    evidence.limitation = severeCriteriaNote();
    return;
end

% ── Grade 0: no DR ──────────────────────────────────────────────────────────
grade = 0;
if totalBright > 0
    % Bright lesions with NO red lesions falls through to 0 under the ICDR
    % criteria as specified: every DR grade above 0 is anchored on
    % microaneurysms/haemorrhages. Flagged rather than silently graded, because
    % exudates with no red lesion at all is unusual enough to be worth a human
    % look — it is more likely a segmentation false positive or a non-DR
    % pathology than true DR, and either way "grade 0" alone under-describes it.
    evidence.criterion = sprintf( ...
        'No DR by ICDR criteria, but %d bright lesion(s) found with no red lesions', ...
        totalBright);
    evidence.limitation = ['Bright lesions without any red lesion do not map to a ' ...
                           'DR grade under ICDR. Likely a false positive or ' ...
                           'non-DR pathology — worth a human look.'];
else
    evidence.criterion = 'No DR: no lesions detected';
    evidence.limitation = severeCriteriaNote();
end
end

% ── Helpers ─────────────────────────────────────────────────────────────────
function note = severeCriteriaNote()
note = ['Severe-NPDR criteria (b) venous beading and (c) IRMA were NOT ' ...
        'assessed — no detector exists. This grade may be an under-call.'];
end

function v = validateCounts(x, name)
if ~isnumeric(x) || ~isvector(x) || numel(x) ~= 4
    error('ruleEngineGrade:badCounts', ...
          '%s must be a 1x4 numeric vector (one count per quadrant).', name);
end
if any(x < 0) || any(~isfinite(x)) || any(mod(x, 1) ~= 0)
    error('ruleEngineGrade:badCounts', ...
          '%s must contain non-negative integers.', name);
end
v = double(x(:))';
end

function v = getdef(s, name, dflt)
if isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
