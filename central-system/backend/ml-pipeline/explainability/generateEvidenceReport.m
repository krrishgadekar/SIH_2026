function [summaryText, reportPath, details] = generateEvidenceReport(caseId, inputs, opts)
% GENERATEEVIDENCEREPORT  The automated annotated report (PS requirement 4).
%
%   [summaryText, reportPath, details] = generateEvidenceReport(caseId, inputs)
%   [summaryText, reportPath, details] = generateEvidenceReport(caseId, inputs, opts)
%
%   inputs (struct):
%     .redByQuadrant     1x4 microaneurysm + haemorrhage counts (Task 4.2)
%     .brightByQuadrant  1x4 exudate counts (Task 4.3)
%     .nvSuspicionScore  scalar 0-1 (Task 4.4)
%     .redSubtypes       optional struct, e.g. {microaneurysms, dotHaemorrhages}
%     .image             optional HxWx3 fundus image, for the annotated overlay
%     .lesionPoints      optional Nx2 [x y] lesion centroids
%     .opticDisc/.fovea  optional [x y]; required for the overlay's quadrants
%   opts:
%     .outputDir  where the annotated PNG is written
%     .ruleOpts   passed straight through to ruleEngineGrade
%
%   Outputs:
%     summaryText - the one-paragraph structured summary
%     reportPath  - path to the annotated image, or '' when one could not be
%                   made (see "Degrading honestly")
%     details     - the grade, the evidence struct, and the per-quadrant table
%
%   Task 7.3. Written to explainability_outputs.evidence_summary_text and
%   returned by GET /api/v1/cases/:caseId as evidenceSummaryText.
%
%   ── TEMPLATED, NOT GENERATED PROSE ─────────────────────────────────────────
%   Every sentence here is assembled from counts by fixed rules. Nothing is
%   phrased by a language model and nothing is inferred beyond what the counts
%   and ruleEngineGrade say.
%
%   That is a deliberate constraint, not a limitation of effort. A report that
%   editorialises about a diagnosis is exactly what the design doc forbids, and
%   a templated sentence is reproducible (the same case gives the same words),
%   translatable (the structure is fixed, so Hindi is a table of strings rather
%   than a second act of writing), and auditable (a reviewer can check every
%   number against the database).
%
%   ── THE RULE: NO NUMBER THAT IS NOT IN THE DATABASE ────────────────────────
%   Task 7.3's Definition of Done is that every figure in the text traces to a
%   stored lesion count. So this function does not compute new quantities to
%   mention, does not round counts into words like "several", and does not
%   restate the ICDR criteria — it calls ruleEngineGrade (Task 5.1) and prints
%   the criterion IT reports. Restating the rule text here would create a second
%   copy that can drift from the one that actually decides the grade, and a
%   report that describes a rule the system did not apply is worse than no
%   report.
%
%   ── DEGRADING HONESTLY ─────────────────────────────────────────────────────
%   Lesion segmentation (Tasks 4.2/4.3) is not built. When counts are absent
%   this returns a summary that SAYS they are absent. It does not print
%   "0 microaneurysms": zero-measured and not-measured are different clinical
%   claims, and only one of them is true today. Likewise the annotated image
%   needs lesion coordinates and both landmarks; without them reportPath is ''
%   and the reason is in details, rather than an unannotated copy of the fundus
%   photo passed off as a report.

if nargin < 3, opts = struct(); end

thisDir = fileparts(mfilename('fullpath'));
addpath(fullfile(thisDir, '..', 'grading'));
addpath(fullfile(thisDir, '..', 'segmentation'));

QUADRANTS = fundusQuadrants('names');

details = struct('caseId', caseId, 'quadrantNames', {QUADRANTS});

red    = getfielddef(inputs, 'redByQuadrant', []);
bright = getfielddef(inputs, 'brightByQuadrant', []);
nvScore = getfielddef(inputs, 'nvSuspicionScore', []);

% ── No counts: say so, and stop ─────────────────────────────────────────────
haveCounts = ~isempty(red) && ~isempty(bright) && numel(red) == 4 && numel(bright) == 4 ...
             && all(isfinite(red)) && all(isfinite(bright));

