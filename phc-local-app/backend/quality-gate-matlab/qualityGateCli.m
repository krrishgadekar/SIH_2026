function qualityGateCli(imagePath, cameraDeviceId)
% QUALITYGATECLI  Deployable entry point for the quality gate.
%
%   Compiled form:   qualityGate.exe <imagePath> <cameraDeviceId>
%   In MATLAB:       qualityGateCli('C:/img.jpg', 'forus_3nethra_v2')
%
%   Prints ONE line of JSON to stdout and nothing else on success:
%     {"scores":{...},"status":"pass","reason":[]}
%
%   Exit codes (compiled only):
%     0  success, JSON on stdout
%     2  wrong number of arguments
%     3  the gate itself failed (unreadable image, missing presets, ...)
%
%   Task 8.1. This is the mcc target — see buildQualityGateExe.m.
%
%   ── WHY A SEPARATE ENTRY POINT ─────────────────────────────────────────────
%   qualityGateMain returns a struct, which is the right shape for a MATLAB
%   function and useless to a compiled executable: a deployed program
%   communicates through argv, stdout and an exit code. Compiling
%   qualityGateMain directly would produce an exe that computes the answer
%   correctly and then discards it.
%
%   Keeping the CLI separate also means qualityGateMain stays a pure function
%   that the MATLAB tests can call directly, rather than one that prints.
%
%   ── ARGUMENTS ARRIVE AS STRINGS ────────────────────────────────────────────
%   Everything from a command line is char, always. That happens to be what
%   qualityGateMain already wants, so there is no numeric conversion to get
%   wrong here — but the count still has to be checked, because a deployed exe
%   invoked with the wrong arity otherwise dies with a MATLAB stack trace on
%   stderr that means nothing to whoever is looking at the PHC's logs.
%
%   ── ERRORS GO TO STDERR, NEVER STDOUT ──────────────────────────────────────
%   Node parses stdout as JSON. An error message printed there would be read as
%   a malformed result rather than a failure, and the route handler would
%   report a parse error instead of the real cause. stdout carries exactly one
%   thing: the JSON result.

if nargin < 2
    printError('usage: qualityGate <imagePath> <cameraDeviceId>');
    exitWith(2);
    return;
end

try
    % char() so a string-class argument behaves identically to argv char.
    result = qualityGateMain(char(imagePath), char(cameraDeviceId));
    disp(jsonencode(result));
catch err
    printError(sprintf('%s: %s', err.identifier, err.message));
    exitWith(3);
    return;
end
end

% ───────────────────────────────────────────────────────────────────────────
function printError(msg)
fprintf(2, 'qualityGate: %s\n', msg);
end

function exitWith(code)
% exit() terminates MATLAB itself, which is correct for a compiled program and
% catastrophic in an interactive session — it would close the IDE mid-test. So
% it is guarded on isdeployed, and a non-deployed caller gets an ordinary
% error() it can catch instead.
if isdeployed
    exit(code);
else
    error('qualityGateCli:failed', 'qualityGateCli would exit with code %d', code);
end
end
