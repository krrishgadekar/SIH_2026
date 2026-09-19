classdef ReduceMeanLayer1011 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v1.coder.ReduceMeanLayer1011(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v1.ReduceMeanLayer1011(cgInstance.Name);
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
        function this = ReduceMeanLayer1011(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_block_165'};
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

        function [x_backbone_block_165] = predict(this, x_backbone_block_159__)
            if isdlarray(x_backbone_block_159__)
                x_backbone_block_159_ = stripdims(x_backbone_block_159__);
            else
                x_backbone_block_159_ = x_backbone_block_159__;
            end
            x_backbone_block_159NumDims = 4;
            x_backbone_block_159 = branchA_v1.coder.ops.permuteInputVar(x_backbone_block_159_, [4 3 1 2], 4);

            [x_backbone_block_165__, x_backbone_block_165NumDims__] = ReduceMeanGraph1033(this, x_backbone_block_159, x_backbone_block_159NumDims, false);
            x_backbone_block_165_ = branchA_v1.coder.ops.permuteOutputVar(x_backbone_block_165__, [3 4 2 1], 4);

            x_backbone_block_165 = dlarray(single(x_backbone_block_165_), 'SSCB');
        end

        function [x_backbone_block_165, x_backbone_block_165NumDims1035] = ReduceMeanGraph1033(this, x_backbone_block_159, x_backbone_block_159NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1022 = branchA_v1.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1034, coder.const(x_backbone_block_159NumDims));
            xReduced1023 = mean(x_backbone_block_159, dims1022);
            x_backbone_block_165 = xReduced1023;
            x_backbone_block_165NumDims = coder.const(x_backbone_block_159NumDims);

            % Set graph output arguments
            x_backbone_block_165NumDims1035 = coder.const(x_backbone_block_165NumDims);

        end

    end

end