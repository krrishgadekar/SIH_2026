function parityCheckV2(modelVersion)
% PARITYCHECKV2  Compare the imported MATLAB dlnetwork for ANY v2-family
% Branch A tag (branchA_v2a | branchA_v2b | branchA_v2c) against the
% original PyTorch model (5-class head only) on the 10 real-image parity
% fixtures (prepare_parity_inputs.py's <modelVersion>_{input,torch_output}.mat).
%
% GENERALIZE (v2b integration): this is parityCheckV2a.m's former body,
% extracted verbatim and parameterized by modelVersion; parityCheckV2a.m is
% now a one-line wrapper calling parityCheckV2('branchA_v2a'), so its own
% name, behaviour and output are UNCHANGED. Same method/threshold as before:
% compare AFTER softmax (matches how the grade is actually consumed), flag
% max|diff| > 0.01 as a failure to investigate, also report per-image argmax
% (predicted grade) agreement.
%
% Filenames are derived directly from modelVersion (e.g. 'branchA_v2b' ->
% net 'branchA_v2b.mat', fixtures 'branchA_v2b_{input,torch_output}.mat') --
% every v2-family tag follows this exact naming convention, no lookup table
% needed.

thisDir   = fileparts(mfilename('fullpath'));
dataDir   = fullfile(thisDir, 'parity_data');
modelsDir = fullfile(thisDir, '..', 'models');

THRESH = 0.01;

matFile = [modelVersion '.mat'];
inFile  = [modelVersion '_input.mat'];
outFile = [modelVersion '_torch_output.mat'];

fprintf('\n===== parityCheckV2: PyTorch vs imported MATLAB dlnetwork (%s, 10 real images) =====\n', modelVersion);

loaded = load(fullfile(modelsDir, matFile), 'net');
net = loaded.net;

inData  = load(fullfile(dataDir, inFile));
outData = load(fullfile(dataDir, outFile));
x      = single(inData.x);       % H x W x C x N (512x512x3x10)
yTorch = double(outData.y);      % N x 5, raw logits (5-class head only)

yPred = predict(net, dlarray(x, 'SSCB'));
yPred = double(extractdata(yPred));   % 5 x N, already softmax'd (net has a terminal softmax)

matlabProbs = yPred';                 % N x 5
torchProbs  = softmaxRows(yTorch);    % N x 5
diffMat     = abs(matlabProbs - torchProbs);
perImageMax = max(diffMat, [], 2)';

[~, matlabArgmax] = max(matlabProbs, [], 2);
[~, torchArgmax]  = max(torchProbs, [], 2);
matlabGrade = matlabArgmax - 1;       % 0-indexed ICDR grade
torchGrade  = torchArgmax - 1;
agree = (matlabGrade == torchGrade);

for k = 1:numel(perImageMax)
    fprintf('  image %2d   max|diff| = %.6f   MATLAB grade=%d  PyTorch grade=%d  %s\n', ...
            k, perImageMax(k), matlabGrade(k), torchGrade(k), agreeLabel(agree(k)));
end

maxDiff = max(perImageMax);
passOk  = maxDiff <= THRESH;
nAgree  = sum(agree);
nTotal  = numel(agree);

fprintf('\n===== Summary =====\n');
if passOk
    fprintf('PASS  overall max|diff| = %.6f  (threshold %.2f)\n', maxDiff, THRESH);
else
    fprintf('FAIL  overall max|diff| = %.6f  EXCEEDS threshold %.2f -- needs investigation\n', ...
            maxDiff, THRESH);
end
fprintf('argmax (predicted grade) agreement: %d/%d (%.1f%%)\n', ...
        nAgree, nTotal, 100 * nAgree / nTotal);

if ~passOk
    error('parityCheckV2:thresholdExceeded', ...
          '%s exceeds the 0.01 parity threshold. Investigate before handoff.', modelVersion);
end
if nAgree < nTotal
    fprintf(['\nNOTE: max|diff| is within threshold but %d/%d image(s) disagree on argmax -- ' ...
             'a near-boundary softmax value can still flip the predicted grade even at small ' ...
             'absolute probability differences. Reported, not treated as a pass/fail criterion ' ...
             'by itself (the brief''s criterion is the max|diff| threshold).\n'], ...
            nTotal - nAgree, nTotal);
end
end

function p = softmaxRows(logits)
m = max(logits, [], 2);
e = exp(logits - m);
p = e ./ sum(e, 2);
end

function s = agreeLabel(tf)
if tf
    s = 'AGREE';
else
    s = 'DISAGREE';
end
end
