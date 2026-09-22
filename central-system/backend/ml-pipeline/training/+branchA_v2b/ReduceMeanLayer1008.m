classdef ReduceMeanLayer1008 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'branchA_v2b.coder.ReduceMeanLayer1008';
        end
    end


    methods
        function this = ReduceMeanLayer1008(name)
            this.Name = name;
            this.OutputNames = {'x_backbone_block_121'};
        end

        function [x_backbone_block_121] = predict(this, x_backbone_block_115)
            if isdlarray(x_backbone_block_115)
                x_backbone_block_115 = stripdims(x_backbone_block_115);
            end
            x_backbone_block_115NumDims = 4;
            x_backbone_block_115 = branchA_v2b.ops.permuteInputVar(x_backbone_block_115, [4 3 1 2], 4);

            [x_backbone_block_121, x_backbone_block_121NumDims] = ReduceMeanGraph1024(this, x_backbone_block_115, x_backbone_block_115NumDims, false);
            x_backbone_block_121 = branchA_v2b.ops.permuteOutputVar(x_backbone_block_121, [3 4 2 1], 4);

            x_backbone_block_121 = dlarray(single(x_backbone_block_121), 'SSCB');
        end

        function [x_backbone_block_121] = forward(this, x_backbone_block_115)
            if isdlarray(x_backbone_block_115)
                x_backbone_block_115 = stripdims(x_backbone_block_115);
            end
            x_backbone_block_115NumDims = 4;
            x_backbone_block_115 = branchA_v2b.ops.permuteInputVar(x_backbone_block_115, [4 3 1 2], 4);

            [x_backbone_block_121, x_backbone_block_121NumDims] = ReduceMeanGraph1024(this, x_backbone_block_115, x_backbone_block_115NumDims, true);
            x_backbone_block_121 = branchA_v2b.ops.permuteOutputVar(x_backbone_block_121, [3 4 2 1], 4);

            x_backbone_block_121 = dlarray(single(x_backbone_block_121), 'SSCB');
        end

        function [x_backbone_block_121, x_backbone_block_121NumDims1026] = ReduceMeanGraph1024(this, x_backbone_block_115, x_backbone_block_115NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims = branchA_v2b.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1025, x_backbone_block_115NumDims);
            xMean = mean(x_backbone_block_115, dims);
            x_backbone_block_121 = xMean;
            x_backbone_block_121NumDims = x_backbone_block_115NumDims;

            % Set graph output arguments
            x_backbone_block_121NumDims1026 = x_backbone_block_121NumDims;

        end

    end

end