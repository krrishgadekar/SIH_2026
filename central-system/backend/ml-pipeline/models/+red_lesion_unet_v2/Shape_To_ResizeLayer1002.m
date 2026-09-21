classdef Shape_To_ResizeLayer1002 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'red_lesion_unet_v2.coder.Shape_To_ResizeLayer1002';
        end
    end


    methods
        function this = Shape_To_ResizeLayer1002(name)
            this.Name = name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_2_R'};
        end

        function [x_decoder_blocks_2_R] = predict(this, x_encoder_layer1__14, x_decoder_blocks__41)
            if isdlarray(x_encoder_layer1__14)
                x_encoder_layer1__14 = stripdims(x_encoder_layer1__14);
            end
            if isdlarray(x_decoder_blocks__41)
                x_decoder_blocks__41 = stripdims(x_decoder_blocks__41);
            end
            x_encoder_layer1__14NumDims = 4;
            x_decoder_blocks__41NumDims = 4;
            x_encoder_layer1__14 = red_lesion_unet_v2.ops.permuteInputVar(x_encoder_layer1__14, [4 3 1 2], 4);
            x_decoder_blocks__41 = red_lesion_unet_v2.ops.permuteInputVar(x_decoder_blocks__41, [4 3 1 2], 4);

            [x_decoder_blocks_2_R, x_decoder_blocks_2_RNumDims] = Shape_To_ResizeGraph1004(this, x_encoder_layer1__14, x_decoder_blocks__41, x_encoder_layer1__14NumDims, x_decoder_blocks__41NumDims, false);
            x_decoder_blocks_2_R = red_lesion_unet_v2.ops.permuteOutputVar(x_decoder_blocks_2_R, [3 4 2 1], 4);

            x_decoder_blocks_2_R = dlarray(single(x_decoder_blocks_2_R), 'SSCB');
        end

        function [x_decoder_blocks_2_R] = forward(this, x_encoder_layer1__14, x_decoder_blocks__41)
            if isdlarray(x_encoder_layer1__14)
                x_encoder_layer1__14 = stripdims(x_encoder_layer1__14);
            end
            if isdlarray(x_decoder_blocks__41)
                x_decoder_blocks__41 = stripdims(x_decoder_blocks__41);
            end
            x_encoder_layer1__14NumDims = 4;
            x_decoder_blocks__41NumDims = 4;
            x_encoder_layer1__14 = red_lesion_unet_v2.ops.permuteInputVar(x_encoder_layer1__14, [4 3 1 2], 4);
            x_decoder_blocks__41 = red_lesion_unet_v2.ops.permuteInputVar(x_decoder_blocks__41, [4 3 1 2], 4);

            [x_decoder_blocks_2_R, x_decoder_blocks_2_RNumDims] = Shape_To_ResizeGraph1004(this, x_encoder_layer1__14, x_decoder_blocks__41, x_encoder_layer1__14NumDims, x_decoder_blocks__41NumDims, true);
            x_decoder_blocks_2_R = red_lesion_unet_v2.ops.permuteOutputVar(x_decoder_blocks_2_R, [3 4 2 1], 4);

            x_decoder_blocks_2_R = dlarray(single(x_decoder_blocks_2_R), 'SSCB');
        end

        function [x_decoder_blocks_2_R, x_decoder_blocks_2_RNumDims1005] = Shape_To_ResizeGraph1004(this, x_encoder_layer1__14, x_decoder_blocks__41, x_encoder_layer1__14NumDims, x_decoder_blocks__41NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_5_ou, x_decoder_Shape_5_ouNumDims] = red_lesion_unet_v2.ops.onnxShape(x_encoder_layer1__14, x_encoder_layer1__14NumDims, 0, x_encoder_layer1__14NumDims+1);

            % Gather:
            [x_decoder_Gather_5_o, x_decoder_Gather_5_oNumDims] = red_lesion_unet_v2.ops.onnxGather(x_decoder_Shape_5_ou, this.Vars.x_decoder_Constant_5, 0, x_decoder_Shape_5_ouNumDims, this.NumDims.x_decoder_Constant_5);

            % Unsqueeze:
            [shape, x_decoder_blocks_2_UNumDims] = red_lesion_unet_v2.ops.prepareUnsqueezeArgs(x_decoder_Gather_5_o, this.Vars.onnx__Unsqueeze_477, x_decoder_Gather_5_oNumDims);
            x_decoder_blocks_2_U = reshape(x_decoder_Gather_5_o, shape);

            % Shape:
            [x_decoder_Shape_4_ou, x_decoder_Shape_4_ouNumDims] = red_lesion_unet_v2.ops.onnxShape(x_encoder_layer1__14, x_encoder_layer1__14NumDims, 0, x_encoder_layer1__14NumDims+1);

            % Gather:
            [x_decoder_Gather_4_o, x_decoder_Gather_4_oNumDims] = red_lesion_unet_v2.ops.onnxGather(x_decoder_Shape_4_ou, this.Vars.x_decoder_Constant_4, 0, x_decoder_Shape_4_ouNumDims, this.NumDims.x_decoder_Constant_4);

            % Unsqueeze:
            [shape, x_decoder_blocks__54NumDims] = red_lesion_unet_v2.ops.prepareUnsqueezeArgs(x_decoder_Gather_4_o, this.Vars.onnx__Unsqueeze_475, x_decoder_Gather_4_oNumDims);
            x_decoder_blocks__54 = reshape(x_decoder_Gather_4_o, shape);

            % Concat:
            [x_decoder_blocks_2_3, x_decoder_blocks_2_3NumDims] = red_lesion_unet_v2.ops.onnxConcat(0, {x_decoder_blocks__54, x_decoder_blocks_2_U}, [x_decoder_blocks__54NumDims, x_decoder_blocks_2_UNumDims]);

            % Cast:
            x_decoder_blocks_2_C = cast(int64(extractdata(x_decoder_blocks_2_3)), 'like', x_decoder_blocks_2_3);
            x_decoder_blocks_2_CNumDims = x_decoder_blocks_2_3NumDims;

            % Shape:
            [x_decoder_blocks_2_S, x_decoder_blocks_2_SNumDims] = red_lesion_unet_v2.ops.onnxShape(x_decoder_blocks__41, x_decoder_blocks__41NumDims, 0, x_decoder_blocks__41NumDims+1);

            % Slice:
            [Indices, x_decoder_blocks__51NumDims] = red_lesion_unet_v2.ops.prepareSliceArgs(x_decoder_blocks_2_S, this.Vars.x_decoder_blocks_2_4, this.Vars.x_decoder_blocks_2_5, this.Vars.x_decoder_blocks_2_6, '', x_decoder_blocks_2_SNumDims);
            x_decoder_blocks__51 = x_decoder_blocks_2_S(Indices{:});

            % Concat:
            [x_decoder_blocks_2_1, x_decoder_blocks_2_1NumDims] = red_lesion_unet_v2.ops.onnxConcat(0, {x_decoder_blocks__51, x_decoder_blocks_2_C}, [x_decoder_blocks__51NumDims, x_decoder_blocks_2_CNumDims]);

            % Resize:
            [DLTScales, DLTSizes, dataFormat, Method, GeometricTransformMode, NearestRoundingMode, x_decoder_blocks_2_RNumDims] = red_lesion_unet_v2.ops.prepareResize11Args(dlarray([]), dlarray([]), x_decoder_blocks_2_1, "asymmetric", "nearest", "floor", x_decoder_blocks__41NumDims);
            if isempty(DLTScales)
                x_decoder_blocks_2_R = dlresize(x_decoder_blocks__41, 'OutputSize', DLTSizes, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            else
                x_decoder_blocks_2_R = dlresize(x_decoder_blocks__41, 'Scale', DLTScales, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            end

            % Set graph output arguments
            x_decoder_blocks_2_RNumDims1005 = x_decoder_blocks_2_RNumDims;

        end

    end

end