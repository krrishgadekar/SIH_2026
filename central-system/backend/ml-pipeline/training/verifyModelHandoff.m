function verifyModelHandoff(modelPath, testImagePath)
% VERIFYMODELHANDOFF  Acceptance test for a trained branchA_v1.mat.
%
%   verifyModelHandoff()
%   verifyModelHandoff(modelPath)
%   verifyModelHandoff(modelPath, testImagePath)
%
%   RUN THIS BEFORE HANDING OVER A TRAINED MODEL. It checks every assumption
%   the inference pipeline makes about the .mat file, against the real
%   preprocessing chain and the real inference/Grad-CAM code -- not against a
%   simplified copy of them. If this passes, dropping the file into
%   ml-pipeline/models/ is the entire integration step; nothing else changes.
%
%   Defaults:
%     modelPath     ../models/branchA_v1.mat
%     testImagePath the first image found in datasets/ (any real fundus photo)
%
%   Checks are grouped as HARD (integration breaks if these fail) and SOFT
%   (integration works, but something downstream will be degraded or blocked).
%   A soft failure is a warning, not an error -- but read it, because most of
%   them cost a retrain if they are discovered later rather than now.
%
%   See docs/model-handoff-guide.md for what each check means and how to fix it.

% ── Argument defaults ────────────────────────────────────────────────────────
thisDir = fileparts(mfilename('fullpath'));

if nargin < 1 || isempty(modelPath)
    modelPath = fullfile(thisDir, '..', 'models', 'branchA_v1.mat');
end
if nargin < 2 || isempty(testImagePath)
    testImagePath = findSampleImage(thisDir);
end

fprintf('\n===== branchA model handoff verification =====\n');
fprintf('model : %s\n', modelPath);
fprintf('image : %s\n\n', testImagePath);

hardFail = 0;
softFail = 0;

% Make the real pipeline code reachable -- we test against it, not a copy.
addpath(fullfile(thisDir, '..', 'preprocessing'));
addpath(fullfile(thisDir, '..', 'grading'));
addpath(fullfile(thisDir, '..', 'calibration'));
addpath(fullfile(thisDir, '..', 'explainability'));

%% ── 1. File and variable layout ─────────────────────────────────────────────
fprintf('-- File layout --\n');

if ~isfile(modelPath)
    fprintf('  HARD FAIL  model file not found\n');
    fprintf('\nCannot continue without the file.\n');
    return;
end
hardFail = report('file exists', true, hardFail);

info     = whos('-file', modelPath);
varNames = {info.name};

hasNet   = ismember('net', varNames);
hardFail = report('contains a variable named ''net''', hasNet, hardFail);
if ~hasNet
    fprintf('    found instead: %s\n', strjoin(varNames, ', '));
    fprintf('    Fix: save(''branchA_v1.mat'', ''net'')  -- save ONLY the network.\n');
    fprintf('\nCannot continue without a ''net'' variable.\n');
    return;
end

% Saving the whole workspace drags training data into the file. It still
% loads, but a 4 GB .mat that has to be copied between machines is a real
% problem, and load(...,'net') then pays to parse the rest.
softFail = report('contains ONLY ''net'' (no stray workspace vars)', ...
                  numel(varNames) == 1, softFail, true);
if numel(varNames) > 1
    fprintf('    also present: %s\n', strjoin(setdiff(varNames, {'net'}), ', '));
end

d = dir(modelPath);
fprintf('  INFO       size on disk: %.1f MB\n', d.bytes / 1e6);

loaded = load(modelPath, 'net');
net    = loaded.net;
fprintf('  INFO       class: %s\n', class(net));

isKnownType = isa(net, 'dlnetwork') || isa(net, 'DAGNetwork') || isa(net, 'SeriesNetwork');
hardFail = report('net is a dlnetwork / DAGNetwork / SeriesNetwork', isKnownType, hardFail);

%% ── 2. Input and output contract ────────────────────────────────────────────
fprintf('\n-- Input / output contract --\n');

% classifyBranchA carries this same guard, so an uninitialised save is
% tolerated -- but initialising before saving is cheaper and less surprising.
if isa(net, 'dlnetwork') && ~net.Initialized
    softFail = report('dlnetwork was saved initialised', false, softFail, true);
    fprintf('    Fix: net = initialize(net, dlarray(randn(512,512,3,1,''single''),''SSCB''));\n');
    net = initialize(net, dlarray(randn(512, 512, 3, 1, 'single'), 'SSCB'));
