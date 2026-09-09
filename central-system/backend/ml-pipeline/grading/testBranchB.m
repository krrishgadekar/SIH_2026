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
[n,f] = t(n, f, 'grade 0: no lesions at all', ...
    ruleEngineGrade([0 0 0 0], [0 0 0 0], 0.0), 0);

[n,f] = t(n, f, 'grade 1: microaneurysms only, few', ...
    ruleEngineGrade([2 1 0 0], [0 0 0 0], 0.0), 1);

[n,f] = t(n, f, 'grade 2: red lesions WITH bright lesions', ...
    ruleEngineGrade([3 2 0 0], [1 0 0 0], 0.1), 2);

[n,f] = t(n, f, 'grade 2: >5 red lesions, no bright', ...
    ruleEngineGrade([4 3 1 0], [0 0 0 0], 0.1), 2);

[n,f] = t(n, f, 'grade 3: 4-2-1(a), >20 red in ALL four quadrants', ...
    ruleEngineGrade([25 30 22 40], [5 0 0 0], 0.2), 3);

[n,f] = t(n, f, 'grade 4: NV suspicion above threshold', ...
    ruleEngineGrade([10 10 10 10], [2 2 0 0], 0.75), 4);

% ── Boundaries, where off-by-one errors actually live ───────────────────────
fprintf('\n--- boundaries ---\n');

[n,f] = t(n, f, 'exactly 5 red, no bright -> 1 (not 2; rule is >5)', ...
    ruleEngineGrade([5 0 0 0], [0 0 0 0], 0), 1);
[n,f] = t(n, f, 'exactly 6 red, no bright -> 2', ...
    ruleEngineGrade([6 0 0 0], [0 0 0 0], 0), 2);

[n,f] = t(n, f, 'NV exactly at 0.6 -> NOT 4 (rule is strictly >)', ...
    ruleEngineGrade([1 0 0 0], [0 0 0 0], 0.6), 1);
[n,f] = t(n, f, 'NV just above 0.6 -> 4', ...
    ruleEngineGrade([1 0 0 0], [0 0 0 0], 0.601), 4);

[n,f] = t(n, f, '>20 in only THREE quadrants -> not severe', ...
    ruleEngineGrade([25 30 22 5], [0 0 0 0], 0), 2);
[n,f] = t(n, f, 'exactly 20 in all four -> not severe (rule is >20)', ...
    ruleEngineGrade([20 20 20 20], [0 0 0 0], 0), 2);

% ── Precedence: a higher criterion must win ─────────────────────────────────
fprintf('\n--- precedence ---\n');

[n,f] = t(n, f, 'NV outranks severe haemorrhages', ...
    ruleEngineGrade([25 25 25 25], [9 9 9 9], 0.9), 4);
[n,f] = t(n, f, 'severe haemorrhages outrank moderate', ...
    ruleEngineGrade([21 21 21 21], [1 0 0 0], 0.1), 3);

% ── The missing severe-NPDR criteria ────────────────────────────────────────
fprintf('\n--- ETDRS 4-2-1 (b) and (c), currently undetectable ---\n');

[n,f] = t(n, f, 'venous beading in 2 quadrants -> 3 (when supplied)', ...
    ruleEngineGrade([2 0 0 0], [0 0 0 0], 0, struct('venousBeadingQuadrants', 2)), 3);
[n,f] = t(n, f, 'venous beading in 1 quadrant -> not severe', ...
    ruleEngineGrade([2 0 0 0], [0 0 0 0], 0, struct('venousBeadingQuadrants', 1)), 1);
[n,f] = t(n, f, 'IRMA in 1 quadrant -> 3 (when supplied)', ...
    ruleEngineGrade([2 0 0 0], [0 0 0 0], 0, struct('irmaQuadrants', 1)), 3);

% This is the documented under-grading, asserted so it cannot change silently.
[n,f] = t(n, f, 'DEFAULT: beading/IRMA absent -> same case grades 1, an UNDER-CALL', ...
    ruleEngineGrade([2 0 0 0], [0 0 0 0], 0), 1);

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
[n,f] = tt(n, f, 'both missing returns []', isempty(a6), 'both missing');

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
