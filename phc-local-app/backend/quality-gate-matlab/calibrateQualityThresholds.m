function out = calibrateQualityThresholds(varargin)
% CALIBRATEQUALITYTHRESHOLDS  Sweep the quality-gate thresholds over a real
% image set, in parallel (Parallel Computing Toolbox: parfor).
%
%   out = calibrateQualityThresholds()
%   out = calibrateQualityThresholds('N', 100, 'Workers', 4, 'Serial', true)
%
%   The gate's three thresholds -- focus 0.17, illumination 0.4, occlusion
%   0.18 -- were each fitted by hand against a small set, and the numbers
%   carry that history: the gate once rejected 100% of clean images because
%   the focus threshold was wrong for the images this project actually sees.
%   Re-checking them means scoring every image, which is the slow part and is
%   also embarrassingly parallel.
%
%   ── THE SHAPE OF THIS: SCORE ONCE, SWEEP CHEAPLY ───────────────────────────
%   The naive version runs the gate once per (image, threshold) pair and is
%   almost all wasted work: the scores do not depend on the thresholds. So the
%   parfor computes each image's raw sub-scores ONCE -- that is the file read,
%   the decode, the Laplacian, the convex hull -- and the sweep afterwards is
%   arithmetic over a numeric matrix, which takes milliseconds serially.
%
%   ── WHY DEGRADED COPIES ARE PART OF THE MEASUREMENT ────────────────────────
%   A threshold that accepts every clean image is trivially satisfied by
%   accepting everything. The sweep therefore scores each image twice: as
%   captured, and re-encoded at JPEG quality 10 -- the compression a thin
%   rural link invites, and the case the gate exists to catch. A threshold is
%   only interesting if it separates the two. Both numbers are reported at
%   every candidate value; neither alone is a result.
%
%   ── NOT PART OF THE DEPLOYED GATE ──────────────────────────────────────────
%   qualityGateMain.m is compiled with mcc and ships to PHC laptops. This file
%   is a bench tool that CALLS the same assessors, and must never be pulled
%   into that build: the deployed gate would then depend on Parallel Computing
%   Toolbox at the MATLAB Runtime, which the PHC machines do not have.

opts = parseArgs(varargin{:});
thisDir = fileparts(mfilename('fullpath'));

images = findImages(opts.ImageDir, opts.N);
if isempty(images)
    error(['calibrateQualityThresholds: no images found under %s.\n' ...
           'Pass ''ImageDir'' explicitly.'], opts.ImageDir);
end
n = numel(images);
fprintf('\n=== Quality-gate threshold calibration ===\n');
fprintf('%d images, scored clean and at JPEG quality %d\n', n, opts.JpegQuality);

usePar = ~opts.Serial && hasParallel();
if usePar
    pool = ensurePool(opts.Workers);
    fprintf('%d workers\n', pool.NumWorkers);
else
    fprintf('serial\n');
end

% ── Score every image, twice ───────────────────────────────────────────────
% Four columns: focus, illumination, occlusion, glare. Preallocated so each
% parfor iteration writes its own row and nothing else.
clean    = nan(n, 4);
degraded = nan(n, 4);
failed   = strings(n, 1);
jpegQ    = opts.JpegQuality;
tmpRoot  = fullfile(tempdir, sprintf('qgcal_%d', feature('getpid')));
if ~isfolder(tmpRoot), mkdir(tmpRoot); end

t0 = tic;
if usePar
    parfor i = 1:n
        [clean(i,:), degraded(i,:), failed(i)] = scorePair(images{i}, jpegQ, tmpRoot, i);
    end
else
    for i = 1:n
        [clean(i,:), degraded(i,:), failed(i)] = scorePair(images{i}, jpegQ, tmpRoot, i);
    end
end
elapsed = toc(t0);

