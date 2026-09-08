function [quadrantIndex, info] = fundusQuadrants(points, opticDisc, fovea, opts)
% FUNDUSQUADRANTS  The one definition of the four retinal quadrants.
%
%   [idx, info] = fundusQuadrants(points, opticDisc, fovea)
%   info        = fundusQuadrants([],     opticDisc, fovea)   % axes only
%
%   Inputs:
%     points     - Nx2 [x y] image coordinates of lesions (may be empty).
%     opticDisc  - [x y] from opticDiscFovea (Task 4.5).
%     fovea      - [x y] from opticDiscFovea.
%     opts.imageSize - [H W], only needed for the info.quadrantMask output.
%
%   Outputs:
%     quadrantIndex - Nx1 integer 1..4, indexing fundusQuadrants('names').
%     info          - struct with the axis vectors, the names, and (if
%                     imageSize was given) a HxW label image.
%
%   fundusQuadrants('names') returns the canonical 1x4 name order.
%
%   Task 7.3 support; consumed by generateEvidenceReport and by whatever builds
%   the 1x4 count vectors ruleEngineGrade (Task 5.1) takes.
%
%   ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
%   Two places need to agree about quadrant order and never drift:
%
%     - ruleEngineGrade takes redLesionQuadrantCounts as a bare 1x4 vector with
%       no names attached, and applies the ETDRS 4-2-1 rule to it;
%     - generateEvidenceReport prints those same counts with names on them
%       ("superior-temporal: 3").
%
%   If the ordering assumed by the counter ever differs from the ordering
%   assumed by the printer, the report attributes lesions to the wrong part of
%   the retina while every number in it stays correct — a wrong report that
%   passes every arithmetic check. Defining the convention once, here, is what
%   makes that impossible rather than merely unlikely.
%
%   ── LATERALITY: THE PROBLEM THIS DISSOLVES ─────────────────────────────────
%   "Temporal" and "nasal" are sides of the PATIENT, so naming them normally
%   requires knowing whether an image is a left or a right eye. Nothing in this
%   system records that: there is no laterality column in the schema, no field
%   in api-contracts.md, and no capture-metadata question for it.
%   opticDiscFovea.m already notes the same gap.
%
%   It turns out not to matter, because of an anatomical fact:
%
%       THE FOVEA IS ALWAYS TEMPORAL TO THE OPTIC DISC — IN BOTH EYES.
%
%   So the temporal direction is simply "the direction from the disc towards the
%   fovea", which this pipeline already measures. Nasal is the opposite. No
%   laterality metadata is needed, and no assumption about it is made — which
%   matters, because assuming would be wrong half the time.
%
%   Superior and inferior come from the perpendicular to that axis. In image
%   coordinates y increases DOWNWARD, so superior is the negative-y side; the
%   normal below is chosen accordingly rather than by whichever way the cross
%   product happened to point.
%
%   ── THE ASSUMPTION THAT REMAINS ────────────────────────────────────────────
%   This assumes the image is in standard orientation and not vertically
%   flipped. A flipped image swaps superior and inferior silently — every count
%   stays right and the labels are wrong. Nothing here can detect that, so it is
%   stated rather than guarded: fundus images from a camera are not flipped, and
%   an image that has been through an editing step that flips it is out of
%   scope.

NAMES = {'superior-temporal', 'inferior-temporal', 'superior-nasal', 'inferior-nasal'};

% fundusQuadrants('names') -- the ordering, without needing coordinates.
if nargin == 1 && (ischar(points) || isstring(points)) && strcmpi(points, 'names')
    quadrantIndex = NAMES;
    return;
end

if nargin < 4, opts = struct(); end

opticDisc = double(opticDisc(:))';
fovea     = double(fovea(:))';
if numel(opticDisc) ~= 2 || numel(fovea) ~= 2
    error('fundusQuadrants:badLandmark', 'opticDisc and fovea must each be [x y].');
