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
%     opts - optional struct, all thresholds overridable:
%       .redFloor               3 - counts at or below this are noise, not disease
%       .grade3QuadMin          3 - per-quadrant red count for severe NPDR
%       .moderateRedCount       5 - total red above this is moderate on its own
%       .brightFloor            1 - bright counts below this are noise
%       .maxGrade               3 - cap on the output (see GRADE 4 IS CAPPED)
%       .nvThreshold          0.6
%       .venousBeadingQuadrants []  1x4 logical, one per quadrant (Tanuj's
%                                   detector), or a scalar quadrant count.
%                                   [] / absent = NOT ASSESSED.
%       .irmaQuadrants          []  same shape and meaning, for IRMA
%       .foveaUnreliable     false  the fovea could not be placed reliably
%                                   (backend plan §I) -- see below
%
%   Outputs:
%     grade    - integer on the International Clinical DR severity scale,
%                0-.maxGrade (0-3 by default, NOT 0-4 — see below).
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
%   ══ THE THRESHOLDS ARE SEGMENTER THRESHOLDS, NOT CLINICAL ONES ═════════════
%   The original constants (any red lesion at all is grade 1; >20 red lesions in
%   all four quadrants is severe NPDR) come from the clinical literature, where
%   the counts are made by a human who only counts real lesions. This code does
%   not receive those counts. It receives the output of a segmentation network,
%   which has a false-positive floor — and applying a clinician's threshold to a
%   detector's output is a category error, not a conservative approximation.
%
%   Measured on 14 validation images with the real segmentation models
%   (diagnostics/out/recalibrated_results.csv, Tanuj, 2026-09-09):
%     - every grade-0 image produced 1-2 spurious red-lesion detections, so the
%       old "any red lesion => grade 1" rule fired on healthy eyes;
%     - no real image ever reached >20 red lesions in all four quadrants, so the
%       old severe-NPDR criterion was unreachable and grade 3 was dead code.
%   Hence redFloor = 3 (the measured noise floor) and grade3QuadMin = 3, which
%   separated both grade-3 images from every grade-2 image in that data.
%
%   ── THE CAVEAT, WHICH TRAVELS WITH THE NUMBERS ─────────────────────────────
%   That separation rests on TWO grade-3 images. It is real data and better than
%   an unreachable threshold, but it is not a sample size that supports a
%   claimed operating point. grade3QuadMin especially is PROVISIONAL and should
%   be refitted whenever more labelled data exists. It is an opt for that reason.
%
%   brightFloor is NOT measured. No bright-lesion noise floor was reported, so it
%   keeps the old "any bright lesion counts" behaviour. That is the weakest
%   constant here and it sits on a referral boundary: with redFloor = 3, an image
%   with three red detections and ONE spurious exudate is graded 2, which is
%   referable. If bright-lesion false positives are later measured, this is the
%   number to fix first.
%
%   ══ GRADE 4 IS CAPPED, AND THAT IS A SAFETY DECISION ═══════════════════════
%   maxGrade defaults to 3, so this branch cannot output 4 (proliferative DR).
%
%   The path to 4 is nvSuspicionScore > nvThreshold, and that score comes from
%   neovascularizationSuspicion.m — a vessel-density-and-tortuosity heuristic
%   whose own header states it is not a validated detector, has no ground truth
%   behind it, and whose weighting is a starting point rather than a fitted
%   formula. A grade of 4 is the most consequential output this system can
%   produce. Producing it from an unvalidated heuristic is the overclaim this
%   project has consistently refused to make elsewhere, and it should not be
%   made here either.
%
%   Capping does not lose grade-4 detection; it moves it onto the mechanism
%   designed for it. Branch A can and does predict 4. When it does and this
%   branch says 3, branchesAgree returns FALSE, and that forces
%   conformal_tier = 'C' — mandatory human review. A suspected proliferative
%   case reaches an ophthalmologist either way; the difference is that it
%   arrives flagged for a human decision rather than carrying an automated
%   grade-4 label nothing in this pipeline can support.
%
%   Set opts.maxGrade = 4 to re-enable the branch. The NV criterion is still
%   EVALUATED when capped, and evidence.cappedFrom records that it fired, so the
%   suspicion is reported rather than silently dropped.
%
%   ══ KNOWN UNDER-GRADING: TWO OF THE THREE SEVERE-NPDR CRITERIA ARE MISSING ══
%   The ETDRS "4-2-1 rule" defines severe NPDR as ANY of:
%     (a) extensive haemorrhages in all 4 quadrants   <- implemented, see below
%     (b) venous beading in >= 2 quadrants            <- NO DETECTOR EXISTS
%     (c) prominent IRMA in >= 1 quadrant             <- NO DETECTOR EXISTS
%
%   Nothing in this pipeline detects venous beading or IRMA. Both are therefore
%   treated as FALSE — never guessed at from a proxy, because a fabricated
%   criterion is worse than an absent one.
%
%   For (a), the STRUCTURE is ETDRS — disease in all four quadrants — but the
%   COUNT is the recalibrated segmenter threshold above, not the literature's
%   20. The evidence string says so; it must not claim to be the clinical
%   criterion when the number in it is empirical.
%
%   The consequence must be stated plainly: an eye that is severe NPDR by (b) or
%   (c) alone will be graded 2 by this branch, not 3. Branch B can UNDER-grade
%   severe NPDR, and it does so silently. That is survivable only because it is
%   one of two branches — Branch A sees the whole image and would likely call
%   such an eye higher, and the resulting DISAGREEMENT routes the case to a
%   human, which is exactly the safety mechanism the dual-branch design is for.
%
%   opts.venousBeadingQuadrants / opts.irmaQuadrants exist so a future detector
%   plugs in without changing this signature or its semantics.
%
%   ── WHEN THE DETECTORS ARE SUPPLIED (backend plan §H) ──────────────────────
%   The contract with the vessel-analysis side is a 1x4 logical per criterion,
%   one entry per quadrant in fundusQuadrants('names') order:
%     (b) fires when sum(venousBeadingQuadrants) >= 2
%     (c) fires when any(irmaQuadrants)
%   OR'd with (a): severe NPDR on ANY one of the three. A supplied array --
%   even all false -- means that criterion WAS assessed, and the "not
%   assessed" caveat is dropped for it. An absent or empty value keeps the
%   caveat. That distinction is the point: an all-false mock must never be
%   passed in just to make the evidence text look complete.
%
%   ══ FOVEA UNRELIABLE (backend plan §I) ═════════════════════════════════════
%   Quadrants are defined around the fovea-to-disc axis. When the localizer
%   says the fovea could not be placed (opts.foveaUnreliable = true), the
%   upstream quadrant assignment does NOT fall back to anything (Tanuj,
%   2026-09-20): segInfer still builds the axis from the flagged fovea
%   coordinate, so the counts arrive keyed to an axis drawn through a point
%   the gate has already called untrustworthy. They are not the anatomical
%   quadrants the ETDRS rule is written for. So the two
%   criteria that depend on WHICH quadrants are involved are skipped:
%     (a) lesions in all four quadrants, and (b) venous beading in >= 2.
%   Grading then rests on totals only -- the criteria that do not care where a
%   lesion sits: (c) IRMA in any quadrant, NV, and the moderate/mild counts.
%   The evidence says so, and the orchestrator holds such a case at Tier B or
%   worse, so a human sees it. This can UNDER-call severe NPDR by (a)/(b); that
%   is the stated trade against grading on quadrants that are not real.

