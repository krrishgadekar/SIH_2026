function runMatlabInferenceSession()
% RUNMATLABINFERENCESESSION  Persistent MATLAB inference server (Part 2 of
% the MATLAB-backend latency fix -- see README.md in this folder).
%
% Loads all 5 project networks once, then polls a request directory for
% work: each request names a Branch A tensor .mat (written by
% preprocessBranchATensor.py) plus an optional Grad-CAM output path; each
% response is the same JSON branchAInferMatlab.m always produced, written
% back under the matching request id.
%
%   matlab -batch "cd('<this dir>'); runMatlabInferenceSession()"
%
% Do not run this directly for real use -- manageMatlabSession.ps1 in this
% folder is the documented start/stop/status interface (background process,
% log redirection, PID tracking). This function itself never daemonizes; it
% blocks until told to stop and expects whatever launched it to have put it
% in the background.
%
% STOP: create a file named 'stop.flag' in this directory. Checked once per
% poll cycle (POLL_INTERVAL_SECONDS below), so shutdown happens within tens
% of milliseconds of the flag appearing. manageMatlabSession.ps1's `stop`
% command does this for you.
%
% ── WHY A FILE-BASED PROTOCOL AND NOT tcpserver ─────────────────────────────
% Simpler, needs no extra toolbox, and every step is inspectable with a
% directory listing -- a stuck request is a file sitting in requests/, not
% opaque socket state. Throughput is not the goal: one Branch A call at a
% time is the current load shape, and a poll interval measured in tens of
% milliseconds is well under the multi-second budget this whole exercise
% exists to protect (see the latency numbers in README.md).
%
% ── WHAT THIS DOES NOT DO ────────────────────────────────────────────────────
% It does not preprocess images -- that still happens in a fresh Python
% process per call (preprocessBranchATensor.py), unchanged by this file.
% Only the MATLAB half of the round trip (network load + predict +
% calibration + Grad-CAM) becomes persistent here. Segmentation (M2-M5) is
% loaded into memory below per the spec this was built against, but nothing
% in this session currently SERVES segmentation requests -- the
% INFERENCE_BACKEND=matlab switch is Branch A/classifier only today.

thisDir     = fileparts(mfilename('fullpath'));
requestDir  = fullfile(thisDir, 'requests');
responseDir = fullfile(thisDir, 'responses');
stopFlag    = fullfile(thisDir, 'stop.flag');
logFile     = fullfile(thisDir, 'session.log');
% Liveness signal for the Node-side supervisor (matlabSessionSupervisor.js,
% backend plan §E). Rewritten every HEARTBEAT_SECONDS from inside the poll
% loop, so a fresh heartbeat means "loaded AND still polling" -- a process that
% is alive but wedged stops refreshing it, which a PID check alone would miss.
% Only written once the loop starts, so it is absent while networks load.
heartbeatFile = fullfile(thisDir, 'session.heartbeat');
if isfile(heartbeatFile), delete(heartbeatFile); end

if ~isfolder(requestDir),  mkdir(requestDir);  end
if ~isfolder(responseDir), mkdir(responseDir); end
if isfile(stopFlag), delete(stopFlag); end   % stale flag from a previous run

mlRoot = fullfile(thisDir, '..', '..');
addpath(fullfile(thisDir, '..'));              % branchAInferMatlab.m lives in inference/
addpath(fullfile(mlRoot, 'calibration'));
addpath(fullfile(mlRoot, 'explainability'));
addpath(fullfile(mlRoot, 'preprocessing'));    % readFundusImage, for report images
addpath(fullfile(mlRoot, 'segmentation'));     % fundusQuadrants, for report labels
addpath(fullfile(mlRoot, 'models'));

% The ONNX converter must be on the path BEFORE any load(): without it the
% ONNX-imported networks deserialize into broken objects without an error.
if ~ensureOnnxSupportOnPath()
    logMsg(logFile, 'WARNING: ONNX converter support package not available');
end
logMsg(logFile, 'session starting -- loading all 5 networks');

% ── Load all 5 networks once, keep them referenced for the session's life ──
% Only branchA_v1 is actually served by handleRequest below today; the other
% four are loaded per spec so a future widening of INFERENCE_BACKEND=matlab
% to segmentation does not need a session restart. `nets` staying a local
% variable in this function's scope, alive for the whole while-loop below,
% is what keeps them resident -- there is no separate registry to manage.
modelsDir = fullfile(mlRoot, 'models');
netFiles = {'branchA_v1', 'vessel_unet_v1', 'localization_v1', ...
            'bright_lesion_unet_v1', 'red_lesion_unet_v1'};
nets = struct(); %#ok<NASGU> -- intentionally kept alive, not read again below
for i = 1:numel(netFiles)
    name = netFiles{i};
    loaded = load(fullfile(modelsDir, [name '.mat']), 'net');
    nets.(name) = loaded.net;
    logMsg(logFile, sprintf('  loaded %s', name));
end

% branchAInferMatlab.m keeps its OWN persistent net (separate from `nets`
% above -- branchA_v1 briefly exists in two places at startup; harmless,
% just not deduplicated). Call it once now on a dummy tensor so the first
% REAL request doesn't pay that load cost.
warmupTensor = fullfile(tempdir, 'matlab_session_warmup.mat');
x = zeros(384, 384, 3, 1, 'single'); %#ok<NASGU>
display = zeros(384, 384, 3, 'uint8'); %#ok<NASGU>
save(warmupTensor, 'x', 'display');
try
    branchAInferMatlab(warmupTensor, '');
    logMsg(logFile, '  warmup inference call OK');
