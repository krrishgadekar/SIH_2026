function [img, meta] = readFundusImage(imagePath)
% READFUNDUSIMAGE  Read a fundus photograph, DICOM or ordinary image file.
%
%   [img, meta] = readFundusImage(path)
%
%   Returns an RGB (or grayscale) image and a metadata struct:
%     .format        'dicom' | 'image'
%     .deviceModel   manufacturer + model from DICOM, '' otherwise
%     .laterality    'L' | 'R' | '' — which eye
%     .acquiredAt    ISO date string from DICOM, '' otherwise
%     .modality      DICOM modality code ('OP' = ophthalmic photography)
%     .pixelSpacing  [row col] mm/pixel if present, [] otherwise
%     .source        the path it came from
%
%   Task 4.6 — Medical Imaging Toolbox.
%
%   ══ WHY THIS IS NOT A DECORATIVE TOOLBOX CALL ══════════════════════════════
%   Task 4.6's Definition of Done is that each named toolbox is used somewhere
%   it is ACTUALLY the right tool, with a one-sentence justification per call
%   site, and that a toolbox with no honest use is left out and said so. The
%   three reasons this one is real:
%
%   1. THE PIPELINE CANNOT CURRENTLY READ WHAT REAL CAMERAS PRODUCE.
%      Desktop fundus cameras (Topcon, Zeiss, Canon) export DICOM under the
%      Ophthalmic Photography IOD, not JPEG. Everything here assumed
%      imread-able files, so a PHC with a clinical-grade camera could not have
%      submitted an image at all. medicalImage is the supported way to read
%      that format with its photometric interpretation handled correctly —
%      hand-parsing DICOM pixel data is exactly the wheel not to reinvent.
%
%   2. THE METADATA HAS AN EXISTING CONSUMER.
%      DICOM carries Manufacturer (0008,0070) and ManufacturerModelName
%      (0008,1090): the device that actually took the photograph. Task 6.3's
%      camera-fingerprint check already cross-references a REPORTED device
%      against what the pixels look like, and today that reported value comes
%      from a health worker picking off a dropdown. A value read from the file
%      the camera itself wrote is a strictly better input to that check.
%
%   3. IT SUPPLIES THE FIELD TASK 7.3 FOUND MISSING.
%      DICOM's ImageLaterality (0020,0062) says which eye. Nothing in this
%      system records that — no schema column, no contract field, and
%      opticDiscFovea.m has a comment about working around its absence.
%
%   ── WHAT IS HONESTLY STILL MISSING ─────────────────────────────────────────
%   Nothing consumes .laterality yet: there is no column for it and
%   fundusQuadrants.m deliberately derives temporal/nasal from the disc-fovea
%   axis so it never needed one. It is returned here because it is free and
%   correct, not because a feature depends on it. Adding the column is a
%   separate change and is not smuggled into this task.
%
%   The PHC quality gate still uses plain imread. Wiring this in there would
%   put a Medical Imaging Toolbox dependency inside the Task 8.1 compiled
%   bundle, which is a licensing and bundle-size decision rather than a coding
%   one, and it should be made deliberately.

if nargin < 1 || isempty(imagePath)
    error('readFundusImage:noPath', 'An image path is required.');
end
if exist(imagePath, 'file') ~= 2
    error('readFundusImage:notFound', 'No file at %s', imagePath);
end

meta = struct('format', 'image', 'deviceModel', '', 'laterality', '', ...
              'acquiredAt', '', 'modality', '', 'pixelSpacing', [], ...
              'multiframe', false, 'frameCount', 1, 'source', imagePath);

% isdicom() inspects the file's magic bytes rather than its extension. That
% matters: DICOM files routinely arrive with no extension at all, and a .dcm
% suffix on a JPEG is equally possible. Trusting the name here would mean
% either refusing valid images or handing non-DICOM bytes to a DICOM reader.
isDicomFile = false;
try
    isDicomFile = isdicom(imagePath);
catch
    isDicomFile = false;     % unreadable as DICOM is simply "not DICOM"
end

if ~isDicomFile
    img = imread(imagePath);
    return;
end

% ── DICOM ───────────────────────────────────────────────────────────────────
meta.format = 'dicom';

mi = medicalImage(imagePath);
raw = mi.Pixels;

