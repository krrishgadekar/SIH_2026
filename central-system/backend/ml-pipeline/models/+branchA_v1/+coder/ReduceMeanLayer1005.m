classdef ReduceMeanLayer1005 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v1.coder.ReduceMeanLayer1005(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v1.ReduceMeanLayer1005(cgInstance.Name);
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
        function this = ReduceMeanLayer1005(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_blocks_77'};
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

        function [x_backbone_blocks_77] = predict(this, x_backbone_blocks_71__)
            if isdlarray(x_backbone_blocks_71__)
                x_backbone_blocks_71_ = stripdims(x_backbone_blocks_71__);
            else
                x_backbone_blocks_71_ = x_backbone_blocks_71__;
            end
            x_backbone_blocks_71NumDims = 4;
            x_backbone_blocks_71 = branchA_v1.coder.ops.permuteInputVar(x_backbone_blocks_71_, [4 3 1 2], 4);

            [x_backbone_blocks_77__, x_backbone_blocks_77NumDims__] = ReduceMeanGraph1015(this, x_backbone_blocks_71, x_backbone_blocks_71NumDims, false);
            x_backbone_blocks_77_ = branchA_v1.coder.ops.permuteOutputVar(x_backbone_blocks_77__, [3 4 2 1], 4);

            x_backbone_blocks_77 = dlarray(single(x_backbone_blocks_77_), 'SSCB');
        end

        function [x_backbone_blocks_77, x_backbone_blocks_77NumDims1017] = ReduceMeanGraph1015(this, x_backbone_blocks_71, x_backbone_blocks_71NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1010 = branchA_v1.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1016, coder.const(x_backbone_blocks_71NumDims));
            xReduced1011 = mean(x_backbone_blocks_71, dims1010);
            x_backbone_blocks_77 = xReduced1011;
            x_backbone_blocks_77NumDims = coder.const(x_backbone_blocks_71NumDims);

            % Set graph output arguments
            x_backbone_blocks_77NumDims1017 = coder.const(x_backbone_blocks_77NumDims);

        end

    end

end