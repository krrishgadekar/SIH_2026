function testRuleEngineSignals()
% TESTRULEENGINESIGNALS  Backend plan §H (venous beading, IRMA) and §I
% (fovea unreliable) in ruleEngineGrade.
%
%   matlab -batch "cd('central-system/backend/ml-pipeline/grading'); testRuleEngineSignals"
%
% The detector outputs are the contract with the vessel-analysis side:
% 1x4 logicals in fundusQuadrants('names') order. These tests feed that shape
% directly, so they pass the day the real fields arrive with no change here.

failures = 0; total = 0;
    function check(label, ok)
        total = total + 1;
        if ok, fprintf('  PASS  %s\n', label);
        else,  fprintf('  FAIL  %s\n', label); failures = failures + 1; end
    end

noRed = [0 0 0 0]; noBright = [0 0 0 0];
mildRed = [1 1 1 0];            % total 3 = redFloor -> grade 1 on its own

fprintf('\n===== §H: venous beading (b) and IRMA (c) =====\n');
[g, e] = ruleEngineGrade(noRed, noBright, 0, struct('venousBeadingQuadrants', logical([1 1 0 0])));
check('VB in 2 quadrants -> grade 3 via 4-2-1(b)', g == 3 && contains(e.criterion, '(b)'));
check('...and evidence records VB as assessed, count 2', e.venousBeadingAssessed && e.venousBeadingQuadrantCount == 2);

[g, ~] = ruleEngineGrade(noRed, noBright, 0, struct('venousBeadingQuadrants', logical([1 0 0 0])));
check('VB in only 1 quadrant does NOT make severe NPDR', g < 3);

[g, e] = ruleEngineGrade(noRed, noBright, 0, struct('irmaQuadrants', logical([0 0 1 0])));
check('IRMA in any one quadrant -> grade 3 via 4-2-1(c)', g == 3 && contains(e.criterion, '(c)'));

[g, ~] = ruleEngineGrade(mildRed, noBright, 0, struct( ...
    'venousBeadingQuadrants', [0 1 1 0], 'irmaQuadrants', [0 0 0 0]));
check('numeric 0/1 arrays are accepted like logicals (VB 2 quadrants -> 3)', g == 3);

[g, ~] = ruleEngineGrade(noRed, noBright, 0, struct('venousBeadingQuadrants', 2));
check('legacy scalar quadrant count still works', g == 3);

fprintf('\n===== assessed vs not assessed =====\n');
[g, e] = ruleEngineGrade(mildRed, noBright, 0);
check('no detector output: mild NPDR, caveat names BOTH (b) and (c)', ...
    g == 1 && contains(e.limitation, '(b) venous beading and (c) IRMA were NOT'));
check('...and neither is marked assessed', ~e.venousBeadingAssessed && ~e.irmaAssessed);

[g, e] = ruleEngineGrade(mildRed, noBright, 0, struct( ...
    'venousBeadingQuadrants', false(1, 4), 'irmaQuadrants', false(1, 4)));
check('all-false detector output: same grade, caveat GONE (both were assessed)', ...
    g == 1 && ~contains(e.limitation, 'NOT assessed') && e.venousBeadingAssessed && e.irmaAssessed);

[~, e] = ruleEngineGrade(mildRed, noBright, 0, struct('irmaQuadrants', false(1, 4)));
check('only IRMA supplied: caveat names only (b)', ...
    contains(e.limitation, '(b) venous beading was NOT') && ~contains(e.limitation, '(c)'));

threw = false;
try, ruleEngineGrade(noRed, noBright, 0, struct('irmaQuadrants', [1 0])); catch, threw = true; end
check('a wrong-length flag array is refused, not silently read', threw);

fprintf('\n===== §I: fovea unreliable =====\n');
allFour = [3 3 3 3];
[g, ~] = ruleEngineGrade(allFour, noBright, 0);
check('baseline: red >=3 in all four quadrants is severe NPDR (a)', g == 3);
[g, e] = ruleEngineGrade(allFour, noBright, 0, struct('foveaUnreliable', true));
check('fovea unreliable: criterion (a) NOT applied -> graded on totals (moderate)', g == 2);
check('...evidence flags it and explains why', e.foveaUnreliable && contains(e.limitation, 'Fovea could not be located'));

[g, ~] = ruleEngineGrade(noRed, noBright, 0, struct('foveaUnreliable', true, ...
    'venousBeadingQuadrants', true(1, 4)));
check('fovea unreliable: VB (quadrant-dependent) is skipped too', g < 3);

[g, e] = ruleEngineGrade(noRed, noBright, 0, struct('foveaUnreliable', true, ...
    'irmaQuadrants', logical([1 0 0 0])));
check('fovea unreliable: IRMA in ANY quadrant still counts (location-free)', g == 3 && contains(e.limitation, 'Fovea'));

[g, e] = ruleEngineGrade(allFour, noBright, 0, struct('foveaUnreliable', false));
check('foveaUnreliable=false behaves exactly like the default', g == 3 && ~e.foveaUnreliable);

fprintf('\n===== %d/%d passed =====\n', total - failures, total);
if failures > 0, error('testRuleEngineSignals:failed', '%d check(s) failed', failures); end
end
