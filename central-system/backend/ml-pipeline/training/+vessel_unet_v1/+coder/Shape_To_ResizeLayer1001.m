classdef Shape_To_ResizeLayer1001 < nnet.layer.Layer & nnet.layer.Formattable
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
            this_cg = vessel_unet_v1.coder.Shape_To_ResizeLayer1001(mlInstance);
        end
        function this_ml = matlabCodegenFromRedirected(cgInstance)
            this_ml = vessel_unet_v1.Shape_To_ResizeLayer1001(cgInstance.Name);
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
        function this = Shape_To_ResizeLayer1001(mlInstance)
            this.Name = mlInstance.Name;
            this.NumInputs = 2;
            this.OutputNames = {'x_decoder_blocks_3_R'};
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

        function [x_decoder_blocks_3_R] = predict(this, x_encoder_relu_Relu___, x_decoder_blocks__59__)
            if isdlarray(x_encoder_relu_Relu___)
                x_encoder_relu_Relu__ = stripdims(x_encoder_relu_Relu___);
            else
                x_encoder_relu_Relu__ = x_encoder_relu_Relu___;
            end
            if isdlarray(x_decoder_blocks__59__)
                x_decoder_blocks__59_ = stripdims(x_decoder_blocks__59__);
            else
                x_decoder_blocks__59_ = x_decoder_blocks__59__;
            end
            x_encoder_relu_Relu_NumDims = 4;
            x_decoder_blocks__59NumDims = 4;
            x_encoder_relu_Relu_ = vessel_unet_v1.coder.ops.permuteInputVar(x_encoder_relu_Relu__, [4 3 1 2], 4);
            x_decoder_blocks__59 = vessel_unet_v1.coder.ops.permuteInputVar(x_decoder_blocks__59_, [4 3 1 2], 4);

            [x_decoder_blocks_3_R__, x_decoder_blocks_3_RNumDims__] = Shape_To_ResizeGraph1002(this, x_encoder_relu_Relu_, x_decoder_blocks__59, x_encoder_relu_Relu_NumDims, x_decoder_blocks__59NumDims, false);
            x_decoder_blocks_3_R_ = vessel_unet_v1.coder.ops.permuteOutputVar(x_decoder_blocks_3_R__, [3 4 2 1], 4);

            x_decoder_blocks_3_R = dlarray(single(x_decoder_blocks_3_R_), 'SSCB');
        end

        function [x_decoder_blocks_3_R, x_decoder_blocks_3_RNumDims1003] = Shape_To_ResizeGraph1002(this, x_encoder_relu_Relu_, x_decoder_blocks__59, x_encoder_relu_Relu_NumDims, x_decoder_blocks__59NumDims, Training)

            % Execute the operators:
            % Shape:
            [x_decoder_Shape_3_ou, x_decoder_Shape_3_ouNumDims] = vessel_unet_v1.coder.ops.onnxShape(x_encoder_relu_Relu_, coder.const(x_encoder_relu_Relu_NumDims), 0, coder.const(x_encoder_relu_Relu_NumDims)+1);

            % Gather:
            [x_decoder_Gather_3_o, x_decoder_Gather_3_oNumDims] = vessel_unet_v1.coder.ops.onnxGather(x_decoder_Shape_3_ou, this.Vars.x_decoder_Constant_3, 0, coder.const(x_decoder_Shape_3_ouNumDims), this.NumDims.x_decoder_Constant_3);

            % Unsqueeze:
            [shape1011, x_decoder_blocks_3_UNumDims] = vessel_unet_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_3_o, this.Vars.onnx__Unsqueeze_499, coder.const(x_decoder_Gather_3_oNumDims));
            x_decoder_blocks_3_U = reshape(x_decoder_Gather_3_o, shape1011);

            % Shape:
            [x_decoder_Shape_2_ou, x_decoder_Shape_2_ouNumDims] = vessel_unet_v1.coder.ops.onnxShape(x_encoder_relu_Relu_, coder.const(x_encoder_relu_Relu_NumDims), 0, coder.const(x_encoder_relu_Relu_NumDims)+1);

            % Gather:
            [x_decoder_Gather_2_o, x_decoder_Gather_2_oNumDims] = vessel_unet_v1.coder.ops.onnxGather(x_decoder_Shape_2_ou, this.Vars.x_decoder_Constant_2, 0, coder.const(x_decoder_Shape_2_ouNumDims), this.NumDims.x_decoder_Constant_2);

            % Unsqueeze:
            [shape1012, x_decoder_blocks__72NumDims] = vessel_unet_v1.coder.ops.prepareUnsqueezeArgs(x_decoder_Gather_2_o, this.Vars.onnx__Unsqueeze_497, coder.const(x_decoder_Gather_2_oNumDims));
            x_decoder_blocks__72 = reshape(x_decoder_Gather_2_o, shape1012);

            % Concat:
            [x_decoder_blocks_3_3, x_decoder_blocks_3_3NumDims] = vessel_unet_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__72, x_decoder_blocks_3_U}, [coder.const(x_decoder_blocks__72NumDims), coder.const(x_decoder_blocks_3_UNumDims)]);

            % Cast:
            x_decoder_blocks_3_C = cast(int64(vessel_unet_v1.coder.ops.extractIfDlarray(x_decoder_blocks_3_3)), 'like', x_decoder_blocks_3_3);
            x_decoder_blocks_3_CNumDims = coder.const(x_decoder_blocks_3_3NumDims);

            % Shape:
            [x_decoder_blocks_3_S, x_decoder_blocks_3_SNumDims] = vessel_unet_v1.coder.ops.onnxShape(x_decoder_blocks__59, coder.const(x_decoder_blocks__59NumDims), 0, coder.const(x_decoder_blocks__59NumDims)+1);

            % Slice:
            [indices1013, x_decoder_blocks__69NumDims] = vessel_unet_v1.coder.ops.prepareSliceArgs(x_decoder_blocks_3_S, this.Vars.x_decoder_blocks_3_4, this.Vars.x_decoder_blocks_3_5, this.Vars.x_decoder_blocks_3_6, '', coder.const(x_decoder_blocks_3_SNumDims));
            x_decoder_blocks__69 = x_decoder_blocks_3_S(indices1013{:});

            % Concat:
            [x_decoder_blocks_3_1, x_decoder_blocks_3_1NumDims] = vessel_unet_v1.coder.ops.onnxConcat(0, {x_decoder_blocks__69, x_decoder_blocks_3_C}, [coder.const(x_decoder_blocks__69NumDims), coder.const(x_decoder_blocks_3_CNumDims)]);

            % Resize:
            [DLTScales1014, DLTSizes1015, dataFormat1016, Method1017, GeometricTransformMode1018, NearestRoundingMode1019, x_decoder_blocks_3_RNumDims] = vessel_unet_v1.coder.ops.prepareResize11Args([], [], x_decoder_blocks_3_1, "asymmetric", "nearest", "floor", coder.const(x_decoder_blocks__59NumDims));
            X1020 = dlarray(single(vessel_unet_v1.coder.ops.extractIfDlarray(x_decoder_blocks__59)));
            if isempty(DLTScales1014)
                Y1021 = dlresize(X1020, 'OutputSize', DLTSizes1015(1:end-1), 'DataFormat', dataFormat1016, 'Method', Method1017, 'GeometricTransformMode', GeometricTransformMode1018, 'NearestRoundingMode', NearestRoundingMode1019);
            else
                Y1021 = dlresize(X1020, 'Scale', DLTScales1014(1:end-1), 'DataFormat', dataFormat1016, 'Method', Method1017, 'GeometricTransformMode', GeometricTransformMode1018, 'NearestRoundingMode', NearestRoundingMode1019);
            end
            x_decoder_blocks_3_R = vessel_unet_v1.coder.ops.extractIfDlarray(Y1021);

            % Set graph output arguments
            x_decoder_blocks_3_RNumDims1003 = coder.const(x_decoder_blocks_3_RNumDims);

        end

    end

end