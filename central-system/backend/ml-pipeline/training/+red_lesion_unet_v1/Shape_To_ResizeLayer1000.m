classdef Shape_To_ResizeLayer1000 < nnet.layer.Layer & nnet.layer.Formattable
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
            name = 'red_lesion_unet_v1.coder.Shape_To_ResizeLayer1000';
        end
    end


    methods
        function this = Shape_To_ResizeLayer1000(name)
            this.Name = name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_4_R'};
        end

        function [x_decoder_blocks_4_R] = predict(this, input, x_decoder_blocks__77)
            if isdlarray(input)
                input = stripdims(input);
            end
            if isdlarray(x_decoder_blocks__77)
                x_decoder_blocks__77 = stripdims(x_decoder_blocks__77);
            end
            inputNumDims = 4;
            x_decoder_blocks__77NumDims = 4;
            input = red_lesion_unet_v1.ops.permuteInputVar(input, [4 3 1 2], 4);
            x_decoder_blocks__77 = red_lesion_unet_v1.ops.permuteInputVar(x_decoder_blocks__77, [4 3 1 2], 4);

            [x_decoder_blocks_4_R, x_decoder_blocks_4_RNumDims] = Shape_To_ResizeGraph1000(this, input, x_decoder_blocks__77, inputNumDims, x_decoder_blocks__77NumDims, false);
            x_decoder_blocks_4_R = red_lesion_unet_v1.ops.permuteOutputVar(x_decoder_blocks_4_R, [3 4 2 1], 4);

            x_decoder_blocks_4_R = dlarray(single(x_decoder_blocks_4_R), 'SSCB');
        end

        function [x_decoder_blocks_4_R] = forward(this, input, x_decoder_blocks__77)
            if isdlarray(input)
                input = stripdims(input);
            end
            if isdlarray(x_decoder_blocks__77)
                x_decoder_blocks__77 = stripdims(x_decoder_blocks__77);
            end
            inputNumDims = 4;
            x_decoder_blocks__77NumDims = 4;
            input = red_lesion_unet_v1.ops.permuteInputVar(input, [4 3 1 2], 4);
            x_decoder_blocks__77 = red_lesion_unet_v1.ops.permuteInputVar(x_decoder_blocks__77, [4 3 1 2], 4);

            [x_decoder_blocks_4_R, x_decoder_blocks_4_RNumDims] = Shape_To_ResizeGraph1000(this, input, x_decoder_blocks__77, inputNumDims, x_decoder_blocks__77NumDims, true);
            x_decoder_blocks_4_R = red_lesion_unet_v1.ops.permuteOutputVar(x_decoder_blocks_4_R, [3 4 2 1], 4);

            x_decoder_blocks_4_R = dlarray(single(x_decoder_blocks_4_R), 'SSCB');
        end

        function [x_decoder_blocks_4_R, x_decoder_blocks_4_RNumDims1001] = Shape_To_ResizeGraph1000(this, input, x_decoder_blocks__77, inputNumDims, x_decoder_blocks__77NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_1_ou, x_decoder_Shape_1_ouNumDims] = red_lesion_unet_v1.ops.onnxShape(input, inputNumDims, 0, inputNumDims+1);

            % Gather:
            [x_decoder_Gather_1_o, x_decoder_Gather_1_oNumDims] = red_lesion_unet_v1.ops.onnxGather(x_decoder_Shape_1_ou, this.Vars.x_decoder_Constant_1, 0, x_decoder_Shape_1_ouNumDims, this.NumDims.x_decoder_Constant_1);

            % Unsqueeze:
            [shape, x_decoder_blocks_4_UNumDims] = red_lesion_unet_v1.ops.prepareUnsqueezeArgs(x_decoder_Gather_1_o, this.Vars.onnx__Unsqueeze_521, x_decoder_Gather_1_oNumDims);
            x_decoder_blocks_4_U = reshape(x_decoder_Gather_1_o, shape);

            % Shape:
            [x_decoder_Shape_outp, x_decoder_Shape_outpNumDims] = red_lesion_unet_v1.ops.onnxShape(input, inputNumDims, 0, inputNumDims+1);

            % Gather:
            [x_decoder_Gather_out, x_decoder_Gather_outNumDims] = red_lesion_unet_v1.ops.onnxGather(x_decoder_Shape_outp, this.Vars.x_decoder_Constant_o, 0, x_decoder_Shape_outpNumDims, this.NumDims.x_decoder_Constant_o);

            % Unsqueeze:
            [shape, x_decoder_blocks__88NumDims] = red_lesion_unet_v1.ops.prepareUnsqueezeArgs(x_decoder_Gather_out, this.Vars.onnx__Unsqueeze_519, x_decoder_Gather_outNumDims);
            x_decoder_blocks__88 = reshape(x_decoder_Gather_out, shape);

            % Concat:
            [x_decoder_blocks_4_2, x_decoder_blocks_4_2NumDims] = red_lesion_unet_v1.ops.onnxConcat(0, {x_decoder_blocks__88, x_decoder_blocks_4_U}, [x_decoder_blocks__88NumDims, x_decoder_blocks_4_UNumDims]);

            % Cast:
            x_decoder_blocks_4_C = cast(int64(extractdata(x_decoder_blocks_4_2)), 'like', x_decoder_blocks_4_2);
            x_decoder_blocks_4_CNumDims = x_decoder_blocks_4_2NumDims;

            % Shape:
            [x_decoder_blocks_4_S, x_decoder_blocks_4_SNumDims] = red_lesion_unet_v1.ops.onnxShape(x_decoder_blocks__77, x_decoder_blocks__77NumDims, 0, x_decoder_blocks__77NumDims+1);

            % Slice:
            [Indices, x_decoder_blocks__85NumDims] = red_lesion_unet_v1.ops.prepareSliceArgs(x_decoder_blocks_4_S, this.Vars.x_decoder_blocks_4_3, this.Vars.x_decoder_blocks_4_4, this.Vars.x_decoder_blocks_4_5, '', x_decoder_blocks_4_SNumDims);
            x_decoder_blocks__85 = x_decoder_blocks_4_S(Indices{:});

            % Concat:
            [x_decoder_blocks_4_1, x_decoder_blocks_4_1NumDims] = red_lesion_unet_v1.ops.onnxConcat(0, {x_decoder_blocks__85, x_decoder_blocks_4_C}, [x_decoder_blocks__85NumDims, x_decoder_blocks_4_CNumDims]);

            % Resize:
            [DLTScales, DLTSizes, dataFormat, Method, GeometricTransformMode, NearestRoundingMode, x_decoder_blocks_4_RNumDims] = red_lesion_unet_v1.ops.prepareResize11Args(dlarray([]), dlarray([]), x_decoder_blocks_4_1, "asymmetric", "nearest", "floor", x_decoder_blocks__77NumDims);
            if isempty(DLTScales)
                x_decoder_blocks_4_R = dlresize(x_decoder_blocks__77, 'OutputSize', DLTSizes, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            else
                x_decoder_blocks_4_R = dlresize(x_decoder_blocks__77, 'Scale', DLTScales, 'DataFormat', dataFormat, 'Method', Method, 'GeometricTransformMode', GeometricTransformMode, 'NearestRoundingMode', NearestRoundingMode);
            end

            % Set graph output arguments
            x_decoder_blocks_4_RNumDims1001 = x_decoder_blocks_4_RNumDims;

        end

    end

end