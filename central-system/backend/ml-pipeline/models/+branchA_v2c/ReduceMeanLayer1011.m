classdef ReduceMeanLayer1011 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2c.coder.ReduceMeanLayer1011';
        end
    end


    methods
        function this = ReduceMeanLayer1011(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_165'};
        end

        function [x_backbone_block_165] = predict(this, x_backbone_block_159)
            if isdlarray(x_backbone_block_159)
                x_backbone_block_159 = stripdims(x_backbone_block_159);
            end
            x_backbone_block_159NumDims = 4;
            x_backbone_block_159 = branchA_v2c.ops.permuteInputVar(x_backbone_block_159, [4 3 1 2], 4);

            [x_backbone_block_165, x_backbone_block_165NumDims] = ReduceMeanGraph1033(this, x_backbone_block_159, x_backbone_block_159NumDims, false);
            x_backbone_block_165 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_165, [3 4 2 1], 4);

            x_backbone_block_165 = dlarray(single(x_backbone_block_165), 'SSCB');
        end

        function [x_backbone_block_165] = forward(this, x_backbone_block_159)
            if isdlarray(x_backbone_block_159)
                x_backbone_block_159 = stripdims(x_backbone_block_159);
            end
            x_backbone_block_159NumDims = 4;
            x_backbone_block_159 = branchA_v2c.ops.permuteInputVar(x_backbone_block_159, [4 3 1 2], 4);

            [x_backbone_block_165, x_backbone_block_165NumDims] = ReduceMeanGraph1033(this, x_backbone_block_159, x_backbone_block_159NumDims, true);
            x_backbone_block_165 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_165, [3 4 2 1], 4);

            x_backbone_block_165 = dlarray(single(x_backbone_block_165), 'SSCB');
        end

        function [x_backbone_block_165, x_backbone_block_165NumDims1035] = ReduceMeanGraph1033(this, x_backbone_block_159, x_backbone_block_159NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2c.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1034, x_backbone_block_159NumDims);
            xMean = mean(x_backbone_block_159, dims);
            x_backbone_block_165 = xMean;
            x_backbone_block_165NumDims = x_backbone_block_159NumDims;

            % Set graph output arguments
            x_backbone_block_165NumDims1035 = x_backbone_block_165NumDims;

        end

    end

end