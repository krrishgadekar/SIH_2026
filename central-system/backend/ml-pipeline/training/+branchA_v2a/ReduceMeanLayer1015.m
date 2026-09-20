classdef ReduceMeanLayer1015 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2a.coder.ReduceMeanLayer1015';
        end
    end


    methods
        function this = ReduceMeanLayer1015(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_224'};
        end

        function [x_backbone_block_224] = predict(this, x_backbone_block_218)
            if isdlarray(x_backbone_block_218)
                x_backbone_block_218 = stripdims(x_backbone_block_218);
            end
            x_backbone_block_218NumDims = 4;
            x_backbone_block_218 = branchA_v2a.ops.permuteInputVar(x_backbone_block_218, [4 3 1 2], 4);

            [x_backbone_block_224, x_backbone_block_224NumDims] = ReduceMeanGraph1045(this, x_backbone_block_218, x_backbone_block_218NumDims, false);
            x_backbone_block_224 = branchA_v2a.ops.permuteOutputVar(x_backbone_block_224, [3 4 2 1], 4);

            x_backbone_block_224 = dlarray(single(x_backbone_block_224), 'SSCB');
        end

        function [x_backbone_block_224] = forward(this, x_backbone_block_218)
            if isdlarray(x_backbone_block_218)
                x_backbone_block_218 = stripdims(x_backbone_block_218);
            end
            x_backbone_block_218NumDims = 4;
            x_backbone_block_218 = branchA_v2a.ops.permuteInputVar(x_backbone_block_218, [4 3 1 2], 4);

            [x_backbone_block_224, x_backbone_block_224NumDims] = ReduceMeanGraph1045(this, x_backbone_block_218, x_backbone_block_218NumDims, true);
            x_backbone_block_224 = branchA_v2a.ops.permuteOutputVar(x_backbone_block_224, [3 4 2 1], 4);

            x_backbone_block_224 = dlarray(single(x_backbone_block_224), 'SSCB');
        end

        function [x_backbone_block_224, x_backbone_block_224NumDims1047] = ReduceMeanGraph1045(this, x_backbone_block_218, x_backbone_block_218NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2a.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1046, x_backbone_block_218NumDims);
            xMean = mean(x_backbone_block_218, dims);
            x_backbone_block_224 = xMean;
            x_backbone_block_224NumDims = x_backbone_block_218NumDims;

            % Set graph output arguments
            x_backbone_block_224NumDims1047 = x_backbone_block_224NumDims;

        end

    end

end