if ~haveCounts
    summaryText = ['Lesion segmentation has not been run for this case, so no ' ...
                   'lesion-level evidence is available. The grade shown is from ' ...
                   'the image classifier alone and has not been cross-checked ' ...
                   'against ICDR lesion criteria.'];
    reportPath = '';
    details.grade = [];
    details.evidence = [];
    details.reason = 'no lesion counts supplied (Tasks 4.2/4.3 not built)';
    details.countsAvailable = false;
    return;
end

details.countsAvailable = true;
red = double(red(:))';
bright = double(bright(:))';
if isempty(nvScore) || ~isfinite(nvScore), nvScore = 0; end

% ── The criteria come from Branch B, not from here ──────────────────────────
[grade, evidence] = ruleEngineGrade(red, bright, nvScore, getdef(opts, 'ruleOpts', struct()));
details.grade = grade;
details.evidence = evidence;

% ── Sentence 1: what was found, and where ───────────────────────────────────
parts = {};

redTotal = sum(red);
if redTotal > 0
    subtypes = getfielddef(inputs, 'redSubtypes', []);
    if isstruct(subtypes) && ~isempty(fieldnames(subtypes))
        % Subtype counts when the segmenter distinguishes them. Their sum is
        % checked against the quadrant total: two numbers in one sentence that
        % disagree would be worse than one number alone.
        subParts = {};
        subTotal = 0;
        for f = string(fieldnames(subtypes))'
            n = double(subtypes.(f));
            subTotal = subTotal + n;
            subParts{end+1} = sprintf('%d %s', n, humanLabel(f, n)); %#ok<AGROW>
        end
        if abs(subTotal - redTotal) > 0
            error('generateEvidenceReport:countMismatch', ...
                  ['Red-lesion subtypes sum to %d but the quadrant counts sum to ' ...
                   '%d. Refusing to write a report whose own numbers disagree.'], ...
                  subTotal, redTotal);
        end
        parts{end+1} = strjoin(subParts, ', ');
    else
        parts{end+1} = sprintf('%d %s', redTotal, humanLabel("redLesions", redTotal));
    end
    parts{end} = [parts{end} ' ' quadrantBreakdown(red, QUADRANTS)];
end

brightTotal = sum(bright);
if brightTotal > 0
    parts{end+1} = sprintf('%d %s %s', brightTotal, ...
        humanLabel("brightLesions", brightTotal), quadrantBreakdown(bright, QUADRANTS));
end

if isempty(parts)
    findings = 'No microaneurysms, haemorrhages or exudates detected.';
else
    findings = [capitalise(strjoin(parts, ', ')) '.'];
end

% ── Sentence 2: which criterion was and was not met ─────────────────────────
% Naming the rule is what makes the report auditable against ICDR/ETDRS rather
% than a bare assertion. evidence.criterion is Branch B's own words.
criterionSentence = evidence.criterion;
if isempty(criterionSentence)
    criterionSentence = 'No ICDR criterion for referable disease was met';
end
if ~endsWith(strtrim(criterionSentence), '.')
    criterionSentence = [strtrim(criterionSentence) '.'];
end

% ── Sentence 3: the limitation, when one applies ────────────────────────────
% evidence.limitation carries Branch B's under-grading caveat: two of the three
% severe-NPDR criteria have no detector. A report that omitted it would imply
% the eye had been checked against all three.
sentences = {findings, criterionSentence};
if ~isempty(evidence.limitation)
    lim = strtrim(evidence.limitation);
    if ~endsWith(lim, '.'), lim = [lim '.']; end
    sentences{end+1} = lim;
end

summaryText = strjoin(sentences, ' ');
details.summaryText = summaryText;

% ── The annotated image ─────────────────────────────────────────────────────
[reportPath, details.annotationNote] = buildAnnotatedImage(caseId, inputs, opts, QUADRANTS);
details.reportPath = reportPath;
end

% ───────────────────────────────────────────────────────────────────────────
function s = quadrantBreakdown(counts, names)
% "(superior-temporal: 3, inferior-nasal: 3)" -- only the non-zero quadrants,
% because listing four entries of which two are zero buries the finding.
nz = find(counts > 0);
if isempty(nz), s = ''; return; end
items = arrayfun(@(k) sprintf('%s: %d', names{k}, counts(k)), nz, 'UniformOutput', false);
s = ['(' strjoin(items, ', ') ')'];
end

