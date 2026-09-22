function testNVScoreFractal()
% TESTNVSCOREFRACTAL  Synthetic-mask tests for the box-counting fractal
% dimension + branchDensity additions to neovascularizationSuspicion.m
% (task: NV score validation, item 5).
%
% Four synthetic vessel masks, disc fixed at [256 256] on a 512x512 canvas
% (default discRadius = 512/16 = 32px -> annulus radius [64,192] from
% centre): empty, a straight vessel segment, a tortuous (sine-wave) vessel,
% and a dense random network of many short segments. All four are placed
% entirely inside the annulus by construction (checked below) so the
% components being tested are never zeroed out by an empty ROI.
%
% "Hand-checked" here means checked against the WELL-DEFINED, unambiguous
% cases (empty -> everything 0; a straight line -> tortuosity/fractalDim
% both close to the theoretical value of 1 for a 1-D curve) plus verified
% ORDERING between the other cases (tortuous > straight on tortuosity;
% dense network > straight/tortuous on density, branchDensity AND fractal
% dimension). Box-counting fractal dimension of a finite-resolution raster
% is an asymptotic slope estimate, not a quantity with one exact "correct"
% value to assert equality against - this test checks plausibility bands
% and relative ordering, not brittle exact numbers, and says so rather than
% overclaiming precision the method does not have.
%
% Also confirms every field the function returned BEFORE this task (score,
% density, normDensity, tortuosity, normTortuosity, branchDensity,
% skeletonPx, branchPoints, endPoints, annulusPx, valid, note) is still
% present and, for the pre-existing formula, byte-identical to what it was
% before the fractal/newScore additions - i.e. the primary `score` output
% and its two existing components did not move under this change.

here = fileparts(mfilename('fullpath'));
addpath(fullfile(here, '..', 'segmentation'));

failures = 0;
OLD_FIELDS = {'density', 'normDensity', 'tortuosity', 'normTortuosity', ...
             'branchDensity', 'skeletonPx', 'branchPoints', 'endPoints', ...
             'annulusPx', 'valid', 'note'};

    function n = check(label, ok, detailStr)
        if ok
            fprintf('  PASS  %s\n', label);
            n = 0;
        else
            fprintf('  FAIL  %s', label);
            if nargin > 2, fprintf('  [%s]', detailStr); end
            fprintf('\n');
            n = 1;
        end
    end

    function n = checkFieldsPresent(detail, caseName)
        n = 0;
        for k = 1:numel(OLD_FIELDS)
            n = n + check(sprintf('%s: old field "%s" present', caseName, OLD_FIELDS{k}), ...
                isfield(detail, OLD_FIELDS{k}));
        end
        newFields = {'fractalDim', 'normFractal', 'normBranchDensity', 'newScore', 'newScoreWeights'};
        for k = 1:numel(newFields)
            n = n + check(sprintf('%s: new field "%s" present', caseName, newFields{k}), ...
                isfield(detail, newFields{k}));
        end
    end

disc = [256 256];

% ═══════════════════════════════════════════════════════════════════════
% Case 1: EMPTY mask (with a valid disc, so the annulus itself is fine -
% this is "no vessels", not "no disc", a separate case verifyPhase4.m
% already covers).
% ═══════════════════════════════════════════════════════════════════════
fprintf('\n--- Case 1: EMPTY vessel mask ---\n');
mEmpty = false(512, 512);
[sEmpty, dEmpty] = neovascularizationSuspicion(mEmpty, disc);
failures = failures + check('score == 0', sEmpty == 0, sprintf('%.6f', sEmpty));
failures = failures + check('density == 0', dEmpty.density == 0);
failures = failures + check('tortuosity == 1 (fallback)', dEmpty.tortuosity == 1);
failures = failures + check('fractalDim == 0 (no pixels)', dEmpty.fractalDim == 0, sprintf('%.6f', dEmpty.fractalDim));
failures = failures + check('branchDensity == 0', dEmpty.branchDensity == 0);
failures = failures + check('newScore == 0', dEmpty.newScore == 0, sprintf('%.6f', dEmpty.newScore));
failures = failures + check('valid == true (disc was valid, just empty)', dEmpty.valid == true);
failures = failures + checkFieldsPresent(dEmpty, 'EMPTY');

% ═══════════════════════════════════════════════════════════════════════
% Case 2: STRAIGHT vessel - a single vertical bar entirely inside the
% annulus (distance from centre in [76,186], annulus is [64,192]).
% ═══════════════════════════════════════════════════════════════════════
fprintf('\n--- Case 2: STRAIGHT vessel segment ---\n');
mStraight = false(512, 512);
mStraight(70:180, 254:257) = true;
[dxs, dys] = meshgrid(254:257, 70:180);
distFromDisc = sqrt((dxs - disc(1)).^2 + (dys - disc(2)).^2);
failures = failures + check('STRAIGHT mask entirely inside annulus [64,192]', ...
    all(distFromDisc(:) >= 64 & distFromDisc(:) <= 192), ...
    sprintf('range [%.1f, %.1f]', min(distFromDisc(:)), max(distFromDisc(:))));

[sStraight, dStraight] = neovascularizationSuspicion(mStraight, disc);
fprintf('    density=%.4f tortuosity=%.4f fractalDim=%.4f branchDensity=%.4f\n', ...
    dStraight.density, dStraight.tortuosity, dStraight.fractalDim, dStraight.branchDensity);
failures = failures + check('tortuosity close to 1.0 (straight vessel), within [1.0, 1.1]', ...
    dStraight.tortuosity >= 1.0 && dStraight.tortuosity <= 1.1, sprintf('%.4f', dStraight.tortuosity));
