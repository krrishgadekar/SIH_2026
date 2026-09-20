classdef ReduceMeanLayer1004 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v2a.coder.ReduceMeanLayer1004(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v2a.ReduceMeanLayer1004(cgInstance.Name);
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
        function this = ReduceMeanLayer1004(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_blocks_63'};
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

        function [x_backbone_blocks_63] = predict(this, x_backbone_blocks_57__)
            if isdlarray(x_backbone_blocks_57__)
                x_backbone_blocks_57_ = stripdims(x_backbone_blocks_57__);
            else
                x_backbone_blocks_57_ = x_backbone_blocks_57__;
            end
            x_backbone_blocks_57NumDims = 4;
            x_backbone_blocks_57 = branchA_v2a.coder.ops.permuteInputVar(x_backbone_blocks_57_, [4 3 1 2], 4);

            [x_backbone_blocks_63__, x_backbone_blocks_63NumDims__] = ReduceMeanGraph1012(this, x_backbone_blocks_57, x_backbone_blocks_57NumDims, false);
            x_backbone_blocks_63_ = branchA_v2a.coder.ops.permuteOutputVar(x_backbone_blocks_63__, [3 4 2 1], 4);

            x_backbone_blocks_63 = dlarray(single(x_backbone_blocks_63_), 'SSCB');
        end

        function [x_backbone_blocks_63, x_backbone_blocks_63NumDims1014] = ReduceMeanGraph1012(this, x_backbone_blocks_57, x_backbone_blocks_57NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1008 = branchA_v2a.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1013, coder.const(x_backbone_blocks_57NumDims));
            xReduced1009 = mean(x_backbone_blocks_57, dims1008);
            x_backbone_blocks_63 = xReduced1009;
            x_backbone_blocks_63NumDims = coder.const(x_backbone_blocks_57NumDims);

            % Set graph output arguments
            x_backbone_blocks_63NumDims1014 = coder.const(x_backbone_blocks_63NumDims);

        end

    end

end