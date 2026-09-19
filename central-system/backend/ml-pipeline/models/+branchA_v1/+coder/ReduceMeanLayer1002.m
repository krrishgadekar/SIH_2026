classdef ReduceMeanLayer1002 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v1.coder.ReduceMeanLayer1002(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v1.ReduceMeanLayer1002(cgInstance.Name);
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
        function this = ReduceMeanLayer1002(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_blocks_34'};
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

        function [x_backbone_blocks_34] = predict(this, x_backbone_blocks_28__)
            if isdlarray(x_backbone_blocks_28__)
                x_backbone_blocks_28_ = stripdims(x_backbone_blocks_28__);
            else
                x_backbone_blocks_28_ = x_backbone_blocks_28__;
            end
            x_backbone_blocks_28NumDims = 4;
            x_backbone_blocks_28 = branchA_v1.coder.ops.permuteInputVar(x_backbone_blocks_28_, [4 3 1 2], 4);

            [x_backbone_blocks_34__, x_backbone_blocks_34NumDims__] = ReduceMeanGraph1006(this, x_backbone_blocks_28, x_backbone_blocks_28NumDims, false);
            x_backbone_blocks_34_ = branchA_v1.coder.ops.permuteOutputVar(x_backbone_blocks_34__, [3 4 2 1], 4);

            x_backbone_blocks_34 = dlarray(single(x_backbone_blocks_34_), 'SSCB');
        end

        function [x_backbone_blocks_34, x_backbone_blocks_34NumDims1008] = ReduceMeanGraph1006(this, x_backbone_blocks_28, x_backbone_blocks_28NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1004 = branchA_v1.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1007, coder.const(x_backbone_blocks_28NumDims));
            xReduced1005 = mean(x_backbone_blocks_28, dims1004);
            x_backbone_blocks_34 = xReduced1005;
            x_backbone_blocks_34NumDims = coder.const(x_backbone_blocks_28NumDims);

            % Set graph output arguments
            x_backbone_blocks_34NumDims1008 = coder.const(x_backbone_blocks_34NumDims);

        end

    end

end