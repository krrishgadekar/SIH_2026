classdef ReduceMeanLayer1012 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v2c.coder.ReduceMeanLayer1012(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v2c.ReduceMeanLayer1012(cgInstance.Name);
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
        function this = ReduceMeanLayer1012(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_block_180'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = branchA_v2c.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_backbone_block_180] = predict(this, x_backbone_block_174__)
            if isdlarray(x_backbone_block_174__)
                x_backbone_block_174_ = stripdims(x_backbone_block_174__);
            else
                x_backbone_block_174_ = x_backbone_block_174__;
            end
            x_backbone_block_174NumDims = 4;
            x_backbone_block_174 = branchA_v2c.coder.ops.permuteInputVar(x_backbone_block_174_, [4 3 1 2], 4);

            [x_backbone_block_180__, x_backbone_block_180NumDims__] = ReduceMeanGraph1036(this, x_backbone_block_174, x_backbone_block_174NumDims, false);
            x_backbone_block_180_ = branchA_v2c.coder.ops.permuteOutputVar(x_backbone_block_180__, [3 4 2 1], 4);

            x_backbone_block_180 = dlarray(single(x_backbone_block_180_), 'SSCB');
        end

        function [x_backbone_block_180, x_backbone_block_180NumDims1038] = ReduceMeanGraph1036(this, x_backbone_block_174, x_backbone_block_174NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1024 = branchA_v2c.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1037, coder.const(x_backbone_block_174NumDims));
            xReduced1025 = mean(x_backbone_block_174, dims1024);
            x_backbone_block_180 = xReduced1025;
            x_backbone_block_180NumDims = coder.const(x_backbone_block_174NumDims);

            % Set graph output arguments
            x_backbone_block_180NumDims1038 = coder.const(x_backbone_block_180NumDims);

        end

    end

end