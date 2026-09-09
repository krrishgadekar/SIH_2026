function [outImg, steps] = preprocessForBranchA(img, qualityScores, opts)
% PREPROCESSFORBRANCHA  THE preprocessing chain. Use this, not the steps.
%
%   outImg         = preprocessForBranchA(img)
%   outImg         = preprocessForBranchA(img, qualityScores)
%   [outImg, steps] = preprocessForBranchA(img, qualityScores, opts)
%
%   Inputs:
%     img           - HxWx3 uint8 RAW fundus image, straight from imread.
%     qualityScores - struct of PHC quality-gate sub-scores, or [] when none
%                     are available (training images, or a case that synced
%                     before scores were transmitted).
%     opts - optional struct:
%              .recipe         'model1' (default) | 'legacy'
%              .targetSize     384 under 'model1', 512 under 'legacy'
%              .denoiseMethod  'anisotropic' | 'nlm' | 'none'  ('legacy' only)
%
%   Outputs:
%     outImg - targetSize x targetSize x 3 uint8, ready for the network.
%     steps  - struct recording what ran, including which adaptations fired.
%
%   ══ WHY THIS FUNCTION EXISTS ═══════════════════════════════════════════════
%   TRAIN/SERVE SKEW is the highest-risk failure mode in this pipeline, and it
%   is completely silent: if training preprocesses images differently from
%   inference, nothing errors, no test fails, and the model is simply worse than
%   it should be for reasons no one can see. It looks like a bad model.
%
%   The chain has already changed once — denoising was inserted (Task 2.1b) and
%   CLAHE/illumination were folded into adaptive enhancement (Task 2.8). Any
%   caller that had hand-written the old three-step sequence is now silently
%   wrong.
%
%   So there is exactly ONE definition of the chain, here, and both sides call
%   it. gradingOrchestrator.js calls it at inference; the training script must
%   call it too (docs/model-handoff-guide.md §2). Do not reimplement these steps
%   anywhere, and do not call the individual functions directly for anything
%   that feeds Branch A.
%
%   ══ 2026-09-09: THE CHAIN CHANGED, AND THIS IS WHY ═════════════════════════
%   Branch A arrived as a trained PyTorch model (Model1, EfficientNet-B0), and
%   it was trained on a PYTHON chain — ben_graham.py then clahe_enhance.py —
%   not on this one. The skew the section above warns about had actually
%   happened.
%
%   Measured on datasets/2.jpg (comparePreprocessingRecipes.m):
%       output size      512x512 here vs 384x384 there — the network's input
%       mean difference  20.6 grey levels (8.1% of range)
%       worst 5% of px   57 grey levels
%       SSIM             0.824
%   Global brightness and contrast matched almost exactly while local structure
%   did not — and local structure is where microaneurysms live.
%
%   So the DEFAULT recipe is now 'model1': preprocessModel1.m, a port of the
%   training code. The rule this file has always stated is unchanged; what
%   changed is WHICH chain both sides agree on. Whoever trains next updates
%   preprocessModel1.m and this default in the same commit.
%
%   ── WHAT 'model1' GIVES UP, STATED PLAINLY ─────────────────────────────────
%   Denoising (2.1b) and adaptive enhancement (2.8) no longer touch the Branch A
%   input, and the camera calibration profile is computed but not applied to its
%   pixels. Those are PS requirement 1 items, so this is a real reduction in
%   what the graded image goes through.
%
%   It is still correct. The model never saw those steps, so applying them makes
%   it perform WORSE, not better — a nicer-looking image is not a better input
%   to a network trained without it. All three remain live under recipe
%   'legacy' for the Phase 4 segmentation path, where the models are ours and we
%   control both sides. Camera classification still runs either way, because the
%   reported-vs-detected mismatch check (Task 6.3) is metadata, not a pixel
%   transform.
%
%   ── 'legacy' ORDER, AND WHY EACH STEP IS WHERE IT IS ───────────────────────
%     1. benGrahamCrop      crop to the retinal disc, resize, boost local
%                           contrast. First, because everything downstream
%                           assumes a consistent frame and scale.
%     2. denoiseRetinal     edge-preserving, BEFORE contrast amplification —
%                           CLAHE amplifies whatever noise it is handed.
%     3. adaptiveEnhance    glare attenuation, conditional sharpening, CLAHE
%                           with a score-scaled clip limit, then illumination
%                           normalisation. Subsumes the old claheEnhance +
%                           illuminationNormalize pair.
%
%   ── TRAINING WITHOUT QUALITY SCORES IS FINE AND DETERMINISTIC ──────────────
%   Training images have no PHC quality gate behind them, so qualityScores is
%   empty and adaptiveEnhance falls through to its default path: CLAHE at clip
%   0.01, no sharpening, no glare attenuation. That is deterministic and
%   reproducible, and it is the same code path a good-quality clinical image
%   takes — which is exactly the property that keeps training and inference
%   aligned for the images that matter most.

