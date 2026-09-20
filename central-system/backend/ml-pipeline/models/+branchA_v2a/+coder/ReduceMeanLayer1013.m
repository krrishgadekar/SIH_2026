classdef ReduceMeanLayer1013 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v2a.coder.ReduceMeanLayer1013(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v2a.ReduceMeanLayer1013(cgInstance.Name);
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
        function this = ReduceMeanLayer1013(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_block_195'};
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

        function [x_backbone_block_195] = predict(this, x_backbone_block_189__)
            if isdlarray(x_backbone_block_189__)
                x_backbone_block_189_ = stripdims(x_backbone_block_189__);
            else
                x_backbone_block_189_ = x_backbone_block_189__;
            end
            x_backbone_block_189NumDims = 4;
            x_backbone_block_189 = branchA_v2a.coder.ops.permuteInputVar(x_backbone_block_189_, [4 3 1 2], 4);

            [x_backbone_block_195__, x_backbone_block_195NumDims__] = ReduceMeanGraph1039(this, x_backbone_block_189, x_backbone_block_189NumDims, false);
            x_backbone_block_195_ = branchA_v2a.coder.ops.permuteOutputVar(x_backbone_block_195__, [3 4 2 1], 4);

            x_backbone_block_195 = dlarray(single(x_backbone_block_195_), 'SSCB');
        end

        function [x_backbone_block_195, x_backbone_block_195NumDims1041] = ReduceMeanGraph1039(this, x_backbone_block_189, x_backbone_block_189NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1026 = branchA_v2a.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1040, coder.const(x_backbone_block_189NumDims));
            xReduced1027 = mean(x_backbone_block_189, dims1026);
            x_backbone_block_195 = xReduced1027;
            x_backbone_block_195NumDims = coder.const(x_backbone_block_189NumDims);

            % Set graph output arguments
            x_backbone_block_195NumDims1041 = coder.const(x_backbone_block_195NumDims);

        end

    end

end