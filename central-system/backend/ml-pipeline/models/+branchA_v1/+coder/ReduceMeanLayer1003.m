classdef ReduceMeanLayer1003 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = branchA_v1.coder.ReduceMeanLayer1003(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = branchA_v1.ReduceMeanLayer1003(cgInstance.Name);
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
        function this = ReduceMeanLayer1003(mlInstance)
            this.Name = mlInstance.Name;
            this.OutputNames = {'x_backbone_blocks_48'};
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

        function [x_backbone_blocks_48] = predict(this, x_backbone_blocks_42__)
            if isdlarray(x_backbone_blocks_42__)
                x_backbone_blocks_42_ = stripdims(x_backbone_blocks_42__);
            else
                x_backbone_blocks_42_ = x_backbone_blocks_42__;
            end
            x_backbone_blocks_42NumDims = 4;
            x_backbone_blocks_42 = branchA_v1.coder.ops.permuteInputVar(x_backbone_blocks_42_, [4 3 1 2], 4);

            [x_backbone_blocks_48__, x_backbone_blocks_48NumDims__] = ReduceMeanGraph1009(this, x_backbone_blocks_42, x_backbone_blocks_42NumDims, false);
            x_backbone_blocks_48_ = branchA_v1.coder.ops.permuteOutputVar(x_backbone_blocks_48__, [3 4 2 1], 4);

            x_backbone_blocks_48 = dlarray(single(x_backbone_blocks_48_), 'SSCB');
        end

        function [x_backbone_blocks_48, x_backbone_blocks_48NumDims1011] = ReduceMeanGraph1009(this, x_backbone_blocks_42, x_backbone_blocks_42NumDims, Training)

            % Execute the operators:
            % ReduceMean:
            dims1006 = branchA_v1.coder.ops.prepareReduceArgs(this.Vars.ReduceMeanAxes1010, coder.const(x_backbone_blocks_42NumDims));
            xReduced1007 = mean(x_backbone_blocks_42, dims1006);
            x_backbone_blocks_48 = xReduced1007;
            x_backbone_blocks_48NumDims = coder.const(x_backbone_blocks_42NumDims);

            % Set graph output arguments
            x_backbone_blocks_48NumDims1011 = coder.const(x_backbone_blocks_48NumDims);

        end

    end

end