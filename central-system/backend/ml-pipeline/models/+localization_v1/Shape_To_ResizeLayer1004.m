classdef Shape_To_ResizeLayer1004 < nnet.layer.Layer & nnet.layer.Formattable
    % A custom layer auto-generated while importing an ONNX network.

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
        % Specify the path to the class that will be used for codegen
        function name = matlabCodegenRedirect(~)
            name = 'localization_v1.coder.Shape_To_ResizeLayer1004';
        end
    end


    methods
        function this = Shape_To_ResizeLayer1004(name)
            this.Name = name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_0_R'};
        end

        function [x_decoder_blocks_0_R] = predict(this, x_encoder_layer3__10, x_encoder_layer4__10)
            if isdlarray(x_encoder_layer3__10)
                x_encoder_layer3__10 = stripdims(x_encoder_layer3__10);
            end
            if isdlarray(x_encoder_layer4__10)
                x_encoder_layer4__10 = stripdims(x_encoder_layer4__10);
            end
            x_encoder_layer3__10NumDims = 4;
            x_encoder_layer4__10NumDims = 4;
            x_encoder_layer3__10 = localization_v1.ops.permuteInputVar(x_encoder_layer3__10, [4 3 1 2], 4);
            x_encoder_layer4__10 = localization_v1.ops.permuteInputVar(x_encoder_layer4__10, [4 3 1 2], 4);

            [x_decoder_blocks_0_R, x_decoder_blocks_0_RNumDims] = Shape_To_ResizeGraph1008(this, x_encoder_layer3__10, x_encoder_layer4__10, x_encoder_layer3__10NumDims, x_encoder_layer4__10NumDims, false);
            x_decoder_blocks_0_R = localization_v1.ops.permuteOutputVar(x_decoder_blocks_0_R, [3 4 2 1], 4);

            x_decoder_blocks_0_R = dlarray(single(x_decoder_blocks_0_R), 'SSCB');
        end

        function [x_decoder_blocks_0_R] = forward(this, x_encoder_layer3__10, x_encoder_layer4__10)
            if isdlarray(x_encoder_layer3__10)
                x_encoder_layer3__10 = stripdims(x_encoder_layer3__10);
            end
            if isdlarray(x_encoder_layer4__10)
                x_encoder_layer4__10 = stripdims(x_encoder_layer4__10);
            end
            x_encoder_layer3__10NumDims = 4;
            x_encoder_layer4__10NumDims = 4;
            x_encoder_layer3__10 = localization_v1.ops.permuteInputVar(x_encoder_layer3__10, [4 3 1 2], 4);
            x_encoder_layer4__10 = localization_v1.ops.permuteInputVar(x_encoder_layer4__10, [4 3 1 2], 4);

            [x_decoder_blocks_0_R, x_decoder_blocks_0_RNumDims] = Shape_To_ResizeGraph1008(this, x_encoder_layer3__10, x_encoder_layer4__10, x_encoder_layer3__10NumDims, x_encoder_layer4__10NumDims, true);
            x_decoder_blocks_0_R = localization_v1.ops.permuteOutputVar(x_decoder_blocks_0_R, [3 4 2 1], 4);

            x_decoder_blocks_0_R = dlarray(single(x_decoder_blocks_0_R), 'SSCB');
        end

        function [x_decoder_blocks_0_R, x_decoder_blocks_0_RNumDims1009] = Shape_To_ResizeGraph1008(this, x_encoder_layer3__10, x_encoder_layer4__10, x_encoder_layer3__10NumDims, x_encoder_layer4__10NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_9_ou, x_decoder_Shape_9_ouNumDims] = localization_v1.ops.onnxShape(x_encoder_layer3__10, x_encoder_layer3__10NumDims, 0, x_encoder_layer3__10NumDims+1);

            % Gather:
            [x_decoder_Gather_9_o, x_decoder_Gather_9_oNumDims] = localization_v1.ops.onnxGather(x_decoder_Shape_9_ou, this.Vars.x_decoder_Constant_9, 0, x_decoder_Shape_9_ouNumDims, this.NumDims.x_decoder_Constant_9);

            % Unsqueeze:
            [shape, x_decoder_blocks_0_UNumDims] = localization_v1.ops.prepareUnsqueezeArgs(x_decoder_Gather_9_o, this.Vars.onnx__Unsqueeze_281, x_decoder_Gather_9_oNumDims);
            x_decoder_blocks_0_U = reshape(x_decoder_Gather_9_o, shape);

            % Shape:
            [x_decoder_Shape_8_ou, x_decoder_Shape_8_ouNumDims] = localization_v1.ops.onnxShape(x_encoder_layer3__10, x_encoder_layer3__10NumDims, 0, x_encoder_layer3__10NumDims+1);

            % Gather:
            [x_decoder_Gather_8_o, x_decoder_Gather_8_oNumDims] = localization_v1.ops.onnxGather(x_decoder_Shape_8_ou, this.Vars.x_decoder_Constant_8, 0, x_decoder_Shape_8_ouNumDims, this.NumDims.x_decoder_Constant_8);

            % Unsqueeze:
            [shape, x_decoder_blocks__18NumDims] = localization_v1.ops.prepareUnsqueezeArgs(x_decoder_Gather_8_o, this.Vars.onnx__Unsqueeze_279, x_decoder_Gather_8_oNumDims);
            x_decoder_blocks__18 = reshape(x_decoder_Gather_8_o, shape);

            % Concat:
            [x_decoder_blocks_0_3, x_decoder_blocks_0_3NumDims] = localization_v1.ops.onnxConcat(0, {x_decoder_blocks__18, x_decoder_blocks_0_U}, [x_decoder_blocks__18NumDims, x_decoder_blocks_0_UNumDims]);

            % Cast:
            x_decoder_blocks_0_C = cast(int64(extractdata(x_decoder_blocks_0_3)), 'like', x_decoder_blocks_0_3);
            x_decoder_blocks_0_CNumDims = x_decoder_blocks_0_3NumDims;

            % Shape:
            [x_decoder_blocks_0_S, x_decoder_blocks_0_SNumDims] = localization_v1.ops.onnxShape(x_encoder_layer4__10, x_encoder_layer4__10NumDims, 0, x_encoder_layer4__10NumDims+1);

            % Slice:
            [Indices, x_decoder_blocks__15NumDims] = localization_v1.ops.prepareSliceArgs(x_decoder_blocks_0_S, this.Vars.x_decoder_blocks_0_4, this.Vars.x_decoder_blocks_0_5, this.Vars.x_decoder_blocks_0_6, '', x_decoder_blocks_0_SNumDims);
            x_decoder_blocks__15 = x_decoder_blocks_0_S(Indices{:});

            % Concat:
            [x_decoder_blocks_0_1, x_decoder_blocks_0_1NumDims] = localization_v1.ops.onnxConcat(0, {x_decoder_blocks__15, x_decoder_blocks_0_C}, [x_decoder_blocks__15NumDims, x_decoder_blocks_0_CNumDims]);

            % Resize:
            [DLTScales, DLTSizes, dataFormat, Method, GeometricTransformMode, NearestRoundingMode, x_decoder_blocks_0_RNumDims] = localization_v1.ops.prepareResize11Args(dlarray([]), dlarray([]), x_decoder_blocks_0_1, "asymmetric", "nearest", "floor", x_encoder_layer4__10NumDims);
            if isempty(DLTScales)
                x_decoder_blocks_0_R = dlresize(x_encoder_layer4__10, 'OutputSize', DLTSizes, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            else
                x_decoder_blocks_0_R = dlresize(x_encoder_layer4__10, 'Scale', DLTScales, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            end

            % Set graph output arguments
            x_decoder_blocks_0_RNumDims1009 = x_decoder_blocks_0_RNumDims;

        end

    end

end