nFailed = sum(strlength(failed) > 0);
ok = all(isfinite(clean), 2) & all(isfinite(degraded), 2);
fprintf('scored %d images in %.1f s (%.2f s/image)%s\n', ...
    sum(ok), elapsed, elapsed / max(1, n), ...
    ternary(nFailed > 0, sprintf('; %d could not be read', nFailed), ''));
clean = clean(ok, :); degraded = degraded(ok, :);
cleanup(tmpRoot);

if isempty(clean)
    error('calibrateQualityThresholds: every image failed to score.');
end

% ── Sweep, in memory ───────────────────────────────────────────────────────
current = readCurrentThresholds(thisDir);
out = struct();
out.n = size(clean, 1);
out.elapsedSeconds = elapsed;
out.parallel = usePar;
out.current = current;
out.focus        = sweepLower(clean(:,1), degraded(:,1), 0:0.01:0.60, 'focus', current.focus);
out.illumination = sweepLower(clean(:,2), degraded(:,2), 0:0.02:1.00, 'illumination', current.illumination);
out.occlusion    = sweepUpper(clean(:,3), degraded(:,3), 0:0.01:0.60, 'occlusion', current.occlusion);

report(out);

if nargout == 0
    clear out;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function [c, d, err] = scorePair(imgPath, jpegQ, tmpRoot, idx)
% One image, scored as captured and as a quality-10 re-encode.
c = nan(1,4); d = nan(1,4); err = "";
try
    img = imread(imgPath);
    c = scores(img);

    % Written per worker under a unique name: two workers sharing a filename
    % would each read whichever copy landed last, and the bug would look like
    % noise in the results rather than a collision.
    tmpFile = fullfile(tmpRoot, sprintf('deg_%06d.jpg', idx));
    imwrite(img, tmpFile, 'Quality', jpegQ);
    d = scores(imread(tmpFile));
    delete(tmpFile);
catch ME
    err = string(ME.message);
end
end

function v = scores(img)
f = assessFocus(img);
l = assessIllumination(img);
g = assessGlareMotionOcclusion(img);
v = [f.score, l.score, g.occlusionScore, g.glareScore];
end

function s = sweepLower(cleanScores, degScores, grid, name, currentValue)
% For focus and illumination a HIGHER score is better, so the gate rejects
% below the threshold. Accept rate on clean images should stay high; reject
% rate on degraded ones should rise.
s.name = name;
s.grid = grid;
s.cleanAccept = arrayfun(@(t) mean(cleanScores >= t), grid);
s.degradedReject = arrayfun(@(t) mean(degScores < t), grid);
s.current = currentValue;
s.currentCleanAccept = mean(cleanScores >= currentValue);
s.currentDegradedReject = mean(degScores < currentValue);
s.cleanWorst = min(cleanScores);
s.suggestion = suggest(grid, s.cleanAccept, s.degradedReject);
end

function s = sweepUpper(cleanScores, degScores, grid, name, currentValue)
% Occlusion is the other way round: a higher score is worse, so the gate
% rejects ABOVE the threshold.
s.name = name;
s.grid = grid;
s.cleanAccept = arrayfun(@(t) mean(cleanScores <= t), grid);
s.degradedReject = arrayfun(@(t) mean(degScores > t), grid);
s.current = currentValue;
s.currentCleanAccept = mean(cleanScores <= currentValue);
s.currentDegradedReject = mean(degScores > currentValue);
s.cleanWorst = max(cleanScores);
s.suggestion = suggest(grid, s.cleanAccept, s.degradedReject);
end

function sug = suggest(grid, cleanAccept, degradedReject)
% The most degraded images rejected, subject to keeping at least 95% of clean
% captures. Stated as a suggestion and never written back: a threshold change
% in this gate decides whether a patient is asked to sit for another
% photograph, and that is a human's call with the numbers in front of them.
viable = find(cleanAccept >= 0.95);
if isempty(viable)
    sug = struct('value', NaN, 'cleanAccept', NaN, 'degradedReject', NaN, ...
                 'note', 'no threshold keeps 95% of clean captures');
    return;