else
    softFail = report('dlnetwork was saved initialised', true, softFail, true);
end

probs1 = runNet(net, uint8(randi([0 255], 512, 512, 3)));

hardFail = report('accepts 512x512x3 input', ~isempty(probs1), hardFail);
hardFail = report('emits exactly 5 outputs', numel(probs1) == 5, hardFail);
if numel(probs1) ~= 5
    fprintf('    got %d. DR grades are 0-4, so the final layer needs 5 outputs.\n', numel(probs1));
end

sumOk    = abs(sum(probs1) - 1) < 1e-3;
hardFail = report('outputs sum to 1 (softmax present)', sumOk, hardFail);
if ~sumOk
    fprintf('    sum = %.6f. A missing terminal softmax means confidence_score\n', sum(probs1));
    fprintf('    is not a probability, and the Tier A/B/C thresholds are meaningless.\n');
end

hardFail = report('outputs are all in [0,1]', all(probs1 >= 0 & probs1 <= 1), hardFail);

%% ── 3. Determinism and caching ──────────────────────────────────────────────
fprintf('\n-- Determinism --\n');

fixedImg = uint8(repmat(reshape(linspace(0, 255, 512), [], 1), 1, 512, 3));
pA = runNet(net, fixedImg);
pB = runNet(net, fixedImg);

% Ordinary predict() must be deterministic. Non-determinism here means dropout
% is active at inference, which would make every grade irreproducible -- MC
% Dropout (Phase 6) forces dropout on deliberately and separately.
hardFail = report('same input gives identical output twice', ...
                  max(abs(pA - pB)) < 1e-9, hardFail);

%% ── 4. Dropout, for Phase 6 MC-Dropout uncertainty ──────────────────────────
fprintf('\n-- Phase 6 readiness --\n');

hasDropout = any(arrayfun(@(L) isa(L, 'nnet.cnn.layer.DropoutLayer'), net.Layers));
softFail   = report('has a dropout layer (needed by MC-Dropout, Task 6.1)', ...
                    hasDropout, softFail, true);
if ~hasDropout
    fprintf('    Task 6.1 estimates uncertainty by running inference many times with\n');
    fprintf('    dropout forced active. With no dropout layer anywhere in the network\n');
    fprintf('    that is impossible, and uncertainty_score stays NULL -- which also\n');
    fprintf('    breaks the ophthalmologist queue ranking, since Tier C is ordered by\n');
    fprintf('    it. Fixing this later costs a re-finetune.\n');
    fprintf('    Fix: include a dropoutLayer(0.3) before the final FC layer when training.\n');
end

%% ── 5. The real pipeline, end to end ────────────────────────────────────────
fprintf('\n-- End-to-end through the real pipeline --\n');

if ~isfile(testImagePath)
    fprintf('  SKIP       no test image found; skipping end-to-end checks.\n');
