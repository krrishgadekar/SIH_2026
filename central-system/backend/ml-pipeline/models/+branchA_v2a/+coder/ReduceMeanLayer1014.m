classdef ReduceMeanLayer1014 < nnet.layer.Layer & nnet.layer.Formattable
    % A custom layer auto-generated while importing an ONNX network.
    %#codegen

    %#ok<*PROPLC>
    %#ok<*NBRAK>
    %#ok<*INUSL>
    %#ok<*VARARG>
    properties (Learnable)
    end

    properties (State)
    end

    properties
        Vars
        NumDims
    end

    methods(Static, Hidden)
        % Specify the properties of the class that will not be modified
        % after the first assignment.
        function p = matlabCodegenNontunableProperties(~)
            p = {
                % Constants, i.e., Vars, NumDims and all learnables and states
                'Vars'
                'NumDims'
                };
        end
    end


    methods(Static, Hidden)
        % Instantiate a codegenable layer instance from a MATLAB layer instance
        function this_cg = matlabCodegenToRedirected(mlInstance)
            this_cg = branchA_v2a.coder.ReduceMeanLayer1014(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v2a.ReduceMeanLayer1014(cgInstance.Name);
            if isstruct(cgInstance.Vars)
                names = fieldnames(cgInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this_ml.Vars.(fieldname) = dlarray(cgInstance.Vars.(fieldname));
                end
            else
                this_ml.Vars = [];
            end
            this_ml.NumDims = cgInstance.NumDims;
        end
    end

    methods
        function this = ReduceMeanLayer1014(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_block_210'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = branchA_v2a.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_backbone_block_210] = predict(this, x_backbone_block_204__)
            if isdlarray(x_backbone_block_204__)
                x_backbone_block_204_ = stripdims(x_backbone_block_204__);
            else
                x_backbone_block_204_ = x_backbone_block_204__;
            end
            x_backbone_block_204NumDims = 4;
            x_backbone_block_204 = branchA_v2a.coder.ops.permuteInputVar(x_backbone_block_204_, [4 3 1 2], 4);

            [x_backbone_block_210__, x_backbone_block_210NumDims__] = ReduceMeanGraph1042(this, x_backbone_block_204, x_backbone_block_204NumDims, false);
            x_backbone_block_210_ = branchA_v2a.coder.ops.permuteOutputVar(x_backbone_block_210__, [3 4 2 1], 4);

            x_backbone_block_210 = dlarray(single(x_backbone_block_210_), 'SSCB');
        end

        function [x_backbone_block_210, x_backbone_block_210NumDims1044] = ReduceMeanGraph1042(this, x_backbone_block_204, x_backbone_block_204NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1028 = branchA_v2a.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1043, coder.const(x_backbone_block_204NumDims));
            xReduced1029 = mean(x_backbone_block_204, dims1028);
            x_backbone_block_210 = xReduced1029;
            x_backbone_block_210NumDims = coder.const(x_backbone_block_204NumDims);

            % Set graph output arguments
            x_backbone_block_210NumDims1044 = coder.const(x_backbone_block_210NumDims);

        end

    end

end