if nargin < 4, opts = struct(); end

redFloor         = getdef(opts, 'redFloor',               3);
grade3QuadMin    = getdef(opts, 'grade3QuadMin',          3);
moderateRedCount = getdef(opts, 'moderateRedCount',       5);
brightFloor      = getdef(opts, 'brightFloor',            1);
maxGrade         = getdef(opts, 'maxGrade',               3);
nvThreshold      = getdef(opts, 'nvThreshold',          0.6);
[venousBeadingQ, vbAssessed]   = quadrantFlags(opts, 'venousBeadingQuadrants');
[irmaQ,          irmaAssessed] = quadrantFlags(opts, 'irmaQuadrants');
foveaUnreliable  = isfield(opts, 'foveaUnreliable') && isequal(opts.foveaUnreliable, true);

red    = validateCounts(redLesionQuadrantCounts,    'redLesionQuadrantCounts');
bright = validateCounts(brightLesionQuadrantCounts, 'brightLesionQuadrantCounts');

if ~isnumeric(nvSuspicionScore) || ~isscalar(nvSuspicionScore) || ~isfinite(nvSuspicionScore)
    error('ruleEngineGrade:badNv', 'nvSuspicionScore must be a finite scalar.');
end

cfg = struct('redFloor', redFloor, 'grade3QuadMin', grade3QuadMin, ...
             'moderateRedCount', moderateRedCount, 'brightFloor', brightFloor, ...
             'nvThreshold', nvThreshold, 'venousBeadingQ', venousBeadingQ, ...
             'irmaQ', irmaQ, 'vbAssessed', vbAssessed, 'irmaAssessed', irmaAssessed, ...
             'foveaUnreliable', foveaUnreliable);