end
[best, k] = max(degradedReject(viable));
idx = viable(k);
sug = struct('value', grid(idx), 'cleanAccept', cleanAccept(idx), ...
             'degradedReject', best, 'note', '');
end

function c = readCurrentThresholds(thisDir)
c = struct('focus', 0.17, 'illumination', 0.4, 'occlusion', 0.18);
try
    presets = jsondecode(fileread(fullfile(thisDir, 'cameraPresets.json')));
    if isfield(presets, 'default')
        d = presets.default;
        if isfield(d, 'focusThreshold'),        c.focus = d.focusThreshold; end
        if isfield(d, 'illuminationThreshold'), c.illumination = d.illuminationThreshold; end
    end
catch
    % Fall back to the documented defaults; the occlusion threshold lives in
    % qualityGateMain.m rather than the presets file, so it is not read here.
end
end

function images = findImages(dir0, N)
if isempty(dir0)
    root = fileparts(fileparts(fileparts(fileparts(mfilename('fullpath')))));
    candidates = { ...
        fullfile(root, 'central-system', 'backend', 'ml-pipeline', 'datasets', ...
                 'idrid', 'grading', 'B. Disease Grading', '1. Original Images', ...
                 'a. Training Set'), ...
        fullfile(root, 'datasets') };
else
    candidates = {dir0};
end
images = {};
for k = 1:numel(candidates)
    if ~isfolder(candidates{k}), continue; end
    d = [dir(fullfile(candidates{k}, '*.jpg')); dir(fullfile(candidates{k}, '*.png'))];
    if isempty(d), continue; end
    images = arrayfun(@(f) fullfile(f.folder, f.name), d, 'UniformOutput', false);
    break;
end
if N > 0 && numel(images) > N
    images = images(1:N);
end
end

function opts = parseArgs(varargin)
q = inputParser;
q.addParameter('N', 60);           % 0 = every image found
q.addParameter('ImageDir', '');
q.addParameter('JpegQuality', 10);
q.addParameter('Workers', 0);
q.addParameter('Serial', false);
q.parse(varargin{:});
opts = q.Results;
end

function tf = hasParallel()
tf = ~isempty(ver('parallel')) && license('test', 'Distrib_Computing_Toolbox');
end

function pool = ensurePool(workers)
pool = gcp('nocreate');
if isempty(pool)
    c = parcluster('Processes');
    n = workers;
    if n <= 0, n = min(4, c.NumWorkers); end
    pool = parpool(c, n);
end
end

function cleanup(tmpRoot)
try
    if isfolder(tmpRoot), rmdir(tmpRoot, 's'); end
catch
end
end

function report(out)
fprintf('\n%d images scored, %s\n\n', out.n, ternary(out.parallel, 'in parallel', 'serially'));
fields = {'focus', 'illumination', 'occlusion'};
for k = 1:numel(fields)
    s = out.(fields{k});
    fprintf('--- %s (current %.3f) ---\n', s.name, s.current);
    fprintf('  at the current value : %.1f%% of clean captures accepted, %.1f%% of JPEG-10 rejected\n', ...
        100*s.currentCleanAccept, 100*s.currentDegradedReject);
    if isnan(s.suggestion.value)
        fprintf('  best alternative     : %s\n', s.suggestion.note);
    else
        fprintf('  best alternative     : %.3f -> %.1f%% clean accepted, %.1f%% JPEG-10 rejected\n', ...
            s.suggestion.value, 100*s.suggestion.cleanAccept, 100*s.suggestion.degradedReject);
        if abs(s.suggestion.value - s.current) < 1e-9
            fprintf('  (the current value is already the best on this set)\n');
        end
    end
    fprintf('\n');
end
fprintf(['Nothing is written back. A threshold decides whether a patient is asked\n' ...
         'to sit for another photograph, so the change is a human''s call.\n']);
end

function v = ternary(c, a, b)
if c, v = a; else, v = b; end
end
