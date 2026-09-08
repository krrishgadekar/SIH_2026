function probePipeline(imagePath, markerFile)
% PROBEPIPELINE  Diagnostic: run the grading chain one step at a time, writing a
% timestamped marker to a file after each stage.
%
%   probePipeline()                       uses datasets/2.jpg
%   probePipeline(imagePath, markerFile)
%
%   WHY A MARKER FILE RATHER THAN fprintf TO STDOUT
%     Under `matlab -batch` with stdout redirected to a pipe or file, MATLAB
%     buffers stdout and nothing appears until the process exits. That makes a
%     hang undiagnosable from outside: the log is empty whether the run stalled
%     at step 1 or step 9. Each marker here is written with fopen/fprintf/fclose
%     so it is flushed to disk immediately and can be read WHILE the run is
%     still stuck.
%
%   Delete this file once the pipeline is stable; it is a debugging aid, not
%   part of the product.

thisDir = fileparts(mfilename('fullpath'));
repoRoot = fullfile(thisDir, '..', '..', '..');

if nargin < 1 || isempty(imagePath)
    imagePath = fullfile(repoRoot, 'datasets', '2.jpg');
end
if nargin < 2 || isempty(markerFile)
    markerFile = fullfile(tempdir, 'probePipeline_markers.txt');
end

if isfile(markerFile), delete(markerFile); end

addpath(fullfile(thisDir, 'preprocessing'));
addpath(fullfile(thisDir, 'grading'));
addpath(fullfile(thisDir, 'calibration'));
addpath(fullfile(thisDir, 'explainability'));
mark(markerFile, '01 addpath done');

t = tic;
img = imread(imagePath);
mark(markerFile, sprintf('02 imread %dx%dx%d  (%.1fs)', ...
     size(img,1), size(img,2), size(img,3), toc(t)));

t = tic; a = benGrahamCrop(img, 512);
mark(markerFile, sprintf('03 benGrahamCrop  (%.1fs)', toc(t)));

t = tic; b = claheEnhance(a);
mark(markerFile, sprintf('04 claheEnhance  (%.1fs)', toc(t)));

t = tic; c = illuminationNormalize(b);
mark(markerFile, sprintf('05 illuminationNormalize  (%.1fs)', toc(t)));

t = tic; r = classifyBranchA(c);
mark(markerFile, sprintf('06 classifyBranchA grade=%d  (%.1fs)', r.grade, toc(t)));

t = tic;
td = load(fullfile(thisDir, 'models', 'temperature_v1.mat'), 'T');
p  = applyTemperature(r.probabilities, td.T);
mark(markerFile, sprintf('07 applyTemperature maxp=%.4f  (%.1fs)', max(p), toc(t)));

t = tic;
nd = load(fullfile(thisDir, 'models', 'branchA_v1.mat'), 'net');
mark(markerFile, sprintf('08 net loaded  (%.1fs)', toc(t)));

[~, gi] = max(p);
outPng = fullfile(tempdir, 'probePipeline_gradcam.png');
t = tic;
gradCam(nd.net, c, gi, outPng);
mark(markerFile, sprintf('09 gradCam -> %s  (%.1fs)', outPng, toc(t)));

mark(markerFile, 'DONE all stages');
fprintf('probePipeline complete. Markers: %s\n', markerFile);

end

function mark(f, msg)
% Append one marker and CLOSE immediately, so it is on disk before the next
% stage starts. An open handle would buffer and defeat the whole purpose.
fid = fopen(f, 'a');
fprintf(fid, '%s  %s\n', datestr(now, 'HH:MM:SS'), msg);
fclose(fid);
end