end
if any(~isfinite(opticDisc)) || any(~isfinite(fovea))
    error('fundusQuadrants:missingLandmark', ...
          ['Quadrants are defined relative to the disc-fovea axis; with either ' ...
           'landmark missing there is no axis and no quadrant assignment. ' ...
           'Do not fall back to image-centre quadrants -- they are not the same ' ...
           'thing and would be reported as if they were.']);
end

axisVec = fovea - opticDisc;                    % disc -> fovea = temporal
axisLen = hypot(axisVec(1), axisVec(2));
if axisLen < eps
    error('fundusQuadrants:degenerateAxis', ...
          'The optic disc and fovea are at the same point; no axis can be formed.');
end
t = axisVec / axisLen;                          % unit temporal direction

% Perpendicular pointing SUPERIOR. With y increasing downward, superior is the
% NEGATIVE-y side, so the normal is taken and then flipped if it points down.
%
% The flip is not redundant. (t(2), -t(1)) points screen-up only when t(1) > 0,
% i.e. when the fovea is to the RIGHT of the disc. Mirror the eye — fovea to
% the left, which is half of all patients — and the same expression points
% screen-DOWN, silently swapping superior and inferior. Every count stays
% correct and every label is wrong, on exactly half the population. This was a
% real bug here, caught by the mirrored-eye case in testPhase7Explainability.
n = [t(2), -t(1)];
if n(2) > 0
    n = -n;
elseif n(2) == 0
    % A perfectly vertical disc–fovea axis, which is anatomically impossible
    % (the two sit on the horizontal meridian). The normal is horizontal, so
    % "superior" has no meaning; pick a deterministic sign so the assignment is
    % at least reproducible. The normal must STAY perpendicular to t — forcing
    % it to [0,-1] here would make it parallel to t and collapse the four
    % quadrants into two.
    if n(1) < 0, n = -n; end
end

info = struct('names', {NAMES}, 'temporalUnit', t, 'superiorUnit', n, ...
              'opticDisc', opticDisc, 'fovea', fovea, 'axisLength', axisLen);

if isempty(points)
    quadrantIndex = zeros(0, 1);
    if isfield(opts, 'imageSize'), info.quadrantMask = buildMask(opts.imageSize, opticDisc, t, n); end
    if nargout <= 1, quadrantIndex = info; end
    return;
end

if size(points, 2) ~= 2
    error('fundusQuadrants:badPoints', 'points must be Nx2 [x y].');
end

rel = double(points) - opticDisc;               % relative to the disc
temporalComponent = rel * t';                   % >0 temporal, <=0 nasal
superiorComponent = rel * n';                   % >0 superior, <=0 inferior

% Boundaries go to the inferior/nasal side by the <= above. An arbitrary but
% FIXED tie-break: a lesion exactly on an axis has to land somewhere, and the
% alternative -- dropping it -- would make the quadrant counts sum to less than
% the lesion total, which ruleEngineGrade's totals would then disagree with.
isTemporal = temporalComponent > 0;
isSuperior = superiorComponent > 0;

quadrantIndex = zeros(size(points, 1), 1);
quadrantIndex( isTemporal &  isSuperior) = 1;   % superior-temporal
quadrantIndex( isTemporal & ~isSuperior) = 2;   % inferior-temporal
quadrantIndex(~isTemporal &  isSuperior) = 3;   % superior-nasal
quadrantIndex(~isTemporal & ~isSuperior) = 4;   % inferior-nasal

if isfield(opts, 'imageSize')
    info.quadrantMask = buildMask(opts.imageSize, opticDisc, t, n);
end
end

function L = buildMask(imageSize, disc, t, n)
% HxW label image, for the annotated report overlay.
H = imageSize(1); W = imageSize(2);
[X, Y] = meshgrid(1:W, 1:H);
dx = X - disc(1); dy = Y - disc(2);
isTemporal = (dx * t(1) + dy * t(2)) > 0;
isSuperior = (dx * n(1) + dy * n(2)) > 0;
L = zeros(H, W);
L( isTemporal &  isSuperior) = 1;
L( isTemporal & ~isSuperior) = 2;
L(~isTemporal &  isSuperior) = 3;
L(~isTemporal & ~isSuperior) = 4;
end
