classdef ReduceMeanLayer1004 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2a.coder.ReduceMeanLayer1004';
        end
    end


    methods
        function this = ReduceMeanLayer1004(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_blocks_63'};
        end

        function [x_backbone_blocks_63] = predict(this, x_backbone_blocks_57)
            if isdlarray(x_backbone_blocks_57)
                x_backbone_blocks_57 = stripdims(x_backbone_blocks_57);
            end
            x_backbone_blocks_57NumDims = 4;
            x_backbone_blocks_57 = branchA_v2a.ops.permuteInputVar(x_backbone_blocks_57, [4 3 1 2], 4);

            [x_backbone_blocks_63, x_backbone_blocks_63NumDims] = ReduceMeanGraph1012(this, x_backbone_blocks_57, x_backbone_blocks_57NumDims, false);
            x_backbone_blocks_63 = branchA_v2a.ops.permuteOutputVar(x_backbone_blocks_63, [3 4 2 1], 4);

            x_backbone_blocks_63 = dlarray(single(x_backbone_blocks_63), 'SSCB');
        end

        function [x_backbone_blocks_63] = forward(this, x_backbone_blocks_57)
            if isdlarray(x_backbone_blocks_57)
                x_backbone_blocks_57 = stripdims(x_backbone_blocks_57);
            end
            x_backbone_blocks_57NumDims = 4;
            x_backbone_blocks_57 = branchA_v2a.ops.permuteInputVar(x_backbone_blocks_57, [4 3 1 2], 4);

            [x_backbone_blocks_63, x_backbone_blocks_63NumDims] = ReduceMeanGraph1012(this, x_backbone_blocks_57, x_backbone_blocks_57NumDims, true);
            x_backbone_blocks_63 = branchA_v2a.ops.permuteOutputVar(x_backbone_blocks_63, [3 4 2 1], 4);

            x_backbone_blocks_63 = dlarray(single(x_backbone_blocks_63), 'SSCB');
        end

        function [x_backbone_blocks_63, x_backbone_blocks_63NumDims1014] = ReduceMeanGraph1012(this, x_backbone_blocks_57, x_backbone_blocks_57NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2a.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1013, x_backbone_blocks_57NumDims);
            xMean = mean(x_backbone_blocks_57, dims);
            x_backbone_blocks_63 = xMean;
            x_backbone_blocks_63NumDims = x_backbone_blocks_57NumDims;

            % Set graph output arguments
            x_backbone_blocks_63NumDims1014 = x_backbone_blocks_63NumDims;

        end

    end

end