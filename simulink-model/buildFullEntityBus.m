function DRCaseFull = buildFullEntityBus()
% BUILDFULLENTITYBUS  Define the DRCaseFull entity type used by
% netraSetuPipeline.slx.
%
%   buildFullEntityBus()            assigns DRCaseFull into the base workspace
%   bus = buildFullEntityBus()      also returns it
%
%   A case carries its whole history through the pipeline, because every
%   routing decision downstream is made by reading one of these fields:
%
%     prio      1 = Tier A (auto-clears), 2 = Tier B, 3 = Tier C
%     qc        1 = the quality gate passed the image, 2 = retake needed
%     retakes   how many times this patient has been photographed again
%     failed    1 = graded, 2 = grading failed
%     attempts  grading attempts so far (the retry budget)
%     route     1 = retry, 2 = give up. Used by both the retake limit and the
%               grading retry limit -- the same question in two places
%     refer     1 = referred onward with an SMS, 2 = cleared by the reviewer
%     residual  remaining service time, written back when a review is
%               preempted by an urgent case
%
%   WHY A BUS AND NOT SEPARATE ATTRIBUTES
%     The Entity Generator dialog holds exactly ONE attribute name, so more
%     than one field requires a Simulink.Bus.
%
%   WHY THIS IS A SEPARATE FILE
%     netraSetuPipeline.slx calls it from its PreLoadFcn so that opening the
%     model anywhere defines the type. A local function inside the builder is
%     not visible to that callback, and the model then fails to compile with
%     "The bus object 'DRCaseFull' ... is invalid" -- an error that names the
%     bus without saying that nothing ever created it. That is exactly how
%     this file came to exist.

names = {'prio', 'qc', 'retakes', 'failed', 'attempts', 'route', 'refer', 'residual'};

elems = Simulink.BusElement.empty(0, numel(names));
for k = 1:numel(names)
    e = Simulink.BusElement;
    e.Name     = names{k};
    e.DataType = 'double';
    elems(k)   = e;
end

DRCaseFull          = Simulink.Bus;
DRCaseFull.Elements = elems;

assignin('base', 'DRCaseFull', DRCaseFull);
end
