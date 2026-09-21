classdef Shape_To_ResizeLayer1001 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'red_lesion_unet_v2.coder.Shape_To_ResizeLayer1001';
        end
    end


    methods
        function this = Shape_To_ResizeLayer1001(name)
            this.Name = name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_3_R'};
        end

        function [x_decoder_blocks_3_R] = predict(this, x_encoder_relu_Relu_, x_decoder_blocks__59)
            if isdlarray(x_encoder_relu_Relu_)
                x_encoder_relu_Relu_ = stripdims(x_encoder_relu_Relu_);
            end
            if isdlarray(x_decoder_blocks__59)
                x_decoder_blocks__59 = stripdims(x_decoder_blocks__59);
            end
            x_encoder_relu_Relu_NumDims = 4;
            x_decoder_blocks__59NumDims = 4;
            x_encoder_relu_Relu_ = red_lesion_unet_v2.ops.permuteInputVar(x_encoder_relu_Relu_, [4 3 1 2], 4);
            x_decoder_blocks__59 = red_lesion_unet_v2.ops.permuteInputVar(x_decoder_blocks__59, [4 3 1 2], 4);

            [x_decoder_blocks_3_R, x_decoder_blocks_3_RNumDims] = Shape_To_ResizeGraph1002(this, x_encoder_relu_Relu_, x_decoder_blocks__59, x_encoder_relu_Relu_NumDims, x_decoder_blocks__59NumDims, false);
            x_decoder_blocks_3_R = red_lesion_unet_v2.ops.permuteOutputVar(x_decoder_blocks_3_R, [3 4 2 1], 4);

            x_decoder_blocks_3_R = dlarray(single(x_decoder_blocks_3_R), 'SSCB');
        end

        function [x_decoder_blocks_3_R] = forward(this, x_encoder_relu_Relu_, x_decoder_blocks__59)
            if isdlarray(x_encoder_relu_Relu_)
                x_encoder_relu_Relu_ = stripdims(x_encoder_relu_Relu_);
            end
            if isdlarray(x_decoder_blocks__59)
                x_decoder_blocks__59 = stripdims(x_decoder_blocks__59);
            end
            x_encoder_relu_Relu_NumDims = 4;
            x_decoder_blocks__59NumDims = 4;
            x_encoder_relu_Relu_ = red_lesion_unet_v2.ops.permuteInputVar(x_encoder_relu_Relu_, [4 3 1 2], 4);
            x_decoder_blocks__59 = red_lesion_unet_v2.ops.permuteInputVar(x_decoder_blocks__59, [4 3 1 2], 4);

            [x_decoder_blocks_3_R, x_decoder_blocks_3_RNumDims] = Shape_To_ResizeGraph1002(this, x_encoder_relu_Relu_, x_decoder_blocks__59, x_encoder_relu_Relu_NumDims, x_decoder_blocks__59NumDims, true);
            x_decoder_blocks_3_R = red_lesion_unet_v2.ops.permuteOutputVar(x_decoder_blocks_3_R, [3 4 2 1], 4);

            x_decoder_blocks_3_R = dlarray(single(x_decoder_blocks_3_R), 'SSCB');
        end

        function [x_decoder_blocks_3_R, x_decoder_blocks_3_RNumDims1003] = Shape_To_ResizeGraph1002(this, x_encoder_relu_Relu_, x_decoder_blocks__59, x_encoder_relu_Relu_NumDims, x_decoder_blocks__59NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_3_ou, x_decoder_Shape_3_ouNumDims] = red_lesion_unet_v2.ops.onnxShape(x_encoder_relu_Relu_, x_encoder_relu_Relu_NumDims, 0, x_encoder_relu_Relu_NumDims+1);

            % Gather:
            [x_decoder_Gather_3_o, x_decoder_Gather_3_oNumDims] = red_lesion_unet_v2.ops.onnxGather(x_decoder_Shape_3_ou, this.Vars.x_decoder_Constant_3, 0, x_decoder_Shape_3_ouNumDims, this.NumDims.x_decoder_Constant_3);

            % Unsqueeze:
            [shape, x_decoder_blocks_3_UNumDims] = red_lesion_unet_v2.ops.prepareUnsqueezeArgs(x_decoder_Gather_3_o, this.Vars.onnx__Unsqueeze_499, x_decoder_Gather_3_oNumDims);
            x_decoder_blocks_3_U = reshape(x_decoder_Gather_3_o, shape);

            % Shape:
            [x_decoder_Shape_2_ou, x_decoder_Shape_2_ouNumDims] = red_lesion_unet_v2.ops.onnxShape(x_encoder_relu_Relu_, x_encoder_relu_Relu_NumDims, 0, x_encoder_relu_Relu_NumDims+1);

            % Gather:
            [x_decoder_Gather_2_o, x_decoder_Gather_2_oNumDims] = red_lesion_unet_v2.ops.onnxGather(x_decoder_Shape_2_ou, this.Vars.x_decoder_Constant_2, 0, x_decoder_Shape_2_ouNumDims, this.NumDims.x_decoder_Constant_2);

            % Unsqueeze:
            [shape, x_decoder_blocks__72NumDims] = red_lesion_unet_v2.ops.prepareUnsqueezeArgs(x_decoder_Gather_2_o, this.Vars.onnx__Unsqueeze_497, x_decoder_Gather_2_oNumDims);
            x_decoder_blocks__72 = reshape(x_decoder_Gather_2_o, shape);

            % Concat:
            [x_decoder_blocks_3_3, x_decoder_blocks_3_3NumDims] = red_lesion_unet_v2.ops.onnxConcat(0, {x_decoder_blocks__72, x_decoder_blocks_3_U}, [x_decoder_blocks__72NumDims, x_decoder_blocks_3_UNumDims]);

            % Cast:
            x_decoder_blocks_3_C = cast(int64(extractdata(x_decoder_blocks_3_3)), 'like', x_decoder_blocks_3_3);
            x_decoder_blocks_3_CNumDims = x_decoder_blocks_3_3NumDims;

            % Shape:
            [x_decoder_blocks_3_S, x_decoder_blocks_3_SNumDims] = red_lesion_unet_v2.ops.onnxShape(x_decoder_blocks__59, x_decoder_blocks__59NumDims, 0, x_decoder_blocks__59NumDims+1);

            % Slice:
            [Indices, x_decoder_blocks__69NumDims] = red_lesion_unet_v2.ops.prepareSliceArgs(x_decoder_blocks_3_S, this.Vars.x_decoder_blocks_3_4, this.Vars.x_decoder_blocks_3_5, this.Vars.x_decoder_blocks_3_6, '', x_decoder_blocks_3_SNumDims);
            x_decoder_blocks__69 = x_decoder_blocks_3_S(Indices{:});

            % Concat:
            [x_decoder_blocks_3_1, x_decoder_blocks_3_1NumDims] = red_lesion_unet_v2.ops.onnxConcat(0, {x_decoder_blocks__69, x_decoder_blocks_3_C}, [x_decoder_blocks__69NumDims, x_decoder_blocks_3_CNumDims]);

            % Resize:
            [DLTScales, DLTSizes, dataFormat, Method, GeometricTransformMode, NearestRoundingMode, x_decoder_blocks_3_RNumDims] = red_lesion_unet_v2.ops.prepareResize11Args(dlarray([]), dlarray([]), x_decoder_blocks_3_1, "asymmetric", "nearest", "floor", x_decoder_blocks__59NumDims);
            if isempty(DLTScales)
                x_decoder_blocks_3_R = dlresize(x_decoder_blocks__59, 'OutputSize', DLTSizes, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            else
                x_decoder_blocks_3_R = dlresize(x_decoder_blocks__59, 'Scale', DLTScales, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            end

            % Set graph output arguments
            x_decoder_blocks_3_RNumDims1003 = x_decoder_blocks_3_RNumDims;

        end

    end

end