function trainVesselUnet(opts)
% TRAINVESSELUNET  Train the vessel-segmentation U-Net on DRIVE (Task 4.1).
%
%   trainVesselUnet()
%   trainVesselUnet(opts)
%
%   opts (all optional):
%     .patchSize       64    - training patch edge, pixels
%     .patchesPerImage 400   - patches sampled per training image
%     .encoderDepth    3     - U-Net depth
%     .maxEpochs       12
%     .miniBatchSize   32
%     .valImages       4     - images held out for validation
%     .quick           false - tiny run to check the plumbing, not to train
%
%   Writes ml-pipeline/models/vessel_unet_v1.mat containing `net`.
%   vesselSegmentationUnet.m picks it up automatically on the next call —
%   no code change anywhere.
%
%   ── THREE CONSTRAINTS THAT DETERMINE THE DESIGN ────────────────────────────
%
%   1. TWENTY IMAGES. DRIVE ships 20 annotated training images. That is far too
%      few to train a U-Net on whole images, so this trains on PATCHES: ~400
%      per image gives ~8,000 samples from 20 photographs. Heavy augmentation
%      (rotation, both reflections) is not polish here, it is the only thing
%      standing between this and memorising twenty pictures.
%
%   2. NO GPU on this machine (gpuDeviceCount == 0). Every choice below is
%      sized for CPU: small patches, a shallow encoder, a modest epoch count.
%      A full-resolution U-Net would be correct and would also not finish.
%
%   3. 7.5% OF PIXELS ARE VESSEL. With plain cross-entropy the network reaches
%      92.5% pixel accuracy by predicting "background" everywhere, and that is
%      a genuine optimum it will find quickly. Dice loss is used instead: it
%      scores overlap with the vessel class, so an all-background prediction
%      scores zero rather than 92.5%.
%
%   ── WHAT CANNOT BE MEASURED HERE ───────────────────────────────────────────
%   DRIVE's test split in this download has images and FOV masks but NO
%   1st_manual ground truth, so the usual test-set Dice cannot be computed.
%   Validation below is a held-out slice of the 20 TRAINING images. That is a
%   weaker claim than a test-set number and must be reported as such — it is a
%   validation figure, not a test figure, and the two are not interchangeable.

if nargin < 1, opts = struct(); end
p.patchSize       = getdef(opts, 'patchSize', 64);
p.patchesPerImage = getdef(opts, 'patchesPerImage', 400);
p.encoderDepth    = getdef(opts, 'encoderDepth', 3);
p.maxEpochs       = getdef(opts, 'maxEpochs', 12);
p.miniBatchSize   = getdef(opts, 'miniBatchSize', 32);
p.valImages       = getdef(opts, 'valImages', 4);
p.quick           = getdef(opts, 'quick', false);

if p.quick
    % Plumbing check only. The resulting weights are meaningless; the point is
    % to fail fast on a datastore or shape problem instead of discovering it
    % forty minutes into a real run.
    p.patchesPerImage = 20; p.maxEpochs = 1;
    fprintf('*** QUICK MODE: plumbing check only, the model will be useless ***\n');
end

thisDir  = fileparts(mfilename('fullpath'));
mlRoot   = fullfile(thisDir, '..');
repoRoot = fullfile(mlRoot, '..', '..', '..');
driveDir = fullfile(repoRoot, 'datasets', 'DRIVE', 'training');

imgDir = fullfile(driveDir, 'images');
gtDir  = fullfile(driveDir, '1st_manual');

if ~isfolder(imgDir) || ~isfolder(gtDir)
    error(['trainVesselUnet: DRIVE training data not found.\n' ...
           'Expected:\n  %s\n  %s\nSee datasets/README.md.'], imgDir, gtDir);
end

imds = imageDatastore(imgDir, 'FileExtensions', {'.tif', '.tiff'});
classNames = ["background", "vessel"];
labelIDs   = [0, 255];
pxds = pixelLabelDatastore(gtDir, classNames, labelIDs, 'FileExtensions', {'.gif'});

n = numel(imds.Files);
fprintf('DRIVE training images: %d\n', n);
if n == 0
    error(['trainVesselUnet: zero images found in %s.\n' ...
           'An empty datastore does NOT error during training -- it would ' ...
           'report a clean run on nothing. Check the path.'], imgDir);
end
if numel(pxds.Files) ~= n
    error('trainVesselUnet: %d images but %d masks — they must correspond.', ...
          n, numel(pxds.Files));
end

% ── Split ───────────────────────────────────────────────────────────────────
% A fixed split, not a random one: with 20 images a different split each run
% changes the reported number more than any training change would, and the
% figure stops being comparable between runs.
rng(42);
nVal = min(p.valImages, max(1, floor(n / 5)));
valIdx   = (n - nVal + 1):n;
trainIdx = 1:(n - nVal);

fprintf('split: %d train, %d validation (held out from TRAINING — DRIVE''s\n', ...
        numel(trainIdx), numel(valIdx));
fprintf('       test split has no 1st_manual ground truth in this download)\n');

