function [family, detail] = classifyCameraFamily(rawImg, reportedDeviceId)
% CLASSIFYCAMERAFAMILY  Identify the capture device family from the image.
%
%   family           = classifyCameraFamily(rawImg)
%   [family, detail] = classifyCameraFamily(rawImg, reportedDeviceId)
%
%   Inputs:
%     rawImg           - HxWx3 uint8, the RAW image as captured. NOT cropped:
%                        benGrahamCrop removes the vignette and normalises the
%                        aspect ratio, which are two of the four features here.
%     reportedDeviceId - optional, the worker-reported cameraDeviceId from the
%                        capture-metadata questionnaire.
%
%   Outputs:
%     family - char, a key in calibrationProfiles.json, or 'unknown'.
%     detail - struct: .features, .scores, .expectedFamily, .mismatch, .notes
%
%   Task 6.3 / design doc §6.3.
%
%   ── WHY THIS EXISTS ────────────────────────────────────────────────────────
%   Different fundus cameras produce systematically different images. A model
%   trained mostly on one degrades on another — the domain generalization gap,
%   and the biggest threat to this system working outside a lab. The PS names
%   portable-camera image quality as a concern directly.
%
%   ── A HEURISTIC, AND SAID SO ───────────────────────────────────────────────
%   Rule-based, not trained, because there is no multi-camera dataset here to
%   train on (design doc §6.3 specifies exactly this). The thresholds come from
%   the optics of each camera class, not from fitting. NO CLASSIFICATION
%   ACCURACY HAS BEEN MEASURED and none should be quoted. What IS verified is
%   that the features separate synthetically-perturbed camera variants and that
%   the chosen profile actually changes the output.
%
%   ── THE MISMATCH IS A FEATURE, NOT AN ERROR ────────────────────────────────
%   When the image says one family and the technician reported a device
%   associated with another, that disagreement is itself useful — it can mean an
%   unusual capture, a mislabelled device, or a camera swapped without the
%   config being updated (design doc §9.4). It is surfaced, never suppressed,
%   and it never overrides the image evidence: the pixels are what the model
%   will actually see.

if nargin < 2, reportedDeviceId = ''; end

if size(rawImg, 3) ~= 3
    error('classifyCameraFamily:badInput', 'Expected an HxWx3 RGB image.');
end

cfg = loadProfiles();

% ── Features ────────────────────────────────────────────────────────────────
f = extractFeatures(rawImg);

% ── Score each family ───────────────────────────────────────────────────────
% Every feature must fall inside the family's range. A per-feature score in
% [0,1] measures how centrally it sits, and the family score is the MINIMUM
% across features, not the mean.
%
% Minimum, deliberately: a mean lets three good features outvote one that is
% flatly out of range, which is how a desktop image gets called a smartphone
% because its colour balance happened to match. Every feature holds a veto.
famNames = fieldnames(cfg.families);
scores = struct();
best = ''; bestScore = -Inf;

for k = 1:numel(famNames)
    name = famNames{k};
    fam  = cfg.families.(name);
    if strcmp(name, cfg.defaultFamily), continue; end   % fallback, never scored

    s = scoreFamily(f, fam.match);
    scores.(name) = s;
    if s > bestScore
        bestScore = s;
        best = name;
    end
end

% A zero score means at least one feature was out of range for every family.
% Falling back to 'unknown' — whose profile is a no-op — is the right answer:
% an unrecognised camera must never be made worse by a guessed correction.
if bestScore <= 0 || isempty(best)
    family = cfg.defaultFamily;
else
    family = best;
end

% ── Cross-check against the worker-reported device ──────────────────────────
expectedFamily = '';
mismatch = false;
notes = {};

if ~isempty(reportedDeviceId) && isfield(cfg.deviceAssociations, matlab.lang.makeValidName(reportedDeviceId))
    assoc = cfg.deviceAssociations.(matlab.lang.makeValidName(reportedDeviceId));
    if ~isempty(assoc) && ~(isnumeric(assoc) && isempty(assoc))
        expectedFamily = char(assoc);
        if ~strcmp(expectedFamily, family)
            mismatch = true;
            notes{end+1} = sprintf(['reported device ''%s'' implies family ''%s'', ' ...
                'but the image looks like ''%s'''], ...
                reportedDeviceId, expectedFamily, family);
        end
    end
end

if strcmp(family, cfg.defaultFamily)
    notes{end+1} = ['no family matched; using the neutral profile, which is a ' ...
                    'no-op rather than a guess'];
end

