classdef ReduceMeanLayer1001 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2b.coder.ReduceMeanLayer1001';
        end
    end


    methods
        function this = ReduceMeanLayer1001(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_blocks_19'};
        end

        function [x_backbone_blocks_19] = predict(this, x_backbone_blocks_13)
            if isdlarray(x_backbone_blocks_13)
                x_backbone_blocks_13 = stripdims(x_backbone_blocks_13);
            end
            x_backbone_blocks_13NumDims = 4;
            x_backbone_blocks_13 = branchA_v2b.ops.permuteInputVar(x_backbone_blocks_13, [4 3 1 2], 4);

            [x_backbone_blocks_19, x_backbone_blocks_19NumDims] = ReduceMeanGraph1003(this, x_backbone_blocks_13, x_backbone_blocks_13NumDims, false);
            x_backbone_blocks_19 = branchA_v2b.ops.permuteOutputVar(x_backbone_blocks_19, [3 4 2 1], 4);

            x_backbone_blocks_19 = dlarray(single(x_backbone_blocks_19), 'SSCB');
        end

        function [x_backbone_blocks_19] = forward(this, x_backbone_blocks_13)
            if isdlarray(x_backbone_blocks_13)
                x_backbone_blocks_13 = stripdims(x_backbone_blocks_13);
            end
            x_backbone_blocks_13NumDims = 4;
            x_backbone_blocks_13 = branchA_v2b.ops.permuteInputVar(x_backbone_blocks_13, [4 3 1 2], 4);

            [x_backbone_blocks_19, x_backbone_blocks_19NumDims] = ReduceMeanGraph1003(this, x_backbone_blocks_13, x_backbone_blocks_13NumDims, true);
            x_backbone_blocks_19 = branchA_v2b.ops.permuteOutputVar(x_backbone_blocks_19, [3 4 2 1], 4);

            x_backbone_blocks_19 = dlarray(single(x_backbone_blocks_19), 'SSCB');
        end

        function [x_backbone_blocks_19, x_backbone_blocks_19NumDims1005] = ReduceMeanGraph1003(this, x_backbone_blocks_13, x_backbone_blocks_13NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2b.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1004, x_backbone_blocks_13NumDims);
            xMean = mean(x_backbone_blocks_13, dims);
            x_backbone_blocks_19 = xMean;
            x_backbone_blocks_19NumDims = x_backbone_blocks_13NumDims;

            % Set graph output arguments
            x_backbone_blocks_19NumDims1005 = x_backbone_blocks_19NumDims;

        end

    end

end