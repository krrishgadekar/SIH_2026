function testReadFundusImage()
% TESTREADFUNDUSIMAGE  Unit tests for Task 4.6 (Medical Imaging Toolbox).
%
%   Run: matlab -batch "testReadFundusImage"
%
%   The DICOM cases are exercised against a file this test WRITES with
%   dicomwrite, carrying real Ophthalmic Photography tags. That is a genuine
%   round trip through the DICOM encoder and decoder, not a mock — but it is
%   not a file from a Topcon or a Zeiss, and no such file has been available
%   here. Vendor DICOM has quirks (private tags, unusual photometric
%   interpretations, multi-frame layouts) that only real samples surface.

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);

fprintf('\n===== Task 4.6: Medical Imaging Toolbox =====\n');
n = 0; f = 0;
TMP = fullfile(tempdir, 'dr_dicom_test');
if ~exist(TMP, 'dir'), mkdir(TMP); end

% ═══ Ordinary images still work exactly as before ══════════════════════════
fprintf('\n--- ordinary images are unaffected ---\n');

jpgPath = findTestImage(thisDir);
if isempty(jpgPath)
    fprintf('  SKIP  no test image under datasets/\n');
else
    [imgA, metaA] = readFundusImage(jpgPath);
    direct = imread(jpgPath);
    [n,f] = tbool(n, f, 'a JPEG reads byte-identically to imread', isequal(imgA, direct));
    [n,f] = tbool(n, f, "format is 'image'", strcmp(metaA.format, 'image'), metaA.format);
    [n,f] = tbool(n, f, 'no device model is invented for a JPEG', isempty(metaA.deviceModel));
    [n,f] = tbool(n, f, 'and no laterality is invented', isempty(metaA.laterality));
    fprintf('        (a JPEG carries none of this; empty is the honest answer,\n');
    fprintf('         and guessing would be worse than saying nothing)\n');
end

% ═══ DICOM ═════════════════════════════════════════════════════════════════
fprintf('\n--- DICOM, which the pipeline previously could not read at all ---\n');

rng(4);
synthetic = uint8(120 + 30 * randn(64, 64, 3));
dcmPath = fullfile(TMP, 'fundus_test.dcm');

% CreateMode 'Copy', deliberately. In the default 'Create' mode dicomwrite
% validates against an IOD and SILENTLY DROPS every attribute not valid for it:
% under the default Secondary Capture class, Manufacturer,
% ManufacturerModelName, ImageLaterality and PixelSpacing all vanish, and the
% test then appears to fail against a file that never carried the tags. MATLAB
% does not implement the Ophthalmic Photography IOD at all (dicom_create_IOD
% errors on 1.2.840.10008.5.1.4.1.1.77.1.5.1), so Copy mode — which writes
% attributes verbatim — is the only way to build a realistic ophthalmic file
% here. It requires the identifying attributes to be supplied explicitly.
meta = struct( ...
    'SOPClassUID',               '1.2.840.10008.5.1.4.1.1.77.1.5.1', ...  % Ophthalmic Photography 8 Bit
    'SOPInstanceUID',            dicomuid, ...
    'StudyInstanceUID',          dicomuid, ...
    'SeriesInstanceUID',         dicomuid, ...
    'Modality',                  'OP', ...        % Ophthalmic Photography
    'Manufacturer',              'Topcon', ...
    'ManufacturerModelName',     'TRC-NW400', ...
    'ImageLaterality',           'R', ...
    'AcquisitionDate',           '20260909', ...
    'PixelSpacing',              [0.0125; 0.0125], ...
    'PatientName',               'Anon', ...
    'PatientID',                 'ANON', ...
    'SamplesPerPixel',           3, ...
    'PhotometricInterpretation', 'RGB', ...
    'PlanarConfiguration',       0, ...
    'Rows',                      64, ...
    'Columns',                   64, ...
    'BitsAllocated',             8, ...
    'BitsStored',                8, ...
    'HighBit',                   7, ...
    'PixelRepresentation',       0);

wroteDicom = true;
try
    dicomwrite(synthetic, dcmPath, meta, 'CreateMode', 'Copy');
catch err
    wroteDicom = false;
    fprintf('  SKIP  could not write a test DICOM: %s\n', err.message);
end

