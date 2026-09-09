function DRCase = buildEntityBus()
% BUILDENTITYBUS  Define the DRCase entity type used by districtScreeningSimEvents.
%
%   buildEntityBus()            assigns DRCase into the base workspace
%   bus = buildEntityBus()      also returns it
%
%   A screening case carries two fields through the SimEvents model:
%
%     prio      1 = Tier A (auto-clears), 2 = Tier B, 3 = Tier C
%     residual  remaining service time, written back when a case is preempted
%
%   WHY A BUS AND NOT TWO ATTRIBUTES
%     The Entity Generator dialog holds exactly ONE attribute name. A cell
%     array, a comma-separated string and a newline-separated string are all
%     rejected, so two fields require a Simulink.Bus.
%
%   WHY 'residual' EXISTS
%     Without it, SimEvents preemption RESTARTS the interrupted case; with it
%     the case RESUMES with the work it had left. referenceQueueingModel.m
%     implements resume, so dropping this would make the two models disagree by
%     construction and invalidate the cross-check between them.
%
%   WHY THIS IS A SEPARATE FILE
%     districtScreeningSimEvents.slx calls it from its PreLoadFcn, so that
%     opening the model anywhere defines the type automatically. A local
%     function inside buildDistrictScreeningModel.m is not visible to that
%     callback -- the model loads with "Unrecognized function or variable
%     'buildEntityBus'" and then fails to compile with an error naming the bus
%     rather than explaining that nothing ever created it.

prio          = Simulink.BusElement;
prio.Name     = 'prio';
prio.DataType = 'double';

residual          = Simulink.BusElement;
residual.Name     = 'residual';
residual.DataType = 'double';

DRCase          = Simulink.Bus;
DRCase.Elements = [prio residual];

assignin('base', 'DRCase', DRCase);
end
