function ok = ensureOnnxSupportOnPath()
% ENSUREONNXSUPPORTONPATH  Put the ONNX converter support package on the path
% if it is installed but not visible.
%
%   ok = ensureOnnxSupportOnPath()
%
% WHY: branchA_v1.mat is an importNetworkFromONNX network, and its layers
% include classes that live in the "Deep Learning Toolbox Converter for ONNX
% Model Format" support package (e.g. nnet.onnx.layer.FlattenInto2dLayer).
% If that package is not on the MATLAB path, load() does NOT fail -- it warns,
% substitutes default objects, and returns a network that then errors inside
% predict(). On the dev machine (2026-09-20) the package was installed and
% registered, yet absent from the path of every `matlab -batch` process, even
% after `rehash toolboxcache`. This makes the session independent of that.
%
% Safe to call repeatedly; a no-op when the package is already visible.
% Returns true when the converter is usable after the call.

ok = exist('importNetworkFromONNX', 'file') == 2;
if ok, return; end

try
    root = matlabshared.supportpkg.getSupportPackageRoot();
catch
    root = '';
end
onnxDir = fullfile(root, 'toolbox', 'nnet', 'supportpackages', 'onnx');
if ~isempty(root) && isfolder(onnxDir)
    addpath(onnxDir);
end

ok = exist('importNetworkFromONNX', 'file') == 2;
if ~ok
    warning('ensureOnnxSupportOnPath:missing', ...
        ['Deep Learning Toolbox Converter for ONNX Model Format is not available. ' ...
         'branchA_v1.mat will not load correctly without it -- install it from ' ...
         'the Add-On Explorer.']);
end
end
