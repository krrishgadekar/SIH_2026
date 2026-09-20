function results = batchGenerateReports(inputDir, outDir, varargin)
% BATCHGENERATEREPORTS  Render many clinical-rationale PDFs at once, in
% parallel (Parallel Computing Toolbox: parfor).
%
%   results = batchGenerateReports(inputDir)
%   results = batchGenerateReports(inputDir, outDir, 'Workers', 3)
%   results = batchGenerateReports(inputDir, outDir, 'Serial', true)
%
%   inputDir holds one JSON per case, in the shape services/caseReport.js
%   writes for generateReport.m. Each PDF is produced by the SAME
%   generateReport used for a single case on demand -- this file adds the loop
%   and nothing else, so a batch-rendered report and an on-demand one are
%   byte-for-byte the same document.
%
%   ── WHY A BATCH MODE EXISTS ────────────────────────────────────────────────
%   On demand, one report at a time, the render cost is invisible. It stops
%   being invisible when a district wants the month's referred cases as a
%   folder of PDFs, or when a reviewer asks for every case they have signed.
%   Those are tens to hundreds of renders of a document that takes seconds
%   each, and they are independent.
%
%   ── THE LICENCE IS THE REAL CONSTRAINT, NOT THE CPU ────────────────────────
%   generateReport uses MATLAB Report Generator (mlreportgen.dom). Every
%   worker is a separate MATLAB process and checks out its own licence, so the
%   usable pool size here is however many Report Generator seats exist, not
%   how many cores the machine has. The pool is capped at 3 by default for
%   that reason, and a worker that cannot get a licence is reported as a
%   failed case rather than taking the batch down -- if that happens for every
%   case, run with 'Serial', true and it will render one at a time on this
%   process's own licence.
%
%   Returns one struct per case: caseId, outPath, seconds, error.

if nargin < 2 || isempty(outDir), outDir = fullfile(inputDir, 'reports'); end
opts = parseArgs(varargin{:});

if ~isfolder(inputDir)
    error('batchGenerateReports: %s is not a folder.', inputDir);
end
if ~isfolder(outDir), mkdir(outDir); end

d = dir(fullfile(inputDir, '*.json'));
inputs = arrayfun(@(f) fullfile(f.folder, f.name), d, 'UniformOutput', false);
n = numel(inputs);
if n == 0
    error('batchGenerateReports: no .json inputs in %s.', inputDir);
end

fprintf('\n=== Batch clinical-rationale reports ===\n');
fprintf('%d cases -> %s\n', n, outDir);

usePar = ~opts.Serial && hasParallel() && n > 1;
if usePar
    pool = ensurePool(opts.Workers);
    fprintf('%d workers (Report Generator licences permitting)\n', pool.NumWorkers);
else
    fprintf('serial\n');
end

% Preallocated: each iteration writes only its own element.
outPaths = strings(n, 1);
errs     = strings(n, 1);
secs     = zeros(n, 1);
ids      = strings(n, 1);

thisDir = fileparts(mfilename('fullpath'));

t0 = tic;
if usePar
    parfor i = 1:n
        [ids(i), outPaths(i), secs(i), errs(i)] = renderOne(inputs{i}, outDir, thisDir);
    end
else
    for i = 1:n
        [ids(i), outPaths(i), secs(i), errs(i)] = renderOne(inputs{i}, outDir, thisDir);
    end
end
elapsed = toc(t0);

results = struct('caseId', cellstr(ids), 'outPath', cellstr(outPaths), ...
                 'seconds', num2cell(secs), 'error', cellstr(errs));

ok = strlength(errs) == 0;
fprintf('\n%d of %d rendered in %.1f s (%.1f s/report of CPU time)\n', ...
    sum(ok), n, elapsed, sum(secs) / max(1, sum(ok)));
if usePar && sum(ok) > 0
    % Wall-clock against summed per-report time: the honest speed-up, not a
    % core count multiplied by hope.
    fprintf('speed-up vs the same work serially: %.1fx\n', sum(secs) / elapsed);
end
if any(~ok)
    fprintf('\nfailed:\n');
    for i = find(~ok)'
        fprintf('  %s: %s\n', ids(i), firstLine(errs(i)));
    end
    if all(contains(lower(errs(~ok)), 'licen'))
        fprintf(['\nEvery failure is a licence checkout. Report Generator seats are\n' ...
                 'the limit here, not cores -- rerun with ''Serial'', true.\n']);
    end
end

if nargout == 0
    clear results;
end
end

% ═══════════════════════════════════════════════════════════════════════════
function [caseId, outPath, seconds, err] = renderOne(inputPath, outDir, thisDir)
% One report. Everything is local to the worker; only four values come back.
caseId = ""; outPath = ""; seconds = 0; err = "";
t = tic;
try
    % A worker starts with a bare path, so the folder holding generateReport
    % has to be added there. Cheap, and idempotent.
    addpath(thisDir);

    raw = jsondecode(fileread(inputPath));
    if isfield(raw, 'caseId'), caseId = string(raw.caseId); else, caseId = string(inputPath); end

    outPath = string(fullfile(outDir, sprintf('%s.pdf', caseId)));
    generateReport(inputPath, char(outPath));

    if ~isfile(outPath)
        err = "generateReport returned without writing a file";
        outPath = "";
    end
catch ME
    err = string(ME.message);
    outPath = "";
end
seconds = toc(t);
end

function opts = parseArgs(varargin)
q = inputParser;
% 3, not the core count: see the licence note in the header.
q.addParameter('Workers', 3);
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
    if n <= 0, n = min(3, c.NumWorkers); end
    pool = parpool(c, min(n, c.NumWorkers));
end
end

function s = firstLine(msg)
parts = strsplit(char(msg), newline);
s = strtrim(parts{1});
end