catch ME
    logMsg(logFile, sprintf('  WARNING: warmup call failed: %s', ME.message));
end
delete(warmupTensor);

logMsg(logFile, 'session ready, polling for requests');

POLL_INTERVAL_SECONDS = 0.05;
HEARTBEAT_SECONDS     = 5;
beatClock = tic;
lastBeat  = -Inf;

while true
    if isfile(stopFlag)
        logMsg(logFile, 'stop.flag seen -- shutting down');
        delete(stopFlag);
        break;
    end

    if toc(beatClock) - lastBeat >= HEARTBEAT_SECONDS
        writeAtomic(heartbeatFile, char(datetime('now', 'TimeZone', 'UTC', ...
            'Format', 'yyyy-MM-dd''T''HH:mm:ss''Z''')));
        lastBeat = toc(beatClock);
    end

    reqFiles = dir(fullfile(requestDir, '*.json'));
    for i = 1:numel(reqFiles)
        reqPath = fullfile(reqFiles(i).folder, reqFiles(i).name);
        [~, reqId] = fileparts(reqFiles(i).name);
        handleRequest(reqPath, reqId, responseDir, logFile, nets);
    end

    pause(POLL_INTERVAL_SECONDS);
end

if isfile(heartbeatFile), delete(heartbeatFile); end
logMsg(logFile, 'session stopped');
end

% ── Local functions ─────────────────────────────────────────────────────────

function names = SEG_SERVED()
% Segmentation nets this session will run on request. red_lesion_unet_v1 (M5)
% is loaded but deliberately NOT served: its conversion is the old 2-class
% model, which the 3-class retrain replaces (backend plan §S.2). It stays on
% the Python path until the new conversion is delivered.
names = {'vessel_unet_v1', 'localization_v1', 'bright_lesion_unet_v1'};
end

function handleRequest(reqPath, reqId, responseDir, logFile, nets)
respPath = fullfile(responseDir, [reqId '.json']);
t0 = tic;
try
    req = jsondecode(fileread(reqPath));

    % ── Segmentation forward pass (backend plan §S) ───────────────────────
    % {"model": "<net name>", "tensorPath": "<in .mat>", "outPath": "<out .mat>"}
    % Forward pass ONLY. segInfer.py keeps every pre- and post-processing
    % step (resize, padding, normalisation, thresholds, OD mask, counting,
    % quadrants), so there is exactly one copy of that logic and the MATLAB
    % and Python backends cannot drift apart on it. The tensor arrives HWCN
    % (MATLAB 'SSCB'); the raw network output goes back the same way.
    if isfield(req, 'model')
        name = char(req.model);
        if ~ismember(name, SEG_SERVED)
            error('runMatlabInferenceSession:model', ...
                  'Model "%s" is not served by this session (served: %s).', ...
                  name, strjoin(SEG_SERVED, ', '));
        end
        td = load(req.tensorPath, 'x');
        y = predict(nets.(name), dlarray(single(td.x), 'SSCB'));
        y = gather(extractdata(y)); %#ok<NASGU>
        save(req.outPath, 'y', '-v7');
        writeAtomic(respPath, jsonencodeAscii(struct('ok', true, 'outPath', req.outPath)));
        logMsg(logFile, sprintf('  request %s OK %s (%.0f ms)', reqId, name, toc(t0) * 1000));
        delete(reqPath);
        return;
    end

    % ── Clinical-rationale PDF (backend plan §O) ──────────────────────────
    % {"report": "<input .json>", "outPath": "<.pdf>"} -- rendered here so a
    % report does not pay a ~20 s MATLAB start of its own.
    if isfield(req, 'report')
        generateReport(char(req.report), char(req.outPath));
        writeAtomic(respPath, jsonencodeAscii(struct('ok', true, 'outPath', req.outPath)));
        logMsg(logFile, sprintf('  request %s OK report (%.0f ms)', reqId, toc(t0) * 1000));
        delete(reqPath);
        return;
    end

    gradcamPath = '';
    if isfield(req, 'gradcamPath'), gradcamPath = req.gradcamPath; end

    out = branchAInferMatlab(req.tensorPath, gradcamPath);
    writeAtomic(respPath, jsonencodeAscii(out));   % ASCII-safe: see jsonencodeAscii.m
    logMsg(logFile, sprintf('  request %s OK (%.0f ms)', reqId, toc(t0) * 1000));
catch ME
    writeAtomic(respPath, jsonencodeAscii(struct('error', ME.message)));
    logMsg(logFile, sprintf('  request %s FAILED (%.0f ms): %s', reqId, toc(t0) * 1000, ME.message));
end
% Request file deleted LAST, after the response is written: the Node side
% polls for the RESPONSE file's existence only, so ordering here just keeps
% requests/ from accumulating -- it is not part of the handshake.
delete(reqPath);
end

function writeAtomic(finalPath, content)
% Write-then-rename: the Node side polls for finalPath's existence, so a
% response file it could read mid-write would be a real race. rename() on
% the same filesystem is atomic; a direct write is not.
tmpPath = [finalPath '.tmp'];
fid = fopen(tmpPath, 'w');
fwrite(fid, content);
fclose(fid);
movefile(tmpPath, finalPath);
end

function logMsg(logFile, msg)
line = sprintf('[%s] %s', datestr(now, 'yyyy-mm-dd HH:MM:SS'), msg);
disp(line);
fid = fopen(logFile, 'a');
fprintf(fid, '%s\n', line);
fclose(fid);
end
