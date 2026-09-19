function runAllHandoffChecks()
% RUNALLHANDOFFCHECKS  Run the acceptance check for all 5 imported models:
% verifyModelHandoff for the classifier (M1), verifySegmentationHandoff for
% the 4 segmentation/localization nets (M2-M5).

verifyModelHandoff();

verifySegmentationHandoff('vessel_unet_v1', 'vessel_unet_v1.mat', [512 512 1], 1);
verifySegmentationHandoff('localization_v1', 'localization_v1.mat', [512 512 3], 2);
verifySegmentationHandoff('bright_lesion_unet_v1', 'bright_lesion_unet_v1.mat', [512 512 3], 1);
verifySegmentationHandoff('red_lesion_unet_v1', 'red_lesion_unet_v1.mat', [512 512 3], 1);
end
