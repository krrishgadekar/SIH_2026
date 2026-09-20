classdef ReduceMeanLayer1002 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2a.coder.ReduceMeanLayer1002';
        end
    end


    methods
        function this = ReduceMeanLayer1002(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_blocks_34'};
        end

        function [x_backbone_blocks_34] = predict(this, x_backbone_blocks_28)
            if isdlarray(x_backbone_blocks_28)
                x_backbone_blocks_28 = stripdims(x_backbone_blocks_28);
            end
            x_backbone_blocks_28NumDims = 4;
            x_backbone_blocks_28 = branchA_v2a.ops.permuteInputVar(x_backbone_blocks_28, [4 3 1 2], 4);

            [x_backbone_blocks_34, x_backbone_blocks_34NumDims] = ReduceMeanGraph1006(this, x_backbone_blocks_28, x_backbone_blocks_28NumDims, false);
            x_backbone_blocks_34 = branchA_v2a.ops.permuteOutputVar(x_backbone_blocks_34, [3 4 2 1], 4);

            x_backbone_blocks_34 = dlarray(single(x_backbone_blocks_34), 'SSCB');
        end

        function [x_backbone_blocks_34] = forward(this, x_backbone_blocks_28)
            if isdlarray(x_backbone_blocks_28)
                x_backbone_blocks_28 = stripdims(x_backbone_blocks_28);
            end
            x_backbone_blocks_28NumDims = 4;
            x_backbone_blocks_28 = branchA_v2a.ops.permuteInputVar(x_backbone_blocks_28, [4 3 1 2], 4);

            [x_backbone_blocks_34, x_backbone_blocks_34NumDims] = ReduceMeanGraph1006(this, x_backbone_blocks_28, x_backbone_blocks_28NumDims, true);
            x_backbone_blocks_34 = branchA_v2a.ops.permuteOutputVar(x_backbone_blocks_34, [3 4 2 1], 4);

            x_backbone_blocks_34 = dlarray(single(x_backbone_blocks_34), 'SSCB');
        end

        function [x_backbone_blocks_34, x_backbone_blocks_34NumDims1008] = ReduceMeanGraph1006(this, x_backbone_blocks_28, x_backbone_blocks_28NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2a.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1007, x_backbone_blocks_28NumDims);
            xMean = mean(x_backbone_blocks_28, dims);
            x_backbone_blocks_34 = xMean;
            x_backbone_blocks_34NumDims = x_backbone_blocks_28NumDims;

            % Set graph output arguments
            x_backbone_blocks_34NumDims1008 = x_backbone_blocks_34NumDims;

        end

    end

end