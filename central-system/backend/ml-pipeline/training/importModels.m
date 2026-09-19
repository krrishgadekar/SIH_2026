function importModels()
% IMPORTMODELS  Import the 5 ONNX graphs (produced by export_to_onnx.py) into
% MATLAB dlnetworks and save each as models/<name>.mat with the network in a
% variable named exactly `net`.
%
% Contract source: diagnostics/MODEL_INTERFACE_REFERENCE.md (verified against
% the training code / checkpoints), NOT docs/model-handoff-guide.md's "net
% contract" section, which predates branchA_v1.pt and describes a 512x512x3 /
% legacy-preprocessing model that was never trained. See export_to_onnx.py's
% header for the full explanation.
%
% Only branchA_v1 (M1) needs post-import surgery:
%   - torch.onnx.export in eval() mode drops the nn.Dropout module entirely
%     (it's an identity op at inference), so the ONNX graph has no dropout
%     node. A dropoutLayer is re-inserted at the same point in the graph
%     (between the backbone's pooled features and the final FC layer) so
%     Task 6.1's MC-Dropout has a module to force active. During ordinary
%     predict() it is a no-op, so this does not change normal inference.
%   - the ONNX graph ends at the Gemm (fully-connected) layer, i.e. raw
%     logits -- a terminal softmax is added so the saved net's output sums to
%     1, per the net contract.
%   - column order: DRClassifier's nn.Linear was trained with integer labels
%     0..4 directly (checkpoint's train_grade_counts is keyed 0..4), and
%     nothing in export or import permutes an FC layer's output rows, so
%     column k = grade k-1 by construction. Confirmed empirically (not just
%     assumed) by parityCheck.m, which compares this net's per-class output
%     against the original PyTorch model's on 10 real images.
%
% M2-M5 (segmentation / localization) are imported as-is: raw logits out,
% caller applies sigmoid (M2/M4/M5) or channel-argmax (M3) downstream. No
% dropout requirement applies to these (MC-Dropout, Task 6.1, is scoped to
% the classifier only).

thisDir  = fileparts(mfilename('fullpath'));
onnxDir  = fullfile(thisDir, 'onnx_out');
modelsDir = fullfile(thisDir, '..', 'models');

fprintf('\n===== importModels =====\n');

%% M1 -- branchA_v1 (classifier, needs dropout + softmax re-attached)
fprintf('\n-- M1 branchA_v1 --\n');
net = importNetworkFromONNX(fullfile(onnxDir, 'branchA_v1.onnx'), ...
                             'InputDataFormats', {'BCSS'});

net = disconnectLayers(net, 'x_backbone_global__2', 'x_head_Gemm');
net = addLayers(net, dropoutLayer(0.3, 'Name', 'dropout_dr'));
net = connectLayers(net, 'x_backbone_global__2', 'dropout_dr');
net = connectLayers(net, 'dropout_dr', 'x_head_Gemm');
net = addLayers(net, softmaxLayer('Name', 'softmax_dr'));
net = connectLayers(net, 'x_head_Gemm', 'softmax_dr');
net.OutputNames = {'softmax_dr'};
net = initialize(net, dlarray(single(zeros(384, 384, 3, 1)), 'SSCB'));

hasDropout = any(arrayfun(@(L) isa(L, 'nnet.cnn.layer.DropoutLayer'), net.Layers));
assertCheck('dropout layer present', hasDropout);

probs = gatherRow(predict(net, dlarray(single(zeros(384, 384, 3, 1)), 'SSCB')));
assertCheck('output has 5 columns', numel(probs) == 5);
assertCheck('output sums to 1 (softmax present)', abs(sum(probs) - 1) < 1e-4);
fprintf('  INFO  column order = grade index + 1 by construction (nn.Linear\n');
fprintf('        row order is untouched by ONNX export/import); empirically\n');
fprintf('        confirmed against the original PyTorch model in parityCheck.m\n');

save(fullfile(modelsDir, 'branchA_v1.mat'), 'net');
fprintf('  SAVED %s\n', fullfile(modelsDir, 'branchA_v1.mat'));

%% M2 -- vessel_unet_v1 (binary segmentation, 1-channel input)
fprintf('\n-- M2 vessel_unet_v1 --\n');
net = importNetworkFromONNX(fullfile(onnxDir, 'vessel_unet_v1.onnx'), ...
                             'InputDataFormats', {'BCSS'});
if ~net.Initialized
    net = initialize(net, dlarray(single(zeros(512, 512, 1, 1)), 'SSCB'));
end
y = predict(net, dlarray(single(zeros(512, 512, 1, 1)), 'SSCB'));
assertCheck('output is 512x512x1', isequal(size(y), [512 512 1 1]));
save(fullfile(modelsDir, 'vessel_unet_v1.mat'), 'net');
fprintf('  SAVED %s\n', fullfile(modelsDir, 'vessel_unet_v1.mat'));

%% M3 -- localization_v1 (2-channel heatmap regression)
fprintf('\n-- M3 localization_v1 --\n');
net = importNetworkFromONNX(fullfile(onnxDir, 'localization_v1.onnx'), ...
                             'InputDataFormats', {'BCSS'});
if ~net.Initialized
    net = initialize(net, dlarray(single(zeros(512, 512, 3, 1)), 'SSCB'));
end
y = predict(net, dlarray(single(zeros(512, 512, 3, 1)), 'SSCB'));
assertCheck('output is 512x512x2 (ch1=OD, ch2=fovea)', isequal(size(y), [512 512 2 1]));
save(fullfile(modelsDir, 'localization_v1.mat'), 'net');
fprintf('  SAVED %s\n', fullfile(modelsDir, 'localization_v1.mat'));

%% M4 -- bright_lesion_unet_v1 (binary segmentation)
fprintf('\n-- M4 bright_lesion_unet_v1 --\n');
net = importNetworkFromONNX(fullfile(onnxDir, 'bright_lesion_unet_v1.onnx'), ...
                             'InputDataFormats', {'BCSS'});
if ~net.Initialized
    net = initialize(net, dlarray(single(zeros(512, 512, 3, 1)), 'SSCB'));
end
y = predict(net, dlarray(single(zeros(512, 512, 3, 1)), 'SSCB'));
assertCheck('output is 512x512x1', isequal(size(y), [512 512 1 1]));
save(fullfile(modelsDir, 'bright_lesion_unet_v1.mat'), 'net');
fprintf('  SAVED %s\n', fullfile(modelsDir, 'bright_lesion_unet_v1.mat'));

%% M5 -- red_lesion_unet_v1 (binary segmentation)
fprintf('\n-- M5 red_lesion_unet_v1 --\n');
net = importNetworkFromONNX(fullfile(onnxDir, 'red_lesion_unet_v1.onnx'), ...
                             'InputDataFormats', {'BCSS'});
if ~net.Initialized
    net = initialize(net, dlarray(single(zeros(512, 512, 3, 1)), 'SSCB'));
end
y = predict(net, dlarray(single(zeros(512, 512, 3, 1)), 'SSCB'));
assertCheck('output is 512x512x1', isequal(size(y), [512 512 1 1]));
save(fullfile(modelsDir, 'red_lesion_unet_v1.mat'), 'net');
fprintf('  SAVED %s\n', fullfile(modelsDir, 'red_lesion_unet_v1.mat'));

fprintf('\nAll 5 models imported and saved.\n');
end

function assertCheck(label, ok)
if ok
    fprintf('  PASS  %s\n', label);
else
    error('importModels:checkFailed', 'FAILED: %s', label);
end
end

function v = gatherRow(y)
v = double(extractdata(y));
v = v(:)';
end