detail = struct( ...
    'features',       f, ...
    'scores',         scores, ...
    'confidence',     max(0, bestScore), ...
    'expectedFamily', expectedFamily, ...
    'reportedDeviceId', reportedDeviceId, ...
    'mismatch',       mismatch, ...
    'profile',        cfg.families.(family).profile, ...
    'notes',          {notes});
end

% ── Feature extraction ──────────────────────────────────────────────────────
function f = extractFeatures(img)
[H, W, ~] = size(img);
gray = rgb2gray(img);

% Retinal mask: same gray>15 rule assessFOV and benGrahamCrop use, so all three
% agree on where the retina is rather than each deciding separately.
retina = imfill(gray > 15, 'holes');
retina = bwareafilt(retina, 1);
if ~any(retina(:)), retina = true(H, W); end

f.aspectRatio     = W / H;
f.retinalCoverage = nnz(retina) / (H * W);

% ── Vignette sharpness ──────────────────────────────────────────────────────
% How abruptly the retinal circle gives way to black. Good optics produce a
% crisp edge; a simple lens or a phone adapter produces a gradual falloff. This
% is the feature that most cleanly separates desktop from portable, because it
% is a property of the optics rather than of the eye or the operator.
%
% Measured as the mean gradient magnitude ON the boundary, normalised by the
% retina's own mean brightness so a dim image is not scored as a soft edge.
edgeBand = bwperim(retina);
edgeBand = imdilate(edgeBand, strel('disk', 3));
[gx, gy] = imgradientxy(double(gray));
gmag = hypot(gx, gy);
retinaMean = mean(double(gray(retina)));
if retinaMean < 1, retinaMean = 1; end
% The ratio is used DIRECTLY, only clamped to [0,1]. An earlier version scaled
% it by 4 "to spread the range", which did the opposite: measured values sit
% around 0.45-0.85, so multiplying by 4 pushed every image past 1 and the clamp
% flattened them all to exactly 1.00. The feature became a constant and carried
% no information at all, while still looking like a working measurement.
%
% Measured on this data: crisp desktop edge 0.84, simulated portable 0.45,
% simulated phone 0.58 — discriminative without any scaling.
if any(edgeBand(:))
    f.vignetteSharpness = min(1, max(0, mean(gmag(edgeBand)) / retinaMean));
else
    f.vignetteSharpness = 0;
end

% ── Colour-channel gain ratios ──────────────────────────────────────────────
% Measured INSIDE the retina only. Including the black surround would pull every
% ratio toward 1 and destroy the discrimination entirely — the surround has no
% colour, and it is most of the frame on a phone capture.
r = double(img(:,:,1)); g = double(img(:,:,2)); b = double(img(:,:,3));
mr = mean(r(retina)); mg = mean(g(retina)); mb = mean(b(retina));
if mg < 1, mg = 1; end
f.redGreenRatio  = mr / mg;
f.blueGreenRatio = mb / mg;
f.megapixels     = (H * W) / 1e6;
end

% ── Scoring ─────────────────────────────────────────────────────────────────
function s = scoreFamily(f, match)
% 1 = every feature sits centrally in range; 0 = at least one is outside.
if isempty(fieldnames(match)), s = 0; return; end

names = fieldnames(match);
s = 1;
for k = 1:numel(names)
    name = names{k};
    if ~isfield(f, name), continue; end
    rng = match.(name);
    v = f.(name);
    if v < rng(1) || v > rng(2)
        s = 0;                       % veto: one bad feature disqualifies
        return;
    end
    % Centrality, as a TIE-BREAKER between families that both match — never as
    % the match test itself. Those are different questions and conflating them
    % was a real bug: a feature sitting exactly at a range boundary scored 0
    % centrality, the caller read 0 as "no family matched", and every image fell
    % through to 'unknown'. Being at the edge of a range means barely inside it,
    % not outside it.
    %
    % The 0.05 floor keeps an in-range family strictly positive, so 0 means
    % exactly one thing: at least one feature was out of range.
    mid  = (rng(1) + rng(2)) / 2;
    half = max(eps, (rng(2) - rng(1)) / 2);
    centrality = max(0, 1 - abs(v - mid) / half);
    s = min(s, 0.05 + 0.95 * centrality);
end
end

% ── Profile loading ─────────────────────────────────────────────────────────
function cfg = loadProfiles()
% Cached: this is read once per MATLAB session, not once per case.
persistent cached
if ~isempty(cached), cfg = cached; return; end

thisDir = fileparts(mfilename('fullpath'));
jsonPath = fullfile(thisDir, 'calibrationProfiles.json');
if ~isfile(jsonPath)
    error('classifyCameraFamily:noProfiles', ...
          'calibrationProfiles.json not found at %s', jsonPath);
end
cached = jsondecode(fileread(jsonPath));
cfg = cached;
end
