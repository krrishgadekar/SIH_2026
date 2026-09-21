classdef ReduceMeanLayer1003 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2b.coder.ReduceMeanLayer1003';
        end
    end


    methods
        function this = ReduceMeanLayer1003(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_blocks_48'};
        end

        function [x_backbone_blocks_48] = predict(this, x_backbone_blocks_42)
            if isdlarray(x_backbone_blocks_42)
                x_backbone_blocks_42 = stripdims(x_backbone_blocks_42);
            end
            x_backbone_blocks_42NumDims = 4;
            x_backbone_blocks_42 = branchA_v2b.ops.permuteInputVar(x_backbone_blocks_42, [4 3 1 2], 4);

            [x_backbone_blocks_48, x_backbone_blocks_48NumDims] = ReduceMeanGraph1009(this, x_backbone_blocks_42, x_backbone_blocks_42NumDims, false);
            x_backbone_blocks_48 = branchA_v2b.ops.permuteOutputVar(x_backbone_blocks_48, [3 4 2 1], 4);

            x_backbone_blocks_48 = dlarray(single(x_backbone_blocks_48), 'SSCB');
        end

        function [x_backbone_blocks_48] = forward(this, x_backbone_blocks_42)
            if isdlarray(x_backbone_blocks_42)
                x_backbone_blocks_42 = stripdims(x_backbone_blocks_42);
            end
            x_backbone_blocks_42NumDims = 4;
            x_backbone_blocks_42 = branchA_v2b.ops.permuteInputVar(x_backbone_blocks_42, [4 3 1 2], 4);

            [x_backbone_blocks_48, x_backbone_blocks_48NumDims] = ReduceMeanGraph1009(this, x_backbone_blocks_42, x_backbone_blocks_42NumDims, true);
            x_backbone_blocks_48 = branchA_v2b.ops.permuteOutputVar(x_backbone_blocks_48, [3 4 2 1], 4);

            x_backbone_blocks_48 = dlarray(single(x_backbone_blocks_48), 'SSCB');
        end

        function [x_backbone_blocks_48, x_backbone_blocks_48NumDims1011] = ReduceMeanGraph1009(this, x_backbone_blocks_42, x_backbone_blocks_42NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2b.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1010, x_backbone_blocks_42NumDims);
            xMean = mean(x_backbone_blocks_42, dims);
            x_backbone_blocks_48 = xMean;
            x_backbone_blocks_48NumDims = x_backbone_blocks_42NumDims;

            % Set graph output arguments
            x_backbone_blocks_48NumDims1011 = x_backbone_blocks_48NumDims;

        end

    end

end