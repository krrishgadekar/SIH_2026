function outDir = buildQualityGateExe(outDir)
% BUILDQUALITYGATEEXE  Compile the quality gate into a standalone executable.
%
%   buildQualityGateExe()          % -> quality-gate-matlab/dist
%   buildQualityGateExe(outDir)
%
%   Run once, on a machine that HAS MATLAB and MATLAB Compiler. The resulting
%   executable runs on PHC machines that have neither — only the free MATLAB
%   Runtime.
%
%   Task 8.1.
%
%   ══ BUILT AND RUN — 2026-09-09, MATLAB Compiler 26.1 ═══════════════════════
%   qualityGate.exe (1.37 MB) was produced and executed end to end: the exe
%   returns byte-identical scores to a direct qualityGateMain call
%   (focusScore 0.80108660159872658 on datasets/2.jpg), and Node drives it
%   through qualityGateClient with QUALITY_GATE_EXE set.
%
%   TWO THINGS STILL UNPROVEN, and they are the ones that matter for
%   deployment:
%
%   1. It has NOT been run on a machine without MATLAB. Here it borrowed
%      mclmcrrt26_1.dll from the full MATLAB install's runtime\win64 folder via
%      a wrapper .cmd. That does exercise the CTF archive properly — the exe
%      reads cameraPresets.json from ctfroot, so the -a bundling below is
%      genuinely verified — but a clean PHC machine is a different test.
%   2. The MATLAB Runtime R2026a has not been installed anywhere. It is a
%      separate, free, ~gigabyte download, and it is what every PHC machine
%      actually needs. Run `mcrinstaller` at the MATLAB prompt to locate it.
%
%   So: the packaging is real and tested; the deployment is not yet.
%
%   ── WHY THIS MATTERS MORE THAN IT LOOKS ────────────────────────────────────
%   Every PHC currently needs a licensed MATLAB install to check whether a
%   photograph is in focus. At district scale that is a per-site licence cost
%   and a multi-gigabyte install on modest rural hardware, for one function.
%   The MATLAB Runtime is free and redistributable.
%
%   It is also a latency fix, though a smaller one than it first looks.
%   MEASURED on this machine, same image, warm:
%
%       matlab -batch   ~9.1 s per call
%       compiled exe    ~4.6 s per call
%
%   So roughly 2x, saving about 4.5 s per capture. That is worth having — it is
%   the difference between a health worker waiting with the patient still in the
%   chair and waiting noticeably longer — but it is NOT the sub-second startup
%   that "compiled" suggests. The MATLAB Runtime still has to initialise on
%   every invocation, because every call is a fresh process. An earlier draft of
%   this file claimed ~50 ms; that was asserted, never measured, and wrong by
%   two orders of magnitude.

if nargin < 1 || isempty(outDir)
    outDir = fullfile(fileparts(mfilename('fullpath')), 'dist');
end

srcDir = fileparts(mfilename('fullpath'));

% ── Refuse early and clearly ────────────────────────────────────────────────
% Without this the failure is an "Undefined function 'mcc'" several steps in,
% after the output directory has been created, which reads like a broken script
% rather than a missing product.
if exist('mcc', 'file') == 0
    error('buildQualityGateExe:noCompiler', ...
          ['MATLAB Compiler is not installed (mcc not found). It IS licensed ' ...
           'here (license test passes), so this is an install, not a purchase:\n\n' ...
           '    mpm install --release=R2026a --products=MATLAB_Compiler\n\n' ...
           'Then re-run this script.']);
end

if ~exist(outDir, 'dir'), mkdir(outDir); end

entryPoint = fullfile(srcDir, 'qualityGateCli.m');
presets    = fullfile(srcDir, 'cameraPresets.json');

if exist(presets, 'file') ~= 2
    error('buildQualityGateExe:noPresets', 'cameraPresets.json not found at %s', presets);
end

% ── The mcc call ────────────────────────────────────────────────────────────
%   -m            build a standalone executable
%   -o            output name
%   -d            output directory
%   -a <file>     ADD a non-code dependency to the archive. This is the one
%                 that matters: mcc traces .m dependencies automatically but
%                 has no way to know that jsondecode(fileread(...)) needs
%                 cameraPresets.json. Omit it and the build succeeds, the exe
%                 runs, and it fails at the first image with a missing-file
%                 error — the failure qualityGateAssetPath.m documents.
%   -v            verbose, so a CI log shows what was bundled
%
% NO -R OPTIONS, and both candidates were tried and measured rather than
% assumed:
%
%   -R -nodisplay is Linux/macOS only. On Windows the Runtime prints
%   "Unrecognized command line option: nodisplay" to stderr on EVERY
%   invocation. Harmless — the Node client keys off the exit code, not stderr
%   — but it is noise in a PHC's log forever, and it was in the first build.
%
%   -R -nojvm looked like the obvious win, since this gate does image
%   arithmetic and JSON and needs no Java. Measured on this machine it was
%   consistently SLOWER: ~6.5 s per call against ~4.4 s with the JVM loaded,
%   over three runs each. Dropped on the measurement. Worth re-testing on the
%   actual PHC hardware, where the trade may go the other way.
args = { '-m', entryPoint, ...
         '-o', 'qualityGate', ...
         '-d', outDir, ...
         '-a', presets, ...
         '-v' };

fprintf('[buildQualityGateExe] compiling %s\n', entryPoint);
fprintf('[buildQualityGateExe] output    %s\n', outDir);
fprintf('[buildQualityGateExe] bundling  %s\n', presets);

mcc(args{:});

% ── Verify the build actually produced something runnable ───────────────────
if ispc, exeName = 'qualityGate.exe'; else, exeName = 'qualityGate'; end
exePath = fullfile(outDir, exeName);
if exist(exePath, 'file') ~= 2
    error('buildQualityGateExe:noOutput', ...
          'mcc reported success but %s does not exist.', exePath);
end

fprintf('\n[buildQualityGateExe] built: %s\n', exePath);
fprintf(['\nNEXT, and do not skip it: run the exe on a machine with NO MATLAB,\n' ...
         'only the MATLAB Runtime. A build that works on this machine proves\n' ...
         'nothing about deployment — the source tree is still sitting here for\n' ...
         'it to fall back on, which is exactly what masks a missing -a asset.\n\n' ...
         '    %s <someImage.jpg> unknown\n\n' ...
         'Then point Node at it:\n' ...
         '    QUALITY_GATE_EXE=%s\n'], exePath, exePath);
end
