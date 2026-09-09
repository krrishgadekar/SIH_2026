function result = qualityGateMain(imagePath, cameraDeviceId)
% QUALITYGATEMAIN  Combined quality gate — returns pass/retake/borderline.
%
%   result = qualityGateMain(imagePath, cameraDeviceId)
%
%   Inputs:
%     imagePath      - char / string path to the raw captured image file.
%     cameraDeviceId - char / string device identifier (from the capture-
%                      metadata questionnaire). Falls back to default preset
%                      if the key is not found in cameraPresets.json.
%
%   Output:
%     result - scalar struct with EXACTLY three fields:
%                .status  char — exactly one of: 'pass' | 'retake' | 'borderline'
%                .reason  char — exactly one of the six api-contracts.md enum
%                                strings, or [] when status is 'pass' or
%                                'borderline'.
%                .scores  struct — all six sub-scores for logging/debugging.
%                                  NEVER sent to the frontend or returned over
%                                  HTTP — for internal logging only.
%
%   Enum strings returned in .reason are the EXACT values from api-contracts.md:
%     'blur'              'low_illumination'   'insufficient_fov'
%     'glare'             'motion_artifact'    'eyelash_occlusion'
%   These are compared with === in the Node route handler and mapped to
%   human-readable messages in QualityResultPanel.jsx — any deviation
%   (capitalisation, underscore vs space, etc.) silently breaks the UI.
%
%   Decision order: priority-ordered if/elseif — FIRST match wins.
%   This is not a set of independent checks.  The order matters:
%     1. FOV failure first — a badly-framed image makes all other metrics
%        unreliable (dominated by the large black border region).
%     2. Glare before motion/focus: glare inflates Laplacian variance and
%        can produce false-pass on focus if checked later.
%     3. Motion before focus (updated after real-image calibration):
%        A motion-blurred image also reduces Laplacian variance and would
%        fire 'blur' if focus is checked first.  Motion and focus are both
%        retake reasons, but the corrective action differs — 'motion_artifact'
%        tells the technician "ask the patient to hold still" while 'blur'
%        tells them "refocus the camera".  Showing the right message matters.
%     4. Focus and illumination before occlusion: a blurry/dark image
%        always warrants retake regardless of minor occlusion.
%     5. Composite borderline check is a catch-all for no single hard failure.

% ── Step 1: load image ────────────────────────────────────────────────────
img = imread(imagePath);

% ── Step 2: load camera preset ────────────────────────────────────────────
% Task 8.1: resolved via qualityGateAssetPath so this works both under MATLAB
% and inside a compiled executable. mfilename('fullpath') points into the CTF
% archive when deployed, so the previous direct fullfile() call would fail at
% the first capture on a PHC machine with no MATLAB.
presetsPath = qualityGateAssetPath('cameraPresets.json');
presets = jsondecode(fileread(presetsPath));
preset  = getPresetOrDefault(presets, cameraDeviceId);

% ── Step 3: run all four assessment functions ─────────────────────────────
focus              = assessFocus(img);
illumination       = assessIllumination(img);
fov                = assessFOV(img);
glareMotionOcclusion = assessGlareMotionOcclusion(img);

% Store all six sub-scores for logging (never returned over HTTP)
result.scores.focusScore       = focus.score;
result.scores.illuminationScore = illumination.score;
result.scores.fovScore         = fov.score;
result.scores.coveragePercent  = fov.coveragePercent;
result.scores.glareScore       = glareMotionOcclusion.glareScore;
result.scores.motionScore      = glareMotionOcclusion.motionScore;
result.scores.occlusionScore   = glareMotionOcclusion.occlusionScore;

% Composite score for the borderline catch-all (Step 4, last branch)
compositeScore = mean([focus.score, illumination.score, fov.score]);

% ── Step 4: priority-ordered decision chain ───────────────────────────────
% First match wins.  Reason strings are EXACT api-contracts.md enum values.

if fov.coveragePercent < 0.5
    % Field of view failure — checked first because a badly-framed image
    % makes all other metrics unreliable.
    result.status = 'retake';
    result.reason = 'insufficient_fov';

