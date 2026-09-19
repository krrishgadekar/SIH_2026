classdef Shape_To_ResizeLayer1004 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = bright_lesion_unet_v1.coder.Shape_To_ResizeLayer1004(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = bright_lesion_unet_v1.Shape_To_ResizeLayer1004(cgInstance.Name);
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
        function this = Shape_To_ResizeLayer1004(mlInstance)
            this.Name = mlInstance.Name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_0_R'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = bright_lesion_unet_v1.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_decoder_blocks_0_R] = predict(this, x_encoder_layer3__30__, x_encoder_layer4__15__)
            if isdlarray(x_encoder_layer3__30__)
                x_encoder_layer3__30_ = stripdims(x_encoder_layer3__30__);
            else
                x_encoder_layer3__30_ = x_encoder_layer3__30__;
            end
            if isdlarray(x_encoder_layer4__15__)
                x_encoder_layer4__15_ = stripdims(x_encoder_layer4__15__);
            else
                x_encoder_layer4__15_ = x_encoder_layer4__15__;
            end
            x_encoder_layer3__30NumDims = 4;
            x_encoder_layer4__15NumDims = 4;
            x_encoder_layer3__30 = bright_lesion_unet_v1.coder.ops.permuteInputVar(x_encoder_layer3__30_, [4 3 1 2], 4);
            x_encoder_layer4__15 = bright_lesion_unet_v1.coder.ops.permuteInputVar(x_encoder_layer4__15_, [4 3 1 2], 4);

            [x_decoder_blocks_0_R__, x_decoder_blocks_0_RNumDims__] = Shape_To_ResizeGraph1008(this, x_encoder_layer3__30, x_encoder_layer4__15, x_encoder_layer3__30NumDims, x_encoder_layer4__15NumDims, false);
            x_decoder_blocks_0_R_ = bright_lesion_unet_v1.coder.ops.permuteOutputVar(x_decoder_blocks_0_R__, [3 4 2 1], 4);

            x_decoder_blocks_0_R = dlarray(single(x_decoder_blocks_0_R_), 'SSCB');
        end

        function [x_decoder_blocks_0_R, x_decoder_blocks_0_RNumDims1009] = Shape_To_ResizeGraph1008(this, x_encoder_layer3__30, x_encoder_layer4__15, x_encoder_layer3__30NumDims, x_encoder_layer4__15NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_9_ou, x_decoder_Shape_9_ouNumDims] = bright_lesion_unet_v1.coder.ops.onnxShape(x_encoder_layer3__30, coder.const(x_encoder_layer3__30NumDims), 0, coder.const(x_encoder_layer3__30NumDims)+1);

            % Gather:
            [x_decoder_Gather_9_o, x_decoder_Gather_9_oNumDims] = bright_lesion_unet_v1.coder.ops.onnxGather(x_decoder_Shape_9_ou, this.Vars.x_decoder_Constant_9, 0, coder.const(x_decoder_Shape_9_ouNumDims), this.NumDims.x_decoder_Constant_9);

            % Unsqueeze:
            [shape1044, x_decoder_blocks_0_UNumDims] = bright_lesion_unet_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_9_o, this.Vars.onnx__Unsqueeze_433, coder.const(x_decoder_Gather_9_oNumDims));
            x_decoder_blocks_0_U = reshape(x_decoder_Gather_9_o, shape1044);

            % Shape:
            [x_decoder_Shape_8_ou, x_decoder_Shape_8_ouNumDims] = bright_lesion_unet_v1.coder.ops.onnxShape(x_encoder_layer3__30, coder.const(x_encoder_layer3__30NumDims), 0, coder.const(x_encoder_layer3__30NumDims)+1);

            % Gather:
            [x_decoder_Gather_8_o, x_decoder_Gather_8_oNumDims] = bright_lesion_unet_v1.coder.ops.onnxGather(x_decoder_Shape_8_ou, this.Vars.x_decoder_Constant_8, 0, coder.const(x_decoder_Shape_8_ouNumDims), this.NumDims.x_decoder_Constant_8);

            % Unsqueeze:
            [shape1045, x_decoder_blocks__18NumDims] = bright_lesion_unet_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_8_o, this.Vars.onnx__Unsqueeze_431, coder.const(x_decoder_Gather_8_oNumDims));
            x_decoder_blocks__18 = reshape(x_decoder_Gather_8_o, shape1045);

            % Concat:
            [x_decoder_blocks_0_3, x_decoder_blocks_0_3NumDims] = bright_lesion_unet_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__18, x_decoder_blocks_0_U}, [coder.const(x_decoder_blocks__18NumDims), coder.const(x_decoder_blocks_0_UNumDims)]);

            % Cast:
            x_decoder_blocks_0_C = cast(int64(bright_lesion_unet_v1.coder.ops.extractIfDlarray(x_decoder_blocks_0_3)), 'like', x_decoder_blocks_0_3);
            x_decoder_blocks_0_CNumDims = coder.const(x_decoder_blocks_0_3NumDims);

            % Shape:
            [x_decoder_blocks_0_S, x_decoder_blocks_0_SNumDims] = bright_lesion_unet_v1.coder.ops.onnxShape(x_encoder_layer4__15, coder.const(x_encoder_layer4__15NumDims), 0, coder.const(x_encoder_layer4__15NumDims)+1);

            % Slice:
            [indices1046, x_decoder_blocks__15NumDims] = bright_lesion_unet_v1.coder.ops.prepareSliceArgs(x_decoder_blocks_0_S, this.Vars.x_decoder_blocks_0_4, this.Vars.x_decoder_blocks_0_5, this.Vars.x_decoder_blocks_0_6, '', coder.const(x_decoder_blocks_0_SNumDims));
            x_decoder_blocks__15 = x_decoder_blocks_0_S(indices1046{:});

            % Concat:
            [x_decoder_blocks_0_1, x_decoder_blocks_0_1NumDims] = bright_lesion_unet_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__15, x_decoder_blocks_0_C}, [coder.const(x_decoder_blocks__15NumDims), coder.const(x_decoder_blocks_0_CNumDims)]);

            % Resize:
            [DLTScales1047, DLTSizes1048, dataFormat1049, Method1050, GeometricTransformMode1051, NearestRoundingMode1052, x_decoder_blocks_0_RNumDims] = bright_lesion_unet_v1.coder.ops.prepareResize11Args([], [], x_decoder_blocks_0_1, "asymmetric", "nearest", "floor", coder.const(x_encoder_layer4__15NumDims));
            X1053 = dlarray(single(bright_lesion_unet_v1.coder.ops.extractIfDlarray(x_encoder_layer4__15)));
            if isempty(DLTScales1047)
                Y1054 = dlresize(X1053, 'OutputSize', DLTSizes1048(1:end-1), 'DataFormat', dataFormat1049, 'Method', Method1050, 'GeometricTransformMode', GeometricTransformMode1051, 'NearestRoundingMode', NearestRoundingMode1052);
            else
                Y1054 = dlresize(X1053, 'Scale', DLTScales1047(1:end-1), 'DataFormat', dataFormat1049, 'Method', Method1050, 'GeometricTransformMode', GeometricTransformMode1051, 'NearestRoundingMode', NearestRoundingMode1052);
            end
            x_decoder_blocks_0_R = bright_lesion_unet_v1.coder.ops.extractIfDlarray(Y1054);

            % Set graph output arguments
            x_decoder_blocks_0_RNumDims1009 = coder.const(x_decoder_blocks_0_RNumDims);

        end

    end

end