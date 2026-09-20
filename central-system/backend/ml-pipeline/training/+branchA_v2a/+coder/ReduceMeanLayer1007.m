classdef ReduceMeanLayer1007 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v2a.coder.ReduceMeanLayer1007(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v2a.ReduceMeanLayer1007(cgInstance.Name);
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
        function this = ReduceMeanLayer1007(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_block_107'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = branchA_v2a.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_backbone_block_107] = predict(this, x_backbone_block_101__)
            if isdlarray(x_backbone_block_101__)
                x_backbone_block_101_ = stripdims(x_backbone_block_101__);
            else
                x_backbone_block_101_ = x_backbone_block_101__;
            end
            x_backbone_block_101NumDims = 4;
            x_backbone_block_101 = branchA_v2a.coder.ops.permuteInputVar(x_backbone_block_101_, [4 3 1 2], 4);

            [x_backbone_block_107__, x_backbone_block_107NumDims__] = ReduceMeanGraph1021(this, x_backbone_block_101, x_backbone_block_101NumDims, false);
            x_backbone_block_107_ = branchA_v2a.coder.ops.permuteOutputVar(x_backbone_block_107__, [3 4 2 1], 4);

            x_backbone_block_107 = dlarray(single(x_backbone_block_107_), 'SSCB');
        end

        function [x_backbone_block_107, x_backbone_block_107NumDims1023] = ReduceMeanGraph1021(this, x_backbone_block_101, x_backbone_block_101NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1014 = branchA_v2a.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1022, coder.const(x_backbone_block_101NumDims));
            xReduced1015 = mean(x_backbone_block_101, dims1014);
            x_backbone_block_107 = xReduced1015;
            x_backbone_block_107NumDims = coder.const(x_backbone_block_101NumDims);

            % Set graph output arguments
            x_backbone_block_107NumDims1023 = coder.const(x_backbone_block_107NumDims);

        end

    end

end