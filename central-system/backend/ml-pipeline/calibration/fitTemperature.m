% FITTEMPERATURE  Fit the temperature scalar T on validation-split logits.
%
%   Run this script ONCE after the Branch A CNN training is complete and the
%   teammate has provided validation-split logits.
%
%   ╔══════════════════════════════════════════════════════════════════════╗
%   ║  NOT YET RUN FOR REAL — waiting on trained model validation logits  ║
%   ║                                                                      ║
%   ║  To run this script, you need:                                       ║
%   ║    1. valLogits  — N×5 double, raw pre-softmax logits from the       ║
%   ║                    Branch A CNN on the validation split.             ║
%   ║    2. valLabels  — N×1 integer, true DR grades (0–4) for those       ║
%   ║                    same N validation images.                         ║
%   ║  Provide these as 'valLogits.mat' and 'valLabels.mat' in the         ║
%   ║  ml-pipeline/models/ directory, then remove or comment out the       ║
%   ║  error() line at the top of this script and re-run.                  ║
%   ╚══════════════════════════════════════════════════════════════════════╝
%
%   Output:
%     Saves temperature_v1.mat containing scalar 'T' to ml-pipeline/models/.
%     Once saved, applyTemperature() will use this T value automatically
%     (it loads temperature_v1.mat). No code changes required anywhere else.
%
%   Algorithm:
%     Finds scalar T in [0.1, 5] that minimises Negative Log-Likelihood
%     (NLL) of softmax(valLogits / T) against valLabels, using fminbnd
%     (golden-section search, 1-D, no gradient needed).
%
%   Reference:
%     Guo et al., "On Calibration of Modern Neural Networks", ICML 2017.

% ── GUARD: fail loudly if validation logits are not available ────────────────
error([...
    'fitTemperature: This script has NOT been run for real yet.\n' ...
    'It requires validation-split logits from the trained Branch A CNN.\n' ...
    'See the header comments in this file for what to provide, then\n' ...
    'remove this error() call and re-run.\n' ...
    'Current temperature_v1.mat contains placeholder T=1 (no-op).']);

% ── (Unreachable until guard is removed) ─────────────────────────────────────

% Load validation data provided by teammate's training script
modelsDir = fullfile(fileparts(mfilename('fullpath')), '..', 'models');
S = load(fullfile(modelsDir, 'valLogits.mat'),  'valLogits');   valLogits  = S.valLogits;
S = load(fullfile(modelsDir, 'valLabels.mat'),  'valLabels');   valLabels  = S.valLabels;

% valLogits: N×5 double (raw pre-softmax logits)
% valLabels: N×1 integer, values in {0,1,2,3,4}
N = size(valLogits, 1);
assert(size(valLogits, 2) == 5,  'valLogits must be N×5');
assert(numel(valLabels) == N,    'valLabels must have N rows');

% Convert 0-indexed grade labels to 1-indexed class indices for MATLAB
classIdx = valLabels + 1;   % {0..4} → {1..5}

% NLL objective: negative mean log-probability of the true class
function nll = negLogLikelihood(T, logits, classIdx)
    scaledLogits = logits / T;
    scaledLogits = scaledLogits - max(scaledLogits, [], 2);   % stable softmax
    expL  = exp(scaledLogits);
    probs = expL ./ sum(expL, 2);                             % N×5
    % Gather probability of true class for each sample
    nLogP = zeros(size(classIdx));
    for i = 1:numel(classIdx)
        nLogP(i) = -log(max(probs(i, classIdx(i)), eps));
    end
    nll = mean(nLogP);
end

% Find optimal T ∈ [0.1, 5] using golden-section search
objFn = @(T) negLogLikelihood(T, valLogits, classIdx);
Topt  = fminbnd(objFn, 0.1, 5);

fprintf('Optimal temperature: T = %.4f\n', Topt);
fprintf('NLL before (T=1): %.4f\n', objFn(1));
fprintf('NLL after  (T=%.4f): %.4f\n', Topt, objFn(Topt));

% Save result — variable name 'T', same file the placeholder uses
T = Topt;
save(fullfile(modelsDir, 'temperature_v1.mat'), 'T');
fprintf('Saved temperature_v1.mat with T=%.4f\n', T);
