function report = refitCalibration(predDir, modelVersion, imgSize, opts)
% REFITCALIBRATION  Thin CSV-loading wrapper around calibrateBranchA.m, so
% refitting the conformal-policy-v3 calibration for ANY model version is ONE
% command:
%
%   python exportModel1Predictions.py --model-version branchA_v1
%   matlab -batch "refitCalibration('models/Model1', 'branchA_v1', 384)"
%
%   python exportModel1Predictions.py --model-version branchA_v2a
%   matlab -batch "refitCalibration('models/Model1/v2a', 'branchA_v2a', 512)"
%
%   report = refitCalibration(predDir, modelVersion, imgSize)
%   report = refitCalibration(predDir, modelVersion, imgSize, opts)
%
%   predDir - directory containing val_logits.csv, val_labels.csv,
%             test_logits.csv, test_labels.csv (written by
%             exportModel1Predictions.py). Relative paths are resolved
%             against this file's own directory (the ml-pipeline root).
%   modelVersion, imgSize, opts - passed straight to calibrateBranchA.m.
%
%   calibrateBranchA.m itself takes arrays, not paths -- this file is the
%   ONLY place that reads a CSV, so there is exactly one loader to keep
%   correct rather than one per caller.

if nargin < 4, opts = struct(); end

thisDir = fileparts(mfilename('fullpath'));
if ~isAbsolutePath(predDir)
    predDir = fullfile(thisDir, predDir);
end

need = {'val_logits.csv', 'val_labels.csv', 'test_logits.csv', 'test_labels.csv'};
for k = 1:numel(need)
    if exist(fullfile(predDir, need{k}), 'file') ~= 2
        error('refitCalibration:missing', ...
              ['Missing %s in %s.\nRun: python exportModel1Predictions.py ' ...
               '--model-version %s'], need{k}, predDir, modelVersion);
    end
end

valLogits  = readmatrix(fullfile(predDir, 'val_logits.csv'));
valLabels  = readmatrix(fullfile(predDir, 'val_labels.csv'));
testLogits = readmatrix(fullfile(predDir, 'test_logits.csv'));
testLabels = readmatrix(fullfile(predDir, 'test_labels.csv'));

report = calibrateBranchA(valLogits, valLabels, testLogits, testLabels, ...
                          modelVersion, imgSize, opts);
end

function tf = isAbsolutePath(p)
tf = ~isempty(regexp(p, '^([A-Za-z]:\\|/)', 'once'));
end
