function importBranchAV2(modelVersion)
% IMPORTBRANCHAV2  Shared v2-family Branch-A-classifier ONNX->dlnetwork
% import logic (dropout re-insert + terminal softmax), for ANY v2-family tag
% (branchA_v2a | branchA_v2b | branchA_v2c).
%
% GENERALIZE (v2b integration): this is importModels.m's former inline "M1
% v2a" section, extracted verbatim and parameterized by modelVersion so
% importModels.m (still importing branchA_v2a by default, byte-identical
% output) and importModelsV2b.m (importing ONLY branchA_v2b, touching
% nothing else) can both call it. A later tag (branchA_v2c) needs only a new
% 3-line importModelsV2c.m calling importBranchAV2('branchA_v2c') once its
% checkpoint/onnx exist -- no change here.
%
% Filenames are derived directly from modelVersion (e.g. 'branchA_v2b' ->
% onnx source 'models/Model1/branchA_v2b.onnx', saved net
% 'models/branchA_v2b.mat') -- every v2-family tag follows this exact naming
% convention, no lookup table needed.
%
% Only branchA_v1 (M1, in importModels.m) needs the dropout/softmax surgery
% for a DIFFERENT reason worth repeating here: torch.onnx.export in eval()
% mode drops the nn.Dropout module entirely (identity op at inference), so
% the ONNX graph has no dropout node -- re-inserting one at the same point
% (between the backbone's pooled features and the final FC layer) is what
% lets Task 6.1's MC-Dropout force it active later. The terminal softmax
% makes the saved net's output sum to 1, per the net contract. Column order
% (grade index + 1) is unchanged by ONNX export/import for the same reason
% v1's is: DRClassifierV2Export's nn.Linear was trained with integer labels
% 0..4 directly and nothing here permutes an FC layer's output rows --
% confirmed empirically by parityCheckV2(modelVersion) on real images.

thisDir   = fileparts(mfilename('fullpath'));       % .../training
modelsDir = fullfile(thisDir, '..', 'models');       % .../ml-pipeline/models

tag = modelVersion(9:end);   % 'branchA_v2a' -> 'v2a' (strip 'branchA_' prefix)
onnxPath = fullfile(modelsDir, 'Model1', [modelVersion '.onnx']);
V2_SIZE = 512;   % every v2-family tag trains at 512, per its own checkpoint's img_size

fprintf('\n-- M1 %s %s --\n', tag, modelVersion);
net = importNetworkFromONNX(onnxPath, 'InputDataFormats', {'BCSS'});

net = disconnectLayers(net, 'x_backbone_global__2', 'x_head_Gemm');
net = addLayers(net, dropoutLayer(0.3, 'Name', 'dropout_dr'));
net = connectLayers(net, 'x_backbone_global__2', 'dropout_dr');
net = connectLayers(net, 'dropout_dr', 'x_head_Gemm');
net = addLayers(net, softmaxLayer('Name', 'softmax_dr'));
net = connectLayers(net, 'x_head_Gemm', 'softmax_dr');
net.OutputNames = {'softmax_dr'};
net = initialize(net, dlarray(single(zeros(V2_SIZE, V2_SIZE, 3, 1)), 'SSCB'));

hasDropout = any(arrayfun(@(L) isa(L, 'nnet.cnn.layer.DropoutLayer'), net.Layers));
assertCheckLocal(sprintf('%s: dropout layer present', tag), hasDropout);

probs = gatherRowLocal(predict(net, dlarray(single(zeros(V2_SIZE, V2_SIZE, 3, 1)), 'SSCB')));
assertCheckLocal(sprintf('%s: output has 5 columns', tag), numel(probs) == 5);
assertCheckLocal(sprintf('%s: output sums to 1 (softmax present)', tag), abs(sum(probs) - 1) < 1e-4);
fprintf('  INFO  column order = grade index + 1 by construction, same as v1 -- see\n');
fprintf('        training/parityCheckV2%s.m for the empirical check on real images\n', tag(3:end));

save(fullfile(modelsDir, [modelVersion '.mat']), 'net');
fprintf('  SAVED %s\n', fullfile(modelsDir, [modelVersion '.mat']));
end

function assertCheckLocal(label, ok)
if ok
    fprintf('  PASS  %s\n', label);
else
    error('importBranchAV2:checkFailed', 'FAILED: %s', label);
end
end

function v = gatherRowLocal(y)
v = double(extractdata(y));
v = v(:)';
end
