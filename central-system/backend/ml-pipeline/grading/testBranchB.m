function testBranchB()
% TESTBRANCHB  Unit tests for Tasks 5.1 and 5.2.
%
%   Run: matlab -batch "testBranchB"
%
%   Task 5.1's Definition of Done asks for at least five hand-constructed cases,
%   one per grade 0-4. This is the easiest piece in the whole ML layer to test
%   properly — pure function, no I/O, no randomness, no toolbox — so it gets
%   tested properly rather than eyeballed.
%
%   Every expected value below is derived from the ICDR/ETDRS rule text, not
%   from running the code and recording what it happened to produce. A test
%   written the second way passes by construction and proves nothing.

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);

fprintf('\n===== Branch B rule engine (Task 5.1) =====\n');
n = 0; f = 0;

% ── One case per grade, as the DoD requires ─────────────────────────────────
% Counts here are what the SEGMENTER produces, not what a clinician would
% count. The thresholds were recalibrated against real inference output on
% 2026-09-09 (see ruleEngineGrade's header), so cases that used to need 20+
% lesions per quadrant now need 3 — and cases with one or two detections are
% now noise rather than grade 1.
[n,f] = t(n, f, 'grade 0: no lesions at all', ...
    ruleEngineGrade([0 0 0 0], [0 0 0 0], 0.0), 0);

[n,f] = t(n, f, 'grade 1: red lesions above the noise floor, few', ...
    ruleEngineGrade([2 1 0 0], [0 0 0 0], 0.0), 1);

[n,f] = t(n, f, 'grade 2: red lesions WITH bright lesions', ...
    ruleEngineGrade([3 2 0 0], [1 0 0 0], 0.1), 2);

[n,f] = t(n, f, 'grade 2: >5 red lesions, no bright', ...
    ruleEngineGrade([4 3 1 0], [0 0 0 0], 0.1), 2);

[n,f] = t(n, f, 'grade 3: 4-2-1(a) structure, >=3 red in ALL four quadrants', ...
    ruleEngineGrade([4 3 5 3], [5 0 0 0], 0.2), 3);

% Grade 4 is CAPPED by default. The criterion still fires and is still
% reported; what changes is that the branch does not emit the label.
[n,f] = t(n, f, 'grade 4: NV suspicion fires but is CAPPED to 3 by default', ...
    ruleEngineGrade([10 10 10 10], [2 2 0 0], 0.75), 3);
[n,f] = t(n, f, 'grade 4: emitted when the cap is explicitly lifted', ...
    ruleEngineGrade([10 10 10 10], [2 2 0 0], 0.75, struct('maxGrade', 4)), 4);

[~, evCap] = ruleEngineGrade([10 10 10 10], [2 2 0 0], 0.75);
[n,f] = tt(n, f, 'the cap is RECORDED, not silent', ...
    isequal(evCap.cappedFrom, 4) && contains(evCap.limitation, 'CAPPED'), ...
    evCap.limitation);
[~, evNoCap] = ruleEngineGrade([4 3 5 3], [0 0 0 0], 0.1);
[n,f] = tt(n, f, 'an uncapped grade records cappedFrom as empty', ...
    isempty(evNoCap.cappedFrom), 'grade 3 was not capped');

% ── The recalibrated thresholds, asserted directly ──────────────────────────
% These are the constants Tanuj measured. They are asserted so a future edit
% that quietly restores the clinical numbers fails loudly rather than making
% grade 3 unreachable again.
fprintf('\n--- recalibrated noise floor (redFloor = 3) ---\n');

[n,f] = t(n, f, '2 red detections are NOISE -> grade 0, not 1', ...
    ruleEngineGrade([2 0 0 0], [0 0 0 0], 0), 0);
[n,f] = t(n, f, '3 red detections clear the floor -> grade 1', ...
    ruleEngineGrade([3 0 0 0], [0 0 0 0], 0), 1);

% Sub-floor red lesions do not become referable just because a bright lesion
% appeared alongside them: the grade-2 rule needs red lesions that are real.
[n,f] = t(n, f, 'sub-floor red + a bright lesion is still 0, not 2', ...
    ruleEngineGrade([2 0 0 0], [1 0 0 0], 0), 0);

[~, evSub] = ruleEngineGrade([2 0 0 0], [0 0 0 0], 0);
[n,f] = tt(n, f, 'a sub-floor case SAYS the detector fired', ...
    contains(evSub.criterion, 'below the noise floor'), evSub.criterion);

fprintf('\n--- recalibrated severe-NPDR threshold (grade3QuadMin = 3) ---\n');

[n,f] = t(n, f, 'exactly 3 in all four quadrants -> severe (rule is >=)', ...
    ruleEngineGrade([3 3 3 3], [0 0 0 0], 0), 3);
[n,f] = t(n, f, 'three quadrants at 3, one at 2 -> NOT severe', ...
    ruleEngineGrade([3 3 3 2], [0 0 0 0], 0), 2);
[n,f] = t(n, f, 'many lesions in only three quadrants -> NOT severe', ...
    ruleEngineGrade([9 9 9 0], [0 0 0 0], 0), 2);

% The old threshold was unreachable on real data. This asserts the failure mode
% it caused: under the literature's >20 rule, a genuinely severe eye graded 2.
[n,f] = t(n, f, 'the OLD >20 threshold would have called this severe eye 2', ...
    ruleEngineGrade([4 3 5 3], [0 0 0 0], 0, struct('grade3QuadMin', 21)), 2);

% ── Boundaries, where off-by-one errors actually live ───────────────────────
fprintf('\n--- boundaries ---\n');

[n,f] = t(n, f, 'exactly 5 red, no bright -> 1 (not 2; rule is >5)', ...
    ruleEngineGrade([5 0 0 0], [0 0 0 0], 0), 1);
[n,f] = t(n, f, 'exactly 6 red, no bright -> 2', ...
    ruleEngineGrade([6 0 0 0], [0 0 0 0], 0), 2);

[n,f] = t(n, f, 'NV exactly at 0.6 -> criterion does NOT fire (rule is strictly >)', ...
    ruleEngineGrade([3 0 0 0], [0 0 0 0], 0.6), 1);
[n,f] = t(n, f, 'NV just above 0.6 -> fires, then caps to 3', ...
    ruleEngineGrade([3 0 0 0], [0 0 0 0], 0.601), 3);

% ── Precedence: a higher criterion must win ─────────────────────────────────
fprintf('\n--- precedence ---\n');

% Checked with the cap lifted, because at the default cap both criteria return
% 3 and the test would pass without proving the ordering.
[n,f] = t(n, f, 'NV outranks severe haemorrhages (cap lifted to see it)', ...
    ruleEngineGrade([25 25 25 25], [9 9 9 9], 0.9, struct('maxGrade', 4)), 4);
[n,f] = t(n, f, 'severe haemorrhages outrank moderate', ...
    ruleEngineGrade([21 21 21 21], [1 0 0 0], 0.1), 3);

% ── The missing severe-NPDR criteria ────────────────────────────────────────
fprintf('\n--- ETDRS 4-2-1 (b) and (c), currently undetectable ---\n');

[n,f] = t(n, f, 'venous beading in 2 quadrants -> 3 (when supplied)', ...
    ruleEngineGrade([3 0 0 0], [0 0 0 0], 0, struct('venousBeadingQuadrants', 2)), 3);
[n,f] = t(n, f, 'venous beading in 1 quadrant -> not severe', ...
    ruleEngineGrade([3 0 0 0], [0 0 0 0], 0, struct('venousBeadingQuadrants', 1)), 1);
[n,f] = t(n, f, 'IRMA in 1 quadrant -> 3 (when supplied)', ...
    ruleEngineGrade([3 0 0 0], [0 0 0 0], 0, struct('irmaQuadrants', 1)), 3);

% This is the documented under-grading, asserted so it cannot change silently.
[n,f] = t(n, f, 'DEFAULT: beading/IRMA absent -> same case grades 1, an UNDER-CALL', ...
    ruleEngineGrade([3 0 0 0], [0 0 0 0], 0), 1);

% ── Evidence output ─────────────────────────────────────────────────────────
fprintf('\n--- evidence traceability ---\n');
[g, ev] = ruleEngineGrade([3 2 0 0], [1 0 0 0], 0.1);
[n,f] = tt(n, f, 'evidence names the criterion that fired', ...
    ~isempty(ev.criterion) && contains(ev.criterion, 'Moderate'), ev.criterion);
[n,f] = tt(n, f, 'evidence totals match the inputs', ...
    ev.redTotal == 5 && ev.brightTotal == 1, ...
    sprintf('red %d, bright %d', ev.redTotal, ev.brightTotal));
[n,f] = tt(n, f, 'evidence carries the under-grading limitation', ...
    contains(ev.limitation, 'venous beading'), ev.limitation);
[n,f] = tt(n, f, 'evidence records the thresholds it was graded under', ...
    ev.redFloor == 3 && ev.grade3QuadMin == 3, ...
    sprintf('redFloor %d, grade3QuadMin %d', ev.redFloor, ev.grade3QuadMin));
% A grade-2 call resting on ONE bright lesion must say so: that constant is the
% only unmeasured one, and it sits on the referral boundary.
[n,f] = tt(n, f, 'a bright-driven grade 2 flags the unmeasured bright floor', ...
    contains(ev.limitation, 'never been measured'), ev.limitation);

[~, ev3] = ruleEngineGrade([4 3 5 3], [0 0 0 0], 0);
[n,f] = tt(n, f, 'a severe call admits the count is not the clinical 20', ...
    contains(ev3.criterion, 'recalibrated segmenter threshold'), ev3.criterion);
[n,f] = tt(n, f, 'a severe call admits it rests on two images', ...
    contains(ev3.limitation, 'PROVISIONAL'), ev3.limitation);

[~, ev0] = ruleEngineGrade([0 0 0 0], [4 0 0 0], 0);
[n,f] = tt(n, f, 'bright-only case is flagged, not silently graded 0', ...
    contains(ev0.limitation, 'false positive'), ev0.limitation);

[~, ev4] = ruleEngineGrade([0 0 0 0], [0 0 0 0], 0.9);
[n,f] = tt(n, f, 'grade 4 evidence says SUSPICION, not detection', ...
    contains(ev4.limitation, 'NOT a validated'), ev4.limitation);

% ── Input validation ────────────────────────────────────────────────────────
fprintf('\n--- input validation ---\n');
[n,f] = tErr(n, f, 'rejects a 3-element count vector', ...
    @() ruleEngineGrade([1 2 3], [0 0 0 0], 0));
[n,f] = tErr(n, f, 'rejects negative counts', ...
    @() ruleEngineGrade([-1 0 0 0], [0 0 0 0], 0));
[n,f] = tErr(n, f, 'rejects non-integer counts', ...
    @() ruleEngineGrade([1.5 0 0 0], [0 0 0 0], 0));
[n,f] = tErr(n, f, 'rejects a non-scalar NV score', ...
    @() ruleEngineGrade([1 0 0 0], [0 0 0 0], [0.1 0.2]));

% ── Task 5.2 ────────────────────────────────────────────────────────────────
fprintf('\n===== Branch agreement (Task 5.2) =====\n');

[a1, d1] = branchesAgree(2, 2);
[n,f] = tt(n, f, 'equal grades agree', a1 == true && d1.gap == 0, d1.reason);

[a2, d2] = branchesAgree(2, 3);
[n,f] = tt(n, f, 'different grades disagree, gap reported', ...
    a2 == false && d2.gap == 1, d2.reason);

[a3, d3] = branchesAgree(0, 4);
[n,f] = tt(n, f, 'a 4-grade split reports gap 4', a3 == false && d3.gap == 4, d3.reason);

% The important one: unavailable is NOT disagreement.
[a4, d4] = branchesAgree(2, []);
[n,f] = tt(n, f, 'missing Branch B returns [] — NOT false', ...
    isempty(a4) && ~d4.comparable, d4.reason);
[a5, ~] = branchesAgree(2, NaN);
[n,f] = tt(n, f, 'NaN Branch B returns [] — NOT false', isempty(a5), 'NaN handled');
[a6, ~] = branchesAgree([], []);
% ── The rule engine's ceiling grade is a LOWER BOUND ────────────────────────
% A capped grade means ">= 3, cannot tell which", not "= 3". These assert the
% asymmetry, which is the whole safety property: consistent-but-unconfirmed and
% flatly-contradicted must NOT collapse to the same answer.
fprintf('\n--- lower-bound agreement (rule engine at its ceiling) ---\n');

[aLB1, dLB1] = branchesAgree(3, 3, true);
[n,f] = tt(n, f, 'CNN 3 vs rule >=3 is NOT agreement -- it is []', ...
    isempty(aLB1) && dLB1.lowerBound, dLB1.reason);

[aLB2, dLB2] = branchesAgree(4, 3, true);
[n,f] = tt(n, f, 'CNN 4 vs rule >=3 is NOT disagreement -- also []', ...
    isempty(aLB2), dLB2.reason);

[aLB3, dLB3] = branchesAgree(0, 3, true);
[n,f] = tt(n, f, 'CNN 0 vs rule >=3 IS a disagreement -- false, not []', ...
    islogical(aLB3) && aLB3 == false, dLB3.reason);
[n,f] = tt(n, f, 'and it says the rule grade may be higher still', ...
    contains(dLB3.reason, 'at least'), dLB3.reason);

% Without the flag the old behaviour must be unchanged, or every existing
% caller silently changes meaning.
[aNB, ~] = branchesAgree(3, 3);
[n,f] = tt(n, f, 'DEFAULT (no flag): 3 vs 3 still agrees', ...
    islogical(aNB) && aNB == true, 'backwards compatible');

% The flag comes FROM ruleEngineGrade, so the two must line up in practice.
[gCeil, evCeil] = ruleEngineGrade([4 3 5 3], [0 0 0 0], 0);
[n,f] = tt(n, f, 'a severe-NPDR call is flagged as a lower bound', ...
    gCeil == 3 && evCeil.isLowerBound, sprintf('grade %d', gCeil));
[~, evMid] = ruleEngineGrade([6 0 0 0], [0 0 0 0], 0);
[n,f] = tt(n, f, 'a grade-2 call is NOT a lower bound', ...
    ~evMid.isLowerBound, 'grade 2 is a determination');
[~, evNv] = ruleEngineGrade([1 1 1 1], [0 0 0 0], 0.9);
[n,f] = tt(n, f, 'an NV call capped to 3 is a lower bound too', ...
    evNv.isLowerBound && isequal(evNv.cappedFrom, 4), 'capped from 4');

[n,f] = tt(n, f, 'both missing returns []',isempty(a6), 'both missing');

% ── Summary ─────────────────────────────────────────────────────────────────
fprintf('\n===== %d/%d passed =====\n\n', n - f, n);
if f > 0
    error('testBranchB: %d test(s) failed.', f);
end
end

% ── Harness ─────────────────────────────────────────────────────────────────
function [n, f] = t(n, f, label, actual, expected)
n = n + 1;
if isequal(actual, expected)
    fprintf('  PASS  %s\n', label);
else
    fprintf('  FAIL  %s  [expected %d, got %d]\n', label, expected, actual);
    f = f + 1;
end
end

function [n, f] = tt(n, f, label, condition, detail)
n = n + 1;
if condition
    fprintf('  PASS  %s\n', label);
else
    fprintf('  FAIL  %s  [%s]\n', label, detail);
    f = f + 1;
end
end

function [n, f] = tErr(n, f, label, fn)
n = n + 1;
try
    fn();
    fprintf('  FAIL  %s  [no error raised]\n', label);
    f = f + 1;
catch
    fprintf('  PASS  %s\n', label);
end
end