elseif glareMotionOcclusion.glareScore > 0.3
    % Glare before motion/focus: glare inflates Laplacian variance and
    % would produce a false-pass on focus if checked later.
    result.status = 'retake';
    result.reason = 'glare';

elseif glareMotionOcclusion.motionScore > 0.3
    % Motion before illumination/focus (calibrated after real-image DoD testing):
    % A strong motion blur also reduces Laplacian variance below the focus
    % threshold, so focus would fire first and return 'blur' — the wrong
    % corrective message for patient movement. Checking motion first ensures
    % the technician sees 'motion_artifact' and knows to ask the patient to
    % hold still, not to adjust the camera focus.
    result.status = 'retake';
    result.reason = 'motion_artifact';

elseif illumination.score < preset.illuminationThreshold
    % Illumination before focus (calibrated after real-image DoD testing):
    % Darkening an image scales pixel values by k, which scales Laplacian
    % variance by k² (variance scales as the square of the signal amplitude).
    % At k=0.3: original v≈56 → dark v≈5 → focus score=0.07 < threshold.
    % So a dark-but-sharp image triggers 'blur' before 'low_illumination',
    % giving the technician the wrong corrective instruction.
    % Illumination-first fixes this. A truly focus-blurred image has normal
    % mean intensity (Gaussian blur doesn't shift the mean), so it still
    % correctly reaches the focus branch below.
    result.status = 'retake';
    result.reason = 'low_illumination';

elseif focus.score < preset.focusThreshold
    result.status = 'retake';
    result.reason = 'blur';

elseif glareMotionOcclusion.occlusionScore > 0.18
    % Recalibrated together with the occlusion METRIC, which changed — see the
    % long note in assessGlareMotionOcclusion.m. The old score measured dark
    % border-touching area over the whole frame, so it was dominated by how much
    % black surround a camera leaves: 0.14 on datasets/2.jpg, 0.31 on IDRiD,
    % both perfectly good images. The old 0.20 threshold sat between those two,
    % so it rejected 46 of 52 clean research-grade photographs as
    % 'eyelash_occlusion' once the focus threshold stopped masking it.
    %
    % The score is now dark area INSIDE the retinal disc over disc area, which
    % is framing-invariant. Measured on the same 52 images plus synthetic bars:
    %
    %   clean IDRiD (n=52)  median 0.0064   max 0.1345
    %   datasets/2.jpg      0.0093           (was 0.14 — same image, same eye)
    %   dark bar across the retina:  2% 0.037   5% 0.071   10% 0.128
    %                               20% 0.238  30% 0.345
    %
    % 0.18 passes all 52 clean images with 0.045 of margin above the worst, and
    % still triggers on the ~20% eyelash bar the original spec targeted. It sits
    % in the overlap region between a clean outlier (0.1345) and a 10% bar
    % (0.128), so occlusions below roughly 14% of the disc are tolerated —
    % deliberately, because the alternative is rejecting good captures.
    %
    % n = 52 from one camera, and the bars are synthetic. Re-fit on real
    % occluded captures before deployment.
    result.status = 'retake';
    result.reason = 'eyelash_occlusion';

elseif compositeScore < 0.7
    % Borderline: no single dimension failed hard, but combined quality
    % is sub-optimal.  Preprocessed centrally with CLAHE enhancement.
    result.status = 'borderline';
    result.reason = [];

else
    result.status = 'pass';
    result.reason = [];
end

end

% ── Local helper ──────────────────────────────────────────────────────────

function preset = getPresetOrDefault(presets, cameraDeviceId)
% GETPRESETORDEFAULT  Return the camera preset for cameraDeviceId, or the
%   'default' preset if cameraDeviceId is not a recognised key.
%
%   presets      - struct decoded from cameraPresets.json (jsondecode output).
%   cameraDeviceId - char / string device key, e.g. 'forus_3nethra_v2'.
%
%   jsondecode maps JSON keys to struct fieldnames.  Keys that are valid
%   MATLAB identifiers survive as-is; others get mangled — that's why
%   cameraPresets.json device keys must be valid identifiers (underscores
%   OK, hyphens not).  'unknown' always falls through to default.

if isfield(presets, cameraDeviceId)
    preset = presets.(cameraDeviceId);
else
    preset = presets.default;
end

end