[rawGrade, evidence] = applyCriteria(red, bright, nvSuspicionScore, cfg);

% ── The cap, applied uniformly at the end ──────────────────────────────────
% Applied here rather than inside each branch so there is exactly one place the
% output range is decided, and so the criterion that fired is still recorded
% truthfully before it is capped.
evidence.maxGrade   = maxGrade;
evidence.cappedFrom = [];

% ── A GRADE AT THE CEILING IS A LOWER BOUND, NOT A DETERMINATION ──────────
% When the output equals maxGrade, this branch is not saying "the grade is 3".
% It is saying "3 or worse, and I cannot tell which" -- because everything above
% maxGrade is unrepresentable here by construction.
%
% That distinction decides what branchesAgree may conclude, and getting it wrong
% is unsafe in both directions:
%
%   Treated as "= 3": Branch A saying 3 reads as CONFIRMATION, when the rule
%   engine never distinguished 3 from 4. The case-detail panel then tells a
%   reviewer that two independent methods agree on a grade one of them never
%   asserted.
%
%   Treated as "no opinion at all": Branch A saying 0 would read as merely
%   uncomparable, when in fact the rule engine found severe disease and the two
%   branches flatly contradict each other -- the single most important
%   disagreement this design exists to catch.
%
% So it is reported as what it is, and branchesAgree applies the bound.
% rawGrade >= maxGrade, so this covers both a criterion that landed exactly on
% the ceiling and one that was capped down to it.
evidence.isLowerBound = (rawGrade >= maxGrade);

if rawGrade > maxGrade
    evidence.cappedFrom = rawGrade;
    evidence.limitation = sprintf(['%s Rule-engine grade %d was CAPPED to %d: ' ...
        'the only path above %d is an unvalidated NV suspicion heuristic. ' ...
        'Grade-%d detection is delegated to Branch A, and a branch ' ...
        'disagreement forces mandatory human review.'], ...
        evidence.limitation, rawGrade, maxGrade, maxGrade, rawGrade);
    grade = maxGrade;
else
    grade = rawGrade;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function [grade, evidence] = applyCriteria(red, bright, nvSuspicionScore, cfg)

totalRed    = sum(red);
totalBright = sum(bright);