imdsTrain = subset(imds, trainIdx);  pxdsTrain = subset(pxds, trainIdx);
imdsVal   = subset(imds, valIdx);    pxdsVal   = subset(pxds, valIdx);

% ── Patch datastores ────────────────────────────────────────────────────────
% Rotation restricted to MULTIPLES OF 90 DEGREES, plus both reflections.
% Together those give all eight orientations of the square, and every one is
% lossless.
%
% ── WHY NOT CONTINUOUS RotATION ────────────────────────────────────────────
% 'RandRotation', [-20 20] looks obviously better for a vessel tree, which has
% no canonical orientation. It also silently breaks training.
%
% An arbitrary rotation leaves triangular fill regions in the corners. On the
% IMAGE those fill with zeros, which is harmless. On the CATEGORICAL pixel-label
% image they become <undefined>, which one-hot encodes to NaN — and the loss is
% NaN from the first iteration. Measured on this data: continuous rotation
% produced 6.84% undefined label pixels, 90-degree rotation and reflections
% produce 0%.
%
% This was mis-diagnosed once already as a gradient explosion in the Dice
% denominator. The giveaway was that VALIDATION loss computed fine while
% training went NaN immediately — and validation is the split with no
% augmentation applied.
%
% If continuous rotation is ever wanted back, the loss must first be changed to
% mask undefined target pixels out of both the numerator and the denominator.
augmenter = imageDataAugmenter( ...
    'RandRotation',    @() 90 * randi([0 3]), ...
    'RandXReflection', true, ...
    'RandYReflection', true);

dsTrain = randomPatchExtractionDatastore(imdsTrain, pxdsTrain, ...
    [p.patchSize p.patchSize], ...
    'PatchesPerImage', p.patchesPerImage, ...
    'DataAugmentation', augmenter);

% No augmentation on validation — the point is a stable number to compare
% across runs, and augmenting it would add noise to the only signal available.
dsVal = randomPatchExtractionDatastore(imdsVal, pxdsVal, ...
    [p.patchSize p.patchSize], ...
    'PatchesPerImage', max(50, round(p.patchesPerImage / 4)));

fprintf('patches: ~%d train, ~%d validation (%dx%d)\n', ...
        numel(trainIdx) * p.patchesPerImage, ...
        numel(valIdx) * max(50, round(p.patchesPerImage/4)), ...
        p.patchSize, p.patchSize);

