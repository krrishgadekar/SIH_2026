function netraSetuCaseMain(inputJsonPath, outputJsonPath)
% NETRASETUCASEMAIN  Deployment entry point for one case's MATLAB grading.
%
%   netraSetuCaseMain in.json out.json
%
%   A thin CLI around runCasePipeline, built so the per-case chain can be
%   compiled (mcc / MATLAB Compiler SDK) and run on a machine with only the
%   MATLAB Runtime. It adds no logic: same input contract, same output, so a
%   compiled run and an in-MATLAB run are comparable line by line -- which is
%   the only way to tell whether compilation changed behaviour.
%
%   ── WHY THIS FILE EXISTS SEPARATELY ────────────────────────────────────────
%   runCasePipeline returns a struct. A deployed program gets char arguments
%   and returns an exit code, so something has to sit between them. Putting
%   that wrapper in the pipeline itself would mean the in-MATLAB path carried
%   deployment concerns it does not have.
%
%   Exit codes: 0 success, 1 failure (the message goes to stderr as JSON, so
%   the caller can read a reason rather than scraping a stack trace).

try
    if nargin < 2
        error('netraSetuCaseMain:usage', ...
              'usage: netraSetuCaseMain <input.json> <output.json>');
    end

    out = runCasePipeline(inputJsonPath);

    % jsonencodeAscii, not jsonencode: the evidence text contains en dashes,
    % and on a Windows machine with a non-UTF-8 default encoding they are
    % silently dropped on the way out. That was already a real bug once in
    % this project.
    txt = jsonencodeAscii(out);

    fid = fopen(outputJsonPath, 'w');
    if fid < 0
        error('netraSetuCaseMain:cannotWrite', ...
              'could not open %s for writing', outputJsonPath);
    end
    closer = onCleanup(@() fclose(fid));
    fwrite(fid, txt);

    fprintf('%s\n', outputJsonPath);
catch ME
    % Machine-readable on stderr. A deployed component is called by Node, and
    % a stack trace it cannot parse is the same as no information at all.
    fprintf(2, '%s\n', jsonencode(struct( ...
        'error', ME.identifier, 'message', ME.message)));
    if isdeployed
        exit(1);
    else
        rethrow(ME);
    end
end

if isdeployed
    exit(0);
end
end
