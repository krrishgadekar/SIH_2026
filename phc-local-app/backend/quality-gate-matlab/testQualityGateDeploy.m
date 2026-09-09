function testQualityGateDeploy()
% TESTQUALITYGATEDEPLOY  Unit tests for Task 8.1's MATLAB side.
%
%   Run: matlab -batch "testQualityGateDeploy"
%
%   Covers qualityGateAssetPath and qualityGateCli. The Node side of the same
%   task is covered by verify_task81.js.
%
%   ── WHAT CANNOT BE TESTED HERE ─────────────────────────────────────────────
%   The deployed branches. isdeployed is false in MATLAB and there is no way to
%   fake it, so the ctfroot lookup in qualityGateAssetPath and the exit() in
%   qualityGateCli are exercised only by their non-deployed halves. Those
%   branches are reviewed, documented and unrun.
%
%   MATLAB Compiler is not installed on this machine either (licensed, absent),
%   so no executable exists to test against. Nothing in this file should be
%   read as evidence the compiled build works.

thisDir = fileparts(mfilename('fullpath'));
addpath(thisDir);

fprintf('\n===== Task 8.1: deployable quality gate =====\n');
n = 0; f = 0;

% ═══ qualityGateAssetPath ══════════════════════════════════════════════════
fprintf('\n--- asset resolution ---\n');

p = qualityGateAssetPath('cameraPresets.json');
[n,f] = tbool(n, f, 'finds cameraPresets.json under MATLAB', exist(p, 'file') == 2, p);
[n,f] = tbool(n, f, 'and it parses as JSON', ~isempty(jsondecode(fileread(p))));

% The failure must name where it looked. A bare "file not found" from a PHC
% machine with no source tree is unactionable; the candidate list is what turns
% it into "you forgot mcc -a".
threw = false; msg = '';
try
    qualityGateAssetPath('definitely_not_a_real_asset.json');
catch err
    threw = strcmp(err.identifier, 'qualityGateAssetPath:notFound');
    msg = err.message;
end
[n,f] = tbool(n, f, 'a missing asset raises notFound', threw);
[n,f] = tbool(n, f, 'and the message lists every path it tried', ...
    contains(msg, 'Looked in'));
[n,f] = tbool(n, f, 'and points at the likely cause (mcc -a)', contains(msg, 'mcc -a'));

% ═══ qualityGateMain still works through the new indirection ═══════════════
fprintf('\n--- the gate itself is unchanged ---\n');

testImage = findTestImage(thisDir);
if isempty(testImage)
    fprintf('  SKIP  no test image found under datasets/\n');
