function scoreNVBatch(cacheDir, outCsv)
% SCORENVBATCH  Task item 4 (MATLAB half): scores every cached vessel-mask/
% disc-centre .mat file (written by computeNVInputs.py + converted by
% convertNVCacheToMat.py) with neovascularizationSuspicion.m, using DEFAULT
% opts (no custom weights/ranges) - this batch's only job is to produce the
% RAW per-image component values once; every score VARIANT (old, equal-
% weight, train-fitted-weight) is then computed cheaply in Python from these
% raw components, so this function never needs to be re-run per variant.
%
%   scoreNVBatch(cacheDir, outCsv)
%
%   cacheDir - the nv_score_pipeline scratch directory (outside git),
%              containing one subfolder per dataset (idrid_train, idrid_test,
%              messidor2), each holding per-image .mat files (mask, discXY,
%              grade, imageId) written by convertNVCacheToMat.py.
%   outCsv   - path to write one row per image: dataset, imageId, grade,
%              oldScore, density, tortuosity, fractalDim, branchDensity,
%              valid, note.
%
% New file. Does not modify neovascularizationSuspicion.m's behaviour (called
% with default opts throughout) and is not wired into any live path.

here = fileparts(mfilename('fullpath'));
addpath(fullfile(here, '..', 'segmentation'));

datasets = {'idrid_train', 'idrid_test', 'messidor2'};
rows = {};
nTotal = 0;
tStart = tic;

for di = 1:numel(datasets)
    ds = datasets{di};
    dsDir = fullfile(cacheDir, ds);
    if ~isfolder(dsDir)
        fprintf('SKIP %s (not found: %s)\n', ds, dsDir);
        continue;
    end
    files = dir(fullfile(dsDir, '*.mat'));
    fprintf('%s: %d images\n', ds, numel(files));

    for fi = 1:numel(files)
        f = fullfile(dsDir, files(fi).name);
        d = load(f);

        [score, detail] = neovascularizationSuspicion(logical(d.mask), d.discXY);

        rows(end+1, :) = { ds, d.imageId, d.grade, score, ...
            detail.density, detail.tortuosity, detail.fractalDim, ...
            detail.branchDensity, detail.valid, detail.note }; %#ok<AGROW>
        nTotal = nTotal + 1;

        if mod(nTotal, 200) == 0
            fprintf('  %d images scored (%.0fs elapsed)\n', nTotal, toc(tStart));
        end
    end
end

T = cell2table(rows, 'VariableNames', ...
    {'dataset', 'imageId', 'grade', 'oldScore', 'density', 'tortuosity', ...
     'fractalDim', 'branchDensity', 'valid', 'note'});
writetable(T, outCsv);
fprintf('Wrote %s (%d rows, %.0fs total)\n', outCsv, height(T), toc(tStart));
end
