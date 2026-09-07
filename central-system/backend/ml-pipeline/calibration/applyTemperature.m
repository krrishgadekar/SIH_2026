function calibratedProbs = applyTemperature(rawProbs, T)
% APPLYTEMPERATURE  Apply temperature scaling to a softmax probability vector.
%
%   calibratedProbs = applyTemperature(rawProbs, T)
%
%   Inputs:
%     rawProbs - 1×C double, output of a softmax classifier (sums to 1).
%                C = number of classes (5 for DR grading).
%     T        - scalar double, temperature > 0.
%                  T = 1 : no effect (identity — placeholder safe).
%                  T > 1 : softer / flatter distribution (reduces overconfidence).
%                  T < 1 : sharper / more peaked (increases confidence).
%
%   Output:
%     calibratedProbs - 1×C double, calibrated probabilities (sums to 1).
%
%   Math:
%     rawProbs were produced by softmax(logits).
%     Inverting: logits ≈ log(rawProbs)  [up to the unknown additive constant
%     that softmax normalises away — this is sufficient because re-applying
%     softmax removes it again].
%     Temperature scaling: calibratedProbs = softmax(log(rawProbs) / T).
%
%   Numerical note:
%     log(0) = -Inf. Any rawProbs entry of 0 would produce -Inf logits,
%     which then survive through softmax as a 0-probability class — this is
%     numerically correct, but guard with max(eps, rawProbs) anyway.
%
%   Reference:
%     Guo et al., "On Calibration of Modern Neural Networks", ICML 2017.

if T <= 0
    error('applyTemperature: T must be > 0, got %.4f', T);
end

% Step 1 — recover logits from probabilities (softmax inverse)
logits = log(max(double(rawProbs), eps));   % guard against log(0)

% Step 2 — divide by temperature
scaledLogits = logits / T;

% Step 3 — re-apply softmax (numerically stable: subtract max before exp)
scaledLogits = scaledLogits - max(scaledLogits);   % subtract max for stability
expL = exp(scaledLogits);
calibratedProbs = expL / sum(expL);

% Ensure output is a 1×C row vector
if ~isrow(calibratedProbs)
    calibratedProbs = calibratedProbs';
end

end
