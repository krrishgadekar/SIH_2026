classdef Shape_To_ResizeLayer1003 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'red_lesion_unet_v2.coder.Shape_To_ResizeLayer1003';
        end
    end


    methods
        function this = Shape_To_ResizeLayer1003(name)
            this.Name = name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_1_R'};
        end

        function [x_decoder_blocks_1_R] = predict(this, x_encoder_layer2__20, x_decoder_blocks__23)
            if isdlarray(x_encoder_layer2__20)
                x_encoder_layer2__20 = stripdims(x_encoder_layer2__20);
            end
            if isdlarray(x_decoder_blocks__23)
                x_decoder_blocks__23 = stripdims(x_decoder_blocks__23);
            end
            x_encoder_layer2__20NumDims = 4;
            x_decoder_blocks__23NumDims = 4;
            x_encoder_layer2__20 = red_lesion_unet_v2.ops.permuteInputVar(x_encoder_layer2__20, [4 3 1 2], 4);
            x_decoder_blocks__23 = red_lesion_unet_v2.ops.permuteInputVar(x_decoder_blocks__23, [4 3 1 2], 4);

            [x_decoder_blocks_1_R, x_decoder_blocks_1_RNumDims] = Shape_To_ResizeGraph1006(this, x_encoder_layer2__20, x_decoder_blocks__23, x_encoder_layer2__20NumDims, x_decoder_blocks__23NumDims, false);
            x_decoder_blocks_1_R = red_lesion_unet_v2.ops.permuteOutputVar(x_decoder_blocks_1_R, [3 4 2 1], 4);

            x_decoder_blocks_1_R = dlarray(single(x_decoder_blocks_1_R), 'SSCB');
        end

        function [x_decoder_blocks_1_R] = forward(this, x_encoder_layer2__20, x_decoder_blocks__23)
            if isdlarray(x_encoder_layer2__20)
                x_encoder_layer2__20 = stripdims(x_encoder_layer2__20);
            end
            if isdlarray(x_decoder_blocks__23)
                x_decoder_blocks__23 = stripdims(x_decoder_blocks__23);
            end
            x_encoder_layer2__20NumDims = 4;
            x_decoder_blocks__23NumDims = 4;
            x_encoder_layer2__20 = red_lesion_unet_v2.ops.permuteInputVar(x_encoder_layer2__20, [4 3 1 2], 4);
            x_decoder_blocks__23 = red_lesion_unet_v2.ops.permuteInputVar(x_decoder_blocks__23, [4 3 1 2], 4);

            [x_decoder_blocks_1_R, x_decoder_blocks_1_RNumDims] = Shape_To_ResizeGraph1006(this, x_encoder_layer2__20, x_decoder_blocks__23, x_encoder_layer2__20NumDims, x_decoder_blocks__23NumDims, true);
            x_decoder_blocks_1_R = red_lesion_unet_v2.ops.permuteOutputVar(x_decoder_blocks_1_R, [3 4 2 1], 4);

            x_decoder_blocks_1_R = dlarray(single(x_decoder_blocks_1_R), 'SSCB');
        end

        function [x_decoder_blocks_1_R, x_decoder_blocks_1_RNumDims1007] = Shape_To_ResizeGraph1006(this, x_encoder_layer2__20, x_decoder_blocks__23, x_encoder_layer2__20NumDims, x_decoder_blocks__23NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_7_ou, x_decoder_Shape_7_ouNumDims] = red_lesion_unet_v2.ops.onnxShape(x_encoder_layer2__20, x_encoder_layer2__20NumDims, 0, x_encoder_layer2__20NumDims+1);

            % Gather:
            [x_decoder_Gather_7_o, x_decoder_Gather_7_oNumDims] = red_lesion_unet_v2.ops.onnxGather(x_decoder_Shape_7_ou, this.Vars.x_decoder_Constant_7, 0, x_decoder_Shape_7_ouNumDims, this.NumDims.x_decoder_Constant_7);

            % Unsqueeze:
            [shape, x_decoder_blocks_1_UNumDims] = red_lesion_unet_v2.ops.prepareUnsqueezeArgs(x_decoder_Gather_7_o, this.Vars.onnx__Unsqueeze_455, x_decoder_Gather_7_oNumDims);
            x_decoder_blocks_1_U = reshape(x_decoder_Gather_7_o, shape);

            % Shape:
            [x_decoder_Shape_6_ou, x_decoder_Shape_6_ouNumDims] = red_lesion_unet_v2.ops.onnxShape(x_encoder_layer2__20, x_encoder_layer2__20NumDims, 0, x_encoder_layer2__20NumDims+1);

            % Gather:
            [x_decoder_Gather_6_o, x_decoder_Gather_6_oNumDims] = red_lesion_unet_v2.ops.onnxGather(x_decoder_Shape_6_ou, this.Vars.x_decoder_Constant_6, 0, x_decoder_Shape_6_ouNumDims, this.NumDims.x_decoder_Constant_6);

            % Unsqueeze:
            [shape, x_decoder_blocks__36NumDims] = red_lesion_unet_v2.ops.prepareUnsqueezeArgs(x_decoder_Gather_6_o, this.Vars.onnx__Unsqueeze_453, x_decoder_Gather_6_oNumDims);
            x_decoder_blocks__36 = reshape(x_decoder_Gather_6_o, shape);

            % Concat:
            [x_decoder_blocks_1_3, x_decoder_blocks_1_3NumDims] = red_lesion_unet_v2.ops.onnxConcat(0, {x_decoder_blocks__36, x_decoder_blocks_1_U}, [x_decoder_blocks__36NumDims, x_decoder_blocks_1_UNumDims]);

            % Cast:
            x_decoder_blocks_1_C = cast(int64(extractdata(x_decoder_blocks_1_3)), 'like', x_decoder_blocks_1_3);
            x_decoder_blocks_1_CNumDims = x_decoder_blocks_1_3NumDims;

            % Shape:
            [x_decoder_blocks_1_S, x_decoder_blocks_1_SNumDims] = red_lesion_unet_v2.ops.onnxShape(x_decoder_blocks__23, x_decoder_blocks__23NumDims, 0, x_decoder_blocks__23NumDims+1);

            % Slice:
            [Indices, x_decoder_blocks__33NumDims] = red_lesion_unet_v2.ops.prepareSliceArgs(x_decoder_blocks_1_S, this.Vars.x_decoder_blocks_1_4, this.Vars.x_decoder_blocks_1_5, this.Vars.x_decoder_blocks_1_6, '', x_decoder_blocks_1_SNumDims);
            x_decoder_blocks__33 = x_decoder_blocks_1_S(Indices{:});

            % Concat:
            [x_decoder_blocks_1_1, x_decoder_blocks_1_1NumDims] = red_lesion_unet_v2.ops.onnxConcat(0, {x_decoder_blocks__33, x_decoder_blocks_1_C}, [x_decoder_blocks__33NumDims, x_decoder_blocks_1_CNumDims]);

            % Resize:
            [DLTScales, DLTSizes, dataFormat, Method, GeometricTransformMode, NearestRoundingMode, x_decoder_blocks_1_RNumDims] = red_lesion_unet_v2.ops.prepareResize11Args(dlarray([]), dlarray([]), x_decoder_blocks_1_1, "asymmetric", "nearest", "floor", x_decoder_blocks__23NumDims);
            if isempty(DLTScales)
                x_decoder_blocks_1_R = dlresize(x_decoder_blocks__23, 'OutputSize', DLTSizes, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            else
                x_decoder_blocks_1_R = dlresize(x_decoder_blocks__23, 'Scale', DLTScales, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            end

            % Set graph output arguments
            x_decoder_blocks_1_RNumDims1007 = x_decoder_blocks_1_RNumDims;

        end

    end

end