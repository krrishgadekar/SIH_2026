function out = runCasePipeline(inputPath)
%RUNCASEPIPELINE  The MATLAB half of one case's grading, as a callable function.
%
%   out = runCasePipeline(inputJsonPath)
%
% Everything gradingOrchestrator.js needs back from MATLAB for a single case:
% the camera-family cross-check (Task 6.3), neovascularization suspicion (§J),
% Branch B's rule-engine grade and branch agreement (Tasks 5.1/5.2),
% lesion-attention consistency (Task 7.1) and the evidence sentence (Task 7.3).
%
% ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
% This logic used to be a ~60-statement chain that gradingOrchestrator.js
% assembled into ONE line and handed to `matlab -batch`. That cost a fresh
% MATLAB start on every case -- about 20 s of the ~50 s a case took, paid again
% for each one. As a function it can run inside the already-warm persistent
% session (runMatlabInferenceSession.m), which pays that start once.
%
% Being a real file is worth as much as the speed. The generated one-liner
% needed a semicolon after every `if` and `end` because the whole script was
% joined onto a single line -- two comments in the generator existed only to
% explain that trap. Nothing here can be broken by string concatenation, and it
% can be read, edited and called directly from the MATLAB prompt.
%
% ── INPUT ───────────────────────────────────────────────────────────────────
% A JSON file (gradingOrchestrator.js's buildCasePipelineInput) with:
%   imagePath       the fundus image; anything readFundusImage reads, DICOM too
%   caseId          for the evidence report's header
%   cameraDeviceId  what the worker said the camera was -- cross-check ONLY
%   redQ, brightQ   4 lesion counts per quadrant, or null when segmentation
%                   did not run: the rule engine then refuses to grade rather
%                   than grading an eye nothing looked at
%   vesselPath      segInfer's vessel mask, and opticDisc as [x y], both in
%   odXY            ORIGINAL image pixels (the same frame)
%   ruleOpts        venousBeadingQuadrants / irmaQuadrants / foveaUnreliable,
%                   each present ONLY when genuinely measured (§H, §I)
%   branchAGrade    the classifier's grade, or null
%   camMap          the raw Grad-CAM, and the lesion/ROI masks at Branch A's
%   lesion384Path   384 geometry. Nothing re-derives that geometry here: doing
%   roi384Path      so is how a misaligned mask scores attention against the
%                   wrong pixels and still returns a plausible number.
%
% A missing or null field always means "not available", never a default -- see
% the [] handling throughout. An absent detector signal makes the rule engine
% say the criterion was NOT assessed, which is the whole point of §H: an
% all-false mock must never be passed in to make the evidence text look
% complete.
%
% ── OUTPUT ──────────────────────────────────────────────────────────────────
% One struct, encoded by the caller with jsonencodeAscii (NOT jsonencode:
% stdout on Windows is the ANSI code page, which silently drops the em dashes
% the evidence text is full of -- see ml-pipeline/inference/jsonencodeAscii.m).
% Every "did not run" value is [], which jsonencode renders as null, so it
% reaches Postgres as NULL and never as a measured 0 or false.

req = jsondecode(fileread(inputPath));

% ── Task 4.6: readFundusImage, not imread ───────────────────────────────────
% Desktop fundus cameras export the Ophthalmic Photography IOD, not JPEG; until
% this went in, such a file could not have been graded at all. Ordinary images
% take the identical imread path.
imagePath = reqStr(req, 'imagePath');
[img, imgMeta] = readFundusImage(imagePath);

% ── Task 6.3: camera family ─────────────────────────────────────────────────
% The worker-reported device is passed in for the CROSS-CHECK only, never to
% steer classification: the pixels are what the model actually sees, so image
% evidence wins and a disagreement is reported rather than resolved in favour
% of the paperwork (design doc §9.4).
%
% A DICOM file names the device that took the photograph, which is better
% evidence than the worker's dropdown -- and it is deliberately NOT substituted
% here. classifyCameraFamily matches against a table of known device keys, and
% a free-text DICOM string ("Topcon TRC-NW400") matches nothing, so
% substituting it would silently SUPPRESS this check rather than improve it.
% The device is recorded as evidence instead, in out.dicomDeviceModel.
[cameraFamily, cameraDetail] = classifyCameraFamily(img, reqStr(req, 'cameraDeviceId'));

% ── §J: neovascularization suspicion ────────────────────────────────────────
% nvScore stays [] when it could not run -- reported as NULL, never as a
% measured 0. The rule engine still gets 0 in that case (nvForRule), so a
% missing score keeps the grade-4 path shut rather than erroring.
vesselPath = reqStr(req, 'vesselPath');
odXY       = reqRow(req, 'odXY', 2);
nvScore = [];
nvForRule = 0;
if isfile(vesselPath) && numel(odXY) == 2
    [nvS, nvDetail] = neovascularizationSuspicion(imread(vesselPath) > 127, odXY);
    if nvDetail.valid
        nvScore = nvS;
        nvForRule = nvS;
    end
end

% ── Branch B (Tasks 5.1/5.2) ────────────────────────────────────────────────
% Counts come from segInfer.py, computed in CROP-512 with a 10 px minimum
% component area -- the exact procedure the ICDR thresholds were calibrated
% against (verifyRuleEngineCounts.py: 14/14 on sum(red), and the same
% rule-engine grade on 14/14).
redQ         = reqRow(req, 'redQ', 4);
brightQ      = reqRow(req, 'brightQ', 4);
ruleOpts     = reqRuleOpts(req);
branchAGrade = reqScalar(req, 'branchAGrade');

ruleGrade        = [];
branchAgree      = [];
evidenceInputs   = struct();
ruleIsLowerBound = false;
ruleMaxGrade     = [];
if numel(redQ) == 4 && numel(brightQ) == 4
    [ruleGrade, ruleEvidence] = ruleEngineGrade(redQ, brightQ, nvForRule, ruleOpts);
    evidenceInputs = struct('redByQuadrant', redQ, 'brightByQuadrant', brightQ, ...
                            'nvSuspicionScore', nvForRule);
    % branchesAgree returns [] -- NOT false -- when either branch is missing.
    % false means "compared and disagreed" and forces mandatory review; []
    % means "Branch B did not run". Collapsing them would send every
    % segmentation failure to the review queue as though something were wrong
    % with the eye.
    branchAgree      = branchesAgree(branchAGrade, ruleGrade, ruleEvidence.isLowerBound);
    ruleIsLowerBound = ruleEvidence.isLowerBound;
    ruleMaxGrade     = ruleEvidence.maxGrade;
end

% ── Task 7.1: lesion-attention consistency ──────────────────────────────────
% Everything arrives pre-aligned in Branch A's 384 frame, so the only thing
% done here is the upsample.
camMap        = reqMatrix(req, 'camMap');
lesion384Path = reqStr(req, 'lesion384Path');
roi384Path    = reqStr(req, 'roi384Path');
lesionAttention = [];
if ~isempty(camMap) && isfile(lesion384Path) && isfile(roi384Path)
    lesionMask = imread(lesion384Path) > 127;
    roiMask    = imread(roi384Path) > 127;
    camFull    = imresize(camMap, size(lesionMask), 'bilinear');
    lesionAttention = lesionAttentionConsistency(camFull, lesionMask, roiMask);
end

% ── Task 7.3: the evidence report ───────────────────────────────────────────
% With counts present this produces the lesion-level sentence; with none it
% says segmentation has not been run rather than inventing "0 microaneurysms",
% because zero-measured and not-measured are different clinical claims.
% ruleOpts is passed through so the report's own ruleEngineGrade call sees the
% same VB/IRMA/fovea inputs as the grade above -- otherwise the text could
% explain a different grade from the one recorded.
[evidenceText, ~, ~] = generateEvidenceReport(reqStr(req, 'caseId'), evidenceInputs, ...
                                              struct('ruleOpts', ruleOpts));

out = struct();
out.evidenceSummaryText = evidenceText;
% Task 4.6: recorded so a DICOM submission is traceable to the device and eye
% the camera itself reported, rather than only to what a worker typed.
out.sourceFormat     = imgMeta.format;
out.dicomDeviceModel = imgMeta.deviceModel;
out.imageLaterality  = imgMeta.laterality;
out.cameraFamily     = cameraFamily;
out.cameraMismatch   = ~isempty(cameraDetail) && cameraDetail.mismatch;
out.ruleEngineGrade  = ruleGrade;
out.branchAgreement  = branchAgree;
out.nvSuspicionScore = nvScore;
out.ruleIsLowerBound = ruleIsLowerBound;
out.ruleMaxGrade     = ruleMaxGrade;
out.lesionAttentionConsistency = lesionAttention;
end

% ── Reading the request ─────────────────────────────────────────────────────
% jsondecode maps JSON null to [], so "absent" and "explicitly null" arrive the
% same way and every reader below treats both as "not available". Each one
% VALIDATES rather than trusting the caller: this function is also reachable
% from the MATLAB prompt and from the session, where the JSON may not have come
% through buildCasePipelineInput's checks.

function s = reqStr(req, name)
s = '';
if isfield(req, name)
    v = req.(name);
    if ischar(v) || isstring(v)
        s = char(v);
    end
end
end

function v = reqScalar(req, name)
v = [];
if isfield(req, name)
    raw = req.(name);
    if isnumeric(raw) && isscalar(raw) && isfinite(raw)
        v = double(raw);
    end
end
end

function v = reqRow(req, name, n)
% An n-element numeric row, or [] when absent or the wrong shape. jsondecode
% gives a COLUMN for a JSON array; the consumers here are written for rows.
v = [];
if isfield(req, name)
    raw = req.(name);
    if isnumeric(raw) && numel(raw) == n && all(isfinite(raw(:)))
        v = double(reshape(raw, 1, n));
    end
end
end

function m = reqMatrix(req, name)
% [] rather than zeros(): an all-zero Grad-CAM is a real and meaningful state
% (no positive evidence survived the ReLU), so it must not share a value with
% "no heatmap was produced".
m = [];
if isfield(req, name)
    raw = req.(name);
    if isnumeric(raw) && ~isempty(raw) && ismatrix(raw) && all(isfinite(raw(:)))
        m = double(raw);
    end
end
end

function opts = reqRuleOpts(req)
% §H/§I. A field is included ONLY when it is present and well-formed, because
% to ruleEngineGrade a supplied array -- even an all-false one -- means that
% criterion WAS assessed and drops the "not assessed" caveat from the evidence.
opts = struct();
if ~isfield(req, 'ruleOpts') || ~isstruct(req.ruleOpts)
    return;
end
r = req.ruleOpts;
for name = {'venousBeadingQuadrants', 'irmaQuadrants'}
    key = name{1};
    if isfield(r, key)
        v = r.(key);
        if (islogical(v) || isnumeric(v)) && numel(v) == 4
            opts.(key) = logical(reshape(v, 1, 4));
        end
    end
end
if isfield(r, 'foveaUnreliable') && isequal(r.foveaUnreliable, true)
    opts.foveaUnreliable = true;
end
end
