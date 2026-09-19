classdef Shape_To_ResizeLayer1000 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = localization_v1.coder.Shape_To_ResizeLayer1000(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = localization_v1.Shape_To_ResizeLayer1000(cgInstance.Name);
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
        function this = Shape_To_ResizeLayer1000(mlInstance)
            this.Name = mlInstance.Name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_4_R'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = localization_v1.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_decoder_blocks_4_R] = predict(this, input__, x_decoder_blocks__77__)
            if isdlarray(input__)
                input_ = stripdims(input__);
            else
                input_ = input__;
            end
            if isdlarray(x_decoder_blocks__77__)
                x_decoder_blocks__77_ = stripdims(x_decoder_blocks__77__);
            else
                x_decoder_blocks__77_ = x_decoder_blocks__77__;
            end
            inputNumDims = 4;
            x_decoder_blocks__77NumDims = 4;
            input = localization_v1.coder.ops.permuteInputVar(input_, [4 3 1 2], 4);
            x_decoder_blocks__77 = localization_v1.coder.ops.permuteInputVar(x_decoder_blocks__77_, [4 3 1 2], 4);

            [x_decoder_blocks_4_R__, x_decoder_blocks_4_RNumDims__] = Shape_To_ResizeGraph1000(this, input, x_decoder_blocks__77, inputNumDims, x_decoder_blocks__77NumDims, false);
            x_decoder_blocks_4_R_ = localization_v1.coder.ops.permuteOutputVar(x_decoder_blocks_4_R__, [3 4 2 1], 4);

            x_decoder_blocks_4_R = dlarray(single(x_decoder_blocks_4_R_), 'SSCB');
        end

        function [x_decoder_blocks_4_R, x_decoder_blocks_4_RNumDims1001] = Shape_To_ResizeGraph1000(this, input, x_decoder_blocks__77, inputNumDims, x_decoder_blocks__77NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_1_ou, x_decoder_Shape_1_ouNumDims] = localization_v1.coder.ops.onnxShape(input, coder.const(inputNumDims), 0, coder.const(inputNumDims)+1);

            % Gather:
            [x_decoder_Gather_1_o, x_decoder_Gather_1_oNumDims] = localization_v1.coder.ops.onnxGather(x_decoder_Shape_1_ou, this.Vars.x_decoder_Constant_1, 0, coder.const(x_decoder_Shape_1_ouNumDims), this.NumDims.x_decoder_Constant_1);

            % Unsqueeze:
            [shape1000, x_decoder_blocks_4_UNumDims] = localization_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_1_o, this.Vars.onnx__Unsqueeze_369, coder.const(x_decoder_Gather_1_oNumDims));
            x_decoder_blocks_4_U = reshape(x_decoder_Gather_1_o, shape1000);

            % Shape:
            [x_decoder_Shape_outp, x_decoder_Shape_outpNumDims] = localization_v1.coder.ops.onnxShape(input, coder.const(inputNumDims), 0, coder.const(inputNumDims)+1);

            % Gather:
            [x_decoder_Gather_out, x_decoder_Gather_outNumDims] = localization_v1.coder.ops.onnxGather(x_decoder_Shape_outp, this.Vars.x_decoder_Constant_o, 0, coder.const(x_decoder_Shape_outpNumDims), this.NumDims.x_decoder_Constant_o);

            % Unsqueeze:
            [shape1001, x_decoder_blocks__88NumDims] = localization_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_out, this.Vars.onnx__Unsqueeze_367, coder.const(x_decoder_Gather_outNumDims));
            x_decoder_blocks__88 = reshape(x_decoder_Gather_out, shape1001);

            % Concat:
            [x_decoder_blocks_4_2, x_decoder_blocks_4_2NumDims] = localization_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__88, x_decoder_blocks_4_U}, [coder.const(x_decoder_blocks__88NumDims), coder.const(x_decoder_blocks_4_UNumDims)]);

            % Cast:
            x_decoder_blocks_4_C = cast(int64(localization_v1.coder.ops.extractIfDlarray(x_decoder_blocks_4_2)), 'like', x_decoder_blocks_4_2);
            x_decoder_blocks_4_CNumDims = coder.const(x_decoder_blocks_4_2NumDims);

            % Shape:
            [x_decoder_blocks_4_S, x_decoder_blocks_4_SNumDims] = localization_v1.coder.ops.onnxShape(x_decoder_blocks__77, coder.const(x_decoder_blocks__77NumDims), 0, coder.const(x_decoder_blocks__77NumDims)+1);

            % Slice:
            [indices1002, x_decoder_blocks__85NumDims] = localization_v1.coder.ops.prepareSliceArgs(x_decoder_blocks_4_S, this.Vars.x_decoder_blocks_4_3, this.Vars.x_decoder_blocks_4_4, this.Vars.x_decoder_blocks_4_5, '', coder.const(x_decoder_blocks_4_SNumDims));
            x_decoder_blocks__85 = x_decoder_blocks_4_S(indices1002{:});

            % Concat:
            [x_decoder_blocks_4_1, x_decoder_blocks_4_1NumDims] = localization_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__85, x_decoder_blocks_4_C}, [coder.const(x_decoder_blocks__85NumDims), coder.const(x_decoder_blocks_4_CNumDims)]);

            % Resize:
            [DLTScales1003, DLTSizes1004, dataFormat1005, Method1006, GeometricTransformMode1007, NearestRoundingMode1008, x_decoder_blocks_4_RNumDims] = localization_v1.coder.ops.prepareResize11Args([], [], x_decoder_blocks_4_1, "asymmetric", "nearest", "floor", coder.const(x_decoder_blocks__77NumDims));
            X1009 = dlarray(single(localization_v1.coder.ops.extractIfDlarray(x_decoder_blocks__77)));
            if isempty(DLTScales1003)
                Y1010 = dlresize(X1009, 'OutputSize', DLTSizes1004(1:end-1), 'DataFormat', dataFormat1005, 'Method', Method1006, 'GeometricTransformMode', GeometricTransformMode1007, 'NearestRoundingMode', NearestRoundingMode1008);
            else
                Y1010 = dlresize(X1009, 'Scale', DLTScales1003(1:end-1), 'DataFormat', dataFormat1005, 'Method', Method1006, 'GeometricTransformMode', GeometricTransformMode1007, 'NearestRoundingMode', NearestRoundingMode1008);
            end
            x_decoder_blocks_4_R = localization_v1.coder.ops.extractIfDlarray(Y1010);

            % Set graph output arguments
            x_decoder_blocks_4_RNumDims1001 = coder.const(x_decoder_blocks_4_RNumDims);

        end

    end

end