if nargin < 2, qualityScores = []; end
if nargin < 3, opts = struct(); end

targetSize    = getdef(opts, 'targetSize', 512);
denoiseMethod = getdef(opts, 'denoiseMethod', 'anisotropic');

if size(img, 3) ~= 3
    error('preprocessForBranchA:badInput', 'Expected an HxWx3 RGB image.');
end

% ── 0. Camera-family calibration (Task 6.3) ────────────────────────────────
% Runs on the RAW image, before benGrahamCrop. That order is forced: the two
% strongest family features are aspect ratio and vignette-edge sharpness, and
% benGrahamCrop removes both — it crops away the vignette and squares the frame.
% Classifying after it would leave the classifier looking at the one thing every
% camera has in common.
cameraFamily = getdef(opts, 'cameraFamily', '');
reportedDevice = getdef(opts, 'reportedDeviceId', '');
camDetail = [];

if getdef(opts, 'enableCameraCalibration', true)
    if isempty(cameraFamily)
        [cameraFamily, camDetail] = classifyCameraFamily(img, reportedDevice);
    else
        % Caller forced a family — used by the ablation in Task 9.3 and by the
        % DoD check that two profiles produce different pixels.
        [~, camDetail] = classifyCameraFamily(img, reportedDevice);
        camDetail.profile = profileFor(cameraFamily);
        camDetail.forcedFamily = true;
    end
    calibrated = applyCalibrationProfile(img, camDetail.profile);
    baseClip   = getdef(camDetail.profile, 'claheClipLimit', 0.01);
else
    calibrated = img;
    baseClip   = 0.01;
    cameraFamily = 'disabled';
end

% ── 1. The chain itself ────────────────────────────────────────────────────
% DEFAULT IS 'model1': the exact recipe Branch A was trained on. See the
% train/serve note in the header. 'legacy' keeps the richer chain for the
% Phase 4 segmentation path, where we own both sides.
recipe = getdef(opts, 'recipe', 'model1');

switch recipe
    case 'model1'
        % Note what is NOT passed: `calibrated`. The camera profile was applied
        % above for its metadata and mismatch check, but the PIXELS handed to
        % Branch A are the raw image put through the training recipe, because
        % that is what the model saw. Feeding it the calibrated image would
        % reintroduce exactly the divergence this change removes.
        [outImg, m1] = preprocessModel1(img, opts);
        applied = m1;
        targetSize = m1.targetSize;
        denoiseMethod = 'none (not in the training recipe)';

    case 'legacy'
        cropped  = benGrahamCrop(calibrated, targetSize);
        denoised = denoiseRetinal(cropped, denoiseMethod);
        [outImg, applied] = adaptiveEnhance(denoised, qualityScores, ...
                                            struct('baseClipLimit', baseClip));

    otherwise
        error('preprocessForBranchA:badRecipe', ...
              'recipe must be ''model1'' or ''legacy'', got ''%s''.', recipe);
end

steps = struct( ...
    'recipe',        recipe, ...
    'targetSize',    targetSize, ...
    'denoiseMethod', denoiseMethod, ...
    'hadQualityScores', ~isempty(qualityScores) && isstruct(qualityScores) ...
                        && ~isempty(fieldnames(qualityScores)), ...
    'cameraFamily',  cameraFamily, ...
    'cameraDetail',  camDetail, ...
    'baseClipLimit', baseClip, ...
    'adaptive',      applied);
end

function p = profileFor(familyName)
% Look up one family's profile directly, for a forced classification.
thisDir = fileparts(mfilename('fullpath'));
cfg = jsondecode(fileread(fullfile(thisDir, '..', 'cameraCalibration', ...
                                   'calibrationProfiles.json')));
if isfield(cfg.families, familyName)
    p = cfg.families.(familyName).profile;
else
    error('preprocessForBranchA:badFamily', ...
          'Unknown camera family ''%s''. Valid: %s', familyName, ...
          strjoin(fieldnames(cfg.families)', ', '));
end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