evidence = struct( ...
    'criterion', '', 'redTotal', totalRed, 'brightTotal', totalBright, ...
    'redByQuadrant', red, 'brightByQuadrant', bright, ...
    'nvSuspicionScore', nvSuspicionScore, ...
    'venousBeadingAssessed', cfg.vbAssessed, 'irmaAssessed', cfg.irmaAssessed, ...
    'venousBeadingQuadrantCount', cfg.venousBeadingQ, 'irmaQuadrantCount', cfg.irmaQ, ...
    'foveaUnreliable', cfg.foveaUnreliable, ...
    'redFloor', cfg.redFloor, 'grade3QuadMin', cfg.grade3QuadMin, ...
    'limitation', '');

% Everything below counts only lesions ABOVE the measured noise floor.
redPresent    = totalRed    >= cfg.redFloor;
brightPresent = totalBright >= cfg.brightFloor;

% ── Grade 4: proliferative DR ───────────────────────────────────────────────
% Suspicion, not confirmation. neovascularizationSuspicion is explicitly not a
% validated detector (design doc §1.12), so this is a route-to-urgent-review
% trigger and must be reported as "possible proliferative pattern", never as
% confirmed neovascularization. By default the caller caps this to 3 — see the
% header — but the criterion is still evaluated and reported.
if nvSuspicionScore > cfg.nvThreshold
    grade = 4;
    evidence.criterion = sprintf( ...
        'NV suspicion %.2f exceeds %.2f — possible proliferative pattern, urgent review', ...
        nvSuspicionScore, cfg.nvThreshold);
    evidence.limitation = ['NV suspicion is a vessel-irregularity signal, NOT a ' ...
                           'validated neovascularization detector.'];
    return;
end

% ── Grade 3: severe NPDR ────────────────────────────────────────────────────
% (a) Lesions in ALL FOUR quadrants. ETDRS structure, recalibrated count.
%
% `any(...) && all(...)` rather than `all(...)` alone. For a 1x4 input the two
% are identical; they differ only on an EMPTY input, where all([]) is vacuously
% true and any([]) is false. Keeping both means an empty count vector cannot
% silently produce a severe-NPDR grade.
if ~cfg.foveaUnreliable && any(red >= cfg.grade3QuadMin) && all(red >= cfg.grade3QuadMin)
    grade = 3;
    evidence.criterion = sprintf( ...
        ['Severe NPDR, ETDRS 4-2-1(a) structure: >=%d red lesions in all four ' ...
         'quadrants [%s]. The count is a recalibrated segmenter threshold, ' ...
         'not the literature 20.'], cfg.grade3QuadMin, num2str(red));
    evidence.limitation = provisionalNote(cfg.grade3QuadMin);
    return;
end

% (b) Venous beading in >= 2 quadrants, (c) prominent IRMA in >= 1.
% Both are FALSE unless a caller supplies a real detector's output. See the
% under-grading note in the header. (b) is quadrant-dependent and is skipped
% when the fovea is unreliable; (c) needs only "any quadrant", so it stands.
if ~cfg.foveaUnreliable && cfg.venousBeadingQ >= 2
    grade = 3;
    evidence.criterion = sprintf('ETDRS 4-2-1(b): venous beading in %d quadrants', cfg.venousBeadingQ);
    evidence.limitation = foveaNote(cfg);
    return;
end
if cfg.irmaQ >= 1
    grade = 3;
    evidence.criterion = sprintf('ETDRS 4-2-1(c): prominent IRMA in %d quadrant(s)', cfg.irmaQ);
    evidence.limitation = joinNotes({ ...
        'IRMA is a classical vessel-irregularity heuristic, not a validated detector.', ...
        foveaNote(cfg)});
    return;
end

% ── Grade 2: moderate NPDR ──────────────────────────────────────────────────
% Red lesions above the noise floor PLUS something else — either bright lesions,
% or enough red lesions to be more than minimal disease.
if redPresent && (brightPresent || totalRed > cfg.moderateRedCount)
    grade = 2;
    if brightPresent
        evidence.criterion = sprintf( ...
            'Moderate NPDR: %d red lesion(s) with %d bright lesion(s)', ...
            totalRed, totalBright);
        evidence.limitation = [severeCriteriaNote(cfg) ' ' brightFloorNote()];
    else
        evidence.criterion = sprintf( ...
            'Moderate NPDR: %d red lesions (>%d), no bright lesions', ...
            totalRed, cfg.moderateRedCount);
        evidence.limitation = severeCriteriaNote(cfg);
    end
    return;
