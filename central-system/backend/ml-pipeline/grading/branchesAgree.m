function [agree, detail] = branchesAgree(gradeA, gradeB, bIsLowerBound)
% BRANCHESAGREE  Do the CNN and the rule engine give the same grade?
%
%   agree           = branchesAgree(gradeA, gradeB)
%   [agree, detail] = branchesAgree(gradeA, gradeB, bIsLowerBound)
%
%   Inputs:
%     gradeA        - Branch A, the CNN grade (0-4), or [] / NaN if unavailable.
%     gradeB        - Branch B, the rule-engine grade (0-4), or [] / NaN.
%     bIsLowerBound - false. Pass ruleEngineGrade's evidence.isLowerBound: true
%                     when gradeB sat at the rule engine's ceiling and therefore
%                     means ">= gradeB" rather than "= gradeB". See the section
%                     on it below — it changes what agreement can mean.
%
%   Outputs:
%     agree  - logical, or [] when either branch is unavailable. NOT false.
%     detail - struct: .comparable, .gap, .reason, .lowerBound
%
%   Task 5.2.
%
%   ── WHY DISAGREEMENT IS A FEATURE ──────────────────────────────────────────
%   This is the opposite of an ensemble. Two independent opinions are not
%   averaged: when they agree that agreement is itself evidence the grade is
%   right, and when they differ the case goes to a human REGARDLESS of either
%   branch's confidence (design doc §1.11, §6.7). Averaging would destroy
%   precisely the signal this exists to produce.
%
%   ── WHY UNAVAILABLE RETURNS [] AND NOT false ───────────────────────────────
%   `false` means "the branches were compared and they disagreed", which forces
%   the case to Tier C for mandatory review. "Branch B has not run yet" is a
%   completely different statement, and today it is the normal one — the rule
%   engine needs lesion counts from Phase 4 segmentation, which is not built.
%
%   Collapsing the two would send every ungraded case to mandatory review and
%   drown the queue in cases nothing has actually flagged. It maps to SQL NULL
%   in grading_results.branch_agreement, which api-contracts.md already requires
%   the frontend to handle.

if nargin < 3, bIsLowerBound = false; end

detail = struct('comparable', false, 'gap', NaN, 'reason', '', 'lowerBound', false);

aOk = isValidGrade(gradeA);
bOk = isValidGrade(gradeB);

if ~aOk || ~bOk
    agree = [];
    if ~aOk && ~bOk
        detail.reason = 'neither branch produced a grade';
    elseif ~bOk
        detail.reason = ['Branch B (rule engine) unavailable — needs lesion ' ...
                         'counts from Phase 4 segmentation'];
    else
        detail.reason = 'Branch A (CNN) unavailable';
    end
    return;
end

detail.comparable = true;
detail.gap = abs(double(gradeA) - double(gradeB));

% ── BRANCH B'S GRADE MAY BE A LOWER BOUND ─────────────────────────────────
% ruleEngineGrade caps its output at maxGrade (3 by default), so a grade there
% means ">= 3, and I cannot tell which" rather than "= 3". It reports that as
% evidence.isLowerBound, and the caller passes it through here.
%
% Under a bound there are exactly two honest answers, and neither is "agree":
%
%   gradeA >= gradeB : CONSISTENT but unconfirmed -> [] (no opinion)
%       The rule engine said "3 or worse". Branch A saying 3 does not confirm
%       that, and Branch A saying 4 does not contradict it. Recording either as
%       agreement would put "the branches agree" in front of a reviewer on a
%       grade the rule engine never actually asserted.
%
%   gradeA <  gradeB : genuine DISAGREEMENT -> false
%       The rule engine found severe disease and Branch A did not. The bound
%       makes this MORE certain, not less: "at least 3" versus "0" cannot be
%       reconciled by any resolution of the bound. This is the case the
%       dual-branch design exists for and it must still force review.
%
% Collapsing the bound to "no opinion" in both directions would lose that second
% case, which is the dangerous one.
if isLowerBoundFlag(bIsLowerBound)
    if double(gradeA) < double(gradeB)
        agree = false;
        detail.reason = sprintf( ...
            ['CNN says %d but the rule engine found at least %d ' ...
             '(its grade is a ceiling, so the true rule grade may be higher)'], ...
            double(gradeA), double(gradeB));
    else
        agree = [];
        detail.reason = sprintf( ...
            ['not comparable: the rule engine reports >= %d (its ceiling), ' ...
             'which neither confirms nor contradicts the CNN''s %d'], ...
            double(gradeB), double(gradeA));
    end
    detail.lowerBound = true;
    return;
end

detail.lowerBound = false;
agree = double(gradeA) == double(gradeB);

if agree
    detail.reason = sprintf('both branches grade %d', double(gradeA));
else
    % The size of the gap matters clinically even though the tier consequence
    % is the same: adjacent grades are a routine boundary call, while a
    % 3-grade split means one branch is badly wrong and the reviewer should
    % know which way before opening the image.
    detail.reason = sprintf('CNN says %d, rule engine says %d (gap %d)', ...
        double(gradeA), double(gradeB), detail.gap);
end
end

function tf = isLowerBoundFlag(v)
% Defensive: the flag arrives from jsonencode/struct plumbing, where a missing
% field can surface as [] rather than false. [] is falsy-ish in MATLAB only by
% accident, so it is normalised here rather than relied on at the if.
tf = ~isempty(v) && islogical(logical(v)) && logical(v);
end

function ok = isValidGrade(g)
ok = ~isempty(g) && isnumeric(g) && isscalar(g) && isfinite(g) ...
     && g >= 0 && g <= 4 && mod(g, 1) == 0;
end
