classdef ReduceMeanLayer1007 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2a.coder.ReduceMeanLayer1007';
        end
    end


    methods
        function this = ReduceMeanLayer1007(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_107'};
        end

        function [x_backbone_block_107] = predict(this, x_backbone_block_101)
            if isdlarray(x_backbone_block_101)
                x_backbone_block_101 = stripdims(x_backbone_block_101);
            end
            x_backbone_block_101NumDims = 4;
            x_backbone_block_101 = branchA_v2a.ops.permuteInputVar(x_backbone_block_101, [4 3 1 2], 4);

            [x_backbone_block_107, x_backbone_block_107NumDims] = ReduceMeanGraph1021(this, x_backbone_block_101, x_backbone_block_101NumDims, false);
            x_backbone_block_107 = branchA_v2a.ops.permuteOutputVar(x_backbone_block_107, [3 4 2 1], 4);

            x_backbone_block_107 = dlarray(single(x_backbone_block_107), 'SSCB');
        end

        function [x_backbone_block_107] = forward(this, x_backbone_block_101)
            if isdlarray(x_backbone_block_101)
                x_backbone_block_101 = stripdims(x_backbone_block_101);
            end
            x_backbone_block_101NumDims = 4;
            x_backbone_block_101 = branchA_v2a.ops.permuteInputVar(x_backbone_block_101, [4 3 1 2], 4);

            [x_backbone_block_107, x_backbone_block_107NumDims] = ReduceMeanGraph1021(this, x_backbone_block_101, x_backbone_block_101NumDims, true);
            x_backbone_block_107 = branchA_v2a.ops.permuteOutputVar(x_backbone_block_107, [3 4 2 1], 4);

            x_backbone_block_107 = dlarray(single(x_backbone_block_107), 'SSCB');
        end

        function [x_backbone_block_107, x_backbone_block_107NumDims1023] = ReduceMeanGraph1021(this, x_backbone_block_101, x_backbone_block_101NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2a.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1022, x_backbone_block_101NumDims);
            xMean = mean(x_backbone_block_101, dims);
            x_backbone_block_107 = xMean;
            x_backbone_block_107NumDims = x_backbone_block_101NumDims;

            % Set graph output arguments
            x_backbone_block_107NumDims1023 = x_backbone_block_107NumDims;

        end

    end

end