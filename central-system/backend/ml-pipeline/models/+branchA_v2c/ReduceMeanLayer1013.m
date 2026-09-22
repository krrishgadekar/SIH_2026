classdef ReduceMeanLayer1013 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2c.coder.ReduceMeanLayer1013';
        end
    end


    methods
        function this = ReduceMeanLayer1013(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_195'};
        end

        function [x_backbone_block_195] = predict(this, x_backbone_block_189)
            if isdlarray(x_backbone_block_189)
                x_backbone_block_189 = stripdims(x_backbone_block_189);
            end
            x_backbone_block_189NumDims = 4;
            x_backbone_block_189 = branchA_v2c.ops.permuteInputVar(x_backbone_block_189, [4 3 1 2], 4);

            [x_backbone_block_195, x_backbone_block_195NumDims] = ReduceMeanGraph1039(this, x_backbone_block_189, x_backbone_block_189NumDims, false);
            x_backbone_block_195 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_195, [3 4 2 1], 4);

            x_backbone_block_195 = dlarray(single(x_backbone_block_195), 'SSCB');
        end

        function [x_backbone_block_195] = forward(this, x_backbone_block_189)
            if isdlarray(x_backbone_block_189)
                x_backbone_block_189 = stripdims(x_backbone_block_189);
            end
            x_backbone_block_189NumDims = 4;
            x_backbone_block_189 = branchA_v2c.ops.permuteInputVar(x_backbone_block_189, [4 3 1 2], 4);

            [x_backbone_block_195, x_backbone_block_195NumDims] = ReduceMeanGraph1039(this, x_backbone_block_189, x_backbone_block_189NumDims, true);
            x_backbone_block_195 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_195, [3 4 2 1], 4);

            x_backbone_block_195 = dlarray(single(x_backbone_block_195), 'SSCB');
        end

        function [x_backbone_block_195, x_backbone_block_195NumDims1041] = ReduceMeanGraph1039(this, x_backbone_block_189, x_backbone_block_189NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2c.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1040, x_backbone_block_189NumDims);
            xMean = mean(x_backbone_block_189, dims);
            x_backbone_block_195 = xMean;
            x_backbone_block_195NumDims = x_backbone_block_189NumDims;

            % Set graph output arguments
            x_backbone_block_195NumDims1041 = x_backbone_block_195NumDims;

        end

    end

end