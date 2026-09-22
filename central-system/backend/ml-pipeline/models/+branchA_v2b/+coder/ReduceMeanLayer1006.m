classdef ReduceMeanLayer1006 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v2b.coder.ReduceMeanLayer1006(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v2b.ReduceMeanLayer1006(cgInstance.Name);
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
        function this = ReduceMeanLayer1006(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_blocks_92'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = branchA_v2b.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_backbone_blocks_92] = predict(this, x_backbone_blocks_86__)
            if isdlarray(x_backbone_blocks_86__)
                x_backbone_blocks_86_ = stripdims(x_backbone_blocks_86__);
            else
                x_backbone_blocks_86_ = x_backbone_blocks_86__;
            end
            x_backbone_blocks_86NumDims = 4;
            x_backbone_blocks_86 = branchA_v2b.coder.ops.permuteInputVar(x_backbone_blocks_86_, [4 3 1 2], 4);

            [x_backbone_blocks_92__, x_backbone_blocks_92NumDims__] = ReduceMeanGraph1018(this, x_backbone_blocks_86, x_backbone_blocks_86NumDims, false);
            x_backbone_blocks_92_ = branchA_v2b.coder.ops.permuteOutputVar(x_backbone_blocks_92__, [3 4 2 1], 4);

            x_backbone_blocks_92 = dlarray(single(x_backbone_blocks_92_), 'SSCB');
        end

        function [x_backbone_blocks_92, x_backbone_blocks_92NumDims1020] = ReduceMeanGraph1018(this, x_backbone_blocks_86, x_backbone_blocks_86NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1012 = branchA_v2b.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1019, coder.const(x_backbone_blocks_86NumDims));
            xReduced1013 = mean(x_backbone_blocks_86, dims1012);
            x_backbone_blocks_92 = xReduced1013;
            x_backbone_blocks_92NumDims = coder.const(x_backbone_blocks_86NumDims);

            % Set graph output arguments
            x_backbone_blocks_92NumDims1020 = coder.const(x_backbone_blocks_92NumDims);

        end

    end

end