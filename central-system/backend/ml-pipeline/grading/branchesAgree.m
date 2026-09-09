function [agree, detail] = branchesAgree(gradeA, gradeB)
% BRANCHESAGREE  Do the CNN and the rule engine give the same grade?
%
%   agree           = branchesAgree(gradeA, gradeB)
%   [agree, detail] = branchesAgree(gradeA, gradeB)
%
%   Inputs:
%     gradeA - Branch A, the CNN grade (0-4), or [] / NaN if unavailable.
%     gradeB - Branch B, the rule-engine grade (0-4), or [] / NaN.
%
%   Outputs:
%     agree  - logical, or [] when either branch is unavailable. NOT false.
%     detail - struct: .comparable, .gap, .reason
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

detail = struct('comparable', false, 'gap', NaN, 'reason', '');

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

function ok = isValidGrade(g)
ok = ~isempty(g) && isnumeric(g) && isscalar(g) && isfinite(g) ...
     && g >= 0 && g <= 4 && mod(g, 1) == 0;
end
