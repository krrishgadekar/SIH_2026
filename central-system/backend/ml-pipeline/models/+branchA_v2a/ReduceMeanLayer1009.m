classdef ReduceMeanLayer1009 < nnet.layer.Layer & nnet.layer.Formattable
    % A custom layer auto-generated while importing an ONNX network.

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
        % Specify the path to the class that will be used for codegen
        function name = matlabCodegenRedirect(~)
            name = 'branchA_v2a.coder.ReduceMeanLayer1009';
        end
    end


    methods
        function this = ReduceMeanLayer1009(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_136'};
        end

        function [x_backbone_block_136] = predict(this, x_backbone_block_130)
            if isdlarray(x_backbone_block_130)
                x_backbone_block_130 = stripdims(x_backbone_block_130);
            end
            x_backbone_block_130NumDims = 4;
            x_backbone_block_130 = branchA_v2a.ops.permuteInputVar(x_backbone_block_130, [4 3 1 2], 4);

            [x_backbone_block_136, x_backbone_block_136NumDims] = ReduceMeanGraph1027(this, x_backbone_block_130, x_backbone_block_130NumDims, false);
            x_backbone_block_136 = branchA_v2a.ops.permuteOutputVar(x_backbone_block_136, [3 4 2 1], 4);

            x_backbone_block_136 = dlarray(single(x_backbone_block_136), 'SSCB');
        end

        function [x_backbone_block_136] = forward(this, x_backbone_block_130)
            if isdlarray(x_backbone_block_130)
                x_backbone_block_130 = stripdims(x_backbone_block_130);
            end
            x_backbone_block_130NumDims = 4;
            x_backbone_block_130 = branchA_v2a.ops.permuteInputVar(x_backbone_block_130, [4 3 1 2], 4);

            [x_backbone_block_136, x_backbone_block_136NumDims] = ReduceMeanGraph1027(this, x_backbone_block_130, x_backbone_block_130NumDims, true);
            x_backbone_block_136 = branchA_v2a.ops.permuteOutputVar(x_backbone_block_136, [3 4 2 1], 4);

            x_backbone_block_136 = dlarray(single(x_backbone_block_136), 'SSCB');
        end

        function [x_backbone_block_136, x_backbone_block_136NumDims1029] = ReduceMeanGraph1027(this, x_backbone_block_130, x_backbone_block_130NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2a.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1028, x_backbone_block_130NumDims);
            xMean = mean(x_backbone_block_130, dims);
            x_backbone_block_136 = xMean;
            x_backbone_block_136NumDims = x_backbone_block_130NumDims;

            % Set graph output arguments
            x_backbone_block_136NumDims1029 = x_backbone_block_136NumDims;

        end

    end

end