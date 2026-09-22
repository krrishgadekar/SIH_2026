classdef ReduceMeanLayer1005 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2b.coder.ReduceMeanLayer1005';
        end
    end


    methods
        function this = ReduceMeanLayer1005(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_blocks_77'};
        end

        function [x_backbone_blocks_77] = predict(this, x_backbone_blocks_71)
            if isdlarray(x_backbone_blocks_71)
                x_backbone_blocks_71 = stripdims(x_backbone_blocks_71);
            end
            x_backbone_blocks_71NumDims = 4;
            x_backbone_blocks_71 = branchA_v2b.ops.permuteInputVar(x_backbone_blocks_71, [4 3 1 2], 4);

            [x_backbone_blocks_77, x_backbone_blocks_77NumDims] = ReduceMeanGraph1015(this, x_backbone_blocks_71, x_backbone_blocks_71NumDims, false);
            x_backbone_blocks_77 = branchA_v2b.ops.permuteOutputVar(x_backbone_blocks_77, [3 4 2 1], 4);

            x_backbone_blocks_77 = dlarray(single(x_backbone_blocks_77), 'SSCB');
        end

        function [x_backbone_blocks_77] = forward(this, x_backbone_blocks_71)
            if isdlarray(x_backbone_blocks_71)
                x_backbone_blocks_71 = stripdims(x_backbone_blocks_71);
            end
            x_backbone_blocks_71NumDims = 4;
            x_backbone_blocks_71 = branchA_v2b.ops.permuteInputVar(x_backbone_blocks_71, [4 3 1 2], 4);

            [x_backbone_blocks_77, x_backbone_blocks_77NumDims] = ReduceMeanGraph1015(this, x_backbone_blocks_71, x_backbone_blocks_71NumDims, true);
            x_backbone_blocks_77 = branchA_v2b.ops.permuteOutputVar(x_backbone_blocks_77, [3 4 2 1], 4);

            x_backbone_blocks_77 = dlarray(single(x_backbone_blocks_77), 'SSCB');
        end

        function [x_backbone_blocks_77, x_backbone_blocks_77NumDims1017] = ReduceMeanGraph1015(this, x_backbone_blocks_71, x_backbone_blocks_71NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2b.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1016, x_backbone_blocks_71NumDims);
            xMean = mean(x_backbone_blocks_71, dims);
            x_backbone_blocks_77 = xMean;
            x_backbone_blocks_77NumDims = x_backbone_blocks_71NumDims;

            % Set graph output arguments
            x_backbone_blocks_77NumDims1017 = x_backbone_blocks_77NumDims;

        end

    end

end