function result = classifyBranchA(preprocessedImg)
% CLASSIFYbrancha  Run Branch A CNN inference on a preprocessed fundus image.
%
%   result = classifyBranchA(preprocessedImg)
%
%   Input:
%     preprocessedImg - 512x512x3 uint8 image output from the preprocessing
%                       pipeline (benGrahamCrop → claheEnhance →
%                       illuminationNormalize).  Must be exactly the input
%                       size the network was trained with.
%
%   Output:
%     result - scalar struct with fields:
%                .grade         integer in {0,1,2,3,4} — predicted DR grade.
%                .probabilities 1x5 double, sums to 1.0 — class posterior
%                               probabilities [P(0), P(1), P(2), P(3), P(4)].
%
%   Architecture:
%     ResNet-50 backbone, final FC layer replaced for 5-class output.
%     Trained on APTOS 2019 + IDRiD grading (70/15/15 stratified split).
%     See ml-pipeline/models/README.md for full model inventory.
%
%   Performance note — persistent variable caching:
%     Loading a .mat network file takes 1–5 seconds (file I/O + GPU transfer).
%     The persistent variable 'net' ensures the network is loaded exactly ONCE
%     per MATLAB session regardless of how many times this function is called.
%     This is required for acceptable latency in the live server path —
%     per-call loading would add 2–5 s to every capture response.
%     The persistent variable survives across calls in the same process but
%     is cleared when 'clear all' or 'clear classifyBranchA' is run.

% ── Network load (once per session) ──────────────────────────────────────────
persistent net

if isempty(net)
    % Path resolution — three levels of fallback:
    %   1. Production layout: classifyBranchA.m is in grading/,
    %      branchA_v1.mat is in ../models/ (sibling directory).
    %   2. MATLAB Online flat layout: both files are in the same directory
    %      (mfilename's parent dir == MATLAB Drive root, so '../models/' fails).
    %   3. Current working directory (e.g. when running from ml-pipeline/).
    thisDir   = fileparts(mfilename('fullpath'));
    candidate = { ...
        fullfile(thisDir, '..', 'models', 'branchA_v1.mat'), ... % production
        fullfile(thisDir, 'branchA_v1.mat'), ...                  % flat layout
        'branchA_v1.mat' };                                        % cwd fallback

    modelPath = '';
    for k = 1:numel(candidate)
        if isfile(candidate{k})
            modelPath = candidate{k};
            break;
        end
    end
    if isempty(modelPath)
        error('classifyBranchA: cannot find branchA_v1.mat. Searched:\n  %s', ...
              strjoin(candidate, '\n  '));
    end

    loaded = load(modelPath, 'net');
    net    = loaded.net;

    % Auto-initialize guard: addLayers/connectLayers de-initializes a
    % dlnetwork. If the saved model was not initialized before saving
    % (e.g. the stub), initialize it now with a dummy input so predict()
    % works.  The real trained model will already be initialized at save
    % time, so this is a no-op for it.
    if isa(net, 'dlnetwork') && ~net.Initialized
        exInput = dlarray(randn(512, 512, 3, 1, 'single'), 'SSCB');
        net = initialize(net, exInput);
    end
end

% ── Inference ─────────────────────────────────────────────────────────────────
% predict() behaviour differs between network types:
%   dlnetwork  (returned by imagePretrainedNetwork in R2023b+):
%              requires dlarray input with format 'SSCB'.
%              Returns a dlarray; extractdata() converts to double.
%   DAGNetwork / SeriesNetwork (older trainNetwork API):
%              accepts raw uint8/single and returns plain double.
%
% The stub was created with imagePretrainedNetwork → dlnetwork, but the
% teammate's real trained model may be either type.  Handle both.

if isa(net, 'dlnetwork')
    % dlnetwork path: convert to single 4-D (H×W×C×N) dlarray
    img4D = single(preprocessedImg);
    if ndims(img4D) == 3
        img4D = reshape(img4D, [size(img4D,1), size(img4D,2), size(img4D,3), 1]);
    end
    X     = dlarray(img4D, 'SSCB');
    probs = double(extractdata(predict(net, X)));
    probs = probs(:)';                % ensure 1×5 row vector
else
    % DAGNetwork / SeriesNetwork path
    probs = double(predict(net, preprocessedImg));
    if ~isrow(probs), probs = probs'; end
end

% max() returns a 1-indexed position; DR grades are 0-indexed (0–4).
[~, gradeIdx]  = max(probs);
result.grade         = gradeIdx - 1;   % 0-indexed DR grade
result.probabilities = probs;          % 1x5, sums to 1

end
