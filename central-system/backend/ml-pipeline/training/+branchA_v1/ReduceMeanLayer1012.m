classdef ReduceMeanLayer1012 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v1.coder.ReduceMeanLayer1012';
        end
    end


    methods
        function this = ReduceMeanLayer1012(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_180'};
        end

        function [x_backbone_block_180] = predict(this, x_backbone_block_174)
            if isdlarray(x_backbone_block_174)
                x_backbone_block_174 = stripdims(x_backbone_block_174);
            end
            x_backbone_block_174NumDims = 4;
            x_backbone_block_174 = branchA_v1.ops.permuteInputVar(x_backbone_block_174, [4 3 1 2], 4);

            [x_backbone_block_180, x_backbone_block_180NumDims] = ReduceMeanGraph1036(this, x_backbone_block_174, x_backbone_block_174NumDims, false);
            x_backbone_block_180 = branchA_v1.ops.permuteOutputVar(x_backbone_block_180, [3 4 2 1], 4);

            x_backbone_block_180 = dlarray(single(x_backbone_block_180), 'SSCB');
        end

        function [x_backbone_block_180] = forward(this, x_backbone_block_174)
            if isdlarray(x_backbone_block_174)
                x_backbone_block_174 = stripdims(x_backbone_block_174);
            end
            x_backbone_block_174NumDims = 4;
            x_backbone_block_174 = branchA_v1.ops.permuteInputVar(x_backbone_block_174, [4 3 1 2], 4);

            [x_backbone_block_180, x_backbone_block_180NumDims] = ReduceMeanGraph1036(this, x_backbone_block_174, x_backbone_block_174NumDims, true);
            x_backbone_block_180 = branchA_v1.ops.permuteOutputVar(x_backbone_block_180, [3 4 2 1], 4);

            x_backbone_block_180 = dlarray(single(x_backbone_block_180), 'SSCB');
        end

        function [x_backbone_block_180, x_backbone_block_180NumDims1038] = ReduceMeanGraph1036(this, x_backbone_block_174, x_backbone_block_174NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v1.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1037, x_backbone_block_174NumDims);
            xMean = mean(x_backbone_block_174, dims);
            x_backbone_block_180 = xMean;
            x_backbone_block_180NumDims = x_backbone_block_174NumDims;

            % Set graph output arguments
            x_backbone_block_180NumDims1038 = x_backbone_block_180NumDims;

        end

    end

end