else
    raw = imread(testImagePath);

    % EXACTLY the chain gradingOrchestrator.js runs, in the same order.
    pre = illuminationNormalize(claheEnhance(benGrahamCrop(raw, 512)));

    sizeOk   = isequal(size(pre), [512 512 3]);
    hardFail = report('preprocessing chain emits 512x512x3', sizeOk, hardFail);

    % classifyBranchA loads the .mat itself, so it can only exercise the
    % canonical path. Deliberately NOT copying the candidate model there:
    % silently overwriting the team's live branchA_v1.mat as a side effect of
    % running a check would be a nasty surprise. Verify in place instead.
    canonicalPath = fullfile(thisDir, '..', 'models', 'branchA_v1.mat');
    isCanonical   = isfile(canonicalPath) && ...
                    strcmp(getCanonical(modelPath), getCanonical(canonicalPath));

    if isCanonical
        clear classifyBranchA   % drop any net cached by a previous run
        t0 = tic; r1 = classifyBranchA(pre); t1 = toc(t0);
        t0 = tic; r2 = classifyBranchA(pre); t2 = toc(t0);

        hardFail = report('classifyBranchA returns grade in 0..4', ...
                          isnumeric(r1.grade) && r1.grade >= 0 && r1.grade <= 4, hardFail);
        hardFail = report('classifyBranchA returns 1x5 probabilities', ...
                          isequal(size(r1.probabilities), [1 5]), hardFail);
        hardFail = report('repeat call returns identical result', ...
                          isequal(r1.grade, r2.grade), hardFail);

        fprintf('  INFO       first call %.2fs, cached call %.2fs\n', t1, t2);
        softFail = report('persistent caching gives a faster second call', ...
                          t2 < t1, softFail, true);
    else
        fprintf('  SKIP       classifyBranchA checks: model is not at models/branchA_v1.mat.\n');
        fprintf('             Copy it there yourself and re-run to exercise the real\n');
        fprintf('             load path and persistent caching.\n');
        probs = runNet(net, pre);
        [~, idx] = max(probs);
        r1 = struct('grade', idx - 1, 'probabilities', probs);
    end

    fprintf('  INFO       grade %d, probabilities [%s]\n', ...
            r1.grade, join(string(round(r1.probabilities, 4)), ', '));

    % A trained model should not be pinned at 1.0 on an arbitrary image.
    % Saturation this extreme means every case lands in Tier A and auto-clears,
    % bypassing the ophthalmologist entirely -- the untrained stub does exactly
    % this, and it is the single most dangerous failure mode to ship unnoticed.
    conf     = max(r1.probabilities);
    softFail = report('confidence is not saturated at ~1.0', conf < 0.9999, softFail, true);
    if conf >= 0.9999
        fprintf('    confidence = %.8f. Check that batch-norm statistics were actually\n', conf);
        fprintf('    learned, and that you are feeding the same preprocessing used in\n');
        fprintf('    training. See docs/model-handoff-guide.md section "Confidence sanity".\n');
    end

    % Grad-CAM
    outPng = fullfile(tempdir, 'handoff_gradcam_check.png');
    try
        gradCam(net, pre, r1.grade + 1, outPng);
        hardFail = report('gradCam writes a PNG', isfile(outPng), hardFail);
        fprintf('  INFO       Grad-CAM written to %s\n', outPng);
        fprintf('             OPEN IT. Attention should sit on retinal structure, not\n');
        fprintf('             spread evenly and not cluster in the corners or the black\n');
        fprintf('             border. This check cannot be automated -- look at it.\n');
    catch ME
        hardFail = report('gradCam runs without error', false, hardFail);
        fprintf('    %s\n', ME.message);
    end
end

%% ── Summary ─────────────────────────────────────────────────────────────────
fprintf('\n===== Summary =====\n');
fprintf('  hard failures : %d\n', hardFail);
fprintf('  soft warnings : %d\n', softFail);

if hardFail > 0
    fprintf('\nNOT READY TO HAND OVER. Fix the hard failures above.\n\n');
elseif softFail > 0
    fprintf('\nIntegrates, but read the warnings -- most cost a retrain if deferred.\n\n');
else
    fprintf('\nREADY TO HAND OVER. Copy the .mat to ml-pipeline/models/ and tell the\n');
    fprintf('backend team, along with valLogits.mat / valLabels.mat for calibration.\n\n');
end

end

% ── helpers ──────────────────────────────────────────────────────────────────

function n = report(label, ok, n, isSoft)
if nargin < 4, isSoft = false; end
if ok
    fprintf('  PASS       %s\n', label);
else
    if isSoft
        fprintf('  WARN       %s\n', label);
    else
        fprintf('  HARD FAIL  %s\n', label);
    end
    n = n + 1;
end
end

function probs = runNet(net, img)
% Mirrors classifyBranchA's dual-path inference so this check exercises the
% same code shape the server will.
if isa(net, 'dlnetwork')
    x = single(img);
    x = reshape(x, [size(x,1), size(x,2), size(x,3), 1]);
    probs = double(extractdata(predict(net, dlarray(x, 'SSCB'))));
else
    probs = double(predict(net, img));
end
probs = probs(:)';
end

function c = getCanonical(p)
% Resolve a path to a comparable absolute form, so '../models/x.mat' and an
% absolute path to the same file compare equal.
f = dir(p);
if isempty(f)
    c = p;
else
    c = lower(fullfile(f(1).folder, f(1).name));
end
end

function p = findSampleImage(thisDir)
root = fullfile(thisDir, '..', '..', '..', '..');   % repo root
p = '';
for pattern = ["datasets/*.jpg", "datasets/*.png", "datasets/*.jpeg", ...
               "datasets/**/*.jpg", "datasets/**/*.png"]
    f = dir(fullfile(root, pattern));
    if ~isempty(f)
        p = fullfile(f(1).folder, f(1).name);
        return;
    end
end
end
