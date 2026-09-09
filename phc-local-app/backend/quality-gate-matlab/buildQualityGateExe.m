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
%   ══ BLOCKED: MATLAB COMPILER IS LICENSED BUT NOT INSTALLED ═════════════════
%   As of 2026-09-09 on this machine:
%       license('test','Compiler')  ->  1     (licensed)
%       ver('compiler')             ->  empty (not installed)
%       exist('mcc','file')         ->  0     (no mcc binary)
%
%   Install it the same way Simulink was installed for Task 0.0:
%
%       mpm install --release=R2026a --products=MATLAB_Compiler
%
%   This script has therefore NEVER BEEN RUN. It is written against the
%   documented mcc interface and the packaging traps are handled, but no
%   executable has been produced or tested. Do not report the quality gate as
%   MATLAB-free until this has actually been built and run on a clean machine.
%
%   ── WHY THIS MATTERS MORE THAN IT LOOKS ────────────────────────────────────
%   Every PHC currently needs a licensed MATLAB install to check whether a
%   photograph is in focus. At district scale that is a per-site licence cost
%   and a multi-gigabyte install on modest rural hardware, for one function.
%   The MATLAB Runtime is free and redistributable.
%
%   It is also a latency fix: `matlab -batch` pays 3-8 s of interpreter startup
%   per call, which is why qualityGateClient has a warm-up hack at all. A
%   compiled exe starts in roughly 50 ms, so the health worker sees the retake
%   prompt while the patient is still in the chair.

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
%   -R -nodisplay no figure windows on a headless PHC machine
%   -v            verbose, so a CI log shows what was bundled
args = { '-m', entryPoint, ...
         '-o', 'qualityGate', ...
         '-d', outDir, ...
         '-a', presets, ...
         '-R', '-nodisplay', ...
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