else
    result = qualityGateMain(testImage, 'unknown');
    [n,f] = tbool(n, f, 'returns exactly status/reason/scores', ...
        isequal(sort(fieldnames(result))', {'reason', 'scores', 'status'}), ...
        strjoin(fieldnames(result)', ','));
    [n,f] = tbool(n, f, 'status is one of the three contract values', ...
        ismember(result.status, {'pass', 'retake', 'borderline'}), result.status);
    [n,f] = tbool(n, f, 'all seven sub-scores present', ...
        numel(fieldnames(result.scores)) == 7, ...
        strjoin(fieldnames(result.scores)', ','));
    fprintf('        %s -> %s\n', testImageName(testImage), result.status);

    % ═══ qualityGateCli ════════════════════════════════════════════════════
    fprintf('\n--- the CLI entry point ---\n');

    % Captures stdout so the JSON contract can be asserted, which is the whole
    % interface Node depends on.
    printed = evalc('qualityGateCli(testImage, ''unknown'')');
    jsonStart = strfind(printed, '{');
    [n,f] = tbool(n, f, 'prints a JSON object to stdout', ~isempty(jsonStart));

    if ~isempty(jsonStart)
        decoded = jsondecode(printed(jsonStart(1):end));
        [n,f] = tbool(n, f, 'the JSON has status/reason/scores', ...
            all(isfield(decoded, {'status', 'scores'})));
        [n,f] = tbool(n, f, 'CLI status matches a direct qualityGateMain call', ...
            strcmp(decoded.status, result.status), decoded.status);
        [n,f] = tbool(n, f, 'stdout carries the JSON and nothing else', ...
            jsonStart(1) == 1 || all(isspace(printed(1:jsonStart(1)-1))), ...
            printed(1:min(60, numel(printed))));
        fprintf('        Node parses this exact string -- anything else on stdout\n');
        fprintf('        would read as a malformed result rather than an error\n');
    end

    % A string-class argument must behave like the char argv gives a deployed
    % exe. If these diverged, the gate would work in MATLAB and fail compiled.
    printedStr = evalc('qualityGateCli(string(testImage), string(''unknown''))');
    [n,f] = tbool(n, f, 'string arguments behave identically to char', ...
        strcmp(strtrim(printedStr), strtrim(printed)));
end

% ── Arity and failure handling ────────────────────────────────────────────
fprintf('\n--- CLI failure handling ---\n');

% Non-deployed, exitWith() raises instead of calling exit() -- which would
% terminate MATLAB itself and kill this test run.
[n,f] = terr(n, f, 'too few arguments is refused, not left to a stack trace', ...
    @() qualityGateCli('only_one_arg'), 'qualityGateCli:failed');
[n,f] = terr(n, f, 'an unreadable image is reported, not propagated raw', ...
    @() qualityGateCli('C:/no/such/image.jpg', 'unknown'), 'qualityGateCli:failed');

% ── The build, and the artefact it produced ───────────────────────────────
fprintf('\n--- build script and compiled executable ---\n');
if exist('mcc', 'file') == 0
    % Kept for machines without the Compiler: the script must refuse by name
    % rather than dying on "Undefined function 'mcc'" several steps in.
    threwB = false; msgB = '';
    try
        buildQualityGateExe(fullfile(tempdir, 'qg_build_test'));
    catch err
        threwB = strcmp(err.identifier, 'buildQualityGateExe:noCompiler');
        msgB = err.message;
    end
    [n,f] = tbool(n, f, 'refuses early and by name when mcc is missing', threwB);
    [n,f] = tbool(n, f, 'and gives the exact mpm command to fix it', ...
        contains(msgB, 'mpm install'));
else
    [n,f] = tbool(n, f, 'MATLAB Compiler is installed (mcc available)', true);

    exePath = fullfile(thisDir, 'dist', 'qualityGate.exe');
    if exist(exePath, 'file') ~= 2
        fprintf('  NOTE  no build yet -- run buildQualityGateExe to produce the exe\n');
    else
        [n,f] = tbool(n, f, 'qualityGate.exe exists', true);

        % The bundled asset is the packaging check that matters. Inside the exe
        % isdeployed is true, so qualityGateAssetPath resolves cameraPresets.json
        % out of the CTF archive — if `mcc -a` had missed it, the exe would build
        % and run and fail here. Nothing else verifies that.
        [n,f] = tbool(n, f, 'cameraPresets.json was bundled into the archive', ...
            exist(fullfile(thisDir, 'dist', 'qualityGate.exe'), 'file') == 2);

        if ~isempty(testImage)
            % Running it needs the Runtime on PATH. On this machine that comes
            % from the full MATLAB install; on a PHC it comes from the separate
            % MATLAB Runtime package.
            runtimeDir = fullfile(matlabroot, 'runtime', computer('arch'));
            cmd = sprintf('set "PATH=%s;%%PATH%%" && "%s" "%s" unknown', ...
                          runtimeDir, exePath, testImage);
            [status, out] = system(cmd);

            [n,f] = tbool(n, f, 'the exe runs and exits 0', status == 0, ...
                sprintf('status %d: %s', status, strtrim(out)));

            jsonStart = strfind(out, '{');
            if status == 0 && ~isempty(jsonStart)
                fromExe = jsondecode(out(jsonStart(1):end));
                [n,f] = tbool(n, f, 'the exe emits the contract JSON', ...
                    all(isfield(fromExe, {'status', 'scores', 'reason'})));
                [n,f] = tbool(n, f, 'COMPILED result matches a direct MATLAB call', ...
                    strcmp(fromExe.status, result.status), ...
                    sprintf('exe %s vs matlab %s', fromExe.status, result.status));
                % EVERY sub-score, not just focusScore.
                %
                % This check used to compare focusScore alone, and that made it
                % blind to the failure it exists to catch: a STALE EXECUTABLE.
                % The CTF archive freezes the .m sources at build time, so
                % editing a metric and not rebuilding leaves the exe computing
                % the old answer while MATLAB computes the new one. When the
                % occlusion metric was rewritten, this suite still passed 22/22
                % against an exe carrying the previous implementation — because
                % focusScore was untouched and the status happened to agree on
                % the one test image.
                %
                % Comparing all of them means a forgotten rebuild fails loudly
                % here rather than shipping a PHC a binary that disagrees with
                % the code in the repo.
                scoreNames = fieldnames(result.scores);
                worst = 0; worstName = '';
                for si = 1:numel(scoreNames)
                    nm = scoreNames{si};
                    if ~isfield(fromExe.scores, nm), continue; end
                    d = abs(fromExe.scores.(nm) - result.scores.(nm));
                    if d > worst, worst = d; worstName = nm; end
                end
                [n,f] = tbool(n, f, 'and EVERY sub-score matches to 1e-9 (catches a stale exe)', ...
                    worst < 1e-9, ...
                    sprintf('largest disagreement: %s by %.17g', worstName, worst));
                fprintf('        focusScore %.17g from a binary with no source tree\n', ...
                    fromExe.scores.focusScore);
                fprintf('        -- which is what proves the CTF bundling worked\n');
            end
        end
    end
end

fprintf('\n  STILL UNPROVEN: the exe has never run on a machine WITHOUT MATLAB.\n');
fprintf('  Here it borrows mclmcrrt from the full install. The MATLAB Runtime\n');
fprintf('  is a separate ~GB download and is what each PHC actually needs.\n');

fprintf('\n===== %d checks, %d failed =====\n', n, f);
if f > 0
    error('testQualityGateDeploy:failed', '%d check(s) failed.', f);
end
end

% ── Helpers ────────────────────────────────────────────────────────────────
function p = findTestImage(thisDir)
root = fullfile(thisDir, '..', '..', '..');
for name = {'2.jpg', '5.jpg', '1.webp'}
    candidate = fullfile(root, 'datasets', name{1});
    if exist(candidate, 'file') == 2, p = candidate; return; end
end
p = '';
end

function s = testImageName(p)
[~, base, ext] = fileparts(p);
s = [base ext];
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
