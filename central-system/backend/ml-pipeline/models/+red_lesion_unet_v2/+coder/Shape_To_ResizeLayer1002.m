classdef Shape_To_ResizeLayer1002 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = red_lesion_unet_v2.coder.Shape_To_ResizeLayer1002(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = red_lesion_unet_v2.Shape_To_ResizeLayer1002(cgInstance.Name);
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
        function this = Shape_To_ResizeLayer1002(mlInstance)
            this.Name = mlInstance.Name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_2_R'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = red_lesion_unet_v2.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_decoder_blocks_2_R] = predict(this, x_encoder_layer1__14__, x_decoder_blocks__41__)
            if isdlarray(x_encoder_layer1__14__)
                x_encoder_layer1__14_ = stripdims(x_encoder_layer1__14__);
            else
                x_encoder_layer1__14_ = x_encoder_layer1__14__;
            end
            if isdlarray(x_decoder_blocks__41__)
                x_decoder_blocks__41_ = stripdims(x_decoder_blocks__41__);
            else
                x_decoder_blocks__41_ = x_decoder_blocks__41__;
            end
            x_encoder_layer1__14NumDims = 4;
            x_decoder_blocks__41NumDims = 4;
            x_encoder_layer1__14 = red_lesion_unet_v2.coder.ops.permuteInputVar(x_encoder_layer1__14_, [4 3 1 2], 4);
            x_decoder_blocks__41 = red_lesion_unet_v2.coder.ops.permuteInputVar(x_decoder_blocks__41_, [4 3 1 2], 4);

            [x_decoder_blocks_2_R__, x_decoder_blocks_2_RNumDims__] = Shape_To_ResizeGraph1004(this, x_encoder_layer1__14, x_decoder_blocks__41, x_encoder_layer1__14NumDims, x_decoder_blocks__41NumDims, false);
            x_decoder_blocks_2_R_ = red_lesion_unet_v2.coder.ops.permuteOutputVar(x_decoder_blocks_2_R__, [3 4 2 1], 4);

            x_decoder_blocks_2_R = dlarray(single(x_decoder_blocks_2_R_), 'SSCB');
        end

        function [x_decoder_blocks_2_R, x_decoder_blocks_2_RNumDims1005] = Shape_To_ResizeGraph1004(this, x_encoder_layer1__14, x_decoder_blocks__41, x_encoder_layer1__14NumDims, x_decoder_blocks__41NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_5_ou, x_decoder_Shape_5_ouNumDims] = red_lesion_unet_v2.coder.ops.onnxShape(x_encoder_layer1__14, coder.const(x_encoder_layer1__14NumDims), 0, coder.const(x_encoder_layer1__14NumDims)+1);

            % Gather:
            [x_decoder_Gather_5_o, x_decoder_Gather_5_oNumDims] = red_lesion_unet_v2.coder.ops.onnxGather(x_decoder_Shape_5_ou, this.Vars.x_decoder_Constant_5, 0, coder.const(x_decoder_Shape_5_ouNumDims), this.NumDims.x_decoder_Constant_5);

            % Unsqueeze:
            [shape1022, x_decoder_blocks_2_UNumDims] = red_lesion_unet_v2.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_5_o, this.Vars.onnx__Unsqueeze_477, coder.const(x_decoder_Gather_5_oNumDims));
            x_decoder_blocks_2_U = reshape(x_decoder_Gather_5_o, shape1022);

            % Shape:
            [x_decoder_Shape_4_ou, x_decoder_Shape_4_ouNumDims] = red_lesion_unet_v2.coder.ops.onnxShape(x_encoder_layer1__14, coder.const(x_encoder_layer1__14NumDims), 0, coder.const(x_encoder_layer1__14NumDims)+1);

            % Gather:
            [x_decoder_Gather_4_o, x_decoder_Gather_4_oNumDims] = red_lesion_unet_v2.coder.ops.onnxGather(x_decoder_Shape_4_ou, this.Vars.x_decoder_Constant_4, 0, coder.const(x_decoder_Shape_4_ouNumDims), this.NumDims.x_decoder_Constant_4);

            % Unsqueeze:
            [shape1023, x_decoder_blocks__54NumDims] = red_lesion_unet_v2.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_4_o, this.Vars.onnx__Unsqueeze_475, coder.const(x_decoder_Gather_4_oNumDims));
            x_decoder_blocks__54 = reshape(x_decoder_Gather_4_o, shape1023);

            % Concat:
            [x_decoder_blocks_2_3, x_decoder_blocks_2_3NumDims] = red_lesion_unet_v2.coder.ops.onnxConcat(0, {x_decoder_blocks__54, x_decoder_blocks_2_U}, [coder.const(x_decoder_blocks__54NumDims), coder.const(x_decoder_blocks_2_UNumDims)]);

            % Cast:
            x_decoder_blocks_2_C = cast(int64(red_lesion_unet_v2.coder.ops.extractIfDlarray(x_decoder_blocks_2_3)), 'like', x_decoder_blocks_2_3);
            x_decoder_blocks_2_CNumDims = coder.const(x_decoder_blocks_2_3NumDims);

            % Shape:
            [x_decoder_blocks_2_S, x_decoder_blocks_2_SNumDims] = red_lesion_unet_v2.coder.ops.onnxShape(x_decoder_blocks__41, coder.const(x_decoder_blocks__41NumDims), 0, coder.const(x_decoder_blocks__41NumDims)+1);

            % Slice:
            [indices1024, x_decoder_blocks__51NumDims] = red_lesion_unet_v2.coder.ops.prepareSliceArgs(x_decoder_blocks_2_S, this.Vars.x_decoder_blocks_2_4, this.Vars.x_decoder_blocks_2_5, this.Vars.x_decoder_blocks_2_6, '', coder.const(x_decoder_blocks_2_SNumDims));
            x_decoder_blocks__51 = x_decoder_blocks_2_S(indices1024{:});

            % Concat:
            [x_decoder_blocks_2_1, x_decoder_blocks_2_1NumDims] = red_lesion_unet_v2.coder.ops.onnxConcat(0, {x_decoder_blocks__51, x_decoder_blocks_2_C}, [coder.const(x_decoder_blocks__51NumDims), coder.const(x_decoder_blocks_2_CNumDims)]);

            % Resize:
            [DLTScales1025, DLTSizes1026, dataFormat1027, Method1028, GeometricTransformMode1029, NearestRoundingMode1030, x_decoder_blocks_2_RNumDims] = red_lesion_unet_v2.coder.ops.prepareResize11Args([], [], x_decoder_blocks_2_1, "asymmetric", "nearest", "floor", coder.const(x_decoder_blocks__41NumDims));
            X1031 = dlarray(single(red_lesion_unet_v2.coder.ops.extractIfDlarray(x_decoder_blocks__41)));
            if isempty(DLTScales1025)
                Y1032 = dlresize(X1031, 'OutputSize', DLTSizes1026(1:end-1), 'DataFormat', dataFormat1027, 'Method', Method1028, 'GeometricTransformMode', GeometricTransformMode1029, 'NearestRoundingMode', NearestRoundingMode1030);
            else
                Y1032 = dlresize(X1031, 'Scale', DLTScales1025(1:end-1), 'DataFormat', dataFormat1027, 'Method', Method1028, 'GeometricTransformMode', GeometricTransformMode1029, 'NearestRoundingMode', NearestRoundingMode1030);
            end
            x_decoder_blocks_2_R = red_lesion_unet_v2.coder.ops.extractIfDlarray(Y1032);

            % Set graph output arguments
            x_decoder_blocks_2_RNumDims1005 = coder.const(x_decoder_blocks_2_RNumDims);

        end

    end

end