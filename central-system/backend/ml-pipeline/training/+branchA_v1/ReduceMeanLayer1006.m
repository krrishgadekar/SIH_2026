classdef ReduceMeanLayer1006 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v1.coder.ReduceMeanLayer1006';
        end
    end


    methods
        function this = ReduceMeanLayer1006(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_blocks_92'};
        end

        function [x_backbone_blocks_92] = predict(this, x_backbone_blocks_86)
            if isdlarray(x_backbone_blocks_86)
                x_backbone_blocks_86 = stripdims(x_backbone_blocks_86);
            end
            x_backbone_blocks_86NumDims = 4;
            x_backbone_blocks_86 = branchA_v1.ops.permuteInputVar(x_backbone_blocks_86, [4 3 1 2], 4);

            [x_backbone_blocks_92, x_backbone_blocks_92NumDims] = ReduceMeanGraph1018(this, x_backbone_blocks_86, x_backbone_blocks_86NumDims, false);
            x_backbone_blocks_92 = branchA_v1.ops.permuteOutputVar(x_backbone_blocks_92, [3 4 2 1], 4);

            x_backbone_blocks_92 = dlarray(single(x_backbone_blocks_92), 'SSCB');
        end

        function [x_backbone_blocks_92] = forward(this, x_backbone_blocks_86)
            if isdlarray(x_backbone_blocks_86)
                x_backbone_blocks_86 = stripdims(x_backbone_blocks_86);
            end
            x_backbone_blocks_86NumDims = 4;
            x_backbone_blocks_86 = branchA_v1.ops.permuteInputVar(x_backbone_blocks_86, [4 3 1 2], 4);

            [x_backbone_blocks_92, x_backbone_blocks_92NumDims] = ReduceMeanGraph1018(this, x_backbone_blocks_86, x_backbone_blocks_86NumDims, true);
            x_backbone_blocks_92 = branchA_v1.ops.permuteOutputVar(x_backbone_blocks_92, [3 4 2 1], 4);

            x_backbone_blocks_92 = dlarray(single(x_backbone_blocks_92), 'SSCB');
        end

        function [x_backbone_blocks_92, x_backbone_blocks_92NumDims1020] = ReduceMeanGraph1018(this, x_backbone_blocks_86, x_backbone_blocks_86NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v1.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1019, x_backbone_blocks_86NumDims);
            xMean = mean(x_backbone_blocks_86, dims);
            x_backbone_blocks_92 = xMean;
            x_backbone_blocks_92NumDims = x_backbone_blocks_86NumDims;

            % Set graph output arguments
            x_backbone_blocks_92NumDims1020 = x_backbone_blocks_92NumDims;

        end

    end

end