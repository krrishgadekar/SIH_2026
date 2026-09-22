classdef ReduceMeanLayer1010 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2c.coder.ReduceMeanLayer1010';
        end
    end


    methods
        function this = ReduceMeanLayer1010(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_151'};
        end

        function [x_backbone_block_151] = predict(this, x_backbone_block_145)
            if isdlarray(x_backbone_block_145)
                x_backbone_block_145 = stripdims(x_backbone_block_145);
            end
            x_backbone_block_145NumDims = 4;
            x_backbone_block_145 = branchA_v2c.ops.permuteInputVar(x_backbone_block_145, [4 3 1 2], 4);

            [x_backbone_block_151, x_backbone_block_151NumDims] = ReduceMeanGraph1030(this, x_backbone_block_145, x_backbone_block_145NumDims, false);
            x_backbone_block_151 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_151, [3 4 2 1], 4);

            x_backbone_block_151 = dlarray(single(x_backbone_block_151), 'SSCB');
        end

        function [x_backbone_block_151] = forward(this, x_backbone_block_145)
            if isdlarray(x_backbone_block_145)
                x_backbone_block_145 = stripdims(x_backbone_block_145);
            end
            x_backbone_block_145NumDims = 4;
            x_backbone_block_145 = branchA_v2c.ops.permuteInputVar(x_backbone_block_145, [4 3 1 2], 4);

            [x_backbone_block_151, x_backbone_block_151NumDims] = ReduceMeanGraph1030(this, x_backbone_block_145, x_backbone_block_145NumDims, true);
            x_backbone_block_151 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_151, [3 4 2 1], 4);

            x_backbone_block_151 = dlarray(single(x_backbone_block_151), 'SSCB');
        end

        function [x_backbone_block_151, x_backbone_block_151NumDims1032] = ReduceMeanGraph1030(this, x_backbone_block_145, x_backbone_block_145NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2c.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1031, x_backbone_block_145NumDims);
            xMean = mean(x_backbone_block_145, dims);
            x_backbone_block_151 = xMean;
            x_backbone_block_151NumDims = x_backbone_block_145NumDims;

            % Set graph output arguments
            x_backbone_block_151NumDims1032 = x_backbone_block_151NumDims;

        end

    end

end