% ── Pixel layout: measured, not assumed ────────────────────────────────────
% medicalImage returns a SINGLE-FRAME RGB image as H x W x 1 x 3 — the colour
% channels are in dimension 4 and dimension 3 is the frame index. That is not
% what imread or dicomread give (both return H x W x 3).
%
% This cost a real bug. The first version of this function treated a 4-D array
% as multi-frame and took img(:,:,:,1) — which on a colour fundus DICOM keeps
% only the RED channel and returns H x W x 1. Nothing would have errored: a
% single-channel image flows through the pipeline, gets graded, and produces a
% confident number from a third of the data. Caught by asserting the pixels
% round-trip byte-identically, which is why that assertion is in the test.
%
% So the layout is normalised by squeezing singleton dimensions rather than by
% indexing a dimension whose meaning was guessed. The frame count comes from
% the DICOM NumberOfFrames tag, which is authoritative, rather than from an
% array shape.
img = squeeze(raw);

if ndims(img) > 3
    % Genuinely multi-frame. Multi-frame acquisitions are ordinary in
    % ophthalmic imaging, and passing a 4-D array to a pipeline written for one
    % photograph would fail somewhere far less informative than here.
    img = squeeze(img(:, :, 1, :));
    meta.multiframe = true;
else
    meta.multiframe = false;
end

if ~(ismatrix(img) || (ndims(img) == 3 && size(img, 3) == 3))
    error('readFundusImage:unexpectedLayout', ...
          ['DICOM pixels came back as %s, which is neither grayscale nor RGB ' ...
           'after normalisation. Refusing to pass an unknown layout downstream ' ...
           '— it would be graded rather than rejected.'], mat2str(size(raw)));
end

info = [];
try
    info = dicominfo(imagePath);
catch err
    % The pixels are already read; losing the metadata is a degraded result,
    % not a failed one. Say so rather than discarding a usable image.
    meta.metadataWarning = sprintf('dicominfo failed: %s', err.message);
end

if ~isempty(info)
    % Authoritative frame count, from the tag rather than from an array shape.
    if isfield(info, 'NumberOfFrames') && ~isempty(info.NumberOfFrames)
        meta.frameCount = double(info.NumberOfFrames);
    else
        meta.frameCount = 1;
    end

    manufacturer = getTag(info, 'Manufacturer');
    model        = getTag(info, 'ManufacturerModelName');
    meta.deviceModel = strtrim(strjoin({manufacturer, model}, ' '));
    meta.laterality  = upper(strtrim(firstNonEmpty( ...
        getTag(info, 'ImageLaterality'), getTag(info, 'Laterality'))));
    meta.modality    = getTag(info, 'Modality');
    meta.acquiredAt  = formatDicomDate(getTag(info, 'AcquisitionDate'), ...
                                       getTag(info, 'StudyDate'));

    if isfield(info, 'PixelSpacing') && ~isempty(info.PixelSpacing)
        meta.pixelSpacing = double(info.PixelSpacing(:))';
    end

    % 'OP' is the Ophthalmic Photography modality. A DICOM that is not OP is
    % still read — refusing it would be worse than noting it — but the value is
    % surfaced so an obviously wrong file (a chest CT posted to a DR screening
    % endpoint) is visible rather than silently graded.
    if ~isempty(meta.modality) && ~strcmpi(meta.modality, 'OP')
        meta.modalityWarning = sprintf( ...
            ['DICOM modality is ''%s'', not ''OP'' (ophthalmic photography). ' ...
             'Reading it anyway, but this may not be a fundus photograph.'], ...
            meta.modality);
    end
end
end

% ───────────────────────────────────────────────────────────────────────────
function v = getTag(info, name)
if isfield(info, name) && ~isempty(info.(name))
    v = info.(name);
    if isnumeric(v), v = num2str(v); end
    v = char(v);
else
    v = '';
end
end

function v = firstNonEmpty(varargin)
v = '';
for k = 1:nargin
    if ~isempty(varargin{k}), v = varargin{k}; return; end
end
end

function s = formatDicomDate(acquisitionDate, studyDate)
% DICOM dates are YYYYMMDD. Converted to ISO because every other date in this
% system is ISO 8601 (api-contracts.md's global date rule), and a second format
% reaching the database is how a date silently sorts wrong.
raw = firstNonEmpty(acquisitionDate, studyDate);
if numel(raw) == 8 && all(isstrprop(raw, 'digit'))
    s = sprintf('%s-%s-%s', raw(1:4), raw(5:6), raw(7:8));
else
    s = '';
end
end
