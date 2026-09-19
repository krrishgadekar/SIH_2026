classdef ReduceMeanLayer1001 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v1.coder.ReduceMeanLayer1001(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v1.ReduceMeanLayer1001(cgInstance.Name);
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
        function this = ReduceMeanLayer1001(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_blocks_19'};
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

        function [x_backbone_blocks_19] = predict(this, x_backbone_blocks_13__)
            if isdlarray(x_backbone_blocks_13__)
                x_backbone_blocks_13_ = stripdims(x_backbone_blocks_13__);
            else
                x_backbone_blocks_13_ = x_backbone_blocks_13__;
            end
            x_backbone_blocks_13NumDims = 4;
            x_backbone_blocks_13 = branchA_v1.coder.ops.permuteInputVar(x_backbone_blocks_13_, [4 3 1 2], 4);

            [x_backbone_blocks_19__, x_backbone_blocks_19NumDims__] = ReduceMeanGraph1003(this, x_backbone_blocks_13, x_backbone_blocks_13NumDims, false);
            x_backbone_blocks_19_ = branchA_v1.coder.ops.permuteOutputVar(x_backbone_blocks_19__, [3 4 2 1], 4);

            x_backbone_blocks_19 = dlarray(single(x_backbone_blocks_19_), 'SSCB');
        end

        function [x_backbone_blocks_19, x_backbone_blocks_19NumDims1005] = ReduceMeanGraph1003(this, x_backbone_blocks_13, x_backbone_blocks_13NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1002 = branchA_v1.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1004, coder.const(x_backbone_blocks_13NumDims));
            xReduced1003 = mean(x_backbone_blocks_13, dims1002);
            x_backbone_blocks_19 = xReduced1003;
            x_backbone_blocks_19NumDims = coder.const(x_backbone_blocks_13NumDims);

            % Set graph output arguments
            x_backbone_blocks_19NumDims1005 = coder.const(x_backbone_blocks_19NumDims);

        end

    end

end