function [reportPath, note] = buildAnnotatedImage(caseId, inputs, opts, names)
reportPath = '';
img    = getfielddef(inputs, 'image', []);
points = getfielddef(inputs, 'lesionPoints', []);
disc   = getfielddef(inputs, 'opticDisc', []);
fovea  = getfielddef(inputs, 'fovea', []);

if isempty(img)
    note = 'no image supplied; annotated overlay not produced';
    return;
end
if isempty(points)
    % An unannotated copy of the fundus photo is not a report. Producing one
    % would put a file at reportPath that looks like a deliverable and contains
    % no evidence.
    note = 'no lesion coordinates (Tasks 4.2/4.3 not built); overlay not produced';
    return;
end
if isempty(disc) || isempty(fovea) || any(~isfinite(disc)) || any(~isfinite(fovea))
    note = 'optic disc / fovea unavailable; quadrant boundaries cannot be drawn';
    return;
end

outputDir = getdef(opts, 'outputDir', pwd);
if ~exist(outputDir, 'dir'), mkdir(outputDir); end

canvas = img;
if ~isa(canvas, 'uint8'), canvas = im2uint8(canvas); end
if size(canvas, 3) == 1, canvas = repmat(canvas, 1, 1, 3); end

[H, W, ~] = size(canvas);
qinfo = fundusQuadrants([], disc, fovea);

% Quadrant boundaries: the disc-fovea axis and its perpendicular, through the
% disc. Drawn so a reviewer can see which quadrant a lesion was counted in
% rather than taking the table's word for it.
canvas = drawAxis(canvas, disc, qinfo.temporalUnit, H, W);
canvas = drawAxis(canvas, disc, qinfo.superiorUnit, H, W);

qidx = fundusQuadrants(points, disc, fovea);
labels = arrayfun(@(k) names{k}, qidx, 'UniformOutput', false);

boxes = [points(:,1) - 12, points(:,2) - 12, ...
         repmat(24, size(points, 1), 1), repmat(24, size(points, 1), 1)];
canvas = insertObjectAnnotation(canvas, 'rectangle', boxes, labels, ...
    'Color', 'yellow', 'TextBoxOpacity', 0.5, 'FontSize', 10);

canvas = insertShape(canvas, 'circle', [disc(1) disc(2) 14], ...
    'Color', 'cyan', 'LineWidth', 3);
canvas = insertShape(canvas, 'circle', [fovea(1) fovea(2) 10], ...
    'Color', 'magenta', 'LineWidth', 3);

reportPath = fullfile(outputDir, sprintf('evidence_%s.png', caseId));
imwrite(canvas, reportPath);
note = sprintf('%d lesion(s) annotated; disc cyan, fovea magenta', size(points, 1));
end

function canvas = drawAxis(canvas, origin, unitVec, H, W)
L = hypot(H, W);
p1 = origin - unitVec * L;
p2 = origin + unitVec * L;
canvas = insertShape(canvas, 'line', [p1(1) p1(2) p2(1) p2(2)], ...
    'Color', 'white', 'LineWidth', 1);
end

function s = humanLabel(kind, n)
switch string(kind)
    case "microaneurysms",  s = plural('microaneurysm', n);
    case "dotHaemorrhages", s = plural('dot haemorrhage', n);
    case "dotHemorrhages",  s = plural('dot hemorrhage', n);
    case "haemorrhages",    s = plural('haemorrhage', n);
    case "redLesions",      s = plural('red lesion', n);
    case "hardExudates",    s = plural('hard exudate', n);
    case "softExudates",    s = plural('soft exudate', n);
    case "brightLesions",   s = plural('bright lesion', n);
    otherwise,              s = plural(char(kind), n);
end
end

function s = plural(word, n)
if n == 1, s = word; else, s = [word 's']; end
end

function s = capitalise(s)
if ~isempty(s), s(1) = upper(s(1)); end
end

function v = getfielddef(s, name, dflt)
if isstruct(s) && isfield(s, name), v = s.(name); else, v = dflt; end
end

function v = getdef(s, name, dflt)
if isstruct(s) && isfield(s, name) && ~isempty(s.(name)), v = s.(name); else, v = dflt; end
end
