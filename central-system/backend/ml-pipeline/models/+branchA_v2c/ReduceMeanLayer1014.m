classdef ReduceMeanLayer1014 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2c.coder.ReduceMeanLayer1014';
        end
    end


    methods
        function this = ReduceMeanLayer1014(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_210'};
        end

        function [x_backbone_block_210] = predict(this, x_backbone_block_204)
            if isdlarray(x_backbone_block_204)
                x_backbone_block_204 = stripdims(x_backbone_block_204);
            end
            x_backbone_block_204NumDims = 4;
            x_backbone_block_204 = branchA_v2c.ops.permuteInputVar(x_backbone_block_204, [4 3 1 2], 4);

            [x_backbone_block_210, x_backbone_block_210NumDims] = ReduceMeanGraph1042(this, x_backbone_block_204, x_backbone_block_204NumDims, false);
            x_backbone_block_210 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_210, [3 4 2 1], 4);

            x_backbone_block_210 = dlarray(single(x_backbone_block_210), 'SSCB');
        end

        function [x_backbone_block_210] = forward(this, x_backbone_block_204)
            if isdlarray(x_backbone_block_204)
                x_backbone_block_204 = stripdims(x_backbone_block_204);
            end
            x_backbone_block_204NumDims = 4;
            x_backbone_block_204 = branchA_v2c.ops.permuteInputVar(x_backbone_block_204, [4 3 1 2], 4);

            [x_backbone_block_210, x_backbone_block_210NumDims] = ReduceMeanGraph1042(this, x_backbone_block_204, x_backbone_block_204NumDims, true);
            x_backbone_block_210 = branchA_v2c.ops.permuteOutputVar(x_backbone_block_210, [3 4 2 1], 4);

            x_backbone_block_210 = dlarray(single(x_backbone_block_210), 'SSCB');
        end

        function [x_backbone_block_210, x_backbone_block_210NumDims1044] = ReduceMeanGraph1042(this, x_backbone_block_204, x_backbone_block_204NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2c.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1043, x_backbone_block_204NumDims);
            xMean = mean(x_backbone_block_204, dims);
            x_backbone_block_210 = xMean;
            x_backbone_block_210NumDims = x_backbone_block_204NumDims;

            % Set graph output arguments
            x_backbone_block_210NumDims1044 = x_backbone_block_210NumDims;

        end

    end

end