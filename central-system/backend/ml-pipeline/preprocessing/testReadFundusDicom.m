function testReadFundusDicom()
% TESTREADFUNDUSDICOM  Backend plan §P: DICOM input through readFundusImage.
%
%   matlab -batch "cd('central-system/backend/ml-pipeline/preprocessing'); testReadFundusDicom"
%
% No real camera DICOM is available in this repo, so this writes a SYNTHETIC
% Ophthalmic Photography file from a real IDRiD photograph, with the tags a
% fundus camera sets (Modality OP, Manufacturer / model, ImageLaterality).
% That proves the read path and the metadata extraction; it does not prove
% compatibility with any specific vendor's files -- test one real export per
% camera model before claiming that.

failures = 0; total = 0;
    function check(label, ok)
        total = total + 1;
        if ok, fprintf('  PASS  %s\n', label);
        else,  fprintf('  FAIL  %s\n', label); failures = failures + 1; end
    end

here = fileparts(mfilename('fullpath'));
src = fullfile(here, '..', 'datasets', 'idrid', 'grading', 'B. Disease Grading', ...
               '1. Original Images', 'b. Testing Set', 'IDRiD_001.jpg');
if ~isfile(src)
    src = fullfile(here, '..', '..', '..', '..', 'datasets', '2.jpg');
end
rgb = imread(src);

tmp = tempname; mkdir(tmp);
cleanup = onCleanup(@() rmdir(tmp, 's'));

fprintf('\n===== DICOM with laterality and device tags =====\n');
dcmR = fullfile(tmp, 'fundus_R.dcm');
dicomwrite(rgb, dcmR, 'Modality', 'OP', 'Manufacturer', 'Topcon', ...
    'ManufacturerModelName', 'TRC-NW400', 'ImageLaterality', 'R', ...
    'AcquisitionDate', '20260920', 'CreateMode', 'copy', ...
    'SOPClassUID', '1.2.840.10008.5.1.4.1.1.77.1.5.1');   % Ophthalmic Photography 8 Bit

[img, meta] = readFundusImage(dcmR);
check('recognised as DICOM by its bytes, not its extension', strcmp(meta.format, 'dicom'));
check('pixels come back H x W x 3 uint8, same size as the source', ...
    isequal(size(img), size(rgb)) && isa(img, 'uint8'));
check('pixel data survives the round trip exactly', isequal(img, rgb));
check('laterality read from ImageLaterality: R', strcmp(meta.laterality, 'R'));
check('device model read from Manufacturer + ManufacturerModelName', ...
    contains(meta.deviceModel, 'Topcon') && contains(meta.deviceModel, 'TRC-NW400'));

fprintf('\n===== DICOM without a laterality tag =====\n');
dcmN = fullfile(tmp, 'fundus_none.dcm');
dicomwrite(rgb, dcmN, 'Modality', 'OP', 'CreateMode', 'copy', ...
    'SOPClassUID', '1.2.840.10008.5.1.4.1.1.77.1.5.1');
[~, meta] = readFundusImage(dcmN);
check('no tag -> laterality empty (the technician''s choice is then used)', isempty(meta.laterality));

fprintf('\n===== Renamed file: extension says JPEG, bytes say DICOM =====\n');
dcmJ = fullfile(tmp, 'looks_like.jpg');
copyfile(dcmR, dcmJ);
[~, meta] = readFundusImage(dcmJ);
check('a DICOM saved as .jpg is still read as DICOM', strcmp(meta.format, 'dicom') && strcmp(meta.laterality, 'R'));

fprintf('\n===== Ordinary image unchanged =====\n');
[img2, meta] = readFundusImage(src);
check('JPEG path: format image, no laterality, same pixels as imread', ...
    strcmp(meta.format, 'image') && isempty(meta.laterality) && isequal(img2, rgb));

fprintf('\n===== %d/%d passed =====\n', total - failures, total);
if failures > 0, error('testReadFundusDicom:failed', '%d check(s) failed', failures); end
end