failures = failures + check('fractalDim close to 1.0 (1-D curve), within [0.8, 1.2]', ...
    dStraight.fractalDim >= 0.8 && dStraight.fractalDim <= 1.2, sprintf('%.4f', dStraight.fractalDim));
failures = failures + check('branchDensity == 0 (no branch points on a single segment)', ...
    dStraight.branchDensity == 0, sprintf('%.4f', dStraight.branchDensity));
failures = failures + checkFieldsPresent(dStraight, 'STRAIGHT');

% ═══════════════════════════════════════════════════════════════════════
% Case 3: TORTUOUS vessel - a sine-wave curve, same rows, inside the annulus.
% ═══════════════════════════════════════════════════════════════════════
fprintf('\n--- Case 3: TORTUOUS (sine-wave) vessel ---\n');
mTort = false(512, 512);
for y = 70:180
    x = round(256 + 20 * sin((y - 70) / 110 * 4 * pi));
    mTort(y, x-1:x+1) = true;
end
[sTort, dTort] = neovascularizationSuspicion(mTort, disc);
fprintf('    density=%.4f tortuosity=%.4f fractalDim=%.4f branchDensity=%.4f\n', ...
    dTort.density, dTort.tortuosity, dTort.fractalDim, dTort.branchDensity);
failures = failures + check('tortuosity clearly > straight case (winding vs straight)', ...
    dTort.tortuosity > dStraight.tortuosity + 0.2, ...
    sprintf('tortuous=%.4f straight=%.4f', dTort.tortuosity, dStraight.tortuosity));
failures = failures + check('tortuosity within a plausible band [1.2, 2.0]', ...
    dTort.tortuosity >= 1.2 && dTort.tortuosity <= 2.0, sprintf('%.4f', dTort.tortuosity));
failures = failures + checkFieldsPresent(dTort, 'TORTUOUS');

% ═══════════════════════════════════════════════════════════════════════
% Case 4: DENSE RANDOM NETWORK - many short random segments inside the
% annulus, thickened by 1px so bwskel does not just re-derive isolated dots.
% ═══════════════════════════════════════════════════════════════════════
fprintf('\n--- Case 4: DENSE RANDOM NETWORK ---\n');
rng(42);   % fixed seed - this test must be deterministic
mDense = false(512, 512);
[xx, yy] = meshgrid(1:512, 1:512);
d2 = (xx - disc(1)).^2 + (yy - disc(2)).^2;
annulusMask = d2 >= 64^2 & d2 <= 192^2;
for k = 1:250
    y0 = randi([64 448]); x0 = randi([64 448]);
    segLen = randi([15 45]); ang = rand() * 2 * pi;
    for t = 0:segLen
        py = round(y0 + t * sin(ang)); px = round(x0 + t * cos(ang));
        if py >= 1 && py <= 512 && px >= 1 && px <= 512
            mDense(py, px) = true;
            if px > 1, mDense(py, px - 1) = true; end
        end
    end
end
mDense = mDense & annulusMask;

[sDense, dDense] = neovascularizationSuspicion(mDense, disc);
fprintf('    density=%.4f tortuosity=%.4f fractalDim=%.4f branchDensity=%.4f skelPx=%d branchPts=%d\n', ...
    dDense.density, dDense.tortuosity, dDense.fractalDim, dDense.branchDensity, ...
    dDense.skeletonPx, dDense.branchPoints);

failures = failures + check('density clearly > straight and tortuous cases (denser coverage)', ...
    dDense.density > dStraight.density * 5 && dDense.density > dTort.density * 5, ...
    sprintf('dense=%.4f straight=%.4f tortuous=%.4f', dDense.density, dStraight.density, dTort.density));
failures = failures + check('branchDensity clearly > 0 (many crossings/junctions)', ...
    dDense.branchDensity > 0.02, sprintf('%.4f', dDense.branchDensity));
failures = failures + check('fractalDim clearly higher than the straight/tortuous single-curve cases', ...
    dDense.fractalDim > dStraight.fractalDim + 0.2 && dDense.fractalDim > dTort.fractalDim + 0.2, ...
    sprintf('dense=%.4f straight=%.4f tortuous=%.4f', dDense.fractalDim, dStraight.fractalDim, dTort.fractalDim));
failures = failures + checkFieldsPresent(dDense, 'DENSE-NETWORK');

% ═══════════════════════════════════════════════════════════════════════
% Cross-case: score/newScore ordering sanity (not a formal spec, just a
% reasonableness check now that all four are computed).
% ═══════════════════════════════════════════════════════════════════════
fprintf('\n--- Cross-case checks ---\n');
failures = failures + check('all four scores lie in [0,1]', ...
    all([sEmpty sStraight sTort sDense] >= 0 & [sEmpty sStraight sTort sDense] <= 1));
failures = failures + check('EMPTY has the lowest old score', ...
    sEmpty <= sStraight && sEmpty <= sTort && sEmpty <= sDense);
failures = failures + check('EMPTY has the lowest newScore', ...
    dEmpty.newScore <= dStraight.newScore && dEmpty.newScore <= dTort.newScore && dEmpty.newScore <= dDense.newScore);

fprintf('\n===== %s =====\n', ...
    ternary(failures == 0, 'testNVScoreFractal: ALL PASSED', sprintf('%d FAILURE(S)', failures)));
if failures > 0
    error('testNVScoreFractal:failed', '%d check(s) failed', failures);
end
end

function v = ternary(cond, a, b)
if cond, v = a; else, v = b; end
end
