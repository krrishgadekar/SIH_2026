classdef ReduceMeanLayer1010 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v1.coder.ReduceMeanLayer1010(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v1.ReduceMeanLayer1010(cgInstance.Name);
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
        function this = ReduceMeanLayer1010(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_block_151'};
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

        function [x_backbone_block_151] = predict(this, x_backbone_block_145__)
            if isdlarray(x_backbone_block_145__)
                x_backbone_block_145_ = stripdims(x_backbone_block_145__);
            else
                x_backbone_block_145_ = x_backbone_block_145__;
            end
            x_backbone_block_145NumDims = 4;
            x_backbone_block_145 = branchA_v1.coder.ops.permuteInputVar(x_backbone_block_145_, [4 3 1 2], 4);

            [x_backbone_block_151__, x_backbone_block_151NumDims__] = ReduceMeanGraph1030(this, x_backbone_block_145, x_backbone_block_145NumDims, false);
            x_backbone_block_151_ = branchA_v1.coder.ops.permuteOutputVar(x_backbone_block_151__, [3 4 2 1], 4);

            x_backbone_block_151 = dlarray(single(x_backbone_block_151_), 'SSCB');
        end

        function [x_backbone_block_151, x_backbone_block_151NumDims1032] = ReduceMeanGraph1030(this, x_backbone_block_145, x_backbone_block_145NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1020 = branchA_v1.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1031, coder.const(x_backbone_block_145NumDims));
            xReduced1021 = mean(x_backbone_block_145, dims1020);
            x_backbone_block_151 = xReduced1021;
            x_backbone_block_151NumDims = coder.const(x_backbone_block_145NumDims);

            % Set graph output arguments
            x_backbone_block_151NumDims1032 = coder.const(x_backbone_block_151NumDims);

        end

    end

end