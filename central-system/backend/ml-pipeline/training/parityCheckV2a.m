function parityCheckV2a()
% PARITYCHECKV2A  Compare the imported MATLAB branchA_v2a dlnetwork against
% the original PyTorch model (5-class head only) on 10 real images
% (prepare_parity_inputs.py's branchA_v2a_{input,torch_output}.mat fixtures).
%
% A SEPARATE file from parityCheck.m -- v1's entries there are not touched.
% Same method and threshold as parityCheck.m's classifier entry: compare
% AFTER softmax (matches how the grade is actually consumed), flag
% max|diff| > 0.01 as a failure to investigate. Also reports argmax
% (predicted grade) agreement per image, which parityCheck.m does not.

thisDir   = fileparts(mfilename('fullpath'));
dataDir   = fullfile(thisDir, 'parity_data');
modelsDir = fullfile(thisDir, '..', 'models');

THRESH = 0.01;

fprintf('\n===== parityCheckV2a: PyTorch vs imported MATLAB dlnetwork (branchA_v2a, 10 real images) =====\n');

loaded = load(fullfile(modelsDir, 'branchA_v2a.mat'), 'net');
net = loaded.net;

inData  = load(fullfile(dataDir, 'branchA_v2a_input.mat'));
outData = load(fullfile(dataDir, 'branchA_v2a_torch_output.mat'));
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
    error('parityCheckV2a:thresholdExceeded', ...
          'branchA_v2a exceeds the 0.01 parity threshold. Investigate before handoff.');
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
