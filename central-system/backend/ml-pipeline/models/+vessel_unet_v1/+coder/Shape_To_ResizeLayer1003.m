classdef Shape_To_ResizeLayer1003 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = vessel_unet_v1.coder.Shape_To_ResizeLayer1003(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = vessel_unet_v1.Shape_To_ResizeLayer1003(cgInstance.Name);
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
        function this = Shape_To_ResizeLayer1003(mlInstance)
            this.Name = mlInstance.Name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_1_R'};
            if isstruct(mlInstance.Vars)
                names = fieldnames(mlInstance.Vars);
                for i=1:numel(names)
                    fieldname = names{i};
                    this.Vars.(fieldname) = vessel_unet_v1.coder.ops.extractIfDlarray(mlInstance.Vars.(fieldname));
                end
            else
                this.Vars = [];
            end

            this.NumDims = mlInstance.NumDims;
        end

        function [x_decoder_blocks_1_R] = predict(this, x_encoder_layer2__20__, x_decoder_blocks__23__)
            if isdlarray(x_encoder_layer2__20__)
                x_encoder_layer2__20_ = stripdims(x_encoder_layer2__20__);
            else
                x_encoder_layer2__20_ = x_encoder_layer2__20__;
            end
            if isdlarray(x_decoder_blocks__23__)
                x_decoder_blocks__23_ = stripdims(x_decoder_blocks__23__);
            else
                x_decoder_blocks__23_ = x_decoder_blocks__23__;
            end
            x_encoder_layer2__20NumDims = 4;
            x_decoder_blocks__23NumDims = 4;
            x_encoder_layer2__20 = vessel_unet_v1.coder.ops.permuteInputVar(x_encoder_layer2__20_, [4 3 1 2], 4);
            x_decoder_blocks__23 = vessel_unet_v1.coder.ops.permuteInputVar(x_decoder_blocks__23_, [4 3 1 2], 4);

            [x_decoder_blocks_1_R__, x_decoder_blocks_1_RNumDims__] = Shape_To_ResizeGraph1006(this, x_encoder_layer2__20, x_decoder_blocks__23, x_encoder_layer2__20NumDims, x_decoder_blocks__23NumDims, false);
            x_decoder_blocks_1_R_ = vessel_unet_v1.coder.ops.permuteOutputVar(x_decoder_blocks_1_R__, [3 4 2 1], 4);

            x_decoder_blocks_1_R = dlarray(single(x_decoder_blocks_1_R_), 'SSCB');
        end

        function [x_decoder_blocks_1_R, x_decoder_blocks_1_RNumDims1007] = Shape_To_ResizeGraph1006(this, x_encoder_layer2__20, x_decoder_blocks__23, x_encoder_layer2__20NumDims, x_decoder_blocks__23NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_7_ou, x_decoder_Shape_7_ouNumDims] = vessel_unet_v1.coder.ops.onnxShape(x_encoder_layer2__20, coder.const(x_encoder_layer2__20NumDims), 0, coder.const(x_encoder_layer2__20NumDims)+1);

            % Gather:
            [x_decoder_Gather_7_o, x_decoder_Gather_7_oNumDims] = vessel_unet_v1.coder.ops.onnxGather(x_decoder_Shape_7_ou, this.Vars.x_decoder_Constant_7, 0, coder.const(x_decoder_Shape_7_ouNumDims), this.NumDims.x_decoder_Constant_7);

            % Unsqueeze:
            [shape1033, x_decoder_blocks_1_UNumDims] = vessel_unet_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_7_o, this.Vars.onnx__Unsqueeze_455, coder.const(x_decoder_Gather_7_oNumDims));
            x_decoder_blocks_1_U = reshape(x_decoder_Gather_7_o, shape1033);

            % Shape:
            [x_decoder_Shape_6_ou, x_decoder_Shape_6_ouNumDims] = vessel_unet_v1.coder.ops.onnxShape(x_encoder_layer2__20, coder.const(x_encoder_layer2__20NumDims), 0, coder.const(x_encoder_layer2__20NumDims)+1);

            % Gather:
            [x_decoder_Gather_6_o, x_decoder_Gather_6_oNumDims] = vessel_unet_v1.coder.ops.onnxGather(x_decoder_Shape_6_ou, this.Vars.x_decoder_Constant_6, 0, coder.const(x_decoder_Shape_6_ouNumDims), this.NumDims.x_decoder_Constant_6);

            % Unsqueeze:
            [shape1034, x_decoder_blocks__36NumDims] = vessel_unet_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_6_o, this.Vars.onnx__Unsqueeze_453, coder.const(x_decoder_Gather_6_oNumDims));
            x_decoder_blocks__36 = reshape(x_decoder_Gather_6_o, shape1034);

            % Concat:
            [x_decoder_blocks_1_3, x_decoder_blocks_1_3NumDims] = vessel_unet_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__36, x_decoder_blocks_1_U}, [coder.const(x_decoder_blocks__36NumDims), coder.const(x_decoder_blocks_1_UNumDims)]);

            % Cast:
            x_decoder_blocks_1_C = cast(int64(vessel_unet_v1.coder.ops.extractIfDlarray(x_decoder_blocks_1_3)), 'like', x_decoder_blocks_1_3);
            x_decoder_blocks_1_CNumDims = coder.const(x_decoder_blocks_1_3NumDims);

            % Shape:
            [x_decoder_blocks_1_S, x_decoder_blocks_1_SNumDims] = vessel_unet_v1.coder.ops.onnxShape(x_decoder_blocks__23, coder.const(x_decoder_blocks__23NumDims), 0, coder.const(x_decoder_blocks__23NumDims)+1);

            % Slice:
            [indices1035, x_decoder_blocks__33NumDims] = vessel_unet_v1.coder.ops.prepareSliceArgs(x_decoder_blocks_1_S, this.Vars.x_decoder_blocks_1_4, this.Vars.x_decoder_blocks_1_5, this.Vars.x_decoder_blocks_1_6, '', coder.const(x_decoder_blocks_1_SNumDims));
            x_decoder_blocks__33 = x_decoder_blocks_1_S(indices1035{:});

            % Concat:
            [x_decoder_blocks_1_1, x_decoder_blocks_1_1NumDims] = vessel_unet_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__33, x_decoder_blocks_1_C}, [coder.const(x_decoder_blocks__33NumDims), coder.const(x_decoder_blocks_1_CNumDims)]);

            % Resize:
            [DLTScales1036, DLTSizes1037, dataFormat1038, Method1039, GeometricTransformMode1040, NearestRoundingMode1041, x_decoder_blocks_1_RNumDims] = vessel_unet_v1.coder.ops.prepareResize11Args([], [], x_decoder_blocks_1_1, "asymmetric", "nearest", "floor", coder.const(x_decoder_blocks__23NumDims));
            X1042 = dlarray(single(vessel_unet_v1.coder.ops.extractIfDlarray(x_decoder_blocks__23)));
            if isempty(DLTScales1036)
                Y1043 = dlresize(X1042, 'OutputSize', DLTSizes1037(1:end-1), 'DataFormat', dataFormat1038, 'Method', Method1039, 'GeometricTransformMode', GeometricTransformMode1040, 'NearestRoundingMode', NearestRoundingMode1041);
            else
                Y1043 = dlresize(X1042, 'Scale', DLTScales1036(1:end-1), 'DataFormat', dataFormat1038, 'Method', Method1039, 'GeometricTransformMode', GeometricTransformMode1040, 'NearestRoundingMode', NearestRoundingMode1041);
            end
            x_decoder_blocks_1_R = vessel_unet_v1.coder.ops.extractIfDlarray(Y1043);

            % Set graph output arguments
            x_decoder_blocks_1_RNumDims1007 = coder.const(x_decoder_blocks_1_RNumDims);

        end

    end

end