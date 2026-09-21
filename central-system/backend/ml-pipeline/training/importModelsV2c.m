function importModelsV2c()
% IMPORTMODELSV2C  Import ONLY branchA_v2c's ONNX graph into a MATLAB
% dlnetwork and save models/branchA_v2c.mat.
%
% Does NOT touch branchA_v1.mat, branchA_v2a.mat, branchA_v2b.mat, or any
% M2-M5 model -- importModels.m's own v1/v2a/M2-M5 imports and
% importModelsV2b.m's v2b import are completely untouched by running this.
%
%   matlab -batch "cd('training'); importModelsV2c()"
%
% See importBranchAV2.m for the shared, fully-parameterized import logic
% this calls, and importModelsV2b.m for the sibling v2b entry point.
importBranchAV2('branchA_v2c');
end
