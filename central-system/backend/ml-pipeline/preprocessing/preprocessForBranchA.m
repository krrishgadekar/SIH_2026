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
%              .targetSize     512
%              .denoiseMethod  'anisotropic' | 'nlm' | 'none'
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
%   ── ORDER, AND WHY EACH STEP IS WHERE IT IS ────────────────────────────────
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

cropped  = benGrahamCrop(calibrated, targetSize);
denoised = denoiseRetinal(cropped, denoiseMethod);
[outImg, applied] = adaptiveEnhance(denoised, qualityScores, ...
                                    struct('baseClipLimit', baseClip));

steps = struct( ...
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