if wroteDicom
    [n,f] = tbool(n, f, 'isdicom recognises the written file', isdicom(dcmPath));

    [imgD, metaD] = readFundusImage(dcmPath);
    [n,f] = tbool(n, f, "format is 'dicom'", strcmp(metaD.format, 'dicom'), metaD.format);
    [n,f] = tbool(n, f, 'pixels come back at the right size', ...
        size(imgD, 1) == 64 && size(imgD, 2) == 64, mat2str(size(imgD)));
    [n,f] = tbool(n, f, 'and are byte-identical to what was written', ...
        isequal(squeeze(imgD), squeeze(synthetic)));

    % The three metadata facts that justify this toolbox at all.
    [n,f] = tbool(n, f, 'device model = manufacturer + model', ...
        contains(metaD.deviceModel, 'Topcon') && contains(metaD.deviceModel, 'TRC-NW400'), ...
        metaD.deviceModel);
    [n,f] = tbool(n, f, 'laterality is read (the field nothing else in the system has)', ...
        strcmp(metaD.laterality, 'R'), metaD.laterality);
    [n,f] = tbool(n, f, 'modality is OP (ophthalmic photography)', ...
        strcmp(metaD.modality, 'OP'), metaD.modality);
    fprintf('        device "%s", eye "%s", acquired %s\n', ...
        metaD.deviceModel, metaD.laterality, metaD.acquiredAt);

    % Dates must be ISO, because every other date in this system is
    % (api-contracts.md's global date rule) and a second format reaching the
    % database is how a date silently sorts wrong.
    [n,f] = tbool(n, f, 'DICOM YYYYMMDD is converted to ISO 8601', ...
        strcmp(metaD.acquiredAt, '2026-09-09'), metaD.acquiredAt);

    [n,f] = tbool(n, f, 'pixel spacing is carried through', ...
        ~isempty(metaD.pixelSpacing), mat2str(metaD.pixelSpacing));
    [n,f] = tbool(n, f, 'a single-frame image is not flagged multiframe', ...
        metaD.multiframe == false);

    % ── A non-ophthalmic DICOM is read, but flagged ───────────────────────
    fprintf('\n--- a DICOM that is not a fundus photograph ---\n');
    ctPath = fullfile(TMP, 'not_fundus.dcm');
    ctMeta = struct('Modality', 'CT', 'Manufacturer', 'SomeVendor', ...
        'SOPClassUID', '1.2.840.10008.5.1.4.1.1.2', ...
        'SOPInstanceUID', dicomuid, 'StudyInstanceUID', dicomuid, ...
        'SeriesInstanceUID', dicomuid, 'PatientName', 'Anon', 'PatientID', 'ANON', ...
        'SamplesPerPixel', 1, 'PhotometricInterpretation', 'MONOCHROME2', ...
        'Rows', 32, 'Columns', 32, 'BitsAllocated', 8, 'BitsStored', 8, ...
        'HighBit', 7, 'PixelRepresentation', 0);
    try
        dicomwrite(uint8(zeros(32, 32)), ctPath, ctMeta, 'CreateMode', 'Copy');
        [~, metaCT] = readFundusImage(ctPath);
        [n,f] = tbool(n, f, 'a CT is still read rather than refused', ...
            strcmp(metaCT.format, 'dicom'));
        [n,f] = tbool(n, f, 'but is flagged as not ophthalmic photography', ...
            isfield(metaCT, 'modalityWarning'));
        fprintf('        "%s"\n', metaCT.modalityWarning);
        fprintf('        (refusing it would be worse than noting it -- but a chest\n');
        fprintf('         scan posted to a DR endpoint must not grade silently)\n');
    catch err
        fprintf('  SKIP  could not write a CT-modality test file: %s\n', err.message);
    end
end

% ═══ Detection is by content, not by filename ══════════════════════════════
fprintf('\n--- format detection ignores the extension ---\n');

if ~isempty(jpgPath)
    % A JPEG deliberately misnamed .dcm. isdicom inspects magic bytes, so this
    % must still read as an ordinary image. Trusting the extension would hand
    % JPEG bytes to a DICOM reader.
    liar = fullfile(TMP, 'actually_a_jpeg.dcm');
    copyfile(jpgPath, liar);
    [imgL, metaL] = readFundusImage(liar);
    [n,f] = tbool(n, f, 'a JPEG named .dcm is still read as an image', ...
        strcmp(metaL.format, 'image'), metaL.format);
    [n,f] = tbool(n, f, 'and its pixels are intact', isequal(imgL, imread(jpgPath)));

    if wroteDicom
        % And the converse: DICOM files routinely arrive with NO extension.
        noExt = fullfile(TMP, 'dicom_without_extension');
        copyfile(dcmPath, noExt);
        [~, metaN] = readFundusImage(noExt);
        [n,f] = tbool(n, f, 'a DICOM with no extension is still detected', ...
            strcmp(metaN.format, 'dicom'), metaN.format);
        fprintf('        (both directions matter: DICOM often has no suffix, and a\n');
        fprintf('         .dcm suffix on a JPEG is equally possible)\n');
    end
end

% ═══ Errors ════════════════════════════════════════════════════════════════
fprintf('\n--- errors ---\n');
[n,f] = terr(n, f, 'refuses a missing file', ...
    @() readFundusImage(fullfile(TMP, 'nope.jpg')), 'notFound');
[n,f] = terr(n, f, 'refuses an empty path', @() readFundusImage(''), 'noPath');

fprintf('\n===== %d checks, %d failed =====\n', n, f);
fprintf(['NOTE: the DICOM here is written by this test, not produced by a real\n' ...
         'fundus camera. Vendor files carry private tags and unusual\n' ...
         'photometric layouts that only real samples expose.\n']);
if f > 0
    error('testReadFundusImage:failed', '%d check(s) failed.', f);
end
end

% ── Helpers ────────────────────────────────────────────────────────────────
function p = findTestImage(thisDir)
root = fullfile(thisDir, '..', '..', '..', '..');
for name = {'2.jpg', '5.jpg'}
    candidate = fullfile(root, 'datasets', name{1});
    if exist(candidate, 'file') == 2, p = candidate; return; end
end
p = '';
end

function [n, f] = tbool(n, f, label, cond, detail)
n = n + 1;
if cond
    fprintf('  PASS  %s\n', label);
else
    fprintf('  FAIL  %s\n', label);
    if nargin > 4, fprintf('        %s\n', string(detail)); end
    f = f + 1;
end
end

function [n, f] = terr(n, f, label, fn, idFragment)
n = n + 1;
try
    fn();
    fprintf('  FAIL  %s  (no error raised)\n', label);
    f = f + 1;
catch err
    if contains(err.identifier, idFragment)
        fprintf('  PASS  %s\n', label);
    else
        fprintf('  FAIL  %s  (wrong error: %s)\n', label, err.identifier);
        f = f + 1;
    end
end
end
