function report = testImportedNetwork(opts)
% TESTIMPORTEDNETWORK  Does MATLAB's imported Branch A match the real model?
%
%   report = testImportedNetwork()
%
%   Answers the architecture question with a number instead of an argument:
%   can Branch A run in MATLAB — as design doc §3 requires, since the MATLAB
%   requirement covers "both grading branches" — or must it run in Python?
%
%   Prerequisites:
%     python traceModel1ForMatlab.py          (writes the traced model)
%     python  ... probe tensor export          (writes probe_tensors.csv)
%
%   ── THE EXPERIMENT ─────────────────────────────────────────────────────────
%   Two things could differ between MATLAB and Python: the PREPROCESSING and
%   the NETWORK. Testing them together would confound them, so this feeds
%   MATLAB the exact tensors Python produced — same pixels, same normalisation,
%   bit for bit — and compares only the network's output against the logits the
%   checkpoint shipped.
%
%   A small difference here is the importer's numerics. A large one means the
%   import is not faithful and no amount of preprocessing work will fix it.

if nargin < 1, opts = struct(); end
thisDir  = fileparts(mfilename('fullpath'));
modelDir = fullfile(thisDir, 'models', 'Model1');

tracedFile = getdef(opts, 'tracedFile', ...
                    fullfile(modelDir, 'branchA_v1_traced_nofreeze.pt'));
imgSize = getdef(opts, 'imgSize', 384);

% The converter installs under ProgramData and mpm does not register it on the
% path, so exist('importNetworkFromPyTorch') is 0 until this runs. Without it
% the failure looks like "the add-on is not installed" when it plainly is.
spRoot = matlabshared.supportpkg.getSupportPackageRoot;
addpath(genpath(fullfile(spRoot, 'toolbox', 'nnet', 'supportpackages', 'pytorch_converter')));

if exist('importNetworkFromPyTorch', 'file') == 0
    error('testImportedNetwork:noConverter', ...
          ['Deep Learning Toolbox Converter for PyTorch Model Format is not ' ...
           'available even after adding %s to the path.'], spRoot);
end

% ── Import ─────────────────────────────────────────────────────────────────
% NOTE the traced file must NOT have been through torch.jit.freeze(). Freezing
% inlines and optimises the graph into constructs the importer rejects with
% "Model contains constructs that are not supported", which reads as an
% architecture problem and is actually a tracing-flag problem. That cost a
% wrong conclusion here before it was tried both ways.
t0 = tic;
net = importNetworkFromPyTorch(tracedFile, 'PyTorchInputSizes', [1 3 imgSize imgSize]);
report.importSeconds = toc(t0);
report.class = class(net);
report.numLayers = numel(net.Layers);
report.initialized = net.Initialized;

% ── Compare against the model's own published logits ───────────────────────
X = readmatrix(fullfile(modelDir, 'probe_tensors.csv'));
R = readmatrix(fullfile(modelDir, 'probe_reflogits.csv'));
n = size(X, 1);

got = zeros(n, 5);
for i = 1:n
    img = reshape(X(i, :), [imgSize imgSize 3]);
    y = predict(net, dlarray(single(img), 'SSCB'));
    got(i, :) = double(extractdata(y))';
end

[~, kGot] = max(got, [], 2);
[~, kRef] = max(R, [], 2);

report.n = n;
report.meanAbsLogitDiff = mean(abs(got(:) - R(:)));
report.maxAbsLogitDiff  = max(abs(got(:) - R(:)));
report.classAgreement   = mean(kGot == kRef);
report.correlation      = corr(got(:), R(:));
report.gotLogits = got;
report.refLogits = R;

% Faithful means the MATLAB path can be trusted to make the same clinical
% decision. Class agreement is the operational test; the logit difference says
% how much headroom there is before that stops being true.
report.faithful = report.classAgreement >= 0.99 && report.meanAbsLogitDiff < 0.05;

if ~getdef(opts, 'quiet', false)
    fprintf('\n=================================================================\n');
    fprintf('  IMPORTED MATLAB NETWORK vs the model''s published logits\n');
    fprintf('=================================================================\n');
    fprintf('imported as            : %s, %d layers, initialized=%d\n', ...
        report.class, report.numLayers, report.initialized);
    fprintf('import took            : %.1f s\n', report.importSeconds);
    fprintf('probe images           : %d (Python-preprocessed, identical pixels)\n', n);
    fprintf('mean |logit difference|: %.6f\n', report.meanAbsLogitDiff);
    fprintf('max  |logit difference|: %.6f\n', report.maxAbsLogitDiff);
    fprintf('predicted-class agree  : %.1f%%\n', 100 * report.classAgreement);
    fprintf('correlation            : %.6f\n', report.correlation);
    fprintf('\nVERDICT: %s\n', verdictText(report));
    fprintf('=================================================================\n');
end

if getdef(opts, 'save', true)
    outPath = fullfile(thisDir, 'models', 'branchA_v1_imported.mat');
    save(outPath, 'net', '-v7.3');
    report.savedTo = outPath;
    fprintf('saved %s\n', outPath);
end
end

function s = verdictText(r)
if r.faithful
    s = ['the import is faithful. Branch A can run in MATLAB, so the design ' ...
         'doc''s "both grading branches in MATLAB" holds without exception.'];
elseif r.classAgreement >= 0.95
    s = ['close but not exact. The same grade is reached on most cases, not ' ...
         'all — which is a clinical difference, not a rounding one. Treat as ' ...
         'NOT faithful until the divergence is explained.'];
else
    s = ['the import is NOT faithful. Running Branch A in Python is then a ' ...
         'documented technical constraint rather than a preference.'];
end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
