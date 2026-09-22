function importModelsV2b()
% IMPORTMODELSV2B  Import ONLY branchA_v2b's ONNX graph into a MATLAB
% dlnetwork and save models/branchA_v2b.mat.
%
% Does NOT touch branchA_v1.mat, branchA_v2a.mat, or any M2-M5 model --
% importModels.m's own v1/v2a/M2-M5 imports are completely untouched by
% running this (v2b integration, GENERALIZE step: existing v2a artifacts
% must not be regenerated or overwritten).
%
%   matlab -batch "cd('training'); importModelsV2b()"
%
% For a later tag (e.g. branchA_v2c), copy this file to importModelsV2c.m
% and change the one string literal below -- see importBranchAV2.m for the
% shared, fully-parameterized import logic this calls.
importBranchAV2('branchA_v2b');
end
