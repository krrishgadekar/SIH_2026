classdef ReduceMeanLayer1015 < nnet.layer.Layer & nnet.layer.Formattable
    % A custom layer auto-generated while importing an ONNX network.
    %#codegen

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
        % Specify the properties of the class that will not be modified
        % after the first assignment.
        function p = matlabCodegenNontunableProperties(~)
            p = {
                % Constants, i.e., Vars, NumDims and all learnables and states
                'Vars'
                'NumDims'
                };
        end
    end


    methods(Static, Hidden)
        % Instantiate a codegenable layer instance from a MATLAB layer instance
        function this_cg = matlabCodegenToRedirected(mlInstance)
            this_cg = branchA_v1.coder.ReduceMeanLayer1015(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v1.ReduceMeanLayer1015(cgInstance.Name);
            if isstruct(cgInstance.Vars)
                names = fieldnames(cgInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this_ml.Vars.(fieldname) = dlarray(cgInstance.Vars.(fieldname));
                end
            else
                this_ml.Vars = [];
            end
            this_ml.NumDims = cgInstance.NumDims;
        end
    end

    methods
        function this = ReduceMeanLayer1015(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_block_224'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = branchA_v1.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_backbone_block_224] = predict(this, x_backbone_block_218__)
            if isdlarray(x_backbone_block_218__)
                x_backbone_block_218_ = stripdims(x_backbone_block_218__);
            else
                x_backbone_block_218_ = x_backbone_block_218__;
            end
            x_backbone_block_218NumDims = 4;
            x_backbone_block_218 = branchA_v1.coder.ops.permuteInputVar(x_backbone_block_218_, [4 3 1 2], 4);

            [x_backbone_block_224__, x_backbone_block_224NumDims__] = ReduceMeanGraph1045(this, x_backbone_block_218, x_backbone_block_218NumDims, false);
            x_backbone_block_224_ = branchA_v1.coder.ops.permuteOutputVar(x_backbone_block_224__, [3 4 2 1], 4);

            x_backbone_block_224 = dlarray(single(x_backbone_block_224_), 'SSCB');
        end

        function [x_backbone_block_224, x_backbone_block_224NumDims1047] = ReduceMeanGraph1045(this, x_backbone_block_218, x_backbone_block_218NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1030 = branchA_v1.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1046, coder.const(x_backbone_block_218NumDims));
            xReduced1031 = mean(x_backbone_block_218, dims1030);
            x_backbone_block_224 = xReduced1031;
            x_backbone_block_224NumDims = coder.const(x_backbone_block_218NumDims);

            % Set graph output arguments
            x_backbone_block_224NumDims1047 = coder.const(x_backbone_block_224NumDims);

        end

    end

end