end

% ── Grade 1: mild NPDR ──────────────────────────────────────────────────────
if redPresent
    grade = 1;
    evidence.criterion = sprintf('Mild NPDR: %d red lesion(s) only', totalRed);
    evidence.limitation = severeCriteriaNote(cfg);
    return;
end

% ── Grade 0: no DR ──────────────────────────────────────────────────────────
grade = 0;
if totalRed > 0
    % Below the noise floor. Reported rather than shown as a clean zero: the
    % detector did fire, and "0 with 2 sub-threshold detections" is a different
    % statement from "0 with nothing found" if a reviewer opens the case.
    evidence.criterion = sprintf( ...
        ['No DR: %d red detection(s), below the noise floor of %d. Every ' ...
         'grade-0 validation image produced 1-2 spurious detections, so counts ' ...
         'this low are not evidence of disease.'], totalRed, cfg.redFloor);
    evidence.limitation = severeCriteriaNote(cfg);
elseif brightPresent
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
    evidence.limitation = severeCriteriaNote(cfg);
end
end

% ── Helpers ─────────────────────────────────────────────────────────────────
function note = severeCriteriaNote(cfg)
% Names only the criteria that were actually NOT assessed, so a supplied
% detector result removes its own caveat and nothing else.
missing = {};
if ~cfg.vbAssessed,   missing{end+1} = '(b) venous beading'; end
if ~cfg.irmaAssessed, missing{end+1} = '(c) IRMA'; end
if isempty(missing)
    note = '';
elseif numel(missing) == 2
    note = ['Severe-NPDR criteria (b) venous beading and (c) IRMA were NOT ' ...
            'assessed — no detector exists. This grade may be an under-call.'];
else
    note = sprintf(['Severe-NPDR criterion %s was NOT assessed. This grade ' ...
                    'may be an under-call.'], missing{1});
end
note = joinNotes({note, foveaNote(cfg)});
end

function note = foveaNote(cfg)
if cfg.foveaUnreliable
    note = ['Fovea could not be located reliably, so the quadrant assignment ' ...
            'cannot be trusted and the quadrant-dependent criteria (a) ' ...
            'all-four-quadrants and (b) venous beading were not applied.'];
else
    note = '';
end
end

function s = joinNotes(parts)
parts = parts(~cellfun(@isempty, parts));
s = strjoin(parts, ' ');
end

function [count, assessed] = quadrantFlags(opts, name)
% 1x4 logical (one per quadrant) -> number of quadrants flagged.
% A scalar is accepted as an already-counted value (the original interface).
% Absent or empty -> not assessed, count 0.
count = 0; assessed = false;
if ~isfield(opts, name) || isempty(opts.(name)), return; end
v = opts.(name);
if (islogical(v) || isnumeric(v)) && numel(v) == 4
    count = sum(logical(v(:)));
elseif isnumeric(v) && isscalar(v) && isfinite(v) && v >= 0 && mod(v, 1) == 0
    count = double(v);
else
    error('ruleEngineGrade:badQuadrantFlags', ...
          '%s must be a 1x4 logical (one per quadrant) or a quadrant count.', name);
end
assessed = true;
end

function note = provisionalNote(q)
note = sprintf(['The per-quadrant threshold of %d is PROVISIONAL: it was fitted ' ...
                'on two grade-3 images and should be refitted when more ' ...
                'labelled data exists.'], q);
end

function note = brightFloorNote()
note = ['The bright-lesion noise floor has never been measured, so a single ' ...
        'spurious exudate can lift this case from grade 1 to referable.'];
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
