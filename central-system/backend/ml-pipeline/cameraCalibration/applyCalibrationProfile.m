function [outImg, applied] = applyCalibrationProfile(img, profile)
% APPLYCALIBRATIONPROFILE  Apply a camera family's correction to an image.
%
%   outImg            = applyCalibrationProfile(img, profile)
%   [outImg, applied] = applyCalibrationProfile(img, profile)
%
%   Inputs:
%     img     - HxWx3 uint8.
%     profile - struct from calibrationProfiles.json:
%                 .whiteBalanceGains  [r g b] multipliers
%                 .vignetteCorrection 0-1, strength of corner-falloff recovery
%                 .claheClipLimit     passed on by the caller, not used here
%                 .illuminationTarget passed on by the caller, not used here
%
%   Outputs:
%     outImg  - HxWx3 uint8, corrected.
%     applied - struct recording what actually changed.
%
%   Task 6.3.
%
%   ── THIS IS THE HALF THE DoD IS STRICT ABOUT ───────────────────────────────
%   Task 6.3's Definition of Done is that processing the same image under two
%   different family profiles VISIBLY changes the output — "confirming the
%   profile is actually being applied, not just computed and discarded".
%
%   That warning is pointed at a specific, easy failure: classifying the camera,
%   writing the family to the database, showing it on a dashboard, and never
%   feeding it back into the pipeline. Everything would look implemented and no
%   pixel would differ. So this function exists to make the profile do work, and
%   verifyCameraCalibration.m measures the pixel difference rather than checking
%   that a profile was merely selected.
%
%   Two corrections here; the two enhancement parameters
%   (claheClipLimit, illuminationTarget) are applied downstream by
%   adaptiveEnhance, which owns those steps.

if nargin < 2 || isempty(profile)
    outImg = img;
    applied = struct('whiteBalance', false, 'vignette', false, ...
                     'reason', 'no profile supplied');
    return;
end

if size(img, 3) ~= 3
    error('applyCalibrationProfile:badInput', 'Expected an HxWx3 RGB image.');
end

[H, W, ~] = size(img);
work = double(img);
applied = struct('whiteBalance', false, 'vignette', false, 'reason', '');

% ── White balance ───────────────────────────────────────────────────────────
% Per-channel gains, correcting the systematic colour cast of a camera family.
% Skipped entirely when the gains are all 1, so the neutral profile is a true
% no-op rather than a round-trip through double and back that would introduce
% quantisation for nothing.
gains = getfielddef(profile, 'whiteBalanceGains', [1 1 1]);
gains = double(gains(:))';
if numel(gains) == 3 && any(abs(gains - 1) > 1e-6)
    for c = 1:3
        work(:,:,c) = work(:,:,c) * gains(c);
    end
    applied.whiteBalance = true;
    applied.gains = gains;
end

% ── Vignette correction ─────────────────────────────────────────────────────
% Portable and phone-adapter optics darken toward the edge of the retinal
% circle. Left uncorrected, that falloff is a systematic difference between
% cameras that the model can latch onto — it learns the camera rather than the
% disease, which is precisely the domain-generalization failure this task
% exists to reduce.
%
% Applied only INSIDE the retina. Brightening the black surround would
% manufacture a grey halo, and that halo is itself a new camera-specific
% artefact — the opposite of the intent.
vc = getfielddef(profile, 'vignetteCorrection', 0);
if vc > 0
    gray = rgb2gray(img);
    retina = imfill(gray > 15, 'holes');
    retina = bwareafilt(retina, 1);

    if any(retina(:))
        st = regionprops(retina, 'Centroid', 'EquivDiameter');
        cx = st(1).Centroid(1); cy = st(1).Centroid(2);
        radius = max(1, st(1).EquivDiameter / 2);

        [xx, yy] = meshgrid(1:W, 1:H);
        rNorm = min(1, hypot(xx - cx, yy - cy) / radius);

        % Gain rising with radius: 1 at the centre, up to (1 + vc) at the rim.
        % Quadratic because lens falloff is roughly cos^4, which over the useful
        % radius is far closer to quadratic than linear.
        gain = 1 + vc * (rNorm .^ 2);
        gain(~retina) = 1;

        for c = 1:3
            work(:,:,c) = work(:,:,c) .* gain;
        end
        applied.vignette = true;
        applied.vignetteStrength = vc;
    end
end

outImg = uint8(max(0, min(255, work)));

if ~applied.whiteBalance && ~applied.vignette
    applied.reason = 'neutral profile — no correction needed';
else
    applied.reason = sprintf('white balance %d, vignette %d', ...
                             applied.whiteBalance, applied.vignette);
end
end

function v = getfielddef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
