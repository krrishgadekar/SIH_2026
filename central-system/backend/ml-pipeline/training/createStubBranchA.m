% createStubBranchA.m — Run-once script: build a THROWAWAY Branch A stub model.
%
%   Run:  matlab -batch "run('createStubBranchA.m')"
%
%   PURPOSE
%     Task 2.2/2.3 (real training) is owned by a teammate and not yet done.
%     Every downstream Phase 2 component (classifyBranchA, gradCam,
%     gradingOrchestrator) needs ml-pipeline/models/branchA_v1.mat to exist
%     before it can run at all.  This script produces a structurally correct
%     but UNTRAINED network so the surrounding plumbing is buildable and
%     testable now.
%
%   !! THE PREDICTIONS FROM THIS MODEL ARE MEANINGLESS !!
%     The final FC layer has random weights.  Grades and confidences produced
%     from it are noise.  This is expected and fine — what is being verified
%     at this stage is orchestration, shapes, caching and DB writes.
%
%   SWAP-IN PATH
%     When the teammate delivers the real trained model, overwrite
%     ml-pipeline/models/branchA_v1.mat with it.  No code changes are needed
%     anywhere, provided the real model also:
%       - stores the network in a variable named 'net'
%       - takes 512x512x3 input
%       - emits 5 class probabilities summing to 1
%     See models/README.md.

fprintf('=== createStubBranchA — building UNTRAINED stub ===\n');

thisDir   = fileparts(mfilename('fullpath'));
modelsDir = fullfile(thisDir, '..', 'models');
if ~isfolder(modelsDir)
    mkdir(modelsDir);
end
outPath = fullfile(modelsDir, 'branchA_v1.mat');

% ── Step 1: ResNet-50 backbone with a fresh 5-class head ─────────────────────
% NumClasses=5 replaces the final learnable (FC) layer with a randomly
% initialised 5-output one — exactly the architecture shape the real trained
% model will have (see models/README.md).
%   PRETRAINED backbone with a fresh random 5-class head — not Weights="none".
%
%   An earlier version used Weights="none" because the ResNet-50 support package
%   was not installed. That produced a network whose BATCH-NORM STATISTICS were
%   also random, and the consequence was not cosmetic: activations compounded
%   through 50 layers and the softmax saturated, returning ~[1 0 0 0 0] on every
%   image. Confidence 1.0 means conformal tier 'A', and Tier A AUTO-CLEARS —
%   so the stub silently sent every case straight past the ophthalmologist, and
%   the review queue (which excludes Tier A) always looked empty.
%
%   A pretrained backbone has learned BN statistics, so activations stay in a
%   sane range and the head produces a spread of confidences instead of a pinned
%   one. The predictions are STILL MEANINGLESS — the classifier head is random
%   and untrained — but the downstream pipeline now exercises a realistic
%   distribution of tiers, which is what makes the queue, the ranking and the
%   referral path testable at all before the real model arrives.
fprintf('Loading imagePretrainedNetwork("resnet50", NumClasses=5)...\n');
net = imagePretrainedNetwork("resnet50", NumClasses=5);

fprintf('Network type: %s\n', class(net));
fprintf('Last 4 layers:\n');
for i = max(1, numel(net.Layers)-3):numel(net.Layers)
    fprintf('  %2d  %-24s  %s\n', i, net.Layers(i).Name, class(net.Layers(i)));
end

% ── Step 2: guarantee a softmax terminal layer ───────────────────────────────
% gradCam.m reads class scores from net.Layers(end) and classifyBranchA.m
% expects probabilities summing to 1.  imagePretrainedNetwork normally ends
% in softmax already; add one only if it does not.
if ~isa(net.Layers(end), 'nnet.cnn.layer.SoftmaxLayer')
    fprintf('No terminal softmax found — appending softmax layer "softmax_dr".\n');
    lastName = net.Layers(end).Name;
    net = addLayers(net, softmaxLayer('Name', 'softmax_dr'));
    net = connectLayers(net, lastName, 'softmax_dr');
else
    fprintf('Terminal softmax already present: "%s".\n', net.Layers(end).Name);
end

% ── Step 3: initialise at the pipeline's real input size ─────────────────────
% addLayers de-initialises a dlnetwork.  Initialising here at 512x512x3 (the
% size benGrahamCrop emits) means the saved file is ready to predict() with
% no further setup.  classifyBranchA/gradCam still carry their own guards.
exInput = dlarray(randn(512, 512, 3, 1, 'single'), 'SSCB');
if ~net.Initialized
    fprintf('Initialising dlnetwork at 512x512x3...\n');
    net = initialize(net, exInput);
end

% ── Step 4: verify the interface contract before saving ──────────────────────
fprintf('Verifying forward pass at 512x512x3...\n');
probs = double(extractdata(predict(net, exInput)));
probs = probs(:)';

assert(numel(probs) == 5, ...
    'Stub verification FAILED: expected 5 outputs, got %d.', numel(probs));
assert(abs(sum(probs) - 1) < 1e-4, ...
    'Stub verification FAILED: probabilities sum to %.6f, not 1.', sum(probs));

fprintf('  output size : 1x%d  OK\n', numel(probs));
fprintf('  sum(probs)  : %.6f  OK\n', sum(probs));
fprintf('  probs       : [%s]\n', join(string(round(probs, 4)), ', '));

% ── Step 5: save ─────────────────────────────────────────────────────────────
save(outPath, 'net', '-v7.3');
d = dir(outPath);
fprintf('\nSaved stub to: %s (%.1f MB)\n', outPath, d.bytes / 1e6);
fprintf('=== DONE — remember: this model is UNTRAINED, predictions are noise ===\n');