% ── Network ─────────────────────────────────────────────────────────────────
% unet() already returns an INITIALISED dlnetwork in R2026a, ending in softmax.
% Wrapping it in dlnetwork() again errors ("First argument must be a layer
% array, LayerGraph, ..."), because a dlnetwork is not a valid input to itself.
% Older examples show unetLayers() -> dlnetwork(); that two-step form is for the
% LayerGraph API and does not apply here.
net = unet([p.patchSize p.patchSize 3], 2, 'EncoderDepth', p.encoderDepth);
if ~isa(net, 'dlnetwork')
    net = dlnetwork(net);   % older releases return a LayerGraph
end

fprintf('U-Net: %dx%dx3 input, encoder depth %d, %d layers\n', ...
        p.patchSize, p.patchSize, p.encoderDepth, numel(net.Layers));

% ── Train ───────────────────────────────────────────────────────────────────
options = trainingOptions('adam', ...
    'InitialLearnRate',    1e-3, ...
    'MaxEpochs',           p.maxEpochs, ...
    'MiniBatchSize',       p.miniBatchSize, ...
    'ValidationData',      dsVal, ...
    'ValidationFrequency', 100, ...
    'Shuffle',             'every-epoch', ...
    ... % Belt and braces against the NaN blow-up the smooth=1 fix addresses:
    ... % if any batch still produces a huge gradient, clip it rather than let
    ... % one bad step destroy the weights for the rest of the run.
    'GradientThreshold',   1, ...
    'ExecutionEnvironment','cpu', ...
    'Plots',               'none', ...      % headless: -batch has no display
    'Verbose',             true, ...
    'VerboseFrequency',    50);

fprintf('\ntraining on CPU — expect tens of minutes, not seconds\n\n');
t0 = tic;
net = trainnet(dsTrain, net, @diceLoss, options);
trainSeconds = toc(t0);
fprintf('\ntrained in %.1f min\n', trainSeconds / 60);

% ── Validation Dice ─────────────────────────────────────────────────────────
% Dice, not pixel accuracy. At 7.5% vessel, accuracy is dominated by the
% background class and an all-background prediction scores 92.5% — a number
% that looks like success and means the model learned nothing.
fprintf('\nevaluating on the held-out validation images...\n');
dice = evaluateDice(net, imdsVal, pxdsVal, p.patchSize);
fprintf('  mean validation Dice (vessel class): %.4f\n', dice);

% ── Quality gate: REFUSE to save a model that does not work ─────────────────
% The first run of this script trained to NaN, scored Dice 0.17, and saved
% anyway. vesselSegmentationUnet.m then picked the file up and began reporting
% method='unet' -- a broken model presenting itself as the trained one, which
% is precisely the confusion that dispatcher's method flag exists to prevent.
% Everything downstream (NV suspicion, lesion false-positive suppression) would
% have consumed it silently.
%
% So a failed run must leave NO artefact. No file is an obvious, loud failure;
% a bad file is a silent one.
MIN_DICE = 0.55;
if p.quick
    fprintf(['\nQUICK MODE: not saving. This run exists to check the plumbing,\n' ...
             'and its weights are meaningless.\n']);
    return;
end
if ~isfinite(dice) || dice < MIN_DICE
    error(['trainVesselUnet: validation Dice %.4f is below the %.2f minimum — ' ...
           'NOT saving.\n' ...
           'A model this poor would be picked up automatically by ' ...
           'vesselSegmentationUnet.m and reported as the trained model.\n' ...
           'Likely causes: too few epochs, or the loss collapsed to ' ...
           'all-background (check for NaN in the training log).'], dice, MIN_DICE);
end

% ── Save ────────────────────────────────────────────────────────────────────
modelsDir = fullfile(mlRoot, 'models');
if ~isfolder(modelsDir), mkdir(modelsDir); end
outPath = fullfile(modelsDir, 'vessel_unet_v1.mat');

meta = struct('trainedAt', datestr(now, 'yyyy-mm-ddTHH:MM:SS'), ...
              'dataset', 'DRIVE training split (20 images)', ...
              'validationDice', dice, ...
              'validationNote', ['held out from TRAINING; DRIVE test split ' ...
                                 'has no 1st_manual in this download'], ...
              'patchSize', p.patchSize, 'encoderDepth', p.encoderDepth, ...
              'maxEpochs', p.maxEpochs, 'trainSeconds', trainSeconds); %#ok<NASGU>

save(outPath, 'net', 'meta', '-v7.3');
d = dir(outPath);
fprintf('\nsaved %s (%.1f MB)\n', outPath, d.bytes / 1e6);
fprintf('vesselSegmentationUnet.m will now report method=''unet'' automatically.\n');
end

% ── Loss ────────────────────────────────────────────────────────────────────
function loss = diceLoss(Y, T)
% Soft Dice. Y and T are both [H W C N] dlarrays in SSCB format, softmax
% outputs and one-hot targets respectively.
%
% Chosen over cross-entropy because of the class imbalance: cross-entropy is
% minimised well by predicting background everywhere, whereas Dice measures
% overlap with the positive class and scores that degenerate solution at zero.
%
% ── SMOOTH = 1, NOT 1e-6 ───────────────────────────────────────────────────
% Not the cause of the NaN that broke the first runs — that was undefined
% labels from continuous rotation, see the augmenter above. But 1 is still the
% right constant here, for a related reason: at ~13% vessel with 64x64 patches
% many patches contain NO vessel pixels, giving intersection 0 over denominator
% 0. With eps = 1e-6 that is a fine VALUE (1) attached to a gradient of order
% 1e6; with smooth = 1 both stay of order 1. This is the standard
% "Dice with smooth = 1".
%
% The denominator is sum(Y) + sum(T), not sum(Y.^2) + sum(T.^2): the linear
% form is better conditioned near zero, and squaring a softmax output already
% in [0,1] only pushes it further toward the badly-behaved region.
%
% No squeeze() either. It is unnecessary here (nothing is singleton) and on a
% formatted dlarray it risks dropping the SSCB labels the gradient needs.
smooth = 1;
intersection   = sum(Y .* T, [1 2]);
denominator    = sum(Y, [1 2]) + sum(T, [1 2]);
dicePerChannel = (2 * intersection + smooth) ./ (denominator + smooth);
loss = 1 - mean(dicePerChannel, 'all');
end

% ── Evaluation ──────────────────────────────────────────────────────────────
function meanDice = evaluateDice(net, imds, pxds, patchSize)
% Whole-image Dice on the held-out set, resized to a multiple of the patch
% size so the U-Net's down/up-sampling divides evenly.
reset(imds); reset(pxds);
scores = [];
k = 0;
while hasdata(imds)
    img = read(imds);
    gtC = read(pxds);
    if iscell(gtC), gt = gtC{1}; else, gt = gtC; end
    gtMask = (gt == "vessel");

    % Round to a multiple of 2^depth so skip connections align.
    target = round([size(img,1) size(img,2)] / patchSize) * patchSize;
    target = max(target, patchSize);

    resized = imresize(img, target);
    scoreMap = predict(net, single(resized));
    if isa(scoreMap, 'dlarray'), scoreMap = extractdata(scoreMap); end
    vesselScore = scoreMap(:,:,2);

    pred = imresize(double(vesselScore), size(gtMask)) > 0.5;

    inter = nnz(pred & gtMask);
    denom = nnz(pred) + nnz(gtMask);
    if denom > 0
        scores(end+1) = 2 * inter / denom; %#ok<AGROW>
        k = k + 1;
        fprintf('    image %d: Dice %.4f (pred %.1f%% vessel, truth %.1f%%)\n', ...
                k, scores(end), 100*nnz(pred)/numel(pred), ...
                100*nnz(gtMask)/numel(gtMask));
    end
end
meanDice = mean(scores);
end

function v = getdef(s, name, dflt)
if isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
